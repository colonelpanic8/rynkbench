// The left side panel, as in GLIDE: the keymap's contents as lists. Layers
// (pick one, and from its ⋮ menu or a right-click: rename, duplicate, move,
// make default, delete) and Combos (ComboList.tsx; a row opens Focus Mode), and
// under them the way into the Behavior Library (behaviors/BehaviorLibrary.tsx).
// The panel never edits a key; it chooses what the canvas and the editor show.

import { useEffect, useState } from "react";
import { layerName } from "../layer-names";
import { pointingDraftDirty } from "../../workbench";
import { useWorkbench } from "../state";
import { useCapabilities } from "../use-capabilities";
import { askConfirm, showToast } from "../messages/store";
import { deletionBlockedMessage, layerDeletionBlockers } from "../../workbench/layer-impact";
import { useTerms } from "../terms";
import { cx } from "../kit";
import { GripIcon, MoreIcon } from "../icons";
import { RowMenu, useRowMenu, type MenuEntry } from "../RowMenu";
import { ComboList } from "./ComboList";
import { BehaviorLibrary, LibraryEntry } from "../behaviors/BehaviorLibrary";
import type { LibraryKind } from "../behaviors/library";
import { useRowDrag } from "./useRowDrag";

/** GLIDE's drop line (its .drop-line-before/after): where a dragged layer lands,
 *  a 3 px accent line with a glow in the gap above or below the row. */
const DROP_LINE =
  "before:pointer-events-none before:absolute before:inset-x-1.5 before:z-20 before:h-[3px] before:rounded-full before:bg-accent before:shadow-[0_0_10px_var(--color-accent)] before:content-['']";

type List = "layers" | "combos";

