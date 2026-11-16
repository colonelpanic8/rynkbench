// The Keymap's sun button (ADR 0016): a small menu with Show lights (the
// layer's lighting on the canvas), RGB settings… and RGB effects… (Layout
// properties' tabs). The way from the keys to the keyboard-wide lighting.

import { useState } from "react";
import { RowMenu, type MenuEntry } from "../RowMenu";
import { openProperties } from "../properties/store";
import { useCapabilities } from "../use-capabilities";
import { LightingIcon } from "../icons";
import { cx } from "../kit";

/** A menu row's height, to open the menu above the button. */
const ROW_HEIGHT = 36;

export function LightsButton({ shown, onShown }: {
  /** Whether the canvas shows the layer's lights; undefined when it has none to show. */
  shown: boolean | undefined;
  onShown: (shown: boolean) => void;
}) {
  const capabilities = useCapabilities();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (!capabilities.has("lighting.state")) return null;
  const items: MenuEntry[] = [
    ...(shown === undefined ? [] : [{ id: "show", label: shown ? "Hide lights" : "Show lights" }, "-" as const]),
    { id: "lighting", label: "RGB settings…" },
    ...(capabilities.has("lighting.extension") ? [{ id: "effects", label: "RGB effects…" }] : []),
  ];

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        aria-label="Lights"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({ x: box.right - 230, y: box.top - 8 - ROW_HEIGHT * items.length });
        }}
        className={cx(
          "flex size-9 cursor-pointer items-center justify-center rounded-xl border bg-raised shadow-2xl transition-colors",
          shown ? "border-accent text-accent" : "border-line-strong text-mute hover:text-ink",
        )}
      >
        <LightingIcon size={15} />
      </button>
      {menu && (
        <RowMenu
          x={menu.x}
          y={menu.y}
          label="Lights"
          items={items}
          onClose={() => setMenu(null)}
          onAction={(id) => {
            if (id === "show") onShown(!shown);
            else if (id === "lighting" || id === "effects") openProperties(id);
          }}
        />
      )}
    </>
  );
}
