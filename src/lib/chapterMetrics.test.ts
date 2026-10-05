import { describe, expect, it } from 'vitest';
import { cpLength } from './codepoints';
import { chapterMetricsText, chapterProgress, chapterProgressText, voicedRuntimeText } from './chapterMetrics';

describe('measured chapter details', () => {
  it('shows source pages only when known and keeps voiced duration separate from source length', () => {
    expect(chapterMetricsText({ wordCount: 1234, pageCount: 7, durationSeconds: 241 })).toBe('1,234 words · 7 pages · 4 min audio');
    expect(chapterMetricsText({ wordCount: 1, pageCount: 1 })).toBe('1 word · 1 page');
    expect(chapterMetricsText({ wordCount: 1234, pageCount: null, durationSeconds: null })).toBe('1,234 words');
    expect(chapterMetricsText({})).toBeUndefined();
    expect(chapterMetricsText({ wordCount: 0 })).toBe('0 words');
  });

  it('does not turn absent or invalid facts into zero, guessed pages, or guessed runtime', () => {
    expect(chapterMetricsText({ wordCount: NaN, pageCount: 0, durationSeconds: Infinity })).toBeUndefined();
    expect(chapterMetricsText({ wordCount: -1, pageCount: -2, durationSeconds: 0 })).toBeUndefined();
    expect(chapterMetricsText({ wordCount: 1.5, pageCount: 2.5, durationSeconds: -1 })).toBeUndefined();
  });

  it('formats measured audio runtime across the minute and hour boundaries', () => {
    expect(voicedRuntimeText(20)).toBe('<1 min audio');
    expect(voicedRuntimeText(59)).toBe('<1 min audio');
    expect(voicedRuntimeText(60)).toBe('1 min audio');
    expect(voicedRuntimeText(3590)).toBe('1 h audio');
    expect(voicedRuntimeText(3900)).toBe('1 h 5 min audio');
  });
});

describe('chapter text progress', () => {
  it('uses Unicode code points rather than UTF-16 indices', () => {
    const text = '🕯️ Door 🌙.';
    expect(text.length).not.toBe(cpLength(text));
    expect(chapterProgressText(5, cpLength(text))).toBe('50% through chapter');
    expect(chapterProgress(5, cpLength(text))).toBe(0.5);
  });

  it('bounds saved places and does not invent a percentage when chapter length is unknown or empty', () => {
    expect(chapterProgressText(-2, 100)).toBe('0% through chapter');
    expect(chapterProgressText(120, 100)).toBe('100% through chapter');
    expect(chapterProgressText(0, 100)).toBe('0% through chapter');
    expect(chapterProgressText(0, 0)).toBeUndefined();
    expect(chapterProgressText(20, undefined)).toBeUndefined();
    expect(chapterProgressText(undefined, 100)).toBeUndefined();
    expect(chapterProgressText(NaN, 100)).toBeUndefined();
    expect(chapterProgressText(20, Infinity)).toBeUndefined();
  });
});
