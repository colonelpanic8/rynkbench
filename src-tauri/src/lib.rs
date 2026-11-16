// Rynkbench's native shell. It serves the built web UI in a Tauri webview and
// provides the transports the webview lacks, which is a different set on each
// platform:
//
// - Desktop (WebKitGTK/WKWebView): neither WebHID nor Web Bluetooth exists, so
//   both the raw-HID transport (`hid`) and the BLE GATT one (`ble`) live here.
// - Android: the platform owns HID-over-GATT outright, so there is no raw-HID
//   path to offer; the Android WebView has no Web Bluetooth either, so BLE is
//   the one transport, served by `ble_android` through a Kotlin plugin.
//
// Both BLE modules answer the same four commands and emit the same two events,
// so `src/session/native-ble` in the frontend does not know which one it is
// talking to.

#[cfg(target_os = "android")]
#[path = "ble_android.rs"]
mod ble;
#[cfg(not(target_os = "android"))]
mod ble;
#[cfg(not(target_os = "android"))]
mod firmware;
#[cfg(not(target_os = "android"))]
mod hid;
mod transport;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(ble::BleState::default());

    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(ble::init())
        .invoke_handler(tauri::generate_handler![
            ble::rynk_ble_list,
            ble::rynk_ble_open,
            ble::rynk_ble_send,
            ble::rynk_ble_close,
        ]);

    #[cfg(not(target_os = "android"))]
    let builder = builder
        .manage(hid::LinkState::default())
        .manage(firmware::FirmwareState::default())
        .invoke_handler(tauri::generate_handler![
            hid::rynk_list,
            hid::rynk_open,
            hid::rynk_send,
            hid::rynk_close,
            ble::rynk_ble_list,
            ble::rynk_ble_open,
            ble::rynk_ble_send,
            ble::rynk_ble_close,
            firmware::firmware_prepare,
            firmware::firmware_install,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running Rynkbench");
}
