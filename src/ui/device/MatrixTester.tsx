// Poll the live key matrix and light up whatever is physically pressed.

import { useMemo, useState } from "react";
import { KeyboardCanvas } from "../KeyboardCanvas";
import { useWorkbench } from "../state";
import { useMatrixPoll } from "../matrix-poll";
import { Button, Panel, SectionLabel } from "../kit";
import { SpinnerIcon } from "../icons";

export function MatrixTester() {
  const { bundle } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const [active, setActive] = useState(false);
  const indices = useMatrixPoll(active);
  const pressed = useMemo(() => new Set(indices), [indices]);

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <SectionLabel>Matrix tester</SectionLabel>
        {active && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-accent">
            <SpinnerIcon size={11} />
            polling
          </span>
        )}
        <div className="flex-1" />
        {active && (
          <span className="tnum text-[12px] text-mute">
            {pressed.size} key{pressed.size === 1 ? "" : "s"} down
          </span>
        )}
        <Button
          variant={active ? "outline" : "primary"}
          className="py-1"
          onClick={() => setActive((v) => !v)}
        >
          {active ? "Stop test" : "Test matrix"}
        </Button>
      </div>
      {active ? (
        <div className="canvas-well mt-3 rounded-xl border border-line-soft px-6 py-4">
          <KeyboardCanvas
            model={bundle.model}
            interactive={false}
            className="mx-auto max-h-48 w-full"
            decorFor={(key) => {
              const down = pressed.has(key.row * cols + key.col);
              return {
                glyph: key.label ? { text: key.label, dim: true } : undefined,
                highlight: down,
                fill: down ? "var(--color-accent)" : undefined,
              };
            }}
          />
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] leading-relaxed text-mute">
          Poll the live key matrix and light up whatever is physically pressed — handy for
          checking switches and solder joints.
        </p>
      )}
    </Panel>
  );
}
