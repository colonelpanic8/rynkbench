import { useState } from "react";
import { errorMessage, useWorkbench } from "../state";
import { Button, Panel } from "../kit";
import { WarningIcon } from "../icons";

type DangerAction = "bootloader" | "wipe";

function dangerError(action: DangerAction, error: unknown): string {
  const message = errorMessage(error);
  if (/\bLocked\b/i.test(message)) {
    return "The keyboard's physical-presence lock is active. Unlock it on the keyboard, then try again.";
  }
  if (action === "wipe" && /\bUnimplemented\b/i.test(message)) {
    return "This firmware does not support wiping stored settings.";
  }
  return message;
}

export function DangerZone() {
  const { bundle, io } = useWorkbench();
  const [arming, setArming] = useState<DangerAction | null>(null);
  const [busy, setBusy] = useState<DangerAction | null>(null);
  const [error, setError] = useState<{ action: DangerAction; message: string } | null>(null);
  const [done, setDone] = useState<DangerAction | null>(null);
  const offline = bundle.session.kind === "offline";

  const fire = async (action: DangerAction) => {
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      if (action === "wipe") await io.resetStorage();
      else await io.rebootToBootloader();
      setDone(action);
    } catch (err) {
      setError({ action, message: dangerError(action, err) });
    } finally {
      setBusy(null);
      setArming(null);
    }
  };

  const controls = (action: DangerAction, label: string, confirm: string, working: string) => {
    if (done === action) {
      return (
        <div className="mt-3 text-[12.5px] text-warn">
          {action === "wipe"
            ? "Stored settings are being wiped; the keyboard reboots on stock defaults when the erase finishes. Reconnect and re-pair it after it comes back."
            : "Bootloader jump requested — the device should now be in flashing mode."}
        </div>
      );
    }
    if (arming === action) {
      return (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="danger" disabled={busy !== null} onClick={() => void fire(action)}>
            {busy === action ? working : confirm}
          </Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => setArming(null)}>
            Cancel
          </Button>
        </div>
      );
    }
    return (
      <Button
        variant="danger"
        className="mt-3"
        disabled={busy !== null || arming !== null || (action === "wipe" && offline)}
        onClick={() => setArming(action)}
      >
        {label}
      </Button>
    );
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
      {controls("bootloader", "Reboot to bootloader…", "Confirm reboot", "Rebooting…")}
      {error?.action === "bootloader" && (
        <div className="mt-2 text-[12px] text-danger">Failed: {error.message}</div>
      )}

      <div className="mt-4 border-t border-line-soft pt-4">
        <p className="text-[12.5px] leading-relaxed text-mute">
          Wipe everything persisted on the keyboard, including its keymap, layer names,
          combos, morses, macros, lighting scenes, and Bluetooth pairings. The keyboard
          reboots on stock defaults and disconnects; paired computers and phones must be
          paired again. This action is not available in an offline workspace.
        </p>
        {controls("wipe", "Wipe stored settings…", "Confirm wipe", "Wiping…")}
        {error?.action === "wipe" && (
          <div className="mt-2 text-[12px] text-danger">Failed: {error.message}</div>
        )}
      </div>
    </Panel>
  );
}
