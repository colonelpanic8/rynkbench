// Rynk BLE GATT transport for Android, the counterpart to the bluest backend
// in `ble.rs`. It answers exactly the same commands and emits exactly the same
// events, so the frontend's `src/session/native-ble` cannot tell the two apart:
//
//   invoke("rynk_ble_list")  -> Candidate[]  bonded LE devices worth trying
//   invoke("rynk_ble_open")  { id? } -> { label }   attach, subscribe, read
//   invoke("rynk_ble_send")  { bytes }       write one frame (chunked in Kotlin)
//   invoke("rynk_ble_close")                 unsubscribe and detach
//   event  "rynk-ble-chunk"      Vec<u8>     one notification payload
//   event  "rynk-ble-disconnect"             the link died
//
// The GATT work itself is in Kotlin (`RynkBlePlugin`): Android exposes its BLE
// stack only through the Java API, and bluest has no Android backend. This
// module is the bridge — it forwards commands to the plugin and turns the
// plugin's notification channel back into the two webview events.
//
// Discovery lists *bonded* devices rather than scanning, for the reason
// documented in the Web Bluetooth link: the firmware's advertisement never
// carries the Rynk service UUID, and a keyboard that is busy being a keyboard
// is not advertising at all. A bonded device is reachable by address whether
// it advertises or not, and only the handshake proves which candidate is a
// usable Rynk peer.

use base64::prelude::{Engine, BASE64_STANDARD};
use serde::{Deserialize, Serialize};
use tauri::plugin::{PluginApi, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::transport::{emit_disconnect, Link, LinkSlot};

/// The webview listens for this on the BLE transport.
const DISCONNECT_EVENT: &str = "rynk-ble-disconnect";

/// Must match the Kotlin plugin's package and class in `gen/android`.
const ANDROID_PLUGIN_PACKAGE: &str = "org.rynkbench.app";
const ANDROID_PLUGIN_CLASS: &str = "RynkBlePlugin";

/// One bonded LE device. `id` is its Bluetooth address, which is stable across
/// reboots and is how the plugin reopens a specific keyboard.
#[derive(Deserialize, Serialize)]
pub struct BleCandidate {
    id: String,
    label: String,
}

#[derive(Deserialize)]
struct ListResult {
    devices: Vec<BleCandidate>,
}

#[derive(Deserialize, Serialize)]
pub struct BleOpenResult {
    label: String,
}

#[derive(Serialize)]
struct OpenArgs {
    address: Option<String>,
    channel: tauri::ipc::Channel<serde_json::Value>,
}

#[derive(Serialize)]
struct SendArgs {
    data: String,
}

#[derive(Serialize)]
struct Empty {}

/// What the plugin pushes up the notification channel.
#[derive(Deserialize)]
#[serde(tag = "event", rename_all = "lowercase")]
enum BleEvent {
    /// One GATT notification payload, base64 because the channel is JSON.
    Chunk {
        data: String,
    },
    Disconnect,
}

/// The open link. Everything stateful lives on the Kotlin side; this only
/// records that a link is open so the slot's one-at-a-time and close-on-open
/// semantics match the desktop backend's.
pub struct AndroidBleLink {
    app: AppHandle,
}

impl Link for AndroidBleLink {
    async fn stop(self) {
        if let Err(error) = call::<Empty, serde_json::Value>(&self.app, "close", Empty {}) {
            // Nothing to recover: the link is going away either way, and the
            // plugin closes its GATT client when the activity dies.
            log::warn!("Closing the Rynk GATT link failed: {error}");
        }
    }
}

pub type BleState = LinkSlot<AndroidBleLink>;

struct RynkBle<R: Runtime>(PluginHandle<R>);

fn call<A: Serialize, T: serde::de::DeserializeOwned>(
    app: &AppHandle,
    command: &str,
    args: A,
) -> Result<T, String> {
    app.state::<RynkBle<tauri::Wry>>()
        .0
        .run_mobile_plugin(command, args)
        .map_err(|error| error.to_string())
}

/// Registers the Kotlin plugin and keeps its handle in app state.
pub fn init() -> TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::<tauri::Wry>::new("rynkble")
        .setup(|app, api: PluginApi<tauri::Wry, ()>| {
            let handle =
                api.register_android_plugin(ANDROID_PLUGIN_PACKAGE, ANDROID_PLUGIN_CLASS)?;
            app.manage(RynkBle(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn rynk_ble_list(app: AppHandle) -> Result<Vec<BleCandidate>, String> {
    let result: ListResult = call(&app, "list", Empty {})?;
    Ok(result.devices)
}

#[tauri::command]
pub async fn rynk_ble_open(
    app: AppHandle,
    state: State<'_, BleState>,
    id: Option<String>,
) -> Result<BleOpenResult, String> {
    state
        .open(|| async {
            // The plugin only sends on this channel once `open` has returned
            // successfully, so no notification can arrive before the frontend
            // is listening for the events it turns into.
            let channel = tauri::ipc::Channel::new({
                let app = app.clone();
                move |message| {
                    match message.deserialize::<BleEvent>() {
                        Ok(BleEvent::Chunk { data }) => {
                            if let Ok(bytes) = BASE64_STANDARD.decode(data) {
                                let _ = app.emit("rynk-ble-chunk", bytes);
                            }
                        }
                        Ok(BleEvent::Disconnect) => emit_disconnect(&app, DISCONNECT_EVENT),
                        Err(error) => log::warn!("Unreadable Rynk GATT event: {error}"),
                    }
                    Ok(())
                }
            });
            let opened: BleOpenResult = call(
                &app,
                "open",
                OpenArgs {
                    address: id,
                    channel,
                },
            )?;
            Ok((AndroidBleLink { app: app.clone() }, opened))
        })
        .await
}

#[tauri::command]
pub async fn rynk_ble_send(
    app: AppHandle,
    state: State<'_, BleState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    // Only the open/closed check needs the slot; the write itself is the
    // plugin's, which owns the GATT operation queue.
    state
        .with(|_| Ok(()))
        .unwrap_or_else(|| Err("No Bluetooth device open".to_string()))?;
    call::<_, serde_json::Value>(
        &app,
        "send",
        SendArgs {
            data: BASE64_STANDARD.encode(bytes),
        },
    )
    .map(|_| ())
}

#[tauri::command]
pub async fn rynk_ble_close(state: State<'_, BleState>) -> Result<(), String> {
    state.take_and_stop().await;
    Ok(())
}
