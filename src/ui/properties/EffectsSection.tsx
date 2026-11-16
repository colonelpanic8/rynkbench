// Layout properties' RGB Effects tab (ADR 0016): the firmware's effects across
// the keyboard. One big Effects switch first, then the effect (and the overlay
// effect, where the firmware has one), palette, speed and the effect's own
// settings. Applied to the keyboard in one go.

import { ApplyBar, ErrorBanner, cx } from "../kit";
import { Slider } from "../lighting/BackgroundPanel";
import { BigSwitch } from "./BigSwitch";
import { useEffectsDraft } from "./useEffectsDraft";

/** One of the firmware's named lists (effects, palettes) as a select. */
function NameSelect({ label, names, value, onChange }: {
  label: string;
  names: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-body text-mute">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 max-w-[60%] rounded-lg border border-line bg-well px-2 py-1 text-body text-ink"
      >
        {names.map((name, index) => (
          <option key={index} value={index}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EffectsSection() {
  const fx = useEffectsDraft();
  const { draft, setDraft } = fx;
  if (!draft) return null;
  const none = fx.effects.length;

  return (
    <div className="flex flex-col gap-4">
      <BigSwitch name="Effects" state={fx.on ? fx.effectName(draft.effect) : "Off"} on={fx.on} onChange={fx.setOn} />

      <fieldset disabled={!fx.on} className={cx("flex flex-col gap-2", !fx.on && "opacity-50")}>
        <NameSelect label="Effect" names={fx.effects} value={draft.effect} onChange={(effect) => setDraft({ ...draft, effect })} />
        {fx.hasOverlaySlot && (
          <NameSelect
            label="Over it"
            names={[...fx.effects, "None"]}
            value={fx.overlayDraft ?? none}
            onChange={(index) => fx.setOverlayDraft(index === none ? undefined : index)}
          />
        )}
        {fx.palettes.length > 0 && (
          <NameSelect label="Palette" names={fx.palettes} value={draft.palette} onChange={(palette) => setDraft({ ...draft, palette })} />
        )}
        <Slider label="Bright" min={1} value={draft.value} onChange={(value) => setDraft({ ...draft, value })} />
        <Slider label="Speed" value={draft.speed} onChange={(speed) => setDraft({ ...draft, speed })} />
        {fx.blocks.map((block) => (
          <div key={block.effect} className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <span className="text-small font-semibold text-mute">{fx.effectName(block.effect)}</span>
            {block.items.map((param, index) => (
              <Slider
                key={`${block.effect}:${index}:${param.name}`}
                label={param.name}
                min={param.min}
                max={param.max}
                value={block.values[index]}
                onChange={(value) => fx.setParam(block.effect, index, value)}
              />
            ))}
          </div>
        ))}
      </fieldset>

      {fx.error && <ErrorBanner message={fx.error} />}
      {fx.dirty && (
        <ApplyBar
          compact
          busy={fx.busy}
          apply={{ label: "Apply", disabled: fx.busy, onClick: () => void fx.apply() }}
          discard={{ label: "Revert", onClick: fx.revert }}
        />
      )}
    </div>
  );
}
