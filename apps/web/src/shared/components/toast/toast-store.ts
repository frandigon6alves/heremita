export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  message: string;
  action?: ToastAction;
  /** Milliseconds before it hides itself; `null` keeps it until dismissed. */
  durationMs?: number | null;
}

export interface Toast extends Required<Pick<ToastOptions, 'message'>> {
  id: number;
  action: ToastAction | undefined;
  durationMs: number | null;
}

export interface Announcement {
  id: number;
  text: string;
}

export interface ToastState {
  toasts: readonly Toast[];
  announcement: Announcement | null;
}

/** Long enough to read a short sentence and reach its Undo button. */
export const DEFAULT_TOAST_DURATION_MS = 6000;
const MAX_VISIBLE = 3;

let state: ToastState = { toasts: [], announcement: null };
let nextId = 1;
const listeners = new Set<() => void>();

function setState(next: ToastState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): ToastState {
  return state;
}

const EMPTY: ToastState = { toasts: [], announcement: null };

export function getServerSnapshot(): ToastState {
  return EMPTY;
}

/**
 * Reads `text` out in the app's single polite live region without showing a
 * toast (reorder results, search result counts).
 */
export function announce(text: string): void {
  setState({ ...state, announcement: { id: nextId++, text } });
}

/** Shows a toast and announces it. Returns its id for `dismissToast`. */
export function showToast({
  message,
  action,
  durationMs = DEFAULT_TOAST_DURATION_MS,
}: ToastOptions): number {
  const id = nextId++;
  const toast: Toast = { id, message, action, durationMs };
  setState({
    toasts: [...state.toasts, toast].slice(-MAX_VISIBLE),
    announcement: { id, text: message },
  });
  return id;
}

export function dismissToast(id: number): void {
  if (state.toasts.some((toast) => toast.id === id)) {
    setState({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) });
  }
}

/** Test helper: forget every toast and announcement. */
export function resetToasts(): void {
  setState(EMPTY);
}
