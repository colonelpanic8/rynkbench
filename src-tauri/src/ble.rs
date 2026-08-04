// Rynk BLE GATT transport for the desktop shell, the Bluetooth counterpart to
// the hidapi backend in `main.rs`. WebKit webviews have neither WebHID nor Web
// Bluetooth, so both transports live on this side and the webview drives them
// through commands:
//
//   invoke("rynk_ble_list")  -> Candidate[]  connected devices exposing Rynk
//   invoke("rynk_ble_open")  { id? } -> { label }   attach, subscribe, read
//   invoke("rynk_ble_send")  { bytes }       write one frame (chunked here)
//   invoke("rynk_ble_close")                 unsubscribe and detach
//   event  "rynk-ble-chunk"      Vec<u8>     one notification payload
//   event  "rynk-ble-disconnect"             the link died
//
// Unlike HID this is a plain byte stream with no report padding, so the
// frontend feeds chunks straight to the wasm deframer. Framing (COBS) stays in
// the frontend either way; this side only moves bytes.
//
// Discovery lists *already-connected* devices rather than scanning: a bonded
// keyboard in use is not advertising, so a scan would not find the one case
// that matters. This mirrors `rynk-ble` in the rmk fork.

use std::sync::Mutex;
use std::time::Duration;

use bluest::{Adapter, Characteristic, Device, Uuid};
use futures_util::StreamExt;
use serde::Serialize;
use tauri::async_runtime::{self, JoinHandle};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc::{self, UnboundedSender};

// Source of truth: `rmk_types::protocol::rynk` in the pinned rmk fork. Copied
// rather than imported for the same reason the HID usage page is copied — the
// desktop shell builds from crates.io alone, with no git dependency to vendor.
const RYNK_SERVICE_UUID: Uuid = Uuid::from_u128(0x10900067_537f_4f0a_9b55_929e271f61ab);
const RYNK_INPUT_CHAR_UUID: Uuid = Uuid::from_u128(0x80f9319b_0c74_43a5_9738_c59d6dda3db9);
const RYNK_OUTPUT_CHAR_UUID: Uuid = Uuid::from_u128(0x19802524_6f90_4346_93c2_63dbc509ab55);
const RYNK_BLE_CHUNK_SIZE: usize = 244;
/// ATT-minimum MTU payload; the floor when the characteristic won't say.
const BLE_SAFE_WRITE: usize = 20;

/// Connection, discovery, and subscription carry no inherent timeout, so a
/// radio-silent device would otherwise pend forever.
const GATT_TIMEOUT: Duration = Duration::from_secs(10);
/// Adapter enumeration hangs rather than erroring when Bluetooth is off or
/// permission is denied, so bound it and report that as a plain failure.
const ADAPTER_TIMEOUT: Duration = Duration::from_secs(5);

pub struct BleLink {
    outbound: UnboundedSender<Vec<u8>>,
    task: JoinHandle<()>,
}

impl BleLink {
    /// Dropping the sender ends the task's receive loop; the abort is only a
    /// backstop for a task parked in a GATT call that never returns.
    fn stop(self) {
        drop(self.outbound);
        self.task.abort();
    }
}

#[derive(Default)]
pub struct BleState(Mutex<Option<BleLink>>);

#[derive(Serialize)]
pub struct BleOpenResult {
    label: String,
}

/// One connected Rynk keyboard. `id` is the adapter's stable handle, which is
/// what the caller reopens; the BLE name is user-settable and may be shared.
#[derive(Serialize)]
pub struct BleCandidate {
    id: String,
    label: String,
}

/// The adapter's device handle rendered as a string the webview can hold and
/// hand back. `DeviceId` has no parse, so identity is compared in this form.
fn device_key(device: &Device) -> String {
    format!("{:?}", device.id())
}

async fn adapter() -> Result<Adapter, String> {
    let adapter = Adapter::default()
        .await
        .ok_or("No Bluetooth adapter available")?;
    tokio::time::timeout(ADAPTER_TIMEOUT, adapter.wait_available())
        .await
        .map_err(|_| "Bluetooth adapter is not available (powered off or permission denied)")?
        .map_err(|e| format!("Bluetooth adapter is unavailable: {e}"))?;
    Ok(adapter)
}

async fn connected_devices(adapter: &Adapter) -> Result<Vec<Device>, String> {
    adapter
        .connected_devices_with_services(&[RYNK_SERVICE_UUID])
        .await
        .map_err(|e| format!("Bluetooth discovery failed: {e}"))
}

async fn label_of(device: &Device) -> String {
    device
        .name_async()
        .await
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Rynk (Bluetooth)".to_string())
}

/// Resolve the Rynk service's input (notify) and output (write) characteristics.
async fn characteristics(device: &Device) -> Result<(Characteristic, Characteristic), String> {
    let service = device
        .discover_services_with_uuid(RYNK_SERVICE_UUID)
        .await
        .map_err(|e| format!("GATT service discovery failed: {e}"))?
        .into_iter()
        .next()
        .ok_or("Rynk GATT service not found on this device")?;

    let mut input = None;
    let mut output = None;
    for characteristic in service
        .discover_characteristics()
        .await
        .map_err(|e| format!("GATT characteristic discovery failed: {e}"))?
    {
        match characteristic
            .uuid_async()
            .await
            .map_err(|e| format!("GATT characteristic uuid failed: {e}"))?
        {
            uuid if uuid == RYNK_INPUT_CHAR_UUID => input = Some(characteristic),
            uuid if uuid == RYNK_OUTPUT_CHAR_UUID => output = Some(characteristic),
            _ => {}
        }
    }
    Ok((
        input.ok_or("Rynk input characteristic missing")?,
        output.ok_or("Rynk output characteristic missing")?,
    ))
}

