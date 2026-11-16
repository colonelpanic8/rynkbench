// A list of behavior rows with their menu (ADR 0020): open, rename in the row,
// duplicate, copy and delete. The library's lists and a kind's section both
// draw their rows with it.

import { useState } from "react";
import { RowMenu, useRowMenu } from "../RowMenu";
import { useWorkbench } from "../state";
import { showToast } from "../messages/store";
import { BehaviorRow } from "./BehaviorRow";
import { useBehaviorActions } from "./useBehaviorActions";
import { rowKey } from "./all-behaviors";
import type { LibraryRow } from "./library";

const ROW_ACTIONS = [
  { id: "open", label: "Open in editor" },
  { id: "rename", label: "Rename" },
  { id: "duplicate", label: "Duplicate" },
  { id: "copy", label: "Copy" },
  "-" as const,
  { id: "delete", label: "Delete", danger: true },
];

export function BehaviorRows({ rows }: { rows: readonly LibraryRow[] }) {
  const { io } = useWorkbench();
  const actions = useBehaviorActions();
  const menu = useRowMenu<string>();
  const [renaming, setRenaming] = useState<string | null>(null);
  const atRow = menu.at ? rows.find((row) => rowKey(row) === menu.at?.id) : undefined;
  const run = async (id: string, row: LibraryRow) => {
    if (id === "open") actions.open(row.kind, row.index);
    else if (id === "rename") setRenaming(rowKey(row));
    else if (id === "copy") actions.copy([row]);
    else if (id === "delete") await actions.remove(row);
    else if (id === "duplicate") {
      const done = await io.apply("duplicate_behavior", { kind: row.kind, slot: row.index });
      if (!done.ok) showToast(`${row.name} not duplicated: ${done.message}`, { tone: "danger" });
    }
  };
  return (
    <>
      {rows.map((row) => (
        <div key={rowKey(row)} {...menu.rowProps(rowKey(row))}>
          <BehaviorRow
            row={row}
            renaming={renaming === rowKey(row)}
            menuOpen={menu.openFor === rowKey(row)}
            onOpen={() => actions.open(row.kind, row.index)}
            onMenu={(event) => menu.openFrom(event, rowKey(row))}
            onRename={(name) => actions.rename(row, name)}
            onRenameDone={() => setRenaming(null)}
          />
        </div>
      ))}
      {menu.at && atRow && <RowMenu x={menu.at.x} y={menu.at.y} label={atRow.name} items={ROW_ACTIONS} onAction={(id) => void run(id, atRow)} onClose={menu.close} />}
    </>
  );
}
