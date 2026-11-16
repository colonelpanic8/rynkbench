// The status setups that take their keys from the board: a connection key
// (one key that switches to a Bluetooth profile or to USB and shows that
// connection's state) and a battery bar (three to eight keys that light one
// after the other as a battery fills). Each is set up here; "Choose … on the
// board" hands over to the keymap (keyPick.ts), where Done installs it.

import { useState } from "react";
import type { KeyPick } from "../../model/lighting/key-pick";
import { BAR_ORDERS, BAR_STYLES, MAX_BAR_SEGMENTS, MIN_BAR_SEGMENTS, type BarOrder, type BarStyle } from "../../model/lighting/status-presets";
import { MarqueeIcon } from "../icons";
import { Button } from "../kit";
import { useWorkbench } from "../state";
import { keyPick } from "./keyPick";

const selectClass = "mt-1 w-full rounded-md border border-line bg-raised px-2 py-1.5 text-body text-ink";
const cardClass = "mt-2 rounded-lg border border-line-soft bg-well p-3";

/** `layer`: the layer the setups light on. `connections`: the firmware's rules can ask about Bluetooth and USB. */
export function StatusKeyPicks({ layer, connections }: { layer: number; connections: boolean }) {
  const { bundle, dispatch } = useWorkbench();
  const [connection, setConnection] = useState<"ble" | "usb">("ble");
  const [slot, setSlot] = useState(0);
  const [node, setNode] = useState(0);
  const [order, setOrder] = useState<BarOrder | "auto">("auto");
  const [style, setStyle] = useState<BarStyle>("bands");
  const profiles = bundle.caps.ble_enabled ? bundle.caps.num_ble_profiles : 0;

  /** The keymap shows the layer and collects the keys; this window steps aside until it is done. */
  const choose = (pick: KeyPick) => {
    dispatch({ type: "mode", mode: "keymap" });
    dispatch({ type: "uiLayer", layer });
    keyPick.start(pick);
  };

  return (
    <>
      {profiles > 0 && (
        <div className={cardClass}>
          <div className="text-body font-medium text-ink">Connection key</div>
          <p className="mt-1 text-small leading-relaxed text-faint">
            One key that switches to a Bluetooth profile or to USB, lit by that connection's state.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-small text-faint">
              Switches to
              <select value={connection} onChange={(event) => setConnection(event.target.value as "ble" | "usb")} className={selectClass}>
                <option value="ble">Bluetooth profile</option>
                <option value="usb">USB</option>
              </select>
            </label>
            {connection === "ble" && (
              <label className="text-small text-faint">
                Profile
                <select value={slot} onChange={(event) => setSlot(Number(event.target.value))} className={selectClass}>
                  {Array.from({ length: profiles }, (_, index) => (
                    <option key={index} value={index}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <Button
            className="mt-2 w-full"
            disabled={!connections}
            reason="This firmware's rules cannot ask about Bluetooth or USB: update it first"
            onClick={() => choose({ kind: "connection", layer, connection: connection === "ble" ? { type: "ble", slot } : { type: "usb" } })}
          >
            <MarqueeIcon size={12} /> Choose its key on the board…
          </Button>
        </div>
      )}

      <div className={cardClass}>
        <div className="text-body font-medium text-ink">Battery bar</div>
        <p className="mt-1 text-small leading-relaxed text-faint">
          {MIN_BAR_SEGMENTS} to {MAX_BAR_SEGMENTS} keys in a column or a row that light one after the other as the battery fills, and turn blue
          while it charges. It replaces that battery's lights on the layer.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {bundle.caps.is_split && (
            <label className="text-small text-faint">
              Battery
              <select value={node} onChange={(event) => setNode(Number(event.target.value))} className={selectClass}>
                <option value={0}>Left half</option>
                <option value={1}>Right half</option>
              </select>
            </label>
          )}
          <label className="text-small text-faint">
            Fills
            <select value={order} onChange={(event) => setOrder(event.target.value as BarOrder | "auto")} className={selectClass}>
              <option value="auto">Up a column, right along a row</option>
              {BAR_ORDERS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-small text-faint">
            Colors
            <select value={style} onChange={(event) => setStyle(event.target.value as BarStyle)} className={selectClass}>
              {BAR_STYLES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button className="mt-2 w-full" onClick={() => choose({ kind: "battery", layer, node, order, style })}>
          <MarqueeIcon size={12} /> Choose its keys on the board…
        </Button>
      </div>
    </>
  );
}
