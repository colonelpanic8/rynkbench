// A behavior's row in the Behavior Library and a kind's list, GLIDE's: its
// name (renamed in the row), how it is used, its description and a detail
// line, and the ⋮ menu (also right-click and long press).

import { useState } from "react";
import type { MouseEvent } from "react";
import { TextInput, cx } from "../kit";
import { MoreIcon } from "../icons";
import { usageBadge, type LibraryRow } from "./library";

function RenameBox({ row, onRename, onDone }: { row: LibraryRow; onRename: (name: string) => Promise<boolean>; onDone: () => void }) {
  const [name, setName] = useState(row.named ? row.name : "");
  const commit = async () => {
    if (name.trim() === (row.named ? row.name : "") || (await onRename(name))) onDone();
  };
  return (
    <TextInput
      autoFocus
      aria-label="New name"
      value={name}
      placeholder={row.name}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
      className="py-0.5 text-body font-semibold"
    />
  );
}

export function BehaviorRow({
  row,
  renaming,
  menuOpen,
  onOpen,
  onMenu,
  onRename,
  onRenameDone,
}: {
  row: LibraryRow;
  renaming: boolean;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (event: MouseEvent<HTMLElement>) => void;
  onRename: (name: string) => Promise<boolean>;
  onRenameDone: () => void;
}) {
  const badge = usageBadge(row);
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 hover:border-line-strong">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex w-full items-center gap-2">
          {renaming ? (
            <RenameBox row={row} onRename={onRename} onDone={onRenameDone} />
          ) : (
            <button type="button" onClick={onOpen} className={cx("min-w-0 flex-1 cursor-pointer truncate text-left text-body font-semibold", row.named ? "text-ink" : "text-mute")}>
              {row.name}
            </button>
          )}
          {badge && (
            <span className={cx("shrink-0 rounded border px-1.5 py-0.5 text-caption font-semibold uppercase tracking-widest", badge.unused ? "border-warn/40 text-warn" : "border-line-strong text-mute")}>
              {badge.text}
            </span>
          )}
        </span>
        {row.description && <span className="w-full truncate text-small text-mute">{row.description}</span>}
        {row.detail && <span className="w-full truncate font-mono text-small text-faint">{row.detail}</span>}
      </div>
      <button
        type="button"
        aria-label={`Actions for ${row.name}`}
        onClick={onMenu}
        className={cx(
          "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-mute hover:bg-hover hover:text-ink",
          menuOpen ? "opacity-100" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        )}
      >
        <MoreIcon size={15} />
      </button>
    </div>
  );
}
