import { describe, expect, it } from 'vitest';
import {
  AUDIO_WORD_TEXT,
  chapterRows,
  chapterWord,
  durationText,
  estimateMake,
  filterMatter,
  hasMatter,
  makeOptions,
  measuredBytesPerSecond,
  nextChapter,
  otherLine,
  readiness,
  runningModel,
  secondsLeft,
  shortList,
  type ChapterAudio,
  type ChapterInfo,
} from './bookAudio';

const ch = (n: number, kind: ChapterInfo['kind'] = 'story'): ChapterInfo => ({ id: `c${n}`, title: `Chapter title ${n}`, kind });
const story = (n: number) => Array.from({ length: n }, (_, i) => ch(i + 1));
const audioOf = (m: Record<string, ChapterAudio['state']>) => new Map(Object.entries(m).map(([k, v]) => [k, { state: v } as ChapterAudio]));

describe('chapterWord: the one audio word of a chapter', () => {
  it('maps the server words', () => {
    expect(AUDIO_WORD_TEXT[chapterWord('ready')]).toBe('Ready');
    expect(AUDIO_WORD_TEXT[chapterWord('making')]).toBe('Making');
    expect(AUDIO_WORD_TEXT[chapterWord('not_yet')]).toBe('Not yet');
    expect(AUDIO_WORD_TEXT[chapterWord(undefined)]).toBe('Not yet');
  });
  it('a held copy is On this device, and keeps that word when the server freed the audio', () => {
    expect(AUDIO_WORD_TEXT[chapterWord('ready', 'held')]).toBe('On this device');
    expect(AUDIO_WORD_TEXT[chapterWord('not_yet', 'held')]).toBe('On this device');
  });
  it('device-only words win over the server word', () => {
    expect(AUDIO_WORD_TEXT[chapterWord('ready', 'downloading')]).toBe('Downloading');
    expect(AUDIO_WORD_TEXT[chapterWord('ready', 'failed')]).toBe('Couldn’t download');
    expect(AUDIO_WORD_TEXT[chapterWord('ready', 'out_of_date')]).toBe('Out of date');
  });
});

describe('readiness', () => {
  it('counts ready and held chapters', () => {
    const r = readiness(['a', 'b', 'c', 'd'], audioOf({ a: 'ready', b: 'ready', c: 'making', d: 'not_yet' }), new Set(['a']));
    expect(r).toEqual({ total: 4, ready: 2, onDevice: 1, fraction: 0.5 });
  });
  it('an empty book is 0, not NaN', () => {
    expect(readiness([], new Map()).fraction).toBe(0);
  });
  it('the line of another audiobook leaves out a device count of zero', () => {
    expect(otherLine(13, 22, 1)).toBe('13 of 22 ready · 1 on this device');
    expect(otherLine(13, 22, 0)).toBe('13 of 22 ready');
  });
});

