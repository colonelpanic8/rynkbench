// The shell around both native transports. HID (`main.rs`) and BLE (`ble.rs`)
// differ only in how they move bytes: each owns exactly one link at a time,
// replaces it on open, stops it on close, and tells the webview when it dies.
// That shape lives here so the two files hold only their I/O loop and their
// discovery.

use std::future::Future;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter};

/// A live connection to one keyboard, however it is carried.
///
/// `stop` is a future because stopping means *waiting*: the HID reader joins
/// its thread and the BLE task drains whatever is still queued. Both are done
/// with no lock held, so a slow shutdown cannot stall the other commands.
pub trait Link: Send + 'static {
    fn stop(self) -> impl Future<Output = ()> + Send;
}

/// The single-link slot each transport keeps in Tauri managed state.
///
/// Every mutation returns the displaced link rather than dropping it under the
/// lock. That is what makes it impossible to overwrite a live link and leak
/// its worker, and it keeps the `MutexGuard` off the far side of an await.
pub struct LinkSlot<L: Link>(Mutex<Option<L>>);

impl<L: Link> Default for LinkSlot<L> {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

impl<L: Link> LinkSlot<L> {
    /// Install `link`, returning whatever it displaced for the caller to stop.
    #[must_use = "the displaced link still owns a worker; stop it"]
    pub fn replace(&self, link: L) -> Option<L> {
        self.0.lock().unwrap().replace(link)
    }

    /// Take the current link out of the slot, if any.
    #[must_use = "the taken link still owns a worker; stop it"]
    pub fn take(&self) -> Option<L> {
        self.0.lock().unwrap().take()
    }

    /// Empty the slot and shut down whatever was in it.
    pub async fn take_and_stop(&self) {
        // Bound the borrow to this statement: the guard is not Send, and the
        // await below would otherwise poison every command that holds one.
        let link = self.take();
        if let Some(link) = link {
            link.stop().await;
        }
    }

    /// Borrow the current link for one short operation, such as queueing a
    /// frame. The guard is confined to `f`, so it never spans an await.
    pub fn with<T>(&self, f: impl FnOnce(&L) -> T) -> Option<T> {
        let slot = self.0.lock().unwrap();
        slot.as_ref().map(f)
    }
}

/// Tell the webview a link is gone. `event` is the transport's own event name,
/// since the frontend attaches one listener per transport.
pub fn emit_disconnect(app: &AppHandle, event: &str) {
    let _ = app.emit(event, ());
}
