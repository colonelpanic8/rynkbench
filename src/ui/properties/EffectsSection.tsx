// Layout properties' RGB Effects tab (ADR 0016): the firmware's effects across
// the keyboard. One big Effects switch first, then the effect (and the effect
// over it, where the firmware has a second slot) picked from a gallery of
// cards, then palette, brightness, speed and the picked effects' own settings.
// Applied to the keyboard in one go.

import { ApplyBar, Button, ErrorBanner, cx } from "../kit";
import { Slider } from "../lighting/BackgroundPanel";
import { BigSwitch } from "./BigSwitch";
import { EffectGallery } from "./EffectGallery";
import { useEffectsDraft } from "./useEffectsDraft";

/** The firmware's palettes as a select. */
function PaletteSelect({ names, value, onChange }: {
  names: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-body text-mute">
      Palette
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

  return (
    <div className="flex flex-col gap-4">
      <BigSwitch name="Effects" state={fx.on ? fx.effectName(draft.effect) : "Off"} on={fx.on} onChange={fx.setOn} />

      <fieldset disabled={!fx.on} className={cx("flex min-w-0 flex-col gap-3", !fx.on && "opacity-50")}>
        <EffectGallery label="Effect" names={fx.effects} value={draft.effect} onPick={(effect) => setDraft({ ...draft, effect })} />
        {fx.hasOverlaySlot && (
          <EffectGallery
            label="Over it"
            names={fx.effects}
            value={fx.overlayDraft}
            onPick={fx.setOverlayDraft}
            empty={{ name: "None", onPick: () => fx.setOverlayDraft(undefined) }}
          />
        )}
        <div className="flex flex-col gap-2">
          {fx.palettes.length > 0 && (
            <PaletteSelect names={fx.palettes} value={draft.palette} onChange={(palette) => setDraft({ ...draft, palette })} />
          )}
          <Slider label="Bright" min={1} value={draft.value} onChange={(value) => setDraft({ ...draft, value })} />
          <Slider label="Speed" value={draft.speed} onChange={(speed) => setDraft({ ...draft, speed })} />
        </div>
        {fx.blocks.map((block) => (
          <div key={block.effect} className="flex flex-col gap-2 border-t border-line-soft pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-small font-semibold text-mute">{fx.effectName(block.effect)}</span>
              <Button
                variant="ghost"
                className="px-1.5 py-0 text-small"
                disabled={block.items.every((param, index) => block.values[index] === param.default)}
                reason="These are the firmware's defaults."
                onClick={() => fx.defaults(block)}
              >
                Defaults
              </Button>
            </div>
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
