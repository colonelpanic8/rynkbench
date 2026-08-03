// A rolling trace of what the session asked the device and what came back.
//
// The desktop app's stdout goes nowhere and its webview devtools are awkward
// to reach, so a console-only trace is not retrievable when something goes
// wrong on someone else's machine. Records are kept in memory instead, and
// `format()` renders them as text that can be copied out of the UI.

/** One completed device request. */
export interface RequestRecord {
  /** Protocol call name, e.g. "commit_lighting_overlay_replace". */
  op: string;
  /** Wall clock at completion, for lining the trace up against user reports. */
  at: number;
  durationMs: number;
  outcome: "ok" | "error" | "timeout";
  /** Failure message, truncated. Absent when the request succeeded. */
  detail?: string;
}

/** Anything worth noting that is not a request: connects, drops, teardown. */
export interface EventRecord {
  at: number;
  kind: "event";
  message: string;
}

export type LogRecord = (RequestRecord & { kind?: "request" }) | EventRecord;

const DETAIL_LIMIT = 200;

function truncate(text: string): string {
  return text.length <= DETAIL_LIMIT ? text : `${text.slice(0, DETAIL_LIMIT)}…`;
}

/** Ring buffer of recent activity. Bounded so a long-lived session cannot
 *  grow it without limit. */
export class SessionLog {
  private records: LogRecord[] = [];

  constructor(private readonly limit = 300) {}

  private append(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit);
  }

  request(record: RequestRecord): void {
    this.append(record);
    if (!debugEnabled()) return;
    const line = `rynk ${record.op} ${record.outcome} ${record.durationMs.toFixed(1)}ms`;
    if (record.outcome === "ok") console.debug(line);
    else console.warn(line, record.detail ?? "");
  }

  event(message: string): void {
    this.append({ at: Date.now(), kind: "event", message });
    if (debugEnabled()) console.debug(`rynk ${message}`);
  }

  entries(): readonly LogRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
  }

  /** Slowest-last summary of what each op cost, so a stall stands out even in
   *  a long trace. */
  summary(): Array<{ op: string; count: number; failures: number; maxMs: number }> {
    const byOp = new Map<string, { op: string; count: number; failures: number; maxMs: number }>();
    for (const record of this.records) {
      if (!isRequest(record)) continue;
      const row = byOp.get(record.op) ?? { op: record.op, count: 0, failures: 0, maxMs: 0 };
      row.count += 1;
      if (record.outcome !== "ok") row.failures += 1;
      row.maxMs = Math.max(row.maxMs, record.durationMs);
      byOp.set(record.op, row);
    }
    return [...byOp.values()].sort((a, b) => a.maxMs - b.maxMs);
  }

  /** Plain text for pasting into a bug report. */
  format(): string {
    if (this.records.length === 0) return "(no session activity recorded)";
    const lines = this.records.map((record) => {
      const stamp = new Date(record.at).toISOString().slice(11, 23);
      if (!isRequest(record)) return `${stamp}  ${record.message}`;
      const detail = record.detail ? `  ${record.detail}` : "";
      return `${stamp}  ${record.op} ${record.outcome} ${record.durationMs.toFixed(1)}ms${detail}`;
    });
    const summary = this.summary().map(
      (row) =>
        `  ${row.op}: ${row.count} call(s), ${row.failures} failed, slowest ${row.maxMs.toFixed(1)}ms`,
    );
    return [...lines, "", "slowest ops last:", ...summary].join("\n");
  }
}

export function isRequest(record: LogRecord): record is RequestRecord & { kind?: "request" } {
  return (record as EventRecord).kind !== "event";
}

/** The session-wide log. One per page: sessions come and go, the trace of how
 *  the last one died is exactly what is worth keeping. */
export const sessionLog = new SessionLog();

/** Console mirroring is opt-in — `localStorage.setItem("rynk:debug", "1")` —
 *  so a normal run is not drowned in per-request chatter. Always on in dev. */
export function debugEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("rynk:debug") === "1")
      return true;
  } catch {
    // Storage can throw in a locked-down webview; fall through to the default.
  }
  return typeof import.meta.env !== "undefined" && import.meta.env.DEV === true;
}
