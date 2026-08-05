// Device mode: identity, capabilities, status, BLE, matrix tester — and the
// danger zone.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BleStatus,
  BuildInfo,
  PeripheralStatus,
  SplitCentralLatencyState,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { RevAgreement } from "../../session/build-identity";
import {
  CLIENT_REVS,
  compareRevs,
  parseBuildLabel,
  revsDiverge,
} from "../../session/build-identity";
import { KeyboardCanvas } from "../KeyboardCanvas";
import { useWorkbench, errorMessage } from "../state";
import { isRequest, sessionLog } from "../../session/diagnostics";
import { Button, Chip, Panel, Row, SectionLabel, cx } from "../kit";
import { BatteryGlyph, BleIcon, SpinnerIcon, WarningIcon } from "../icons";
import { KIND_LABEL } from "../TopBar";

const CONNECTION_LABEL: Record<string, string> = {
  Usb: "USB",
  Ble: "BLE",
};

function hex4(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

const BLE_STATE_LABEL: Record<string, string> = {
  Advertising: "Advertising",
  Connected: "Connected",
  Inactive: "Inactive",
};

function BleCard() {
  const { bundle } = useWorkbench();
  const { caps } = bundle;
  const session = bundle.session;
  const [status, setStatus] = useState<BleStatus | null>(null);
  const [peripherals, setPeripherals] = useState<Array<PeripheralStatus | null>>([]);
  const [arming, setArming] = useState<number | null>(null);
  const [clearing, setClearing] = useState<number | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    session.device.bleStatus().then(
      (s) => {
        if (!cancelled) setStatus(s);
      },
      () => {},
    );
    if (caps.is_split && caps.num_split_peripherals > 0) {
      setPeripherals(Array.from({ length: caps.num_split_peripherals }, () => null));
      for (let slot = 0; slot < caps.num_split_peripherals; slot++) {
        session.device.peripheralStatus(slot).then(
          (p) => {
            if (!cancelled) {
              setPeripherals((prev) => prev.map((v, i) => (i === slot ? p : v)));
            }
          },
          () => {},
        );
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, caps.is_split, caps.num_split_peripherals]);

  const switchSlot = async (slot: number) => {
    setSwitching(slot);
    setError(null);
    try {
      await session.device.switchBleProfile(slot);
      // Selecting a slot drops any live link and re-advertises, so the status
      // needs a beat to settle before it reflects the new slot.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const s = await session.device.bleStatus().catch(() => status);
      if (s) setStatus(s);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSwitching(null);
    }
  };

  const clearSlot = async (slot: number) => {
    setClearing(slot);
    setError(null);
    try {
      await session.device.clearBleProfile(slot);
      const s = await session.device.bleStatus().catch(() => status);
      if (s) setStatus(s);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setClearing(null);
      setArming(null);
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Bluetooth</SectionLabel>
        {status && (
          <Chip tone={status.state === "Connected" ? "accent" : "neutral"}>
            <BleIcon size={11} />
            {BLE_STATE_LABEL[status.state] ?? status.state}
          </Chip>
        )}
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Profiles
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          {Array.from({ length: caps.num_ble_profiles }, (_, slot) => {
            const active = status?.profile === slot;
            return (
              <div
                key={slot}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg border px-3 py-1.5",
                  active ? "border-accent-deep bg-accent-dim/20" : "border-line bg-raised",
                )}
              >
                <span
                  className={cx(
                    "tnum font-mono text-[12.5px]",
                    active ? "text-accent" : "text-mute",
                  )}
                >
                  Profile {slot}
                </span>
                {active && <Chip tone="accent">active</Chip>}
                <div className="flex-1" />
                {!active && arming !== slot && (
                  <button
                    type="button"
                    title={`Make profile ${slot} the active BLE connection`}
                    disabled={switching !== null || clearing !== null}
                    className="cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors duration-120 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => switchSlot(slot)}
                  >
                    {switching === slot ? "Switching…" : "Switch"}
                  </button>
                )}
                {arming === slot ? (
                  <span className="flex items-center gap-1.5">
                    <Button
                      variant="danger"
                      className="px-2 py-0.5 text-[11.5px]"
                      disabled={clearing !== null}
                      onClick={() => clearSlot(slot)}
                    >
                      {clearing === slot ? "Clearing…" : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-[11.5px]"
                      disabled={clearing !== null}
                      onClick={() => setArming(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    title={`Forget the pairing stored in profile ${slot}`}
                    className="cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors duration-120 hover:text-danger"
                    onClick={() => setArming(slot)}
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {caps.is_split && peripherals.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
            Peripherals
          </div>
          <div className="mt-1.5 flex flex-col divide-y divide-line-soft">
            {peripherals.map((p, slot) => {
              const battery =
                p && p.battery !== "Unavailable" ? p.battery.Available : null;
              return (
                <div key={slot} className="flex items-center gap-3 py-1.5">
                  <span className="text-[12.5px] text-mute">Half {slot + 1}</span>
                  <div className="flex-1" />
                  {p === null ? (
                    <span className="text-[11.5px] text-faint">…</span>
                  ) : (
                    <>
                      <Chip tone={p.connected ? "ok" : "danger"}>
                        {p.connected ? "connected" : "offline"}
                      </Chip>
                      {battery && (
                        <span className="flex items-center gap-1.5">
                          <BatteryGlyph
                            level={battery.level ?? null}
                            charging={battery.charge_state === "Charging"}
                            size={20}
                          />
                          <span className="tnum text-[12px] text-mute">
                            {battery.level != null ? `${battery.level}%` : "—"}
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-[12px] text-danger">Failed: {error}</div>}
    </Panel>
  );
}

function SplitLatencyCard() {
  const { bundle } = useWorkbench();
  const session = bundle.session;
  const [deviceState, setDeviceState] = useState<SplitCentralLatencyState | null>(null);
  const [powered, setPowered] = useState("0");
  const [battery, setBattery] = useState("1");
  const [overrideLatency, setOverrideLatency] = useState("");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDraft = useCallback((next: SplitCentralLatencyState) => {
    setDeviceState(next);
    setPowered(String(next.policy.powered));
    setBattery(String(next.policy.battery));
    setOverrideLatency(
      next.policy.override_latency === undefined ? "" : String(next.policy.override_latency),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    session.device.splitCentralLatency().then(
      (next) => {
        if (!cancelled) loadDraft(next);
      },
      () => {
        if (!cancelled) setSupported(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadDraft, session]);

  if (!supported || !deviceState) return null;

  const values = [powered, battery, ...(overrideLatency === "" ? [] : [overrideLatency])];
  const valid = values.every((value) => {
    const parsed = Number(value);
    return value !== "" && Number.isInteger(parsed) && parsed >= 0 && parsed <= 499;
  });
  const dirty =
    powered !== String(deviceState.policy.powered) ||
    battery !== String(deviceState.policy.battery) ||
    overrideLatency !==
      (deviceState.policy.override_latency === undefined
        ? ""
        : String(deviceState.policy.override_latency));

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const next = await session.device.setSplitCentralLatency({
        powered: Number(powered),
        battery: Number(battery),
        override_latency: overrideLatency === "" ? undefined : Number(overrideLatency),
      });
      loadDraft(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-24 rounded-md border border-line bg-cap px-2 py-1 text-right font-mono text-[12px] text-cap-ink outline-none focus:border-accent";

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Split link latency</SectionLabel>
        <Chip tone={deviceState.powered ? "ok" : "neutral"}>
          {deviceState.powered ? "USB powered" : "battery"} · effective {deviceState.effective}
        </Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        Maximum BLE connection events the central may skip while active. The runtime override is
        volatile; leave it blank to follow the current power source.
      </p>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
        <label htmlFor="latency-powered" className="text-[12.5px] text-mute">
          USB-powered default
        </label>
        <input
          id="latency-powered"
          className={inputClass}
          type="number"
          min={0}
          max={499}
          value={powered}
          onChange={(event) => setPowered(event.target.value)}
        />
        <label htmlFor="latency-battery" className="text-[12.5px] text-mute">
          Battery default
        </label>
        <input
          id="latency-battery"
          className={inputClass}
          type="number"
          min={0}
          max={499}
          value={battery}
          onChange={(event) => setBattery(event.target.value)}
        />
        <label htmlFor="latency-override" className="text-[12.5px] text-mute">
          Runtime override
        </label>
        <input
          id="latency-override"
          className={inputClass}
          type="number"
          min={0}
          max={499}
          placeholder="auto"
          value={overrideLatency}
          onChange={(event) => setOverrideLatency(event.target.value)}
        />
      </div>
      {!valid && (
        <p className="mt-2 text-[11.5px] text-danger">Use whole numbers from 0 through 499.</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" disabled={busy || !dirty || !valid} onClick={save}>
          {busy ? "Saving…" : "Apply policy"}
        </Button>
        {overrideLatency !== "" && (
          <Button variant="ghost" disabled={busy} onClick={() => setOverrideLatency("")}>
            Restore automatic
          </Button>
        )}
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">Failed: {error}</div>}
    </Panel>
  );
}

function IndicatorChips() {
  const { state } = useWorkbench();
  const ind = state.ledIndicator;
  if (!ind) return null;
  const items: Array<{ label: string; on: boolean }> = [
    { label: "Num", on: ind.num_lock },
    { label: "Caps", on: ind.caps_lock },
    { label: "Scroll", on: ind.scroll_lock },
  ];
  return (
    <span className="flex items-center gap-1.5" title="Host lock indicators, live">
      {items.map((i) => (
        <span
          key={i.label}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            i.on ? "border-accent-deep/60 bg-accent-dim/30 text-accent" : "border-line text-faint",
          )}
        >
          <span className={cx("size-1.5 rounded-full", i.on ? "bg-accent" : "bg-line-strong")} />
          {i.label}
        </span>
      ))}
    </span>
  );
}

/** Decode the row-major pressed bitmap into a set of "row,col" keys. */
function pressedKeys(bitmap: number[], rows: number, cols: number): Set<string> {
  const bytesPerRow = Math.ceil(cols / 8);
  const out = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const byte = bitmap[r * bytesPerRow + (c >> 3)] ?? 0;
      if (byte & (1 << (c & 7))) out.add(`${r},${c}`);
    }
  }
  return out;
}

const MATRIX_POLL_MS = 100;

function MatrixTester() {
  const { bundle } = useWorkbench();
  const session = bundle.session;
  const [active, setActive] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const inflight = useRef(false);

  useEffect(() => {
    if (!active) {
      setPressed(new Set());
      return;
    }
    let cancelled = false;
    const timer = setInterval(async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const state = await session.device.matrixState();
        if (!cancelled) {
          setPressed(
            pressedKeys(state.pressed_bitmap, bundle.caps.num_rows, bundle.caps.num_cols),
          );
        }
      } catch {
        // transient poll failure — keep going
      } finally {
        inflight.current = false;
      }
    }, MATRIX_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, session, bundle.caps.num_rows, bundle.caps.num_cols]);

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <SectionLabel>Matrix tester</SectionLabel>
        {active && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-accent">
            <SpinnerIcon size={11} />
            polling
          </span>
        )}
        <div className="flex-1" />
        {active && (
          <span className="tnum text-[12px] text-mute">
            {pressed.size} key{pressed.size === 1 ? "" : "s"} down
          </span>
        )}
        <Button
          variant={active ? "outline" : "primary"}
          className="py-1"
          onClick={() => setActive((v) => !v)}
        >
          {active ? "Stop test" : "Test matrix"}
        </Button>
      </div>
      {active ? (
        <div className="canvas-well mt-3 rounded-xl border border-line-soft px-6 py-4">
          <KeyboardCanvas
            model={bundle.model}
            interactive={false}
            className="mx-auto max-h-48 w-full"
            decorFor={(key) => ({
              glyph: key.label ? { text: key.label, dim: true } : undefined,
              highlight: pressed.has(`${key.row},${key.col}`),
              fill: pressed.has(`${key.row},${key.col}`) ? "var(--color-accent)" : undefined,
            })}
          />
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
          Poll the live key matrix and light up whatever is physically pressed — handy for
          checking switches and solder joints.
        </p>
      )}
    </Panel>
  );
}

/** The recent request trace, with a way to get it off the machine. Console
 *  logs are not reachable in the desktop app, so the copy button is the point
 *  of this panel — a stalled or failing op is visible here after the fact. */
function DiagnosticsCard() {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  // The log is mutated outside React; poll while the panel is open.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const records = sessionLog.entries();
  const recent = records.slice(-12);
  const failures = records.filter((r) => isRequest(r) && r.outcome !== "ok").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionLog.format());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the trace is still readable below.
      setCopied(false);
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Session diagnostics</SectionLabel>
        <Chip tone={failures > 0 ? "danger" : "neutral"}>
          {records.length} recorded{failures > 0 ? ` · ${failures} failed` : ""}
        </Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        Every request to the keyboard, with how long it took. Copy this if something misbehaves.
        Set <code className="text-faint">localStorage["rynk:debug"] = "1"</code> to mirror it to the
        console.
      </p>
      {recent.length === 0 && (
        <p className="mt-2 text-[11.5px] text-faint">
          Nothing recorded yet. Simulated boards answer in-process and are not traced — this fills
          in against a real keyboard.
        </p>
      )}
      {recent.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-line-soft bg-well p-2 font-mono text-[11px] leading-relaxed">
          {recent.map((record, index) => (
            <div
              key={index}
              className={cx(
                "truncate",
                !isRequest(record)
                  ? "text-accent"
                  : record.outcome === "ok"
                    ? "text-faint"
                    : "text-danger",
              )}
              title={isRequest(record) ? (record.detail ?? record.op) : record.message}
            >
              {isRequest(record)
                ? `${record.op} ${record.outcome} ${record.durationMs.toFixed(0)}ms`
                : record.message}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={copy}>
          {copied ? "Copied" : "Copy full trace"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            sessionLog.clear();
            setTick((n) => n + 1);
          }}
        >
          Clear
        </Button>
      </div>
    </Panel>
  );
}

function DangerZone() {
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

/**
 * What this client and the firmware were each built from.
 *
 * Neither version above answers that: the Rynk protocol version is frozen at
 * v0.1 upstream, and RMK's semver does not move when the fork changes an
 * encoding — so two builds that disagree about, say, the keycode table report
 * identical versions right until one fails to decode what the other wrote. The
 * source revisions do distinguish them, so they are shown plainly, and a
 * divergence is marked rather than announced: the assembled branch is rebuilt on
 * every repin, so a mismatch is common and a banner would only teach you to
 * ignore it.
 */
function BuildCard({ build }: { build: BuildInfo | null }) {
  const parsed = build ? parseBuildLabel(build.label) : null;
  const agreement = parsed ? compareRevs(parsed) : null;

  const mark = (state: RevAgreement) =>
    state === "different" ? <span className="ml-1.5 text-warn">≠</span> : null;

  return (
    <Panel className="col-span-2 p-4">
      <SectionLabel>Build</SectionLabel>
      <div className="mt-2 flex flex-col divide-y divide-line-soft">
        <Row label="Firmware" mono>
          {build ? build.label : "not reported"}
        </Row>
        {CLIENT_REVS.map((pin) => (
          <Row key={pin.input} label={`This client · ${pin.input}`} mono>
            {pin.rev.slice(0, 8)}
            {agreement && mark(pin.input === "rmk" ? agreement.rmk : agreement.app)}
          </Row>
        ))}
      </div>
      {parsed && revsDiverge(parsed) && (
        <div className="mt-2 text-[11px] leading-relaxed text-faint">
          Marked revisions differ from the firmware's. Usually harmless, but it is
          the first thing to check if a read fails to decode.
        </div>
      )}
      {parsed?.dirty && (
        <div className="mt-2 text-[11px] leading-relaxed text-faint">
          The firmware was built from a modified tree, so its revision does not
          fully identify it.
        </div>
      )}
    </Panel>
  );
}

export function DeviceMode() {
  const { bundle, state } = useWorkbench();
  const { info, caps, protocol, build, lightingCaps } = bundle;
  const battery = state.battery !== "Unavailable" ? state.battery.Available : null;
  const conn = state.connection;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-8">
        {/* the board as identity */}
        <div className="canvas-well rounded-2xl border border-line-soft px-8 py-5">
          <KeyboardCanvas
            model={bundle.model}
            interactive={false}
            className="mx-auto max-h-56 w-full"
            decorFor={(key) => ({
              glyph: key.label ? { text: key.label, dim: true } : undefined,
            })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Panel className="p-4">
            <SectionLabel>Identity</SectionLabel>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Product">{info.product_name}</Row>
              <Row label="Manufacturer">{info.manufacturer}</Row>
              <Row label="Serial" mono>
                {info.serial_number || "—"}
              </Row>
              <Row label="Vendor / product id" mono>
                {hex4(info.vendor_id)} · {hex4(info.product_id)}
              </Row>
              <Row label="RMK firmware" mono>
                v{info.rmk_version.major}.{info.rmk_version.minor}.{info.rmk_version.patch}
              </Row>
              <Row label="Rynk protocol" mono>
                v{protocol.major}.{protocol.minor}
              </Row>
            </div>
          </Panel>

          <BuildCard build={build} />

          <Panel className="p-4">
            <SectionLabel>Capabilities</SectionLabel>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Matrix">
                {caps.num_rows} × {caps.num_cols}
              </Row>
              <Row label="Layers">{caps.num_layers}</Row>
              <Row label="Encoders">{caps.num_encoders}</Row>
              <Row label="Combos">{caps.max_combos}</Row>
              <Row label="Macro space">{caps.macro_space_size} B</Row>
              <Row label="LEDs">
                {lightingCaps ? lightingCaps.led_count : "—"}
              </Row>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {caps.storage_enabled && <Chip>storage</Chip>}
              {caps.lighting_enabled && <Chip>lighting</Chip>}
              {caps.is_split && <Chip>split · {caps.num_split_peripherals}p</Chip>}
              {caps.ble_enabled && <Chip>BLE · {caps.num_ble_profiles} profiles</Chip>}
              {caps.bulk_transfer_supported && <Chip>bulk transfer</Chip>}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Battery</SectionLabel>
            {battery ? (
              <div className="mt-3 flex items-center gap-4">
                <BatteryGlyph
                  level={battery.level ?? null}
                  charging={battery.charge_state === "Charging"}
                  size={34}
                />
                <div>
                  <div className="tnum text-[20px] font-semibold text-ink">
                    {battery.level != null ? `${battery.level}%` : "—"}
                  </div>
                  <div className="text-[12px] text-mute">
                    {battery.charge_state}
                    {caps.is_split ? " · central half" : ""}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[12.5px] text-faint">
                Battery status is unavailable on this connection — likely a wired device.
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Connection</SectionLabel>
              <IndicatorChips />
            </div>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Session">{bundle.session.label}</Row>
              <Row label="Transport">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</Row>
              {conn ? (
                <>
                  <Row label="USB">{conn.usb}</Row>
                  <Row label="BLE">
                    {conn.ble.state} · profile {conn.ble.profile}
                  </Row>
                  <Row label="Preferred">{CONNECTION_LABEL[conn.preferred] ?? conn.preferred}</Row>
                </>
              ) : (
                <Row label="Status">unknown</Row>
              )}
            </div>
          </Panel>
        </div>

        {caps.ble_enabled && caps.num_ble_profiles > 0 && <BleCard />}

        {caps.is_split && caps.ble_enabled && <SplitLatencyCard />}

        <MatrixTester />

        <DiagnosticsCard />

        <DangerZone />
      </div>
    </div>
  );
}
