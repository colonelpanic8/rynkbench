// The app's two kinds of message, as one small store any screen can call:
// `askConfirm` (a question that must be answered before something that cannot
// be taken back) and `showToast` (a short note that something happened). The
// host (MessageHost.tsx) draws them; this file has no React and no DOM.

export type Tone = "neutral" | "ok" | "danger";

export interface ConfirmRequest {
  /** What will happen, consequence first: "Delete the Magic layer?" */
  title: string;
  /** One plain sentence on what follows from it. */
  body?: string;
  /** The verb on the button that goes ahead: "Delete layer". */
  confirmLabel: string;
  cancelLabel?: string;
  /** The action destroys something: the button is drawn in the danger colour. */
  danger?: boolean;
  /** Rynkbench Guard asks (ADR 0011): its label on top, Reject and Approve. */
  guard?: boolean;
  /** Names and places, behind Show details rather than in the message. */
  details?: string[];
  /** Adds Show me: it answers no and takes you to the first place concerned. */
  showMe?: () => void;
}

export interface PendingConfirm extends ConfirmRequest {
  id: number;
  resolve: (answer: boolean) => void;
}

export interface Toast {
  id: number;
  text: string;
  tone: Tone;
  /** One button on the toast, such as Undo. */
  action?: { label: string; run: () => void };
  /** Rynkbench Guard stopped or fixed something: the toast carries its label. */
  guard?: boolean;
}

export interface MessagesState {
  confirm: PendingConfirm | null;
  toasts: Toast[];
}

/** How long a toast stays, and how many can show at once. */
export const TOAST_MS = 4000;
export const MAX_TOASTS = 3;

let state: MessagesState = { confirm: null, toasts: [] };
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function set(next: MessagesState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getMessages(): MessagesState {
  return state;
}

export function subscribeMessages(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Ask a question; resolves true when the person goes ahead. A second
 *  question while one is open answers the first with "no". */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  state.confirm?.resolve(false);
  return new Promise((resolve) => {
    const id = nextId++;
    set({
      ...state,
      confirm: {
        ...request,
        id,
        resolve: (answer) => {
          if (state.confirm?.id === id) set({ ...state, confirm: null });
          resolve(answer);
        },
      },
    });
  });
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (state.toasts.some((toast) => toast.id === id)) {
    set({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) });
  }
}

/** Show a short note. The newest is last; the oldest goes when there are too many. */
export function showToast(
  text: string,
  options: { tone?: Tone; action?: Toast["action"]; guard?: boolean } = {},
): number {
  const id = nextId++;
  const toast: Toast = { id, text, tone: options.tone ?? "neutral", action: options.action, guard: options.guard };
  const toasts = [...state.toasts, toast];
  for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) {
    clearTimeout(timers.get(dropped.id));
    timers.delete(dropped.id);
  }
  set({ ...state, toasts: toasts.slice(-MAX_TOASTS) });
  timers.set(
    id,
    setTimeout(() => dismissToast(id), TOAST_MS),
  );
  return id;
}

/** For tests: forget every message and timer. */
export function resetMessages(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  state.confirm?.resolve(false);
  set({ confirm: null, toasts: [] });
}
