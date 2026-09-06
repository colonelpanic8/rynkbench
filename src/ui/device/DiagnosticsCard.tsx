// Session request trace, with a way to get it off the machine.

import { useEffect, useState } from "react";
import { isRequest, sessionLog } from "../../session/diagnostics";
import { Button, Chip, Panel, SectionLabel, cx } from "../kit";

/** The recent request trace, with a way to get it off the machine. Console
 *  logs are not reachable in the desktop app, so the copy button is the point
 *  of this panel — a stalled or failing op is visible here after the fact. */
export function DiagnosticsCard() {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  // The log is mutated outside React; poll while the panel is open.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const records = sessionLog.entries();
  const recent = records.slice(-12);
  const failures = records.filter((r) => isRequest(r) && r.outcome !== "ok").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sessionLog.format());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the trace is still readable below.
      setCopied(false);
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Session diagnostics</SectionLabel>
        <Chip tone={failures > 0 ? "danger" : "neutral"}>
          {records.length} recorded{failures > 0 ? ` · ${failures} failed` : ""}
        </Chip>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mute">
        Every request to the keyboard, with how long it took. Copy this if something misbehaves.
        Set <code className="text-faint">localStorage["rynk:debug"] = "1"</code> to mirror it to the
        console.
      </p>
      {recent.length === 0 && (
        <p className="mt-2 text-[11.5px] text-faint">
          Nothing recorded yet. Simulated boards answer in-process and are not traced — this fills
          in against a real keyboard.
        </p>
      )}
      {recent.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-line-soft bg-well p-2 font-mono text-[11px] leading-relaxed">
          {recent.map((record, index) => (
            <div
              key={index}
              className={cx(
                "truncate",
                !isRequest(record)
                  ? "text-accent"
                  : record.outcome === "ok"
                    ? "text-faint"
                    : "text-danger",
              )}
              title={isRequest(record) ? (record.detail ?? record.op) : record.message}
            >
              {isRequest(record)
                ? `${record.op} ${record.outcome} ${record.durationMs.toFixed(0)}ms`
                : record.message}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={copy}>
          {copied ? "Copied" : "Copy full trace"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            sessionLog.clear();
            setTick((n) => n + 1);
          }}
        >
          Clear
        </Button>
      </div>
    </Panel>
  );
}