/// Own both characteristics on one task and pump in both directions. The notify
/// stream borrows `input`, which is fine as long as the borrow stays inside this
/// future — so the loop lives here rather than in a returned reader.
///
/// Subscription must be live before the first write, so `open` waits on the
/// ready channel and this task signals it only once `notify()` has returned.
async fn run_io(
    app: AppHandle,
    input: Characteristic,
    output: Characteristic,
    write_chunk: usize,
    mut outbound: mpsc::UnboundedReceiver<Vec<u8>>,
    ready: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    let updates = match input.notify().await {
        Ok(updates) => updates,
        Err(error) => {
            let _ = ready.send(Err(format!("Could not subscribe to Rynk input: {error}")));
            return;
        }
    };
    if ready.send(Ok(())).is_err() {
        return; // `open` gave up; nothing is listening.
    }
    futures_util::pin_mut!(updates);

    loop {
        tokio::select! {
            // Bias the write side so a request is not held behind a busy
            // notification stream at the same connection interval.
            biased;
            frame = outbound.recv() => {
                let Some(frame) = frame else { return }; // close() dropped the sender
                for chunk in frame.chunks(write_chunk) {
                    // Write-without-response: the LE link layer still delivers
                    // reliably, and skipping the ATT ack saves a full connection
                    // interval per chunk.
                    if output.write_without_response(chunk).await.is_err() {
                        emit_disconnect(&app);
                        return;
                    }
                }
            }
            update = updates.next() => {
                match update {
                    Some(Ok(chunk)) => {
                        let _ = app.emit("rynk-ble-chunk", chunk);
                    }
                    // An unsubscribe or a dropped link both end the stream.
                    Some(Err(_)) | None => {
                        emit_disconnect(&app);
                        return;
                    }
                }
            }
        }
    }
}

fn emit_disconnect(app: &AppHandle) {
    let _ = app.emit("rynk-ble-disconnect", ());
}

/// Enumerate connected Rynk keyboards. Presence of the service is the only
/// filter; only the handshake proves a device is a usable peer.
#[tauri::command]
pub async fn rynk_ble_list() -> Result<Vec<BleCandidate>, String> {
    let adapter = adapter().await?;
    let mut candidates = Vec::new();
    for device in connected_devices(&adapter).await? {
        candidates.push(BleCandidate {
            id: device_key(&device),
            label: label_of(&device).await,
        });
    }
    Ok(candidates)
}

#[tauri::command]
pub async fn rynk_ble_open(
    app: AppHandle,
    state: State<'_, BleState>,
    id: Option<String>,
) -> Result<BleOpenResult, String> {
    if let Some(previous) = state.0.lock().unwrap().take() {
        previous.stop();
    }

    let adapter = adapter().await?;
    let device = connected_devices(&adapter)
        .await?
        .into_iter()
        .find(|device| match &id {
            Some(wanted) => device_key(device) == *wanted,
            None => true,
        })
        .ok_or_else(|| match &id {
            Some(wanted) => format!("Rynk device {wanted} is no longer connected"),
            None => "No connected Rynk keyboard found over Bluetooth".to_string(),
        })?;
    let label = label_of(&device).await;

    let (tx, rx) = mpsc::unbounded_channel();
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let task = tokio::time::timeout(GATT_TIMEOUT, async {
        adapter
            .connect_device(&device)
            .await
            .map_err(|e| format!("Could not connect to {label}: {e}"))?;
        let (input, output) = characteristics(&device).await?;
        // Cap writes to what the characteristic will accept.
        let write_chunk = output
            .max_write_len_async()
            .await
            .unwrap_or(BLE_SAFE_WRITE)
            .clamp(BLE_SAFE_WRITE, RYNK_BLE_CHUNK_SIZE);

        let task = async_runtime::spawn(run_io(
            app.clone(),
            input,
            output,
            write_chunk,
            rx,
            ready_tx,
        ));
        match ready_rx.await {
            Ok(Ok(())) => Ok(task),
            Ok(Err(error)) => Err(error),
            Err(_) => Err("Rynk input subscription ended before it was live".to_string()),
        }
    })
    .await
    .map_err(|_| format!("Timed out attaching to {label}"))??;

    *state.0.lock().unwrap() = Some(BleLink { outbound: tx, task });
    Ok(BleOpenResult { label })
}

#[tauri::command]
pub fn rynk_ble_send(state: State<'_, BleState>, bytes: Vec<u8>) -> Result<(), String> {
    let slot = state.0.lock().unwrap();
    let link = slot.as_ref().ok_or("No Bluetooth device open")?;
    link.outbound
        .send(bytes)
        .map_err(|_| "Bluetooth link is down".to_string())
}

#[tauri::command]
pub fn rynk_ble_close(state: State<'_, BleState>) {
    if let Some(link) = state.0.lock().unwrap().take() {
        link.stop();
    }
}
