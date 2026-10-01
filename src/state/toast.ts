import { writable } from 'svelte/store';

export interface ToastMessage {
  id: number;
  message: string;
  /** A link action, e.g. "Open" to the book that was just added. */
  actionLabel?: string;
  href?: string;
  /** A callback action, e.g. "Undo". */
  onaction?: () => void;
}

/** The one toast the library screens show at a time. */
export const toast = writable<ToastMessage | null>(null);

let next = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Show a message; it goes away by itself after `ms` (default 6 s). */
export function showToast(t: Omit<ToastMessage, 'id'>, ms = 6000): void {
  clearTimeout(timer);
  toast.set({ ...t, id: next++ });
  timer = setTimeout(() => toast.set(null), ms);
}

export function dismissToast(): void {
  clearTimeout(timer);
  toast.set(null);
}
