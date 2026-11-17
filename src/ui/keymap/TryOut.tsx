// "Try out (not saved)" in the RGB Lighting tab: a switch, and while it is on
// what makes plain that the lights are not saved, how long each stays on, and
// keeping them on the layer shown or clearing them off the keyboard.

import { BigSwitch } from "../properties/BigSwitch";
import { NumberField } from "../lighting/EffectEditor";
import { TRY_OUT_LIFETIME_MS } from "../../model/lighting/try-out";
import { Button } from "../kit";
import { showToast } from "../messages/store";
import type { TryOut } from "./useTryOut";

export function TryOutSwitch({ tryOut }: { tryOut: TryOut }) {
  return (
    <BigSwitch
      name="Try out (not saved)"
      state={tryOut.on ? "Lights go on the keyboard at once and are never saved" : "Off: the lights you set are saved on the layer"}
      on={tryOut.on}
      onChange={tryOut.turn}
    />
  );
}

/** While trying out: the note, the lifetime and the two ways out. `name`: the layer shown. */
export function TryOutPanel({ tryOut, layer, name }: { tryOut: TryOut; layer: number; name: string }) {
  const plural = (count: number) => `${count} try-out light${count === 1 ? "" : "s"}`;
  const keep = async () => {
    const count = tryOut.keepable;
    const result = await tryOut.keep(layer);
    if (result.ok) showToast(`${plural(count)} kept on ${name}`, { tone: "ok" });
    else if (!result.guarded) showToast(`Nothing was kept: ${result.message}`, { tone: "danger" });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-warn/10 p-3 text-body text-warn">
        Not saved: these lights vanish when the keyboard restarts. Turning Try out off takes them off the keyboard.
      </p>
      <label className="flex cursor-pointer items-center justify-between text-body text-mute">
        <span>Lights turn off on their own</span>
        <input
          type="checkbox"
          checked={tryOut.lifetimeMs !== null}
          onChange={(event) => tryOut.setLifetime(event.target.checked ? TRY_OUT_LIFETIME_MS : null)}
        />
      </label>
      {tryOut.lifetimeMs !== null && (
        <NumberField
          label="Lights turn off after"
          unit="ms"
          min={100}
          max={3_600_000}
          clamp
          value={tryOut.lifetimeMs}
          onChange={tryOut.setLifetime}
        />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          className="px-2.5 py-1 text-small"
          disabled={tryOut.keepable === 0}
          reason="No try-out lights to keep"
          onClick={() => void keep()}
        >
          Keep these lights on {name}
        </Button>
        <Button
          variant="danger"
          className="px-2.5 py-1 text-small"
          disabled={tryOut.lit === 0}
          reason="No try-out lights on the keyboard"
          onClick={() => void tryOut.clear()}
        >
          Clear try-out lights
        </Button>
      </div>
    </div>
  );
}
