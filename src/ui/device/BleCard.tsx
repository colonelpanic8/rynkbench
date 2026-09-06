// BLE profile slots and split-peripheral status.

import { useEffect, useState } from "react";
import type { PeripheralStatus } from "../../vendor/rynk-wasm/rynk_wasm";
import { errorMessage, useWorkbench } from "../state";
import { Button, Chip, Panel, SectionLabel, cx } from "../kit";
import { BatteryGlyph, BleIcon } from "../icons";

const BLE_STATE_LABEL: Record<string, string> = {
  Advertising: "Advertising",
  Connected: "Connected",
  Inactive: "Inactive",
};

export function BleCard() {
  const { bundle, state, dispatch } = useWorkbench();
  const { caps, session } = bundle;
  const [peripherals, setPeripherals] = useState<Array<PeripheralStatus | null>>([]);
  const [arming, setArming] = useState<number | null>(null);
  const [clearing, setClearing] = useState<number | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The connection topic carries BLE state, so the card reads what the rest of
  // the workbench already has instead of keeping a second, staler copy.
  const status = state.connection?.ble ?? null;

  useEffect(() => {
    if (!caps.is_split || caps.num_split_peripherals === 0) return;
    let cancelled = false;
    setPeripherals(Array.from({ length: caps.num_split_peripherals }, () => null));
    for (let slot = 0; slot < caps.num_split_peripherals; slot++) {
      session.device.peripheralStatus(slot).then(
        (peripheral) => {
          if (!cancelled) {
            setPeripherals((prev) => prev.map((v, i) => (i === slot ? peripheral : v)));
          }
        },
        () => {},
      );
    }
    return () => {
      cancelled = true;
    };
  }, [session, caps.is_split, caps.num_split_peripherals]);

  /** Not every firmware pushes a ConnectionChange after a profile write, so
   *  one read-back keeps the card honest on the ones that don't. */
  const refreshConnection = async () => {
    try {
      dispatch({ type: "topicConnection", connection: await session.device.connectionStatus() });
    } catch {
      // The topic push, if there is one, remains the source of truth.
    }
  };

  const busy = switching !== null || clearing !== null;

  const switchSlot = async (slot: number) => {
    setSwitching(slot);
    setError(null);
    try {
      await session.device.switchBleProfile(slot);
      await refreshConnection();
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
      await refreshConnection();
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
                    disabled={busy}
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
                      disabled={busy}
                      onClick={() => clearSlot(slot)}
                    >
                      {clearing === slot ? "Clearing…" : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-2 py-0.5 text-[11.5px]"
                      disabled={busy}
                      onClick={() => setArming(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    title={`Forget the pairing stored in profile ${slot}`}
                    disabled={busy}
                    className="cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors duration-120 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
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
            {peripherals.map((peripheral, slot) => {
              const battery =
                peripheral && peripheral.battery !== "Unavailable"
                  ? peripheral.battery.Available
                  : null;
              return (
                <div key={slot} className="flex items-center gap-3 py-1.5">
                  <span className="text-[12.5px] text-mute">Half {slot + 1}</span>
                  <div className="flex-1" />
                  {peripheral === null ? (
                    <span className="text-[11.5px] text-faint">…</span>
                  ) : (
                    <>
                      <Chip tone={peripheral.connected ? "ok" : "danger"}>
                        {peripheral.connected ? "connected" : "offline"}
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