describe('chapter rows (B4)', () => {
  const chapters = [ch(1, 'front_matter'), ch(2), ch(3), ch(4, 'back_matter')];
  const audio = audioOf({ c1: 'ready', c2: 'ready', c3: 'making', c4: 'not_yet' });

  it('every row has exactly one audio word', () => {
    const rows = chapterRows({ chapters, audio, currentId: 'c2', progress: 0.3 });
    expect(rows.map((r) => r.wordText)).toEqual(['Ready', 'Ready', 'Making', 'Not yet']);
    for (const r of rows) expect(Object.values(AUDIO_WORD_TEXT)).toContain(r.wordText);
  });
  it('numbers story chapters from 1 and marks matter with a dash', () => {
    expect(chapterRows({ chapters, audio }).map((r) => r.number)).toEqual(['–', '1', '2', '–']);
  });
  it('the current chapter says where you are and shows progress in place of Ready', () => {
    const [, cur] = chapterRows({ chapters, audio, currentId: 'c2', progress: 0.34 });
    expect(cur).toMatchObject({ current: true, detail: 'You are here', progress: '34%', word: 'ready' });
  });
  it('the current chapter keeps its word visible when it is not ready yet', () => {
    const [, , cur] = chapterRows({ chapters, audio, currentId: 'c3', progress: 0.5 });
    expect(cur?.progress).toBeUndefined();
    expect(cur?.wordText).toBe('Making');
  });
  it('device copies change the word', () => {
    const rows = chapterRows({ chapters, audio, held: new Set(['c2']), deviceState: new Map([['c3', 'downloading' as const]]) });
    expect(rows.map((r) => r.wordText)).toEqual(['Ready', 'On this device', 'Downloading', 'Not yet']);
  });
  it('shows measured length and chapter progress before any audio is made, keeping the audio word visible', () => {
    const row = chapterRows({
      chapters: [{ ...ch(1), wordCount: 1500, textLength: 10000, pageCount: 6 }],
      audio: new Map(), currentId: 'c1', currentOffset: 3400,
    })[0]!;
    expect(row).toMatchObject({ wordText: 'Not yet', detail: 'You are here', metadata: '1,500 words · 6 pages', progressText: '34% through chapter' });
    expect(row.progress).toBeUndefined();
  });
  it('uses the retained copy runtime while newer audio downloads or has failed', () => {
    for (const state of ['held', 'out_of_date', 'downloading', 'failed'] as const) {
      const row = chapterRows({
        chapters: [{ ...ch(1), wordCount: 1500 }],
        audio: new Map([['c1', { state: 'ready', durationSeconds: 600 }]]),
        deviceState: new Map([['c1', state]]), heldDurations: new Map([['c1', 240]]),
      })[0]!;
      expect(row.metadata).toBe('1,500 words · 4 min audio');
    }
  });
});

describe('the matter filter (B6)', () => {
  const chapters = [ch(1, 'front_matter'), ch(2), ch(3), ch(4, 'back_matter')];
  it('leaves out front and back matter on request', () => {
    expect(filterMatter(chapters, 'story').map((c) => c.id)).toEqual(['c2', 'c3']);
    expect(filterMatter(chapters, 'all')).toHaveLength(4);
  });
  it('knows whether to offer the filter', () => {
    expect(hasMatter(chapters)).toBe(true);
    expect(hasMatter(story(3))).toBe(false);
  });
  it('rows keep the numbers of the whole book when filtered', () => {
    const rows = chapterRows({ chapters, audio: new Map(), filter: 'story' });
    expect(rows.map((r) => [r.id, r.number])).toEqual([['c2', '1'], ['c3', '2']]);
  });
  it('keeps the listener’s current matter chapter visible while hiding other matter', () => {
    const rows = chapterRows({ chapters, audio: new Map(), filter: 'story', currentId: 'c1' });
    expect(rows.map((r) => [r.id, r.number])).toEqual([['c1', '–'], ['c2', '1'], ['c3', '2']]);
    expect(rows[0]).toMatchObject({ current: true, matter: true, detail: 'You are here' });
  });
  it('"next chapter" skips matter unless asked', () => {
    const list = [ch(1), ch(2, 'back_matter'), ch(3, 'back_matter')];
    expect(nextChapter(list, 'c1')).toBeUndefined();
    expect(nextChapter(list, 'c1', true)?.id).toBe('c2');
    expect(nextChapter([ch(1, 'front_matter'), ch(2), ch(3)], 'c1')?.id).toBe('c2');
    expect(nextChapter(list, 'nope')).toBeUndefined();
  });
});

describe('the short list', () => {
  const rows = chapterRows({ chapters: story(22), audio: new Map(), currentId: 'c4' });
  it('starts at the current chapter', () => {
    const s = shortList(rows, false);
    expect(s.rows.map((r) => r.number)).toEqual(['4', '5', '6', '7']);
    expect(s).toMatchObject({ more: true, total: 22 });
  });
  it('starts at the beginning when there is no place', () => {
    expect(shortList(chapterRows({ chapters: story(22), audio: new Map() }), false).rows[0]?.number).toBe('1');
  });
  it('near the end still shows a full short list', () => {
    const near = chapterRows({ chapters: story(22), audio: new Map(), currentId: 'c22' });
    expect(shortList(near, false).rows.map((r) => r.number)).toEqual(['19', '20', '21', '22']);
  });
  it('expanded or short books show everything and no "show all"', () => {
    expect(shortList(rows, true)).toMatchObject({ more: false, total: 22 });
    expect(shortList(rows, true).rows).toHaveLength(22);
    expect(shortList(chapterRows({ chapters: story(3), audio: new Map() }), false)).toMatchObject({ more: false, total: 3 });
  });
});

