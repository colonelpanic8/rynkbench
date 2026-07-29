// Minimal ambient declarations for the Tauri global injected by
// `app.withGlobalTauri` in tauri.conf.json — just what this backend uses.
// (The project deliberately avoids a @tauri-apps/api dependency so the web
// build stays untouched; the desktop shell provides the global at runtime.)

interface TauriEvent<T> {
  readonly payload: T;
}

interface TauriGlobal {
  core: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
  event: {
    listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<() => void>;
  };
}

interface Window {
  readonly __TAURI__?: TauriGlobal;
}
