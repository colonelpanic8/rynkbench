import { StrictMode, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useDeviceDraft, type DeviceDraft } from "./device-draft";

type Value = { keys: number[] };
interface Step {
  device: Value;
  pending?: boolean;
  check: (draft: DeviceDraft<Value>) => void;
}

// Render-phase updates exercise the hook's React state without a DOM shim.
function run(steps: Step[]) {
  function Editor() {
    const [index, setIndex] = useState(0);
    const step = steps[index];
    const draft = useDeviceDraft(step.device, step.pending);
    step.check(draft);
    if (index + 1 < steps.length) setIndex(index + 1);
    return null;
  }
  renderToStaticMarkup(<StrictMode><Editor /></StrictMode>);
}

const saved = { keys: [1] };
const edited = { keys: [2] };
const pushed = { keys: [3] };

describe("useDeviceDraft", () => {
  it("follows confirmed pushes while clean and resets dirty edits to the latest push", () => {
    run([
      { device: saved, check: ({ dirty }) => expect(dirty).toBe(false) },
      { device: pushed, check: ({ draft, setDraft }) => {
        expect(draft).toEqual(pushed);
        setDraft(edited);
      } },
      { device: saved, check: ({ draft, dirty, reset }) => {
        expect(draft).toEqual(edited);
        expect(dirty).toBe(true);
        reset();
      } },
      { device: saved, check: ({ draft, dirty }) => {
        expect(draft).toEqual(saved);
        expect(dirty).toBe(false);
      } },
    ]);
  });

  it("keeps the attempted edit when an optimistic write rolls back", () => {
    run([
      { device: saved, check: ({ setDraft }) => setDraft(edited) },
      { device: edited, pending: true, check: ({ draft, dirty }) => {
        expect(draft).toEqual(edited);
        expect(dirty).toBe(true);
      } },
      { device: saved, check: ({ draft, dirty }) => {
        expect(draft).toEqual(edited);
        expect(dirty).toBe(true);
      } },
      { device: edited, pending: true, check: () => {} },
      { device: edited, check: ({ draft, dirty }) => {
        expect(draft).toEqual(edited);
        expect(dirty).toBe(false);
      } },
      { device: pushed, check: ({ draft }) => expect(draft).toEqual(pushed) },
    ]);
  });

  it("preserves edits made during a write when its earlier value is confirmed", () => {
    run([
      { device: saved, check: ({ setDraft }) => setDraft(edited) },
      { device: edited, pending: true, check: ({ setDraft }) => setDraft(pushed) },
      { device: edited, check: ({ draft, dirty }) => {
        expect(draft).toEqual(pushed);
        expect(dirty).toBe(true);
      } },
    ]);
  });
});
