import type { ReactNode } from "react";
import type { KeyView } from "../../model/keyboard";
import { Button, cx } from "../kit";
import { MarqueeIcon } from "../icons";
import { keyAddressLabel, keyHoverTitle } from "../key-address";
import { useWorkbench } from "../state";
import type { KeyPick } from "./keyPick";

/**
 * The keys a preset will use, with the controls that choose them. Chips light
 * their key on the board when hovered so the mapping is visible before install.
 */
export function KeyChoice({
  pick,
  active,
  keys,
  chip,
  problem,
  onPick,
}: {
  pick: KeyPick;
  active: boolean;
  keys: KeyView[];
  chip?: (key: KeyView, index: number) => ReactNode;
  /** Why the current choice can't be installed yet. */
  problem?: string;
  onPick: (pick: KeyPick | null) => void;
}) {
  const { dispatch } = useWorkbench();
  const clear = () => dispatch({ type: "lightingSelect", leds: [] });
  return (
    <div
      className={cx(
        "mt-2 rounded-md border p-2",
        active ? "border-accent-deep/60 bg-accent-dim/15" : "border-line bg-raised",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] text-faint">
          {pick.single ? "Key" : "Keys"}
          {keys.length > 0 && !pick.single && (
            <span className="tnum"> · {keys.length}</span>
          )}
        </span>
        {active ? (
          <Button variant="primary" className="px-2 py-0.5 text-[11.5px]" onClick={() => onPick(null)}>
            Done
          </Button>
        ) : (
          <Button
            variant="outline"
            className="px-2 py-0.5 text-[11.5px]"
            title={`Choose ${pick.single ? "a key" : "keys"} by clicking on the board`}
            onClick={() => onPick(pick)}
          >
            <MarqueeIcon size={12} />
            {keys.length === 0 ? "Choose on board" : "Change"}
          </Button>
        )}
        {keys.length > 0 && (
          <Button variant="ghost" className="px-2 py-0.5 text-[11.5px]" onClick={clear}>
            Clear
          </Button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {keys.length === 0 ? (
          <span className="text-[11.5px] text-faint">
            {active ? "Click a key on the board…" : "None chosen yet"}
          </span>
        ) : (
          keys.map((key, index) => (
            <span
              key={key.ledId}
              title={keyHoverTitle(key)}
              onPointerEnter={() => dispatch({ type: "hoverLeds", leds: [key.ledId!] })}
              onPointerLeave={() => dispatch({ type: "hoverLeds", leds: null })}
              className="tnum inline-flex cursor-default items-center rounded-full border border-accent-deep/60 bg-accent-dim/30 px-2 py-0.5 text-[11px] text-accent"
            >
              {chip ? chip(key, index) : keyAddressLabel(key)}
            </span>
          ))
        )}
      </div>
      {problem && <p className="mt-1.5 text-[11px] text-warn">{problem}</p>}
    </div>
  );
}

