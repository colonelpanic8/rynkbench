import { useEffect, useState } from "react";
import {
  firmwareInstallOrder,
  firmwareUpdateStatus,
  latestFirmwareRelease,
  type FirmwareRelease,
} from "../../firmware/releases";
import {
  installPreparedFirmware,
  nativeFirmwareInstallerAvailable,
  prepareFirmware,
} from "../../firmware/native";
import { describeBuild, parseBuildLabel } from "../../session/build-identity";
import { Button, Chip, Panel, Row, SectionLabel } from "../kit";
import { errorMessage, useWorkbench } from "../state";

export function FirmwareUpdateCard() {
  const { bundle, io } = useWorkbench();
  const firmware = bundle.boardProfile?.firmware;
  const [release, setRelease] = useState<FirmwareRelease | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const automatic = nativeFirmwareInstallerAvailable();

  useEffect(() => {
    if (!firmware) return;
    const controller = new AbortController();
    setRelease(null);
    setLoadError(null);
    void latestFirmwareRelease(firmware, controller.signal)
      .then(setRelease)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(error));
      });
    return () => controller.abort();
  }, [firmware]);

  if (!firmware) return null;

  const installed = bundle.build ? parseBuildLabel(bundle.build.label) : null;
  const status = firmwareUpdateStatus(installed, release);
  const current = status === "current";

  const install = async () => {
    if (!release) return;
    setArmed(false);
    setInstallError(null);
    try {
      for (const { target, asset } of firmwareInstallOrder(release.targets)) {
        setActivity(`Downloading and verifying ${target.label}…`);
        const prepared = await prepareFirmware(asset, target.uf2FamilyId);
        setActivity(`Rebooting ${target.label} into its UF2 bootloader…`);
        await io.rebootToBootloader(target.bootloader);
        setActivity(`Flashing ${target.label}…`);
        await installPreparedFirmware(prepared.token, target.volumeLabels);
      }
      setActivity("Firmware installed. Reconnect after both halves finish rebooting.");
    } catch (error) {
      const message = errorMessage(error);
      setActivity(null);
      setInstallError(/\bLocked\b/i.test(message)
        ? "The keyboard's physical-presence lock is active. Unlock it on the keyboard, then try again."
        : message);
    }
  };

  return (
    <Panel className="col-span-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Firmware update</SectionLabel>
        {release && status !== "unidentified" && (
          <Chip tone={current ? "ok" : "accent"}>{current ? "current" : "update available"}</Chip>
        )}
      </div>
      <div className="mt-2 flex flex-col divide-y divide-line-soft">
        <Row label="Channel">{firmware.source.label}</Row>
        <Row label="Installed" mono>{(installed && describeBuild(installed)) ?? "unknown"}</Row>
        <Row label="Latest" mono>{release?.tag ?? (loadError ? "unavailable" : "checking…")}</Row>
      </div>

      {loadError && <div className="mt-2 text-[12px] text-danger">{loadError}</div>}
      {release && status === "unidentified" && (
        <div className="mt-2 text-[12px] leading-relaxed text-faint">
          This firmware names no revision that identifies it in this channel, so whether it
          is current cannot be decided here.
        </div>
      )}
      {release && (
        <div className="mt-3 text-[12px] leading-relaxed text-mute">
          {release.targets.length} verified UF2 {release.targets.length === 1 ? "image" : "images"} from{" "}
          <a className="text-accent hover:underline" href={release.pageUrl} target="_blank" rel="noreferrer">
            {release.name}
          </a>
          . Split peripherals are flashed first; the central is last because it carries the control connection.
          Keep every processor being updated connected to this computer over USB.
        </div>
      )}

      {!automatic && release && (
        <div className="mt-3 text-[12px] text-faint">
          One-click flashing requires the Rynkbench desktop app, which can wait for and write the UF2 volume.
        </div>
      )}

      {automatic && release && !activity && !armed && (
        <Button variant="primary" className="mt-3" onClick={() => setArmed(true)}>
          {current ? "Reinstall latest firmware…" : "Install latest firmware…"}
        </Button>
      )}
      {armed && (
        <div className="mt-3 flex items-center gap-2">
          <Button variant="danger" onClick={() => void install()}>
            Flash {release?.targets.length ?? 0} {release?.targets.length === 1 ? "processor" : "processors"}
          </Button>
          <Button variant="ghost" onClick={() => setArmed(false)}>Cancel</Button>
        </div>
      )}
      {activity && <div className="mt-3 text-[12.5px] text-accent">{activity}</div>}
      {installError && <div className="mt-2 text-[12px] text-danger">Failed: {installError}</div>}
    </Panel>
  );
}
