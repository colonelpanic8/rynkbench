import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TOASTS, TOAST_MS, askConfirm, dismissToast, getMessages, resetMessages, showToast } from "./store";

afterEach(() => {
  resetMessages();
  vi.useRealTimers();
});

describe("askConfirm", () => {
  it("resolves with the answer and closes", async () => {
    const answer = askConfirm({ title: "Delete?", confirmLabel: "Delete" });
    expect(getMessages().confirm?.title).toBe("Delete?");
    getMessages().confirm?.resolve(true);
    await expect(answer).resolves.toBe(true);
    expect(getMessages().confirm).toBeNull();
  });

  it("answers an open question no when a second one is asked", async () => {
    const first = askConfirm({ title: "First?", confirmLabel: "Yes" });
    const second = askConfirm({ title: "Second?", confirmLabel: "Yes" });
    await expect(first).resolves.toBe(false);
    expect(getMessages().confirm?.title).toBe("Second?");
    getMessages().confirm?.resolve(false);
    await expect(second).resolves.toBe(false);
  });
});

describe("showToast", () => {
  it("disappears on its own", () => {
    vi.useFakeTimers();
    showToast("Saved");
    expect(getMessages().toasts.map((t) => t.text)).toEqual(["Saved"]);
    vi.advanceTimersByTime(TOAST_MS);
    expect(getMessages().toasts).toEqual([]);
  });

  it("keeps the newest few", () => {
    for (let i = 0; i <= MAX_TOASTS; i++) showToast(`note ${i}`);
    expect(getMessages().toasts.map((t) => t.text)).toEqual(
      Array.from({ length: MAX_TOASTS }, (_, i) => `note ${i + 1}`),
    );
  });

  it("can be dismissed early", () => {
    const id = showToast("Undone", { tone: "ok", action: { label: "Redo", run: () => {} } });
    expect(getMessages().toasts[0].action?.label).toBe("Redo");
    dismissToast(id);
    expect(getMessages().toasts).toEqual([]);
  });
});
