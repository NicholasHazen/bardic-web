import { describe, expect, it } from 'vitest';
import {
  aheadText,
  deriveListening,
  firstPlayable,
  needsCode,
  needsFromServer,
  needsYou,
  nextPlayable,
  premiumNeeds,
  previousPlayable,
  progressEstimate,
  waitingText,
} from './rules';

const ch = (id: string, index: number, kind: 'story' | 'front_matter' | 'back_matter', words = 1000) => ({ id, index, kind, word_count: words });
const chapters = [ch('c0', 0, 'front_matter', 10), ch('c1', 1, 'story'), ch('c2', 2, 'story'), ch('c3', 3, 'story'), ch('c4', 4, 'back_matter', 100)];

describe('detail lines', () => {
  it('ahead', () => {
    expect(aheadText(null)).toBeNull();
    expect(aheadText(20)).toBe('Less than a minute ahead');
    expect(aheadText(360)).toBe('6 min ahead');
    expect(aheadText(3900)).toBe('1 h 5 min ahead');
    expect(aheadText(7200)).toBe('2 h ahead');
  });
  it('waiting counts down from the job until', () => {
    expect(waitingText(40_000, 0)).toBe('Continues in about 40 s');
    expect(waitingText(500, 0)).toBe('Continues in a moment');
    expect(waitingText(5 * 60_000, 0)).toBe('Continues in about 5 min');
    expect(waitingText(null, 0)).toBe('Continues when the wait is over');
  });
});

describe('the four listening states', () => {
  const base = { needs: null, waiting: null, awaitingAudio: false, buffering: false, playing: false, aheadSeconds: null, now: 0 };
  it('playing says how far ahead', () => {
    expect(deriveListening({ ...base, playing: true, aheadSeconds: 360 })).toEqual({ listening: 'playing', detail: '6 min ahead' });
  });
  it('getting ready while the first audio is made, and when the element waits for data', () => {
    expect(deriveListening({ ...base, awaitingAudio: true })).toEqual({ listening: 'getting_ready', detail: 'First audio in about 10 s' });
    expect(deriveListening({ ...base, playing: true, buffering: true }).listening).toBe('getting_ready');
  });
  it('waiting from the job, with the countdown', () => {
    expect(deriveListening({ ...base, awaitingAudio: true, waiting: { until: 40_000 } })).toEqual({ listening: 'waiting', detail: 'Continues in about 40 s' });
  });
  it('needs you beats everything and carries its text', () => {
    const n = needsYou('limit_exceeded', 'The limit was reached.', '/book/b1');
    const r = deriveListening({ ...base, awaitingAudio: true, waiting: { until: 1 }, playing: true, needs: n });
    expect(r.listening).toBe('needs_you');
    expect(r.detail).toBe(n.text);
  });
  it('paused with nothing wrong is not a state, never Needs you', () => {
    expect(deriveListening(base)).toEqual({ listening: null, detail: null });
  });
});

describe('Needs you says what is kept first', () => {
  it('starts with what is kept, then the problem', () => {
    const n = needsYou('provider_refused', 'The voice service refused this chapter.', '/book/b1');
    expect(n.text.startsWith('Your place and the chapters already made are kept.')).toBe(true);
    expect(n.text.endsWith('refused this chapter.')).toBe(true);
    expect(n.action?.route).toBe('/book/b1');
  });
  it('maps server codes, unknown ones to other', () => {
    expect(needsCode('key_rejected')).toBe('key_rejected');
    expect(needsCode('source_not_set_up')).toBe('no_voice');
    expect(needsCode('something_new')).toBe('other');
    expect(needsFromServer({ code: 'repeated_failure', text: 'Three failed.' }, '/x').code).toBe('repeated_failure');
  });
  it('the premium rule', () => {
    const n = premiumNeeds('/book/b1');
    expect(n.text).toContain('Premium audio is made under a plan');
    expect(n.text.startsWith('Your place is kept')).toBe(true);
    expect(n.action?.route).toBe('/book/b1');
  });
  it('never uses the banned words', () => {
    const all = [premiumNeeds('/x').text, needsYou('other', 'x', '/x').text, aheadText(100), waitingText(null, 0)].join(' ');
    expect(all).not.toMatch(/private|protected/i);
  });
});

describe('who comes next', () => {
  it('skips front and back matter', () => {
    expect(nextPlayable(chapters, 'c0')!.id).toBe('c1');
    expect(nextPlayable(chapters, 'c1')!.id).toBe('c2');
    expect(nextPlayable(chapters, 'c3')).toBeUndefined();
    expect(previousPlayable(chapters, 'c2')!.id).toBe('c1');
    expect(previousPlayable(chapters, 'c1')).toBeUndefined();
    expect(firstPlayable(chapters)!.id).toBe('c1');
    expect(firstPlayable([ch('m', 0, 'front_matter')])!.id).toBe('m');
  });
});

describe('progress estimate', () => {
  it('counts story words before the place', () => {
    expect(progressEstimate(chapters, 'c1', 0)).toBe(0);
    expect(progressEstimate(chapters, 'c2', 0.5)).toBeCloseTo(0.5, 5);
    expect(progressEstimate(chapters, 'c3', 1)).toBe(1);
    expect(progressEstimate(chapters, 'c0', 0.5)).toBe(0);
    expect(progressEstimate(chapters, 'c4', 0.5)).toBe(1);
    expect(progressEstimate([], 'c1', 0.5)).toBe(0);
  });
});
