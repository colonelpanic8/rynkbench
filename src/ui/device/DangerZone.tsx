// Bootloader entry: the one destructive thing this tab can do.

import { useState } from "react";
import { errorMessage, useWorkbench } from "../state";
import { Button, Panel } from "../kit";
import { WarningIcon } from "../icons";

export function DangerZone() {
  const { io } = useWorkbench();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fire = async () => {
    setBusy(true);
    setError(null);
    try {
      await io.rebootToBootloader();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setArming(false);
    }
  };

  return (
    <Panel className="border-danger/30 p-4">
      <div className="flex items-center gap-2 text-danger">
        <WarningIcon size={15} />
        <span className="text-[13px] font-semibold">Danger zone</span>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
        Reboot the keyboard into its bootloader for firmware flashing. The device will
        disconnect and stop typing until it is flashed or power-cycled.
      </p>
      {done ? (
        <div className="mt-3 text-[12.5px] text-warn">
          Bootloader jump requested — the device should now be in flashing mode.
        </div>
      ) : arming ? (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="danger" disabled={busy} onClick={fire}>
            {busy ? "Rebooting…" : "Confirm reboot"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setArming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="danger" className="mt-3" onClick={() => setArming(true)}>
          Reboot to bootloader…
        </Button>
      )}
      {error && <div className="mt-2 text-[12px] text-danger">Failed: {error}</div>}
    </Panel>
  );
}

