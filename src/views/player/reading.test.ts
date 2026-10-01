import { describe, expect, it } from 'vitest';
import { cpLength } from '../../lib/codepoints';
import type { TextLine } from '../../player/types';
import { backLabel, followStep, highlightedLines, neighbourLine, paragraphsOf, readerColors, readerMetrics } from './reading';

function build(paragraphs: string[][]) {
  const lines: TextLine[] = [];
  let text = '';
  let at = 0;
  let n = 0;
  paragraphs.forEach((p, pi) => {
    p.forEach((l, li) => {
      if (li > 0) {
        text += ' ';
        at += 1;
      }
      const len = cpLength(l);
      lines.push({ id: `l${++n}`, start: at, end: at + len });
      text += l;
      at += len;
    });
    if (pi < paragraphs.length - 1) {
      text += '\n\n';
      at += 2;
    }
  });
  return { text, lines };
}

describe('paragraphsOf', () => {
  it('makes one paragraph per blank-line break, lines in order', () => {
    const { text, lines } = build([['One. ', 'Two.'].map((s) => s.trim()), ['Three.']]);
    const ps = paragraphsOf(text, lines);
    expect(ps).toHaveLength(2);
    expect(ps[0]!.parts.map((p) => p.lineId)).toEqual(['l1', null, 'l2']);
    expect(ps[0]!.parts.map((p) => p.text).join('')).toBe('One. Two.');
    expect(ps[1]!.parts).toEqual([{ text: 'Three.', lineId: 'l3' }]);
  });
  it('cuts by code points, so astral characters never split', () => {
    const { text, lines } = build([['A 😀 b.', 'C 𝒳 d.'], ['Ünï 🎶.']]);
    const ps = paragraphsOf(text, lines);
    expect(ps.flatMap((p) => p.parts.map((x) => x.text)).join('|')).toBe('A 😀 b.| |C 𝒳 d.|Ünï 🎶.');
    expect(ps[0]!.parts[0]!.text).toBe('A 😀 b.');
  });
  it('accepts lines in any order and keeps text between and around them', () => {
    const { text, lines } = build([['First.', 'Second.']]);
    const ps = paragraphsOf(`  ${text}\n`, lines.map((l) => ({ ...l, start: l.start + 2, end: l.end + 2 })).reverse());
    expect(ps).toHaveLength(1);
    expect(ps[0]!.parts.filter((p) => p.lineId).map((p) => p.lineId)).toEqual(['l1', 'l2']);
  });
  it('is empty before the text arrives', () => {
    expect(paragraphsOf('', [])).toEqual([]);
  });
});

describe('highlightedLines', () => {
  it('marks the current line and any found lines', () => {
    const m = highlightedLines('l2', ['l4']);
    expect(m.get('l2')).toBe('current');
    expect(m.get('l4')).toBe('marked');
    expect(m.get('l1')).toBeUndefined();
  });
  it('lets the current line win', () => {
    expect(highlightedLines('l2', ['l2']).get('l2')).toBe('current');
  });
  it('marks nothing when there is no current line', () => {
    expect(highlightedLines(null).size).toBe(0);
  });
});

describe('neighbourLine', () => {
  const lines: TextLine[] = [
    { id: 'a', start: 0, end: 4 },
    { id: 'b', start: 5, end: 9 },
    { id: 'c', start: 10, end: 14 },
  ];
  it('moves and clamps', () => {
    expect(neighbourLine(lines, 'a', 1)).toBe('b');
    expect(neighbourLine(lines, 'c', 1)).toBe('c');
    expect(neighbourLine(lines, 'a', -1)).toBe('a');
    expect(neighbourLine(lines, null, 1)).toBe('a');
    expect(neighbourLine([], 'a', 1)).toBeNull();
  });
});

describe('following the narration', () => {
  it('keeps the current line in view while following', () => {
    expect(followStep('following', 'line-changed')).toEqual({ mode: 'following', scroll: true });
  });
  it('stops following when the listener scrolls, and does not yank the text back', () => {
    const away = followStep('following', 'user-scroll');
    expect(away).toEqual({ mode: 'away', scroll: false });
    expect(followStep(away.mode, 'line-changed')).toEqual({ mode: 'away', scroll: false });
    expect(followStep(away.mode, 'user-scroll')).toEqual({ mode: 'away', scroll: false });
  });
  it('resumes with the way back, scrolling to the current line', () => {
    expect(followStep('away', 'back-to-narration')).toEqual({ mode: 'following', scroll: true });
  });
  it('resumes on a tap on a line without scrolling first', () => {
    expect(followStep('away', 'line-tapped')).toEqual({ mode: 'following', scroll: false });
  });
  it('follows again for a new chapter and when Read opens', () => {
    expect(followStep('away', 'chapter-changed')).toEqual({ mode: 'following', scroll: true });
    expect(followStep('away', 'read-entered')).toEqual({ mode: 'following', scroll: true });
  });
  it('labels the way back', () => {
    expect(backLabel(true)).toBe('Back to narration');
    expect(backLabel(false)).toBe('Back to your place');
  });
});

describe('appearance', () => {
  it('sizes the column by layout and the text by the listener', () => {
    const a = { size: 21, theme: 'dark', font: 'serif', spacing: 1.72, dimAura: true } as const;
    expect(readerMetrics(a, 'phone')).toMatchObject({ fontSize: 21, lineHeight: 1.72, titleSize: 30, columnWidth: 390, gap: 18 });
    expect(readerMetrics({ ...a, size: 23 }, 'tablet-landscape')).toMatchObject({ titleSize: 35, columnWidth: null, gap: 16 });
    expect(readerMetrics({ ...a, font: 'sans' }, 'tablet-portrait').fontFamily).toBe('var(--font-ui)');
  });
  it('gives light and sepia a paper page and dark none', () => {
    expect(readerColors('dark').paper).toBeNull();
    expect(readerColors('light').paper).not.toBeNull();
    expect(readerColors('sepia').paper).not.toBeNull();
    expect(readerColors('dim').dim).toBe(true);
  });
});
