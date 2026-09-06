// Live matrix polling, shared by the live view's press overlay and the device
// tab's matrix tester. Both want the same thing: row-major indices of the keys
// currently held down, refreshed while the panel is on screen.

import { useEffect, useRef, useState } from "react";
import { useWorkbench } from "./state";
import { pressedMatrixIndices } from "./live/characters";

export const MATRIX_POLL_MS = 100;

/**
 * Poll `get_matrix_state` while `enabled`, returning row-major indices of the
 * pressed keys. A hidden tab is not worth a request every 100 ms, so polling
 * stops with the page and resumes when it comes back; the last known state is
 * retained across transient read failures and cleared when polling is turned
 * off.
 */
export function useMatrixPoll(enabled: boolean, intervalMs = MATRIX_POLL_MS): number[] {
  const { bundle } = useWorkbench();
  const { session } = bundle;
  const rows = bundle.caps.num_rows;
  const cols = bundle.caps.num_cols;
  const [pressed, setPressed] = useState<number[]>([]);
  const inflight = useRef(false);

  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPressed([]);
      return;
    }
    if (!visible) return;
    let cancelled = false;
    const poll = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const matrix = await session.device.matrixState();
        if (!cancelled) setPressed(pressedMatrixIndices(matrix.pressed_bitmap, rows, cols));
      } catch {
        // Legacy/transient read failure: retain the last matrix-derived state.
      } finally {
        inflight.current = false;
      }
    };
    void poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, visible, session, rows, cols, intervalMs]);

  return pressed;
}
