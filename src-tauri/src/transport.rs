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
/// its thread and the BLE task drains whatever is still queued. Neither holds
/// the frame-send lock while waiting for shutdown.
pub trait Link: Send + 'static {
    fn stop(self) -> impl Future<Output = ()> + Send;
}

/// Opening and closing share one lifecycle lock; frame sends only borrow `link`.
pub struct LinkSlot<L: Link> {
    link: Mutex<Option<L>>,
    lifecycle: tokio::sync::Mutex<()>,
}

impl<L: Link> Default for LinkSlot<L> {
    fn default() -> Self {
        Self {
            link: Mutex::new(None),
            lifecycle: tokio::sync::Mutex::new(()),
        }
    }
}

impl<L: Link> LinkSlot<L> {
    /// Stop the previous worker before discovery can start another one.
    pub async fn open<T, E, F: Future<Output = Result<(L, T), E>>>(
        &self,
        connect: impl FnOnce() -> F,
    ) -> Result<T, E> {
        let _lifecycle = self.lifecycle.lock().await;
        self.stop_current().await;
        let (link, result) = connect().await?;
        *self.link.lock().unwrap() = Some(link);
        Ok(result)
    }

    pub async fn take_and_stop(&self) {
        let _lifecycle = self.lifecycle.lock().await;
        self.stop_current().await;
    }

    async fn stop_current(&self) {
        let link = self.link.lock().unwrap().take();
        if let Some(link) = link {
            link.stop().await;
        }
    }

    pub fn with<T>(&self, f: impl FnOnce(&L) -> T) -> Option<T> {
        let slot = self.link.lock().unwrap();
        slot.as_ref().map(f)
    }
}

/// Tell the webview a link is gone. `event` is the transport's own event name,
/// since the frontend attaches one listener per transport.
pub fn emit_disconnect(app: &AppHandle, event: &str) {
    let _ = app.emit(event, ());
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::poll;
    use std::sync::Arc;
    use tokio::sync::oneshot;

    struct TestLink {
        name: &'static str,
        stops: Arc<Mutex<Vec<&'static str>>>,
        stopped: Option<oneshot::Receiver<()>>,
    }

    impl Link for TestLink {
        async fn stop(self) {
            self.stops.lock().unwrap().push(self.name);
            if let Some(stopped) = self.stopped {
                let _ = stopped.await;
            }
        }
    }

    fn send_future<F: Future + Send>(future: F) -> F {
        future
    }

    #[tokio::test]
    async fn close_waits_for_discovery_and_stops_the_installed_link_once() {
        let slot = LinkSlot::<TestLink>::default();
        let stops = Arc::new(Mutex::new(Vec::new()));
        let (ready, discovered) = oneshot::channel();
        let open = send_future(slot.open(|| async {
            discovered.await.unwrap();
            Ok::<_, ()>((
                TestLink {
                    name: "first",
                    stops: stops.clone(),
                    stopped: None,
                },
                (),
            ))
        }));
        tokio::pin!(open);
        assert!(poll!(&mut open).is_pending());
        let close = send_future(slot.take_and_stop());
        tokio::pin!(close);
        assert!(poll!(&mut close).is_pending());
        ready.send(()).unwrap();
        open.await.unwrap();
        close.await;
        assert!(slot.with(|_| ()).is_none());
        slot.take_and_stop().await;
        assert_eq!(*stops.lock().unwrap(), ["first"]);
    }

    #[tokio::test]
    async fn replacement_waits_for_shutdown_without_blocking_frame_access() {
        let slot = LinkSlot::<TestLink>::default();
        let stops = Arc::new(Mutex::new(Vec::new()));
        let (finish, stopped) = oneshot::channel();
        slot.open(|| async {
            Ok::<_, ()>((
                TestLink {
                    name: "old",
                    stops: stops.clone(),
                    stopped: Some(stopped),
                },
                (),
            ))
        })
        .await
        .unwrap();
        let entered = Arc::new(Mutex::new(false));
        let replacement = send_future(slot.open(|| async {
            *entered.lock().unwrap() = true;
            Ok::<_, ()>((
                TestLink {
                    name: "new",
                    stops: stops.clone(),
                    stopped: None,
                },
                (),
            ))
        }));
        tokio::pin!(replacement);
        assert!(poll!(&mut replacement).is_pending());
        assert!(!*entered.lock().unwrap());
        assert!(slot.with(|_| ()).is_none());
        assert_eq!(*stops.lock().unwrap(), ["old"]);
        finish.send(()).unwrap();
        replacement.await.unwrap();
        assert_eq!(slot.with(|link| link.name), Some("new"));
        slot.take_and_stop().await;
        assert_eq!(*stops.lock().unwrap(), ["old", "new"]);
    }

    #[tokio::test]
    async fn concurrent_opens_install_in_order_and_failed_open_leaves_no_worker() {
        let slot = LinkSlot::<TestLink>::default();
        let stops = Arc::new(Mutex::new(Vec::new()));
        let (ready, discovered) = oneshot::channel();
        let first = slot.open(|| async {
            discovered.await.unwrap();
            Ok::<_, ()>((
                TestLink {
                    name: "first",
                    stops: stops.clone(),
                    stopped: None,
                },
                (),
            ))
        });
        tokio::pin!(first);
        assert!(poll!(&mut first).is_pending());
        let second = slot.open(|| async {
            assert_eq!(*stops.lock().unwrap(), ["first"]);
            Err::<(TestLink, ()), _>("discovery failed")
        });
        tokio::pin!(second);
        assert!(poll!(&mut second).is_pending());
        ready.send(()).unwrap();
        first.await.unwrap();
        assert_eq!(second.await, Err("discovery failed"));
        assert!(slot.with(|_| ()).is_none());
        slot.take_and_stop().await;
        assert_eq!(*stops.lock().unwrap(), ["first"]);
    }
}
