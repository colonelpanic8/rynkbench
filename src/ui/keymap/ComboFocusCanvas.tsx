// The keyboard in Focus Mode, as in GLIDE: a combo is open, its keys are
// marked, and clicking a key adds it to the combo or takes it out. A pill
// above the keys counts them and says what the combo still needs.

import { useEffect } from "react";
import type { KeyView } from "../../model/keyboard";
import { comboHasKey } from "../../model/combos";
import { BoardWell, KeyboardCanvas, type KeyDecor } from "../KeyboardCanvas";
import { Button } from "../kit";
import { WarningIcon } from "../icons";
import { keyAddressLabel } from "../key-address";

import { useWorkbench } from "../state";
import type { ComboFocus } from "./useComboFocus";
import { useKeyText } from "../useKeyText";

const NEEDS = {
  keys: "Needs at least 2 keys",
  action: "Needs an action: pick one below",
} as const;

function FocusPill({ focus }: { focus: ComboFocus }) {
  return (
    <div
      data-testid="combo-focus"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-line-strong bg-panel/95 py-1.5 pr-1.5 pl-4 text-body shadow-lg backdrop-blur"
    >
      <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className="font-semibold text-ink">Focus Mode: click keys to toggle</span>
      <span className="tnum rounded-md border border-line-strong px-2 py-0.5 text-mute" aria-live="polite">
        {focus.keys} of {focus.maxKeys} keys
      </span>
      {focus.needs && (
        <span data-testid="combo-needs" className="flex items-center gap-1 font-semibold text-warn">
          <WarningIcon size={12} /> {NEEDS[focus.needs]}
        </span>
      )}
      {focus.twins.length > 0 && (
        <span data-testid="combo-twin" className="flex items-center gap-1 font-semibold text-warn">
          <WarningIcon size={12} /> Same keys as {focus.twins.map((i) => `C${i}`).join(", ")}
        </span>
      )}
      <span className="flex gap-2">
        {focus.needs && (
          <Button variant="ghost" onClick={focus.discard}>
            Discard combo
          </Button>
        )}
        <Button variant="primary" onClick={focus.done}>
          Done Editing
        </Button>
      </span>
    </div>
  );
}

export function ComboFocusCanvas({ focus }: { focus: ComboFocus }) {
  const keyText = useKeyText();
  const { bundle, state } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const actions = state.layers[focus.layer];
  const actionAt = (key: KeyView) => actions?.[key.row * cols + key.col] ?? "No";

  const { done } = focus;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") done();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  // As in GLIDE: the keys go blank, so the combo's own keys, filled in the
  // accent colour, are what stands out.
  const decorFor = (key: KeyView): KeyDecor => {
    const action = actionAt(key);
    const inCombo = comboHasKey(focus.combo, key, action);
    return {
      fill: inCombo ? "var(--color-accent-fill)" : undefined,
      ariaLabel: `${keyAddressLabel(key)}: ${keyText.describe(action)}. ${
        inCombo ? "In the combo; press Enter to take it out." : "Press Enter to add it to the combo."
      }`,
      ariaKeyShortcuts: "Enter Space Escape",
    };
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col max-lg:min-h-[380px]">
      <BoardWell model={bundle.model} flush top={<FocusPill focus={focus} />}>
        <KeyboardCanvas
          model={bundle.model}
          className="h-full w-full"
          decorFor={decorFor}
          onKeyPointerDown={(key, event) => {
            if (event.button === 0) focus.toggle(key, actionAt(key));
          }}
          onKeyKeyboardActivate={(key, event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              focus.toggle(key, actionAt(key));
            }
          }}
        />
      </BoardWell>
    </div>
  );
}
