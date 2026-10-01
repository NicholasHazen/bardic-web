import { describe, expect, it } from 'vitest';
import { SPEEDS } from '../../player/types';
import { SPEED_CHOICES, clampSpeed, isChoice, nudgeSpeed, speedFraction, speedText } from './speed';

describe('speed', () => {
  it('offers the engine speeds plus 2.25 and 2.5', () => {
    expect(SPEED_CHOICES).toEqual([...SPEEDS, 2.25, 2.5]);
    expect(SPEED_CHOICES).toHaveLength(8);
  });
  it('clamps and snaps to 0.05', () => {
    expect(clampSpeed(0.1)).toBe(0.75);
    expect(clampSpeed(9)).toBe(2.5);
    expect(clampSpeed(1.2149)).toBe(1.2);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });
  it('nudges without float drift', () => {
    let v = 1;
    for (let i = 0; i < 5; i++) v = nudgeSpeed(v, 1);
    expect(v).toBe(1.25);
    expect(nudgeSpeed(0.75, -1)).toBe(0.75);
    expect(nudgeSpeed(2.5, 1)).toBe(2.5);
  });
  it('writes it without trailing zeros', () => {
    expect(speedText(1.25)).toBe('1.25×');
    expect(speedText(1)).toBe('1×');
    expect(speedText(1.5)).toBe('1.5×');
    expect(speedText(2.25)).toBe('2.25×');
  });
  it('places it on the slider as the board does', () => {
    expect(speedFraction(1.25)).toBeCloseTo(0.2857, 3);
    expect(speedFraction(0.75)).toBe(0);
    expect(speedFraction(2.5)).toBe(1);
  });
  it('knows a chip speed from a fine adjust', () => {
    expect(isChoice(1.25)).toBe(true);
    expect(isChoice(1.3)).toBe(false);
  });
});
