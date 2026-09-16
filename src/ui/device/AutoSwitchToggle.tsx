// The persisted policy that lets the USB cable pick the output transport.

import { useEffect, useState } from "react";
import { errorMessage, useWorkbench } from "../state";

export function AutoSwitchToggle() {
  const { bundle } = useWorkbench();
  const session = bundle.session;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    session.device.autoSwitchTransport().then(
      (next) => {
        if (!cancelled) setEnabled(next);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Firmware without the policy never answers, so the row stays hidden.
  if (enabled === null) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await session.device.setAutoSwitchTransport(next);
      setEnabled(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-1">
      <label className="flex cursor-pointer items-baseline justify-between gap-4 text-[12.5px] text-mute">
        <span>Follow the cable</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void toggle(event.target.checked)}
          className="accent-(--color-accent)"
        />
      </label>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Plugging USB in switches typing to USB and unplugging hands it back to Bluetooth. Output
        keys still override it until the cable next moves.
      </p>
      {error && <div className="mt-1 text-[11.5px] text-danger">Failed: {error}</div>}
    </div>
  );
}