describe('progress of a job', () => {
  const job = { state: 'running' as const, chapters_total: 22, chapters_done: 9, created_at: '2026-01-01T00:00:00Z' };
  const t0 = Date.parse(job.created_at);
  it('time left comes from the pace so far', () => {
    expect(secondsLeft(9, 22, t0, t0 + 9 * 60_000)).toBe(13 * 60);
  });
  it('time left is unknown before the first chapter, and at the end', () => {
    expect(secondsLeft(0, 22, t0, t0 + 60_000)).toBeUndefined();
    expect(secondsLeft(22, 22, t0, t0 + 60_000)).toBeUndefined();
  });
  it('durations read as the boards do', () => {
    expect(durationText(25 * 60)).toBe('About 25 min');
    expect(durationText(65 * 60)).toBe('About 1 h 5 min');
    expect(durationText(2 * 3600)).toBe('About 2 h');
    expect(durationText(20)).toBe('Less than a minute');
  });
  it('a running job offers pause and stop; fractions come from the counts', () => {
    const m = runningModel(job, { chapters_ready: 12, chapters_total: 22 }, t0 + 9 * 60_000);
    expect(m).toMatchObject({ label: 'Making it ready', countText: '9 of 22 chapters', canPause: true, canResume: false });
    expect(m.done).toBeCloseTo(9 / 22);
    expect(m.ready).toBeCloseTo(12 / 22);
    expect(m.note).toBe('About 13 min left. You can listen while it works.');
  });
  it('says nothing about time before one chapter is made', () => {
    expect(runningModel({ ...job, chapters_done: 0 }, { chapters_ready: 0, chapters_total: 22 }, t0 + 5000).note).toBe('Getting started. You can listen while it works.');
  });
  it('a paused job offers resume and says what is kept', () => {
    const m = runningModel({ ...job, state: 'paused' }, { chapters_ready: 12, chapters_total: 22 }, t0);
    expect(m).toMatchObject({ label: 'Paused', paused: true, canResume: true, canPause: false });
    expect(m.note).toContain('kept');
  });
  it('waiting is not a problem and needs-you starts with what is kept', () => {
    const w = runningModel({ ...job, state: 'waiting', waiting: { text: 'Held for a quota.' } }, { chapters_ready: 1, chapters_total: 22 }, t0);
    expect(w.label).toBe('Waiting');
    expect(w.note).toContain('Nothing is wrong');
    const n = runningModel({ ...job, state: 'needs_you', needs_you: { text: 'A chapter was refused.' } }, { chapters_ready: 1, chapters_total: 22 }, t0);
    expect(n.note.startsWith('Finished chapters are kept.')).toBe(true);
  });
  it('done never passes total', () => {
    expect(runningModel({ ...job, chapters_done: 30 }, { chapters_ready: 22, chapters_total: 22 }, t0).done).toBe(1);
  });
});

