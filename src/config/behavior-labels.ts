// Behavior labels in a TOML layout file (ADR 0020). The format names each
// `[[macro]]`, `[[morse]]` and `[[fork]]` table, the n-th table being slot n;
// the names the renderer makes up (`morse 3`) are not labels. A description is
// a `# ` comment line right under its table's header, since the format rejects
// unknown fields; other tools ignore it. Profiles keep their names in the file
// already. Pure text work on the renderer's output.

import { noLabels, withLabel, type BehaviorKind, type BehaviorLabels } from "../model/behavior-labels";

const TABLES: Record<string, Exclude<BehaviorKind, "profiles">> = { "[[macro]]": "macros", "[[morse]]": "morse", "[[fork]]": "forks" };
const MADE_UP = /^(macro|morse|fork) \d+$/;
const NAME = /^name\s*=\s*(".*")\s*$/;
const DESCRIPTION = /^# (.*)$/;
const isHeader = (line: string) => line.trimStart().startsWith("[");

interface Table {
  kind: Exclude<BehaviorKind, "profiles">;
  slot: number;
  /** The header's line, and the line after the table's last. */
  start: number;
  end: number;
}

function tablesOf(lines: readonly string[]): Table[] {
  const counts: Record<string, number> = {};
  const out: Table[] = [];
  lines.forEach((line, index) => {
    if (!isHeader(line)) return;
    const open = out.at(-1);
    if (open && open.end === -1) open.end = index;
    const kind = TABLES[line.trim()];
    if (kind) out.push({ kind, slot: (counts[kind] = (counts[kind] ?? -1) + 1), start: index, end: -1 });
  });
  const last = out.at(-1);
  if (last && last.end === -1) last.end = lines.length;
  return out;
}

function unquote(text: string): string {
  try {
    return String(JSON.parse(text));
  } catch {
    return "";
  }
}

/** The labels a TOML file holds. */
export function labelsFromToml(text: string): BehaviorLabels {
  const lines = text.split("\n");
  let labels = noLabels();
  for (const table of tablesOf(lines)) {
    const body = lines.slice(table.start + 1, table.end);
    const named = body.map((line) => NAME.exec(line.trim())).find(Boolean);
    const name = named ? unquote(named[1]) : "";
    const description = DESCRIPTION.exec(lines[table.start + 1] ?? "")?.[1] ?? "";
    labels = withLabel(labels, table.kind, table.slot, { name: MADE_UP.test(name) ? "" : name, description });
  }
  return labels;
}

/** The rendered TOML with the labels' names and descriptions in their tables. */
export function withTomlLabels(text: string, labels: BehaviorLabels): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let at = 0;
  for (const table of tablesOf(lines)) {
    out.push(...lines.slice(at, table.start + 1));
    const label = labels[table.kind][table.slot];
    let body = lines.slice(table.start + 1, table.end);
    if (DESCRIPTION.test(body[0] ?? "")) body = body.slice(1);
    if (label?.name) body = body.filter((line) => !NAME.test(line.trim()));
    if (label?.description) out.push(`# ${label.description.replace(/\s+/g, " ")}`);
    if (label?.name) out.push(`name = ${JSON.stringify(label.name)}`);
    out.push(...body);
    at = table.end;
  }
  out.push(...lines.slice(at));
  return out.join("\n");
}
