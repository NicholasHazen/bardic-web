import { describe, expect, it } from 'vitest';
import { clockText, formatPlaceTime } from './placeTime';

// All times are built from local components so the tests do not depend on the time zone.
const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 1, 10, 30); // Thursday 1 October 2026, 10:30 am

describe('formatPlaceTime', () => {
  it('says Just now under a minute and for a future time', () => {
    expect(formatPlaceTime(NOW - 20_000, NOW)).toBe('Just now');
    expect(formatPlaceTime(NOW + 5 * 60_000, NOW)).toBe('Just now');
  });
  it('counts minutes within the hour', () => {
    expect(formatPlaceTime(NOW - 3 * 60_000, NOW)).toBe('3 min ago');
    expect(formatPlaceTime(NOW - 59 * 60_000, NOW)).toBe('59 min ago');
  });
  it('says Today with the time later the same day', () => {
    expect(formatPlaceTime(at(2026, 10, 1, 8, 5), NOW)).toBe('Today, 8:05 am');
  });
  it('says Yesterday across midnight even when under 24 hours', () => {
    expect(formatPlaceTime(at(2026, 9, 30, 21, 40), NOW)).toBe('Yesterday, 9:40 pm');
    expect(formatPlaceTime(at(2026, 9, 30, 22, 50), at(2026, 10, 1, 0, 10))).toBe('Yesterday, 10:50 pm');
  });
  it('names the weekday within a week, then the date', () => {
    expect(formatPlaceTime(at(2026, 9, 27, 9, 14), NOW)).toBe('Sun, 9:14 am');
    expect(formatPlaceTime(at(2026, 9, 12, 12, 0), NOW)).toBe('12 Sep, 12:00 pm');
    expect(formatPlaceTime(at(2025, 12, 31, 0, 7), NOW)).toBe('31 Dec 2025, 12:07 am');
  });
});

describe('clockText', () => {
  it('uses a 12 hour clock', () => {
    expect(clockText(new Date(2026, 0, 1, 0, 0))).toBe('12:00 am');
    expect(clockText(new Date(2026, 0, 1, 13, 5))).toBe('1:05 pm');
  });
});
