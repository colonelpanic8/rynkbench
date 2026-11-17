// "Try out (not saved)" in the RGB Lighting tab: offered for a connected
// keyboard with an overlay, never for a file. Its switch and lifetime live in
// the light view; the lights themselves in the workbench (`tryOut`, `applied`),
// and they reach the keyboard only through `io`. Turning it off takes the
// try-out lights off the keyboard.

import { tryOutPlan } from "../../model/lighting/try-out";
import { useWorkbench } from "../state";
import { useCapability } from "../use-capabilities";
import { lightView, useLightView } from "./lightView";

export function useTryOut() {
  const { bundle, state, io } = useWorkbench();
  const view = useLightView();
  const offered = useCapability("lighting.overlay") !== undefined && bundle.session.kind !== "offline";
  const lit = new Set([...Object.keys(state.tryOut), ...Object.keys(state.applied)]).size;
  return {
    offered,
    on: offered && view.tryingOut,
    lifetimeMs: view.lifetimeMs,
    /** Keys with a try-out light, here or on the keyboard. */
    lit,
    /** How many try-out lights can be kept on a layer. */
    keepable: Object.keys(state.tryOut).length,
    turn(on: boolean) {
      lightView.setTryingOut(on);
      // A brush of a stored-only light paints nothing while trying out.
      if (on && view.brush && !tryOutPlan(view.brush, [], null)) lightView.setBrush(null);
      if (!on && lit > 0) void io.clearTryOut();
    },
    setLifetime: lightView.setLifetime,
    clear: () => io.clearTryOut(),
    keep: (layer: number) => io.keepTryOut(layer),
  };
}

export type TryOut = ReturnType<typeof useTryOut>;
