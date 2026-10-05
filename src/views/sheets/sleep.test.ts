import { describe, expect, it } from 'vitest';
import { choiceOf, minutesLeft, timeLeftTitle, timerBadge, timerFor } from './sleep';

const NOW = 1_000_000;

describe('timerFor', () => {
  it('starts a timer that ends the chosen minutes from now', () => {
    expect(timerFor('m30', NOW)).toEqual({ kind: 'minutes', minutes: 30, endsAt: NOW + 30 * 60_000 });
    expect(timerFor('off', NOW)).toEqual({ kind: 'off' });
    expect(timerFor('end_of_chapter', NOW)).toEqual({ kind: 'end_of_chapter' });
  });
});

describe('choiceOf', () => {
  it('maps a timer back to its option', () => {
    expect(choiceOf({ kind: 'off' })).toBe('off');
    expect(choiceOf({ kind: 'minutes', minutes: 45, endsAt: 0 })).toBe('m45');
    expect(choiceOf({ kind: 'end_of_chapter' })).toBe('end_of_chapter');
  });
  it('shows no option for a length the sheet does not offer', () => {
    expect(choiceOf({ kind: 'minutes', minutes: 20, endsAt: 0 })).toBeNull();
  });
});

describe('time left', () => {
  const timer = { kind: 'minutes' as const, minutes: 30, endsAt: NOW + 30 * 60_000 };
  it('rounds up so it never says 0 minutes while time is left', () => {
    expect(minutesLeft(timer, NOW)).toBe(30);
    expect(minutesLeft(timer, NOW + 29 * 60_000 + 1)).toBe(1);
    expect(minutesLeft(timer, NOW + 31 * 60_000)).toBe(0);
    expect(minutesLeft({ kind: 'off' }, NOW)).toBeNull();
  });
  it('words it', () => {
    expect(timeLeftTitle(timer, NOW)).toBe('Pauses in 30 minutes');
    expect(timeLeftTitle(timer, NOW + 29 * 60_000)).toBe('Pauses in 1 minute');
    expect(timeLeftTitle(timer, NOW + 29.5 * 60_000)).toBe('Pauses in under a minute');
    expect(timeLeftTitle(timer, NOW + 31 * 60_000)).toBe('Pausing now');
    expect(timeLeftTitle({ kind: 'end_of_chapter' }, NOW)).toBe('Pauses at the end of this chapter');
    expect(timeLeftTitle({ kind: 'off' }, NOW)).toBeNull();
  });
  it('has a short badge', () => {
    expect(timerBadge(timer, NOW + 10 * 60_000)).toBe('20 min left');
    expect(timerBadge({ kind: 'end_of_chapter' }, NOW)).toBe('End of chapter');
    expect(timerBadge({ kind: 'off' }, NOW)).toBeNull();
  });
});
