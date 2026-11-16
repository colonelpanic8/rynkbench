// Desktop entry point. Everything else, including the Android entry point,
// lives in the library so both targets build the same app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rynkbench_lib::run();
}
