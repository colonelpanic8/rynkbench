// The colour field of Key Lighting, as GLIDE's ColorChoice: "dark" first when
// it means something, the presets, your colours (those lit in the layout, most
// used first; double-click one, or its pencil, to change it on every key),
// then the browser's colour picker in a circle beside a hex field.

import { useEffect, useState } from "react";
import type { LightingRgb8 } from "../../model/lighting-types";
import { cssRgb, hexToRgb, LED_PRESETS, rgbToHex } from "../../model/lighting/color";
import { showToast } from "../messages/store";
import { cx } from "../kit";
import { PencilIcon } from "../icons";

const same = (a: LightingRgb8 | null, b: LightingRgb8 | null) => !!a && !!b && rgbToHex(a) === rgbToHex(b);
const RING = "ring-2 ring-accent ring-offset-2 ring-offset-panel";
/** What the browser's picker opens on when there is no colour yet. */
const PICKER_START = rgbToHex(LED_PRESETS[LED_PRESETS.length - 1]);

function Swatch({ color, chosen, title, onPick, onDoubleClick }: {
  color: LightingRgb8;
  chosen: boolean;
  title: string;
  onPick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={chosen}
      onClick={onPick}
      onDoubleClick={onDoubleClick}
      style={{ background: cssRgb(color) }}
      className={cx("size-5 shrink-0 cursor-pointer rounded-full border border-line-strong transition-transform hover:scale-125", chosen && RING)}
    />
  );
}

/** The browser's colour picker, as a round swatch. */
function Picker({ value, onPick, title = "Pick any color" }: { value: string; onPick: (hex: string) => void; title?: string }) {
  return (
    <span title={title} className="relative size-5 shrink-0 overflow-hidden rounded-full border border-line-strong">
      <input
        type="color"
        aria-label={title}
        value={value}
        onChange={(event) => onPick(event.target.value)}
        className="absolute -top-2 -left-2 size-10 cursor-pointer"
      />
    </span>
  );
}

/** A picker and a hex field; a hex value is saved on Enter or when the field is left, a wrong one turns red. */
function HexField({ value, onPick }: { value: LightingRgb8 | null; onPick: (color: LightingRgb8) => void }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText("");
    setBad(false);
  }, [value]);
  const save = () => {
    if (!text.trim()) return setBad(false);
    const color = hexToRgb(text);
    if (!color) return setBad(true);
    onPick(color);
    setText("");
  };
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 rounded-full border bg-raised py-0.5 pr-2.5 pl-1",
        bad ? "border-danger" : "border-line-strong",
      )}
    >
      <Picker value={value ? rgbToHex(value) : PICKER_START} onPick={(hex) => hexToRgb(hex) && onPick(hexToRgb(hex)!)} />
      <input
        type="text"
        aria-label="Hex color"
        placeholder={value ? rgbToHex(value).toUpperCase() : "#HEX"}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setBad(false);
        }}
        onBlur={save}
        onKeyDown={(event) => event.key === "Enter" && save()}
        className="w-[4.5rem] bg-transparent font-mono text-small text-mute uppercase outline-none placeholder:text-mute"
      />
    </span>
  );
}

export function ColorChoice({
  value,
  onPick,
  darkTitle,
  used,
  usage,
  onRecolor,
}: {
  value: LightingRgb8 | null;
  onPick: (color: LightingRgb8 | null) => void;
  /** When set, a first "dark" choice that picks no colour, titled this. */
  darkTitle?: string;
  /** Your colours, most used first. */
  used: readonly LightingRgb8[];
  usage: (color: LightingRgb8) => { keys: number; layers: number };
  /** Changes a colour everywhere; says how many keys changed. */
  onRecolor: (from: LightingRgb8, to: LightingRgb8) => number;
}) {
  const [editing, setEditing] = useState<LightingRgb8 | null>(null);
  const [hex, setHex] = useState("");
  const startEdit = (color: LightingRgb8) => {
    setEditing(color);
    setHex(rgbToHex(color).toUpperCase());
  };
  const applyEdit = () => {
    const to = hexToRgb(hex);
    if (!editing) return;
    if (!to) return void showToast("Enter a hex color: six digits, like E55F2E", { tone: "danger" });
    const count = onRecolor(editing, to);
    setEditing(null);
    showToast(count ? `${count} key${count === 1 ? "" : "s"} changed to ${rgbToHex(to).toUpperCase()}` : "No keys use that color");
  };
  const counted = editing && usage(editing);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        {darkTitle && (
          <button
            type="button"
            title={darkTitle}
            aria-label={darkTitle}
            aria-pressed={value === null}
            onClick={() => onPick(null)}
            className={cx("group relative flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full", !value && RING)}
          >
            <span className="absolute inset-0 rounded-full border-2 border-mute group-hover:border-ink" />
            <span className="absolute h-[120%] w-0.5 rotate-45 bg-mute group-hover:bg-ink" />
          </button>
        )}
        {LED_PRESETS.map((color) => (
          <Swatch key={rgbToHex(color)} color={color} title={rgbToHex(color).toUpperCase()} chosen={same(value, color)} onPick={() => onPick(color)} />
        ))}
        {used.length > 0 && <span className="h-5 w-px shrink-0 bg-line-strong" aria-hidden />}
        {used.map((color) => (
          <span key={`yours-${rgbToHex(color)}`} className="relative inline-flex">
            <Swatch
              color={color}
              title={`${rgbToHex(color).toUpperCase()} (in this layout; double-click to change it everywhere)`}
              chosen={same(value, color)}
              onPick={() => onPick(color)}
              onDoubleClick={() => startEdit(color)}
            />
            {same(value, color) && !same(editing, color) && (
              <button
                type="button"
                title="Change this color everywhere"
                aria-label="Change this color everywhere"
                onClick={() => startEdit(color)}
                className="absolute -top-2 -right-2 flex size-3.5 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-panel text-ink hover:bg-accent-fill"
              >
                <PencilIcon size={8} />
              </button>
            )}
          </span>
        ))}
        <HexField value={value} onPick={onPick} />
      </div>
      {editing && counted && (
        <div className="flex w-fit flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-raised px-3 py-2 text-small text-mute">
          <Picker value={hexToRgb(hex) ? rgbToHex(hexToRgb(hex)!) : rgbToHex(editing)} onPick={(next) => setHex(next.toUpperCase())} title="New color" />
          <input
            type="text"
            autoFocus
            aria-label="New color as hex"
            value={hex}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setHex(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyEdit();
              else if (event.key === "Escape") {
                event.stopPropagation();
                setEditing(null);
              }
            }}
            className="w-24 rounded border border-line-strong bg-panel px-2 py-0.5 font-mono text-ink uppercase outline-none"
          />
          <span>
            Used on {counted.keys} key{counted.keys === 1 ? "" : "s"} in {counted.layers} layer{counted.layers === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={applyEdit} className="cursor-pointer rounded bg-accent-fill px-2 py-0.5 text-on-accent">
            Apply
          </button>
          <button type="button" onClick={() => setEditing(null)} className="cursor-pointer rounded border border-line-strong px-2 py-0.5">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
