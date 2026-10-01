// Sleep timer choices and the words about them. The value type is `SleepTimer` from src/player/types.ts.
import type { SleepTimer } from '../../player/types';

export const SLEEP_MINUTES = [15, 30, 45, 60] as const;

export type SleepChoice = 'off' | 'end_of_chapter' | `m${(typeof SLEEP_MINUTES)[number]}`;

export interface SleepOption {
  id: SleepChoice;
  label: string;
}

export const SLEEP_OPTIONS: readonly SleepOption[] = [
  { id: 'off', label: 'Off' },
  ...SLEEP_MINUTES.map((m) => ({ id: `m${m}` as SleepChoice, label: `${m} minutes` })),
  { id: 'end_of_chapter', label: 'End of chapter' },
];

/** The timer a choice starts at time `now` (epoch ms). */
export function timerFor(choice: SleepChoice, now: number): SleepTimer {
  if (choice === 'off') return { kind: 'off' };
  if (choice === 'end_of_chapter') return { kind: 'end_of_chapter' };
  const minutes = Number(choice.slice(1));
  return { kind: 'minutes', minutes, endsAt: now + minutes * 60_000 };
}

/** Which option shows as chosen. A timer of a length the options do not offer shows as none of them. */
export function choiceOf(timer: SleepTimer): SleepChoice | null {
  if (timer.kind === 'off') return 'off';
  if (timer.kind === 'end_of_chapter') return 'end_of_chapter';
  return (SLEEP_MINUTES as readonly number[]).includes(timer.minutes) ? (`m${timer.minutes}` as SleepChoice) : null;
}

/** Whole minutes left, rounded up; 0 when the time has passed. */
export function minutesLeft(timer: SleepTimer, now: number): number | null {
  if (timer.kind !== 'minutes') return null;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 60_000));
}

/** "Pauses in 30 minutes", "Pauses in 1 minute", "Pauses in under a minute"; null when the timer is off. */
export function timeLeftTitle(timer: SleepTimer, now: number): string | null {
  if (timer.kind === 'off') return null;
  if (timer.kind === 'end_of_chapter') return 'Pauses at the end of this chapter';
  const left = timer.endsAt - now;
  if (left <= 0) return 'Pausing now';
  if (left < 60_000) return 'Pauses in under a minute';
  const m = Math.ceil(left / 60_000);
  return `Pauses in ${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** Short label for a button that opens the sheet: "30 min left", "End of chapter", or null when off. */
export function timerBadge(timer: SleepTimer, now: number): string | null {
  if (timer.kind === 'off') return null;
  if (timer.kind === 'end_of_chapter') return 'End of chapter';
  const m = minutesLeft(timer, now) ?? 0;
  return m <= 0 ? 'Pausing' : `${m} min left`;
}