/** `value` null: neither list is on show (the Behavior Library is). */
function ListSwitch({ value, onChange }: { value: List | null; onChange: (list: List) => void }) {
  const term = useTerms();
  return (
    <div className="flex gap-1 rounded-lg border border-line bg-raised p-1 shadow-inner">
      {(
        [
          ["layers", "Layers"],
          ["combos", term("section.combos")],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cx(
            "flex-1 cursor-pointer rounded-md py-1.5 text-small font-semibold uppercase tracking-widest transition-all duration-150",
            value === id ? "bg-accent-fill text-on-accent shadow-sm" : "text-mute hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LayerList({ onPicked }: { onPicked?: () => void }) {
  const { bundle, state, dispatch, io } = useWorkbench();
  const capabilities = useCapabilities();
  const menu = useRowMenu<number>();
  const rows = useRowDrag((from, to) => void io.moveLayer(from, to));
  const [renaming, setRenaming] = useState<number | null>(null);
  const [name, setName] = useState("");
  // A layer added or removed elsewhere ends a rename; a refreshed copy of the
  // same names (switching layer on a keyboard) must not, or double-click never sticks.
  const layerCount = state.layerMetadata?.length;
  useEffect(() => setRenaming(null), [layerCount]);

  const numLayers = bundle.caps.num_layers;
  const layers = state.layerMetadata
    ? state.layerMetadata.flatMap((metadata, layer) => (metadata.occupied ? [layer] : []))
    : Array.from({ length: numLayers }, (_, layer) => layer);
  const canRename = state.layerMetadata !== null;
  const structureSupported =
    state.layerMetadata !== null &&
    capabilities.has("pointing") &&
    state.behaviorOptions !== null &&
    (!capabilities.has("lighting.state") || capabilities.has("lighting.output"));
  const block = !structureSupported
    ? "This keyboard cannot change its layers yet"
    : state.layerBusy
      ? "Wait for the layer change in progress"
      : !state.batchMode && pointingDraftDirty(state)
        ? "Wait for the pointing changes to reach the keyboard"
        : null;

  const remove = (layer: number) => {
    const label = layerName(state.layerMetadata, layer);
    // Say what still uses the layer now, before reading the keyboard to find out.
    const blockers = layerDeletionBlockers(
      {
        layers: state.layers,
        cols: bundle.caps.num_cols,
        layerMetadata: state.layerMetadata,
        combos: state.combos,
        morse: state.morse,
        forks: state.forks,
      },
      layer,
    );
    if (blockers.length > 0) {
      dispatch({ type: "layerOperationError", message: deletionBlockedMessage(label, blockers) });
      return;
    }
    void askConfirm({
      title: `Delete layer “${label}”?`,
      body: "Its keys are removed and the layers after it move up one place; keys that switch to those layers follow them. This cannot be undone.",
      confirmLabel: "Delete layer",
      danger: true,
    }).then(async (yes) => {
      if (!yes) return;
      const result = await io.deleteLayer(layer);
      if (result.ok) showToast(`Layer “${label}” deleted`, { tone: "ok" });
    });
  };

  const items = (layer: number): MenuEntry[] => {
    const position = layers.indexOf(layer);
    return [
      { id: "rename", label: "Rename", disabled: !canRename, reason: "This keyboard does not store layer names" },
      "-",
      {
        id: "duplicate",
        label: "Duplicate",
        disabled: block !== null || layers.length >= numLayers,
        reason: block ?? `All ${numLayers} layers are in use`,
      },
      {
        id: "up",
        label: "Move up",
        disabled: block !== null || position <= 0,
        reason: block ?? "This is already the first layer",
      },
      {
        id: "down",
        label: "Move down",
        disabled: block !== null || position >= layers.length - 1,
        reason: block ?? "This is already the last layer",
      },
      "-",
      {
        id: "delete",
        label: "Delete",
        danger: true,
        disabled: block !== null || layers.length <= 1,
        reason: block ?? "A keyboard needs at least one layer",
      },
    ];
  };

  const act = (layer: number, id: string) => {
    if (id === "rename") {
      setName(layerName(state.layerMetadata, layer));
      setRenaming(layer);
    } else if (id === "duplicate") void io.duplicateLayer(layer);
    else if (id === "up") void io.moveLayer(layer, layer - 1);
    else if (id === "down") void io.moveLayer(layer, layer + 1);
    else if (id === "delete") remove(layer);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {layers.map((layer) => {
        const active = layer === state.uiLayer;
        const label = layerName(state.layerMetadata, layer);
        if (renaming === layer) {
          return (
            <form
              key={layer}
              onSubmit={(event) => {
                event.preventDefault();
                void io.renameLayer(layer, name).then((result) => {
                  if (result.ok) setRenaming(null);
                });
              }}
            >
              <input
                autoFocus
                value={name}
                maxLength={32}
                aria-label="Layer name"
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setRenaming(null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(null);
                }}
                className="w-full rounded-xl border border-accent bg-panel px-3 py-2 text-body font-semibold text-ink outline-none"
              />
            </form>
          );
        }
        return (
          <div
            key={layer}
            data-row={layer}
            {...menu.rowProps(layer)}
            className={cx(
              "group relative flex items-center rounded-xl border transition-all duration-200",
              rows.drag?.from === layer && "border-dashed opacity-30",
              rows.edge(layer) && DROP_LINE,
              rows.edge(layer) === "top" && "before:-top-1.5",
              rows.edge(layer) === "bottom" && "before:-bottom-1.5",
              active
                ? "border-accent bg-raised shadow-sm"
                : menu.openFor === layer
                  ? "border-line-strong bg-panel"
                  : "border-transparent hover:border-line-strong hover:bg-panel",
            )}
          >
            {block === null && layers.length > 1 && (
              <span
                {...rows.handle(layer)}
                aria-hidden
                title="Drag to reorder"
                className="ml-1.5 flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-faint hover:text-ink"
              >
                <GripIcon size={13} />
              </span>
            )}
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => {
                dispatch({ type: "uiLayer", layer });
                onPicked?.();
              }}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2.5 pl-1.5 pr-1 text-left"
            >
              <span className="w-4 shrink-0 text-right font-mono text-caption text-faint">{layer}</span>
              <span className={cx("min-w-0 flex-1 truncate text-body font-semibold", active ? "text-accent" : "text-ink")}>
                {label}
              </span>
              {layer === state.currentLayer && layer !== state.uiLayer && (
                <span title="Active on the keyboard now" className="size-1.5 shrink-0 rounded-full bg-ok" />
              )}
            </button>
            <button
              type="button"
              aria-label={`Layer actions for ${label}`}
              title="Layer actions (or right-click the layer)"
              onClick={(event) => menu.openFrom(event, layer)}
              className={cx(
                "mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-mute transition-[opacity,visibility] hover:bg-hover hover:text-ink",
                active || menu.openFor === layer
                  ? "opacity-100"
                  : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
              )}
            >
              <MoreIcon size={15} />
            </button>
          </div>
        );
      })}
      {menu.at && (
        <RowMenu
          x={menu.at.x}
          y={menu.at.y}
          label={layerName(state.layerMetadata, menu.at.id)}
          items={items(menu.at.id)}
          onAction={(id) => menu.at && act(menu.at.id, id)}
          onClose={menu.close}
        />
      )}
      {state.layerError && (
        <p role="alert" className="mt-1 px-1 text-small leading-relaxed text-danger">
          {state.layerError}
        </p>
      )}
    </div>
  );
}

/** The panel; on a phone it is a drawer the top bar opens. `libraryKinds`:
 *  the Behavior Library lists this keyboard has (none: no library). */
export function SidePanel({ onPicked, libraryKinds = [] }: { onPicked?: () => void; libraryKinds?: LibraryKind[] }) {
  const [list, setList] = useState<List>("layers");
  const [library, setLibrary] = useState(false);
  const pick = (next: List) => {
    setList(next);
    setLibrary(false);
  };
  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-line bg-bg">
      <div className="shrink-0 border-b border-line bg-panel p-3">
        <ListSwitch value={library ? null : list} onChange={pick} />
        {libraryKinds.length > 0 && <LibraryEntry open={library} onToggle={() => setLibrary((shown) => !shown)} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {library ? <BehaviorLibrary kinds={libraryKinds} /> : list === "layers" ? <LayerList onPicked={onPicked} /> : <ComboList />}
      </div>
    </aside>
  );
}
