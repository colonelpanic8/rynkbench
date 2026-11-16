// The usage report (what refers to what) for the workbench as it stands, shared
// by the Behavior Library and the Usage screen so both read the same facts.

import { useMemo } from "react";
import { useWorkbench } from "../state";
import { analyzeUsage, type UsageReport } from "../../workbench/usage";

export function useUsageReport(): UsageReport {
  const { bundle, state } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const { layers, defaultLayer, layerMetadata, combos, morse, forks, macroOps, morseProfiles } = state;
  return useMemo(
    () => analyzeUsage({ layers, cols, defaultLayer, layerMetadata, combos, morse, forks, macroOps, morseProfiles }),
    [layers, cols, defaultLayer, layerMetadata, combos, morse, forks, macroOps, morseProfiles],
  );
}
