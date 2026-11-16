import { useState } from "react";
import { errorMessage } from "../../session/errors";
import { useWorkbench } from "../state";
import { Button, Panel } from "../kit";
import { WarningIcon } from "../icons";
import { askConfirm, type ConfirmRequest } from "../messages/store";

type DangerAction = "bootloader" | "wipe";

const QUESTION: Record<DangerAction, ConfirmRequest> = {
  bootloader: {
    title: "Reboot into the bootloader?",
    body: "The keyboard disconnects and stops typing until it is flashed or switched off and on.",
    confirmLabel: "Reboot",
    danger: true,
  },
  wipe: {
    title: "Wipe everything stored on the keyboard?",
    body: "Its keymap, layer names, combos, morse, macros, lighting scenes and Bluetooth pairings are erased. It restarts on stock defaults; pair your computers and phones again afterwards.",
    confirmLabel: "Wipe keyboard",
    danger: true,
  },
};

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
    }
  };

  const controls = (action: DangerAction, label: string, working: string) => {
    if (done === action) {
      return (
        <div className="mt-3 text-body text-warn">
          {action === "wipe"
            ? "Stored settings are being wiped; the keyboard reboots on stock defaults when the erase finishes. Reconnect and re-pair it after it comes back."
            : "Bootloader jump requested — the device should now be in flashing mode."}
        </div>
      );
    }
    return (
      <Button
        variant="danger"
        className="mt-3"
        disabled={busy !== null || (action === "wipe" && offline)}
        reason={busy !== null ? "Wait for the action in progress" : "Connect the keyboard to wipe it"}
        onClick={() => void askConfirm(QUESTION[action]).then((yes) => {
          if (yes) void fire(action);
        })}
      >
        {busy === action ? working : label}
      </Button>
    );
  };

  return (
    <Panel className="border-danger/30 p-4">
      <div className="flex items-center gap-2 text-danger">
        <WarningIcon size={15} />
        <span className="text-ui font-semibold">Danger zone</span>
      </div>
      <p className="mt-2 text-body leading-relaxed text-mute">
        Reboot the keyboard into its bootloader for firmware flashing. The device will
        disconnect and stop typing until it is flashed or power-cycled.
      </p>
      {controls("bootloader", "Reboot to bootloader…", "Rebooting…")}
      {error?.action === "bootloader" && (
        <div className="mt-2 text-body text-danger">Failed: {error.message}</div>
      )}

      <div className="mt-4 border-t border-line-soft pt-4">
        <p className="text-body leading-relaxed text-mute">
          Wipe everything persisted on the keyboard, including its keymap, layer names,
          combos, morses, macros, lighting scenes, and Bluetooth pairings. The keyboard
          reboots on stock defaults and disconnects; paired computers and phones must be
          paired again. This action is not available in an offline workspace.
        </p>
        {controls("wipe", "Wipe stored settings…", "Wiping…")}
        {error?.action === "wipe" && (
          <div className="mt-2 text-body text-danger">Failed: {error.message}</div>
        )}
      </div>
    </Panel>
  );
}
