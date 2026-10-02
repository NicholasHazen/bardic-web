import { describe, expect, it } from 'vitest';
import { begin, cancel, fractionOf, initial, key, KEY_STEP, move, release, THRESHOLD, valueText } from './slide';

describe('slide to confirm: pointer', () => {
  it('a short drag goes home and does not confirm', () => {
    let s = begin(initial());
    s = move(s, 0.5);
    expect(s).toEqual({ value: 0.5, status: 'dragging' });
    expect(release(s)).toEqual({ value: 0, status: 'idle' });
  });
  it('a drag to the end confirms on release', () => {
    let s = move(begin(initial()), 0.95);
    expect(THRESHOLD).toBeLessThan(0.95);
    s = release(s);
    expect(s).toEqual({ value: 1, status: 'confirmed' });
  });
  it('moving without starting does nothing, and the value stays between 0 and 1', () => {
    expect(move(initial(), 0.9)).toEqual(initial());
    expect(move(begin(initial()), 7).value).toBe(1);
    expect(move(begin(initial()), -3).value).toBe(0);
  });
  it('a lost pointer never confirms', () => {
    const s = cancel(move(begin(initial()), 0.99));
    expect(s).toEqual({ value: 0, status: 'idle' });
    expect(release(s)).toEqual(s);
  });
  it('confirmed is final', () => {
    const done = release(move(begin(initial()), 1));
    expect(done.status).toBe('confirmed');
    expect(begin(done)).toEqual(done);
    expect(cancel(done)).toEqual(done);
    expect(key(done, 'ArrowLeft')).toEqual(done);
    expect(move(done, 0)).toEqual(done);
  });
  it('turns a pointer position into a fraction of the travel', () => {
    // track 342 wide, handle 48, 4 px padding each side: travel 286
    expect(fractionOf(100 + 4 + 24, 100, 342, 48, 24)).toBe(0);
    expect(fractionOf(100 + 4 + 24 + 286, 100, 342, 48, 24)).toBe(1);
    expect(fractionOf(100 + 4 + 24 + 143, 100, 342, 48, 24)).toBeCloseTo(0.5);
    expect(fractionOf(0, 100, 342, 48, 24)).toBe(0);
    expect(fractionOf(5000, 100, 342, 48, 24)).toBe(1);
    expect(fractionOf(5, 0, 40, 48, 0)).toBe(0);
  });
});

describe('slide to confirm: keyboard', () => {
  it('four presses of Enter, Space or an arrow confirm; fewer do not', () => {
    for (const k of ['Enter', ' ', 'ArrowRight', 'ArrowUp']) {
      let s = initial();
      for (let i = 1; i <= 3; i++) {
        s = key(s, k);
        expect(s.status).toBe('idle');
        expect(s.value).toBeCloseTo(i * KEY_STEP);
      }
      s = key(s, k);
      expect(s).toEqual({ value: 1, status: 'confirmed' });
    }
  });
  it('one press never confirms', () => {
    expect(key(initial(), 'Enter').status).toBe('idle');
  });
  it('back keys step back and Home resets, never below zero', () => {
    let s = key(key(initial(), 'ArrowRight'), 'ArrowRight');
    expect(s.value).toBe(0.5);
    s = key(s, 'ArrowLeft');
    expect(s.value).toBe(0.25);
    expect(key(s, 'Home').value).toBe(0);
    expect(key(initial(), 'ArrowDown').value).toBe(0);
  });
  it('other keys, including Escape and Tab, do nothing', () => {
    const s = key(initial(), 'ArrowRight');
    for (const k of ['Escape', 'Tab', 'a', 'End', 'PageUp']) expect(key(s, k)).toEqual(s);
  });
  it('says its value in words for a screen reader', () => {
    expect(valueText(initial())).toBe('Not confirmed');
    expect(valueText(key(initial(), 'Enter'))).toBe('1 of 4 steps toward deleting');
    expect(valueText({ value: 1, status: 'confirmed' })).toBe('Confirmed');
  });
});
