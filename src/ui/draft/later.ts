// A task run a moment after it was last asked for, or at once when flushed:
// the kept draft is saved this way, and flushed when the workbench goes away
// so a quick reconnect does not lose the last change.

export interface Later {
  /** Runs `task` after the delay, in place of any task still waiting. */
  schedule(task: () => void): void;
  /** Runs the waiting task now, if there is one. */
  flush(): void;
  /** Drops the waiting task. */
  cancel(): void;
}

export function later(ms: number): Later {
  let waiting: { task: () => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const cancel = () => {
    if (waiting) clearTimeout(waiting.timer);
    waiting = null;
  };
  const flush = () => {
    const task = waiting?.task;
    cancel();
    task?.();
  };
  return {
    schedule(task) {
      cancel();
      waiting = { task, timer: setTimeout(flush, ms) };
    },
    flush,
    cancel,
  };
}
