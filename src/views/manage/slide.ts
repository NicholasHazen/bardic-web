// The slide-to-confirm control as a state machine. A confirmation that cannot be done by accident, and that does
// not need a finger: the pointer drags the handle to the end; the keyboard (and a screen reader) moves it in
// steps. Nothing here touches the DOM.
//
//   idle --drag--> dragging --release past THRESHOLD--> confirmed
//                      \--release short--> idle (handle returns)
//   idle --Enter/Space/Right/Up (4 presses)--> confirmed
//
// `confirmed` is final: the owner calls its action once and later input is ignored.

/** How far the handle must go (0 to 1) before a release confirms. */
export const THRESHOLD = 0.92;
/** One key press moves this far; four presses confirm. */
export const KEY_STEP = 0.25;

export type SlideStatus = 'idle' | 'dragging' | 'confirmed';
export interface SlideState {
  /** 0 to 1. */
  value: number;
  status: SlideStatus;
}

export const initial = (): SlideState => ({ value: 0, status: 'idle' });

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function begin(s: SlideState): SlideState {
  return s.status === 'confirmed' ? s : { ...s, status: 'dragging' };
}

export function move(s: SlideState, fraction: number): SlideState {
  if (s.status !== 'dragging') return s;
  return { ...s, value: clamp(fraction) };
}

/** Let go: past the threshold confirms (the handle ends at the end); short of it, the handle goes home. */
export function release(s: SlideState): SlideState {
  if (s.status !== 'dragging') return s;
  return s.value >= THRESHOLD ? { value: 1, status: 'confirmed' } : { value: 0, status: 'idle' };
}

/** A cancelled drag (the pointer was lost, Escape): never confirms. */
export function cancel(s: SlideState): SlideState {
  return s.status === 'confirmed' ? s : { value: 0, status: 'idle' };
}

/** The keyboard: Enter, Space, Right and Up step forward; Left, Down and Home step back. Other keys do nothing. */
export function key(s: SlideState, k: string): SlideState {
  if (s.status === 'confirmed') return s;
  const forward = k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'ArrowRight' || k === 'ArrowUp';
  const back = k === 'ArrowLeft' || k === 'ArrowDown';
  if (forward) {
    const value = Math.round((s.value + KEY_STEP) * 100) / 100;
    return value >= THRESHOLD ? { value: 1, status: 'confirmed' } : { value, status: 'idle' };
  }
  if (back) return { value: Math.max(0, Math.round((s.value - KEY_STEP) * 100) / 100), status: 'idle' };
  if (k === 'Home') return { value: 0, status: 'idle' };
  return s;
}

/** What a screen reader hears as the value. */
export function valueText(s: SlideState): string {
  if (s.status === 'confirmed') return 'Confirmed';
  const steps = Math.round(s.value / KEY_STEP);
  return s.value === 0 ? 'Not confirmed' : `${steps} of 4 steps toward deleting`;
}

/** Where the pointer is along the track, as 0 to 1 of the travel (the handle's left edge from its start). */
export function fractionOf(pointerX: number, trackLeft: number, trackWidth: number, handleWidth: number, grabOffset: number): number {
  const travel = trackWidth - handleWidth - 8;
  if (travel <= 0) return 0;
  return clamp((pointerX - trackLeft - 4 - grabOffset) / travel);
}
