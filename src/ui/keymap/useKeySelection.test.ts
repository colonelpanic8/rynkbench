// A drag that selects keys lasts from the press that selected until the
// pointer is let go, wherever that happens.

import { describe, expect, it } from "vitest";
import { selectDrag } from "./useKeySelection";

describe("a selecting drag", () => {
  const listening = () => {
    const window = new EventTarget();
    const drag = selectDrag();
    const stop = drag.listen(window);
    return { window, drag, stop };
  };

  it.each(["pointerup", "pointercancel", "blur"])("ends on %s anywhere, so a later drag from the background selects nothing", (event) => {
    const { window, drag } = listening();
    drag.start("add");
    window.dispatchEvent(new Event(event));
    expect(drag.active()).toBe(false);
    expect(drag.crossing()).toBeNull();
  });

  it("selects nothing more after a press that only picked one key, yet still holds the drag", () => {
    const { drag } = listening();
    drag.start(null);
    expect(drag.active()).toBe(true);
    expect(drag.crossing()).toBeNull();
  });
});
