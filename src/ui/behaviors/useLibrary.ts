// What the Behavior Library and All your behaviors read: the workbench's
// behaviors as rows' input, with how each is used (ADR 0020).

import { useMemo } from "react";
import { useWorkbench } from "../state";
import { useWording } from "../terms";
import { useLayerNames } from "../layer-names";
import { behaviorUses } from "../../operations";
import { wantOf } from "../../workbench/draft/want";
import { useUsageReport } from "./useUsage";
import type { LibraryInput } from "./library";

export function useLibraryInput(): LibraryInput {
  const { bundle, state } = useWorkbench();
  const usage = useUsageReport();
  const wording = useWording();
  const layerNames = useLayerNames();
  const cols = bundle.caps.num_cols;
  const { layers, morse, forks, macroOps, morseProfiles, combos } = state;
  const behaviorUse = useMemo(
    () => behaviorUses(wantOf(state), cols),
    // What you want changes with these; the rest of the state does not change how behaviors are used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layers, morse, forks, macroOps, morseProfiles, combos, cols],
  );
  return { usage, macroOps, morse, forks, profiles: morseProfiles, labels: state.labels, behaviorUse, wording, layerNames };
}
