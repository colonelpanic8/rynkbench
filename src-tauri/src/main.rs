// Rynkbench desktop shell: serves the built web UI in a Tauri window and
// provides the raw-HID transport that WebKit lacks (no WebHID outside
// Chromium). The webview's native session backend drives it via:
//
//   invoke("rynk_open")  -> { label }   open the device, start the reader
//   invoke("rynk_send")  { bytes }      write one frame (split into reports)
//   invoke("rynk_close")                stop the reader, close the device
//   event  "rynk-report"     Vec<u8>    one raw input report, padding included
//   event  "rynk-disconnect"            the reader saw the device vanish
//
// Framing stays in the frontend (shared with WebHID); this side only moves
// 32-byte reports. One device at a time: rynk_open replaces any open link.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use hidapi::HidApi;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const RYNK_USAGE_PAGE: u16 = 0xff60;
const RYNK_USAGE: u16 = 0x61;
const RYNK_HID_REPORT_SIZE: usize = 32;
/// How long the reader blocks in read_timeout before checking for outbound
/// reports and shutdown; bounds the added request latency.
const IO_POLL: Duration = Duration::from_millis(5);

struct Link {
    outbound: Sender<Vec<u8>>,
    shutdown: Arc<AtomicBool>,
    reader: Option<JoinHandle<()>>,
}

impl Link {
    fn stop(mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

#[derive(Default)]
struct LinkState(Mutex<Option<Link>>);

#[derive(Serialize)]
struct OpenResult {
    label: String,
}

fn emit_disconnect(app: &AppHandle) {
    let _ = app.emit("rynk-disconnect", ());
}

/// Own the device on a dedicated thread: interleave short blocking reads with
/// draining the outbound queue, so one handle serves both directions without
/// assuming hidapi handles are Sync.
fn run_io(
    app: AppHandle,
    device: hidapi::HidDevice,
    outbound: std::sync::mpsc::Receiver<Vec<u8>>,
    shutdown: Arc<AtomicBool>,
) {
    let mut buf = [0u8; RYNK_HID_REPORT_SIZE];
    while !shutdown.load(Ordering::Relaxed) {
        loop {
            match outbound.try_recv() {
                Ok(report) => {
                    // hidapi writes take the report ID first; 0 = unnumbered.
                    let mut framed = Vec::with_capacity(report.len() + 1);
                    framed.push(0u8);
                    framed.extend_from_slice(&report);
                    if device.write(&framed).is_err() {
                        emit_disconnect(&app);
                        return;
                    }
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }
        match device.read_timeout(&mut buf, IO_POLL.as_millis() as i32) {
            Ok(0) => {}
            Ok(n) => {
                let _ = app.emit("rynk-report", buf[..n].to_vec());
            }
            Err(_) => {
                emit_disconnect(&app);
                return;
            }
        }
    }
}

/// One candidate raw-HID interface. `path` is hidapi's stable handle for the
/// exact interface, so the caller can reopen a specific one instead of
/// whichever the enumeration happens to yield first.
#[derive(Clone, serde::Serialize)]
struct Candidate {
    path: String,
    label: String,
    serial: Option<String>,
}

fn candidates(api: &HidApi) -> Vec<Candidate> {
    api.device_list()
        .filter(|d| d.usage_page() == RYNK_USAGE_PAGE && d.usage() == RYNK_USAGE)
        .map(|d| Candidate {
            path: d.path().to_string_lossy().into_owned(),
            label: d
                .product_string()
                .filter(|s| !s.is_empty())
                .unwrap_or("Rynk (native)")
                .to_string(),
            serial: d
                .serial_number()
                .filter(|s| !s.is_empty())
                .map(str::to_string),
        })
        .collect()
}

/// Enumerate every Rynk interface. Two keyboards of the same model are
/// indistinguishable by label alone, so the serial number rides along and
/// only the handshake proves which one is usable.
#[tauri::command]
fn rynk_list() -> Result<Vec<Candidate>, String> {
    let api = HidApi::new().map_err(|e| format!("HID subsystem unavailable: {e}"))?;
    Ok(candidates(&api))
}

#[tauri::command]
fn rynk_open(
    app: AppHandle,
    state: State<'_, LinkState>,
    path: Option<String>,
) -> Result<OpenResult, String> {
    let mut slot = state.0.lock().unwrap();
    if let Some(previous) = slot.take() {
        previous.stop();
    }

    let api = HidApi::new().map_err(|e| format!("HID subsystem unavailable: {e}"))?;
    let info = api
        .device_list()
        .filter(|d| d.usage_page() == RYNK_USAGE_PAGE && d.usage() == RYNK_USAGE)
        .find(|d| match &path {
            Some(wanted) => d.path().to_string_lossy() == wanted.as_str(),
            None => true,
        })
        .ok_or_else(|| match &path {
            Some(wanted) => format!("Rynk interface {wanted} is no longer present"),
            None => "No Rynk keyboard found (raw-HID usage 0xFF60/0x61)".to_string(),
        })?;
    let label = info
        .product_string()
        .filter(|s| !s.is_empty())
        .unwrap_or("Rynk (native)")
        .to_string();
    let device = info
        .open_device(&api)
        .map_err(|e| format!("Could not open {label}: {e}"))?;

    let (tx, rx) = std::sync::mpsc::channel();
    let shutdown = Arc::new(AtomicBool::new(false));
    let reader = std::thread::spawn({
        let app = app.clone();
        let shutdown = shutdown.clone();
        move || run_io(app, device, rx, shutdown)
    });
    *slot = Some(Link {
        outbound: tx,
        shutdown,
        reader: Some(reader),
    });
    Ok(OpenResult { label })
}

#[tauri::command]
fn rynk_send(state: State<'_, LinkState>, bytes: Vec<u8>) -> Result<(), String> {
    let slot = state.0.lock().unwrap();
    let link = slot.as_ref().ok_or("No device open")?;
    for chunk in bytes.chunks(RYNK_HID_REPORT_SIZE) {
        let mut report = vec![0u8; RYNK_HID_REPORT_SIZE];
        report[..chunk.len()].copy_from_slice(chunk);
        link.outbound
            .send(report)
            .map_err(|_| "Device link is down".to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rynk_close(state: State<'_, LinkState>) {
    if let Some(link) = state.0.lock().unwrap().take() {
        link.stop();
    }
}

fn main() {
    tauri::Builder::default()
        .manage(LinkState::default())
        .invoke_handler(tauri::generate_handler![rynk_list, rynk_open, rynk_send, rynk_close])
        .run(tauri::generate_context!())
        .expect("error while running Rynkbench");
}
