// Playback speed choices. The board offers eight chips (0.75 to 2.5) and a fine adjust in steps of 0.05;
// `SPEEDS` in src/player/types.ts stops at 2, so the extra two are added here.
import { SPEEDS } from '../../player/types';

export const SPEED_MIN = 0.75;
export const SPEED_MAX = 2.5;
export const SPEED_STEP = 0.05;
export const SPEED_CHOICES: readonly number[] = [...SPEEDS, 2.25, 2.5];

/** Round to the step and keep inside the range. Not a number gives 1. */
export function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return 1;
  const snapped = Math.round(v / SPEED_STEP) * SPEED_STEP;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, snapped)) * 100) / 100;
}

/** One fine-adjust step up or down. */
export function nudgeSpeed(v: number, direction: 1 | -1): number {
  return clampSpeed(v + direction * SPEED_STEP);
}

/** "1.25×", "1×", "0.75×" (no trailing zeros). */
export function speedText(v: number): string {
  return `${Number(v.toFixed(2))}×`;
}

/** Where the speed sits on the slider, 0 to 1. */
export function speedFraction(v: number): number {
  return (clampSpeed(v) - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
}

export const isChoice = (v: number) => SPEED_CHOICES.some((c) => Math.abs(c - v) < 1e-9);