describe('the free Make ready sheet', () => {
  const chapters = story(10).map((c) => ({ ...c, word_count: 1500 }));
  it('offers the whole book, and from the current chapter when it is not the first', () => {
    const none = makeOptions({ chapters, audio: new Map(), currentId: 'c1' });
    expect(none.map((o) => o.id)).toEqual(['whole']);
    const opts = makeOptions({ chapters, audio: audioOf({ c1: 'ready', c2: 'ready' }), currentId: 'c4' });
    expect(opts.map((o) => o.title)).toEqual(['Whole book', 'From chapter 4']);
    expect(opts[0]?.detail).toBe('10 chapters · 2 ready');
    expect(opts[1]?.detail).toBe('7 chapters · none ready yet');
    expect(opts[1]?.scope).toEqual({ kind: 'from_chapter', from_chapter_id: 'c4' });
    expect(opts[1]?.chapterIds).toHaveLength(7);
  });
  it('says all ready, and one chapter in the singular', () => {
    const o = makeOptions({ chapters: chapters.slice(0, 1), audio: audioOf({ c1: 'ready' }) });
    expect(o[0]?.detail).toBe('1 chapter · all ready');
  });
  it('keeps an arbitrary selection in reading order, removes duplicates and unknown IDs, and respects matter inclusion', () => {
    const mixed = [ch(1, 'front_matter'), ch(2), ch(3), ch(4), ch(5, 'back_matter')].map((chapter) => ({ ...chapter, word_count: 100 }));
    const input = { chapters: mixed, audio: audioOf({ c2: 'ready' }), selectedChapterIds: ['c4', 'c1', 'c2', 'c4', 'missing'] };
    expect(makeOptions({ ...input, includeMatter: false }).at(-1)).toMatchObject({
      id: 'chosen', detail: '2 chapters · 1 ready', chapterIds: ['c2', 'c4'],
      scope: { kind: 'chapters', chapter_ids: ['c2', 'c4'], include_matter: false },
    });
    expect(makeOptions({ ...input, includeMatter: true }).at(-1)?.chapterIds).toEqual(['c1', 'c2', 'c4']);
    expect(makeOptions({ ...input, selectedChapterIds: [], includeMatter: false }).at(-1)).toMatchObject({
      id: 'chosen', chapterIds: [], scope: { kind: 'chapters', chapter_ids: [], include_matter: false },
    });
    const chosen = makeOptions({ ...input, includeMatter: false }).at(-1)!;
    expect(estimateMake(mixed, chosen.chapterIds, input.audio).toMake).toBe(1);
  });
  it('filters matter before counting whole/from scopes and retains a matter chapter as the from anchor', () => {
    const mixed = [ch(1, 'front_matter'), ch(2), ch(3, 'front_matter'), ch(4), ch(5, 'back_matter')].map((c) => ({ ...c, word_count: 100 }));
    const audio = audioOf({ c1: 'ready', c2: 'ready', c5: 'ready' });
    const opts = makeOptions({ chapters: mixed, audio, currentId: 'c3', includeMatter: false });
    expect(opts[0]).toMatchObject({ detail: '2 chapters · 1 ready', scope: { kind: 'whole_book', include_matter: false }, chapterIds: ['c2', 'c4'] });
    expect(opts[1]).toMatchObject({ title: 'From here', detail: '1 chapter · none ready yet', scope: { kind: 'from_chapter', from_chapter_id: 'c3', include_matter: false }, chapterIds: ['c4'] });
    const all = makeOptions({ chapters: mixed, audio, currentId: 'c3', includeMatter: true });
    expect(all[0]!.chapterIds).toHaveLength(5);
    expect(all[1]!.chapterIds).toEqual(['c3', 'c4', 'c5']);
  });
  it('counts only what is not ready, and sizes it from measured audio when there is some', () => {
    const audio = audioOf({ c1: 'ready' });
    const e = estimateMake(chapters, chapters.map((c) => c.id), audio, 8000);
    expect(e.toMake).toBe(9);
    expect(e.measured).toBe(true);
    // 9 x 1500 words at 150 wpm = 90 min of speech; made at 0.9 s of audio per second = 100 min; 5400 s x 8000 B = 43.2 MB
    expect(e.seconds).toBeCloseTo(6000);
    expect(e.bytes).toBe(43_200_000);
  });
  it('falls back to a stated default rate when nothing was measured', () => {
    expect(estimateMake(chapters, ['c1'], new Map()).measured).toBe(false);
  });
  it('measures bytes per second from ready audio only', () => {
    expect(measuredBytesPerSecond([{ state: 'ready', bytes: 1000, durationSeconds: 100 }, { state: 'making', bytes: 5, durationSeconds: 5 }, { state: 'not_yet' }])).toBe(10);
    expect(measuredBytesPerSecond([{ state: 'not_yet' }])).toBeUndefined();
  });
});
