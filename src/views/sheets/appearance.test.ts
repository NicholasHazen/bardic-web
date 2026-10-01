import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_EXTRAS,
  clampSize,
  clampSpacing,
  loadAppearance,
  loadExtras,
  nearestSpacing,
  normalizeAppearance,
  saveAppearance,
  saveExtras,
  stepSize,
  type KeyValueStorage,
} from './appearance';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('size', () => {
  it('stays inside the reading sizes', () => {
    expect(clampSize(10)).toBe(19);
    expect(clampSize(40)).toBe(23);
    expect(clampSize(20.6)).toBe(21);
    expect(clampSize(Number.NaN)).toBe(21);
    expect(clampSize('big')).toBe(21);
  });
  it('steps one pixel and stops at the ends', () => {
    expect(stepSize(21, 1)).toBe(22);
    expect(stepSize(23, 1)).toBe(23);
    expect(stepSize(19, -1)).toBe(19);
  });
});

describe('spacing', () => {
  it('clamps and shows as the nearest word', () => {
    expect(clampSpacing(0.5)).toBe(1.4);
    expect(clampSpacing(9)).toBe(2);
    expect(nearestSpacing(1.72).label).toBe('Normal');
    expect(nearestSpacing(1.45).label).toBe('Tight');
    expect(nearestSpacing(2).label).toBe('Loose');
  });
});

describe('normalize', () => {
  it('fills in the defaults for nothing, junk and half-filled values', () => {
    expect(normalizeAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance('x')).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ size: 22, theme: 'neon', font: 'comic' })).toEqual({ ...DEFAULT_APPEARANCE, size: 22 });
  });
  it('keeps night and the four contract themes', () => {
    for (const theme of ['dark', 'dim', 'light', 'sepia', 'night']) expect(normalizeAppearance({ theme }).theme).toBe(theme);
  });
});

describe('persistence', () => {
  it('round-trips through a storage', () => {
    const s = memory();
    const v = { size: 23, theme: 'sepia' as const, font: 'sans' as const, spacing: 1.9, dimAura: true };
    expect(saveAppearance(s, v)).toBe(true);
    expect(loadAppearance(s)).toEqual(v);
    saveExtras(s, { followNarration: false, keepScreenOn: true, pageWidth: 'full' });
    expect(loadExtras(s)).toEqual({ followNarration: false, keepScreenOn: true, pageWidth: 'full' });
  });
  it('returns defaults for corrupt, missing or blocked storage and never throws', () => {
    const s = memory();
    s.data.set(APPEARANCE_KEY, '{not json');
    expect(loadAppearance(s)).toEqual(DEFAULT_APPEARANCE);
    expect(loadAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(loadExtras(undefined)).toEqual(DEFAULT_EXTRAS);
    const blocked: KeyValueStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(loadAppearance(blocked)).toEqual(DEFAULT_APPEARANCE);
    expect(saveAppearance(blocked, DEFAULT_APPEARANCE)).toBe(false);
  });
  it('stores only valid values', () => {
    const s = memory();
    saveAppearance(s, { ...DEFAULT_APPEARANCE, size: 99 });
    expect(JSON.parse(s.data.get(APPEARANCE_KEY)!).size).toBe(23);
  });
});
