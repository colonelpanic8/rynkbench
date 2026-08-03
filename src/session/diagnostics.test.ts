import { describe, expect, it } from "vitest";
import { isRequest, SessionLog } from "./diagnostics";

function record(log: SessionLog, op: string, outcome: "ok" | "error" | "timeout", durationMs = 1) {
  log.request({ op, at: 0, durationMs, outcome, detail: outcome === "ok" ? undefined : "boom" });
}

describe("session log", () => {
  it("keeps requests and events in order", () => {
    const log = new SessionLog();
    log.event("session opened");
    record(log, "get_lighting_state", "ok");
    const entries = log.entries();
    expect(entries).toHaveLength(2);
    expect(isRequest(entries[0])).toBe(false);
    expect(isRequest(entries[1])).toBe(true);
  });

  it("drops the oldest records past the limit", () => {
    const log = new SessionLog(3);
    for (const op of ["a", "b", "c", "d"]) record(log, op, "ok");
    expect(log.entries().map((r) => (isRequest(r) ? r.op : r.message))).toEqual(["b", "c", "d"]);
  });

  it("summarises calls, failures, and the slowest time per op", () => {
    const log = new SessionLog();
    record(log, "put_chunk", "ok", 5);
    record(log, "put_chunk", "timeout", 5000);
    record(log, "get_state", "ok", 2);
    expect(log.summary()).toEqual([
      { op: "get_state", count: 1, failures: 0, maxMs: 2 },
      { op: "put_chunk", count: 2, failures: 1, maxMs: 5000 },
    ]);
  });

  it("formats a copyable trace that names the failure", () => {
    const log = new SessionLog();
    log.event("session opened on webhid (Glove80)");
    record(log, "commit_overlay", "timeout", 5000);
    const text = log.format();
    expect(text).toContain("session opened on webhid (Glove80)");
    expect(text).toContain("commit_overlay timeout 5000.0ms  boom");
    expect(text).toContain("slowest ops last:");
  });

  it("reports emptiness rather than a bare header", () => {
    expect(new SessionLog().format()).toBe("(no session activity recorded)");
  });
});
