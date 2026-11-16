// Layout properties → Details, as GLIDE's: the layout's name and its keyboard
// (with Convert to the other MoErgo board). Rynkbench adds what the keyboard
// can hold, from its capabilities; layout files here carry no title, tags or notes.

import { useState } from "react";
import type { ReactNode } from "react";
import { useWorkbench } from "../state";
import { useSharedDocumentTransfer } from "../transfer-actions";
import { TextInput } from "../kit";
import { closeProperties } from "./store";

const LABEL = "mt-4 mb-1.5 block text-small font-semibold text-mute";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-1.5 last:border-b-0">
      <span className="text-body text-mute">{label}</span>
      <span className="font-mono text-body text-ink">{children}</span>
    </div>
  );
}

export function DetailsSection() {
  const { bundle } = useWorkbench();
  const { workspaceName, renameWorkspace, migrationTarget, previewMigration } = useSharedDocumentTransfer();
  const [name, setName] = useState(workspaceName);
  const caps = bundle.caps;
  const keyboard = bundle.boardProfile?.name ?? bundle.model.name;
  const commit = () => {
    const next = name.trim();
    if (next && next !== workspaceName) renameWorkspace(next);
    else setName(workspaceName);
  };

  return (
    <div className="max-w-xl">
      <label className={LABEL} htmlFor="layout-name">
        Name
      </label>
      <TextInput
        id="layout-name"
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="w-full"
      />
      <p className="mt-1 text-small text-faint">Saving the layout uses this name for the file.</p>

      <span className={LABEL}>Keyboard</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body font-semibold text-ink">{keyboard}</span>
        {migrationTarget && (
          <button
            type="button"
            onClick={() => {
              closeProperties();
              void previewMigration();
            }}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-body font-semibold text-ink hover:bg-hover"
          >
            Convert to {migrationTarget}…
          </button>
        )}
      </div>
      {migrationTarget && (
        <p className="mt-1 text-small leading-relaxed text-faint">
          Moves your keys to the other keyboard and tells you what could not come along.
        </p>
      )}

      <span className={LABEL}>What this keyboard holds</span>
      <div className="rounded-xl border border-line bg-raised px-3 py-1">
        <Fact label="Layers">{caps.num_layers}</Fact>
        <Fact label="Combos">{caps.max_combos}</Fact>
        {caps.max_morse > 0 && <Fact label="Tap patterns (morse)">{caps.max_morse}</Fact>}
        {caps.max_macros > 0 && <Fact label="Macros">{caps.max_macros}</Fact>}
        {caps.max_forks > 0 && <Fact label="Forks">{caps.max_forks}</Fact>}
        {caps.ble_enabled && <Fact label="Bluetooth profiles">{caps.num_ble_profiles}</Fact>}
        {caps.is_split && <Fact label="Halves">{caps.num_split_peripherals + 1}</Fact>}
      </div>
    </div>
  );
}
