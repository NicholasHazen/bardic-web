import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import {
  BookStore,
  makeSheet,
  noticeNeeds,
  pageModel,
  pickCurrent,
  seriesLine,
  toAudio,
  toHeader,
  type Audiobook,
  type AudiobookChapter,
  type Book,
  type BookGateway,
  type BookState,
  type Chapter,
  type Job,
  type Place,
  type R,
} from './book';

const ok = <T>(value: T): R<T> => ({ ok: true, value });
const bad = (status: number, detail: string, code?: string): R<never> => ({ ok: false, status, detail, code });

const book: Book = {
  id: 'b1',
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  state: 'readable',
  added_at: '2026-01-01T00:00:00Z',
  series: { name: 'The Ashmark Cycle', order: 2 },
  cover: null,
  chapter_count: 4,
  story_chapter_count: 4,
  word_count: 74200,
  source_sha256: null,
  place: null,
};
const chapters: Chapter[] = [
  { id: 'c0', index: 0, title: 'Title page', kind: 'front_matter', word_count: 10, text_length: 1000, page_count: null, text_sha256: 'x' },
  { id: 'c1', index: 1, title: 'Ash on the Water', kind: 'story', word_count: 1500, text_length: 1000, page_count: null, text_sha256: 'x' },
  { id: 'c2', index: 2, title: 'What the Ledger Owes', kind: 'story', word_count: 1500, text_length: 1000, page_count: null, text_sha256: 'x' },
  { id: 'c3', index: 3, title: 'A Debt in Salt', kind: 'story', word_count: 1500, text_length: 1000, page_count: null, text_sha256: 'x' },
  { id: 'c4', index: 4, title: 'Afterword', kind: 'back_matter', word_count: 100, text_length: 1000, page_count: null, text_sha256: 'x' },
];
const ab = (id: string, tier: 'free' | 'premium', ready: number, voice = id, extra: Partial<Audiobook> = {}): Audiobook => ({
  id,
  book_id: 'b1',
  voice_id: `v-${voice}`,
  voice_name: voice,
  source_id: tier === 'free' ? 'breeze' : 'gemini',
  tier,
  voice_revision: 'r1',
  chapters_total: 5,
  chapters_ready: ready,
  bytes: 0,
  created_at: '2026-01-01T00:00:00Z',
  active_job_id: null,
  ...extra,
});
const place = (audiobook_id: string | null, extra: Partial<Place> = {}): Place => ({
  book_id: 'b1',
  chapter_id: 'c2',
  offset: 120,
  progress: 0.34,
  mode: 'listening',
  audiobook_id,
  device_id: 'd1',
  revision: 7,
  updated_at: '2026-01-02T00:00:00Z',
  finished: { finished: false, since: null, reason: null },
  ...extra,
});
const audioItems = (states: Record<string, 'ready' | 'making' | 'not_yet'>): AudiobookChapter[] =>
  chapters.map((c) => ({
    chapter_id: c.id,
    state: states[c.id] ?? 'not_yet',
    audio: states[c.id] === 'ready' ? { id: `a-${c.id}`, duration_seconds: 100, bytes: 800_000, sha256: 's', content_type: 'audio/x', voice_revision: 'r1' } : null,
    newer_audio: null,
    detail: null,
  }));
const job = (state: Job['state'], extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'make_audio',
  state,
  audiobook_id: 'free1',
  book_id: 'b1',
  plan_id: null,
  chapters_total: 5,
  chapters_done: 1,
  waiting: null,
  needs_you: null,
  started_by: { listener_id: 'l1', device_id: 'd1' } as Job['started_by'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
});

function fakeGateway(init: { audiobooks: Audiobook[]; place?: Place | null; defaultVoice?: string | null; states?: Record<string, 'ready' | 'making' | 'not_yet'> }) {
  const calls: string[] = [];
  const puts: unknown[] = [];
  const makes: { id: string; scope: unknown; key: string }[] = [];
  let currentPlace = init.place ?? null;
  const gw: BookGateway = {
    book: async () => ok(book),
    chapters: async () => ok(chapters),
    refreshChapters: async () => (calls.push('refreshChapters'), ok(chapters)),
    audiobooks: async () => ok(init.audiobooks),
    place: async () => ok(currentPlace),
    defaultVoice: async () => ok(init.defaultVoice ?? null),
    sources: async () => ok([{ id: 'breeze', kind: 'breeze', name: 'Breeze', tier: 'free', state: 'connected', voice_count: 2, checked_at: null, detail: null }]),
    audioChapters: async (id) => (calls.push(`audio:${id}`), ok(audioItems(init.states ?? {}))),
    job: async () => ok(job('running')),
    makeReady: async (_l, id, scope, key) => (calls.push('makeReady'), makes.push({ id, scope, key }), ok(job('running'))),
    pauseJob: async () => (calls.push('pause'), ok(job('paused'))),
    resumeJob: async () => (calls.push('resume'), ok(job('running'))),
    cancelJob: async () => (calls.push('cancel'), ok(job('stopped'))),
    putPlace: async (_l, _b, input) => {
      puts.push(input);
      currentPlace = place(input.audiobook_id ?? null, { revision: (currentPlace?.revision ?? 0) + 1, chapter_id: input.chapter_id, offset: input.offset });
      return ok(currentPlace);
    },
  };
  return { gw, calls, puts, makes };
}

const loaded = async (g: ReturnType<typeof fakeGateway>) => {
  const store = new BookStore(g.gw, () => Date.parse('2026-01-01T00:09:00Z'), () => 'key-1');
  store.configure('l1', 'b1');
  await store.load();
  return store;
};

describe('which audiobook is current', () => {
  const list = [ab('a', 'free', 2, 'Mara'), ab('b', 'premium', 5, 'Kore')];
  it('the audiobook in the place wins', () => {
    expect(pickCurrent(list, place('a'), 'b', 'v-Kore')).toBe('a');
  });
  it('then the one chosen on this device, then the default voice, then the most ready', () => {
    expect(pickCurrent(list, null, 'b', null)).toBe('b');
    expect(pickCurrent(list, place(null), null, 'v-Mara')).toBe('a');
    expect(pickCurrent(list, null, null, null)).toBe('b');
  });
  it('ignores ids that are not on this book and handles none', () => {
    expect(pickCurrent(list, place('gone'), 'gone', 'v-gone')).toBe('b');
    expect(pickCurrent([], null, null, null)).toBeNull();
  });
});

describe('shaping the page', () => {
  it('series and header', () => {
    expect(seriesLine({ name: 'The Ashmark Cycle', order: 2 })).toBe('The Ashmark Cycle · Volume 2');
    expect(seriesLine({ name: 'Solo', order: null })).toBe('Solo');
    expect(seriesLine(null)).toBeUndefined();
    expect(toHeader(book)).toMatchObject({ title: 'The Ash Ledger', meta: '4 chapters · 74,200 words', seriesLine: 'The Ashmark Cycle · Volume 2' });
  });

  it('builds the card, the other audiobooks and the rows from what the server said', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 3, 'Mara'), ab('prem1', 'premium', 2, 'Kore')], place: place('free1'), states: { c0: 'ready', c1: 'ready', c2: 'ready', c3: 'making' } });
    const store = await loaded(g);
    const m = pageModel(get(store), { expanded: true, storyOnly: false })!;
    expect(m.primaryLabel).toBe('Continue listening');
    expect(m.audiobook).toMatchObject({ voice: 'Mara', tier: 'free', readyText: '3 of 5 chapters ready', deviceText: '0 on this device', canMakeReady: true, sourceLine: 'Breeze voice · from your Breeze server' });
    expect(m.others).toEqual([{ id: 'prem1', voice: 'Kore', tier: 'premium', line: '2 of 5 ready' }]);
    expect(m.chapters.rows.map((r) => r.wordText)).toEqual(['Ready', 'Ready', 'Ready', 'Making', 'Not yet']);
    expect(m.chapters.rows[2]).toMatchObject({ current: true, metadata: '1,500 words · 2 min audio', progressText: '12% through chapter' });
    expect(m.chapters.rows[2]?.progress).toBeUndefined();
    expect(m.chapters.hasMatter).toBe(true);
  });

  it('the matter filter leaves out matter and keeps the numbers', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 0)], place: null }));
    const m = pageModel(get(store), { expanded: true, storyOnly: true })!;
    expect(m.chapters.rows.map((r) => r.number)).toEqual(['1', '2', '3']);
    expect(m.primaryLabel).toBe('Listen');
  });
  it('shows chapter-local progress before audio exists, independent of whole-book progress', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 0)], place: place('free1', { offset: 500, progress: 0.91 }) }));
    const row = pageModel(get(store), { expanded: true, storyOnly: false })!.chapters.rows[2]!;
    expect(row).toMatchObject({ wordText: 'Not yet', metadata: '1,500 words', progressText: '50% through chapter' });
    expect(row.progress).toBeUndefined();
  });
  it('uses the selected audiobook’s held runtime rather than a newer server copy', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 1)], states: { c2: 'ready' } }));
    const s = get(store);
    const row = pageModel(s, { expanded: true, storyOnly: false }, new Map([['free1', new Map([['c2', 'out_of_date' as const]])]]), s.at,
      new Map([['free1', new Map([['c2', 3900]])]]))!.chapters.rows[2]!;
    expect(row).toMatchObject({ wordText: 'Out of date', metadata: '1,500 words · 1 h 5 min audio' });
  });

  it('a finished book offers Listen, not Continue', async () => {
    const finished = place('free1', { finished: { finished: true, since: '2026-01-03T00:00:00Z', reason: 'marked' } });
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 0)], place: finished }));
    expect(pageModel(get(store), { expanded: false, storyOnly: false })!.primaryLabel).toBe('Listen');
  });

  it('a held chapter counts on the device and a book with no audiobook has no card', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 1)], place: place('free1'), states: { c1: 'ready' } }));
    const held = new Map([['free1', new Map([['c1', 'held' as const]])]]);
    const m = pageModel(get(store), { expanded: true, storyOnly: false }, held)!;
    expect(m.audiobook?.deviceText).toBe('1 on this device');
    expect(m.chapters.rows[1]?.wordText).toBe('On this device');
    const none = await loaded(fakeGateway({ audiobooks: [] }));
    expect(pageModel(get(none), { expanded: false, storyOnly: false })!.audiobook).toBeNull();
  });

  it('a running job turns the card into the making-ready state', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 1, 'Mara', { active_job_id: 'j1' })], place: place('free1'), states: { c1: 'ready' } }));
    const m = pageModel(get(store), { expanded: false, storyOnly: false })!;
    expect(m.audiobook?.running).toMatchObject({ label: 'Making it ready', countText: '1 of 5 chapters', canPause: true });
  });

  it('a finished job does not show as running', () => {
    const s = { ...get(new BookStore(fakeGateway({ audiobooks: [] }).gw)), book, chapters, audiobooks: [ab('free1', 'free', 5)], currentId: 'free1', job: job('completed') } as BookState;
    expect(pageModel(s, { expanded: false, storyOnly: false })!.audiobook?.running).toBeUndefined();
  });
});

describe('B3: choosing another audiobook keeps the place', () => {
  it('writes the same chapter and offset with the other audiobook and the place revision', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 3), ab('prem1', 'premium', 2)], place: place('free1') });
    const store = await loaded(g);
    expect(get(store).currentId).toBe('free1');
    const r = await store.choose('prem1');
    expect(r.ok).toBe(true);
    expect(g.puts).toEqual([{ chapter_id: 'c2', offset: 120, mode: 'listening', audiobook_id: 'prem1', base_revision: 7 }]);
    expect(get(store).currentId).toBe('prem1');
    expect(get(store).place).toMatchObject({ chapter_id: 'c2', offset: 120, audiobook_id: 'prem1' });
  });
  it('with no place it writes nothing (the choice is only remembered here)', async () => {
    const g = fakeGateway({ audiobooks: [ab('a', 'free', 3), ab('b', 'free', 2)], place: null });
    const store = await loaded(g);
    await store.choose('b');
    expect(g.puts).toEqual([]);
    expect(get(store).currentId).toBe('b');
  });
  it('refuses an audiobook that is not on the book', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('a', 'free', 3)], place: null }));
    expect((await store.choose('zzz')).ok).toBe(false);
  });
  it('a conflict leaves the other device’s place alone and says so', async () => {
    const g = fakeGateway({ audiobooks: [ab('a', 'free', 3), ab('b', 'free', 2)], place: place('a') });
    g.gw.putPlace = async () => bad(409, 'conflict', 'place_conflict');
    const store = await loaded(g);
    const r = await store.choose('b');
    expect(r).toMatchObject({ ok: false, code: 'place_conflict' });
    expect(r.ok === false && r.detail).toContain('not changed');
  });
});

describe('making ready: free only (P2)', () => {
  it('starts a job for a free audiobook with the scope and an idempotency key', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 0)], place: null });
    const store = await loaded(g);
    const r = await store.makeReady({ kind: 'from_chapter', from_chapter_id: 'c2' });
    expect(r.ok).toBe(true);
    expect(g.makes).toEqual([{ id: 'free1', scope: { kind: 'from_chapter', from_chapter_id: 'c2' }, key: 'key-1' }]);
    expect(get(store).job?.state).toBe('running');
  });
  it('never calls the server for a premium audiobook', async () => {
    const g = fakeGateway({ audiobooks: [ab('prem1', 'premium', 0)], place: null });
    const store = await loaded(g);
    const r = await store.makeReady({ kind: 'whole_book' });
    expect(r).toMatchObject({ ok: false, code: 'plan_required' });
    expect(g.makes).toEqual([]);
    expect(g.calls).not.toContain('makeReady');
  });
  it('passes the server’s refusal on, in its words', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 0)] });
    g.gw.makeReady = async () => bad(409, 'Your voice server could not be reached.', 'source_unreachable');
    const store = await loaded(g);
    expect(await store.makeReady({ kind: 'whole_book' })).toMatchObject({ ok: false, detail: 'Your voice server could not be reached.' });
  });
  it('pauses, resumes and stops the job', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 1, 'Mara', { active_job_id: 'j1' })], place: null });
    const store = await loaded(g);
    await store.pause();
    expect(get(store).job?.state).toBe('paused');
    await store.resume();
    expect(get(store).job?.state).toBe('running');
    await store.stop();
    expect(get(store).job?.state).toBe('stopped');
    expect(g.calls.filter((c) => ['pause', 'resume', 'cancel'].includes(c))).toEqual(['pause', 'resume', 'cancel']);
  });
  it('a job action with no job says nothing is being made', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 1)] }));
    expect(await store.pause()).toMatchObject({ ok: false });
  });
});

describe('the Make ready sheet figures', () => {
  it('is not offered for a premium audiobook', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('prem1', 'premium', 0)] }));
    expect(makeSheet(get(store), 'whole')).toBeUndefined();
  });
  it('counts what is left, with space measured from audio already made', async () => {
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 2)], place: place('free1'), states: { c0: 'ready', c1: 'ready' } }));
    const s = makeSheet(get(store), 'from')!;
    expect(s.model.eyebrow).toBe('free1 · free');
    expect(s.model.options.map((o) => o.title)).toEqual(['Whole book', 'From chapter 2']);
    expect(s.chosen.id).toBe('from');
    expect(s.model.toMake).toBe('3 chapters');
    expect(s.model.space).toMatch(/^About .* MB on the server$/);
    expect(s.model.nothingToMake).toBe(false);
  });
  it('says there is nothing to make when everything is ready', async () => {
    const all = { c0: 'ready', c1: 'ready', c2: 'ready', c3: 'ready', c4: 'ready' } as const;
    const store = await loaded(fakeGateway({ audiobooks: [ab('free1', 'free', 5)], states: all }));
    expect(makeSheet(get(store), 'whole')!.model.nothingToMake).toBe(true);
  });
  it('excluding matter uses the story selection for counts, space and the submitted scope', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 1)], place: place('free1'), states: { c1: 'ready' } });
    const store = await loaded(g);
    const story = makeSheet(get(store), 'whole', false)!;
    const all = makeSheet(get(store), 'whole', true)!;
    expect(story.chosen.chapterIds).toEqual(['c1', 'c2', 'c3']);
    expect(story.model.toMake).toBe('2 chapters');
    expect(all.model.toMake).toBe('4 chapters');
    expect(story.model.space).not.toBe(all.model.space);
    expect(story.chosen.scope).toEqual({ kind: 'whole_book', include_matter: false });
    await store.makeReady(story.chosen.scope);
    expect(g.makes).toEqual([{ id: 'free1', scope: { kind: 'whole_book', include_matter: false }, key: 'key-1' }]);
  });
});

describe('refreshing chapter display metadata', () => {
  it('reloads corrected names and story counts while retaining chapter IDs, hashes and the selected audio/place', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 2)], place: place('free1'), states: { c1: 'ready', c2: 'ready' } });
    const old = chapters.map((chapter) => ({ ...chapter, title: `Section ${chapter.index + 1}`, kind: 'story' as const }));
    let refreshed = false;
    g.gw.chapters = async () => ok(refreshed ? chapters : old);
    g.gw.book = async () => ok({ ...book, chapter_count: 5, story_chapter_count: refreshed ? 3 : 5, word_count: refreshed ? 4500 : 4610 });
    g.gw.refreshChapters = async (id) => {
      g.calls.push(`refresh:${id}`);
      refreshed = true;
      return ok(chapters);
    };
    const store = await loaded(g);
    const before = get(store);
    expect(await store.refreshChapters()).toEqual({ ok: true });
    const after = get(store);
    expect(after.refreshingChapters).toBe(false);
    expect(after.chapters).toEqual(chapters);
    expect(after.chapters.map(({ id, index, text_sha256 }) => ({ id, index, text_sha256 }))).toEqual(before.chapters.map(({ id, index, text_sha256 }) => ({ id, index, text_sha256 })));
    expect(after.book).toMatchObject({ chapter_count: 5, story_chapter_count: 3, word_count: 4500 });
    expect(after.currentId).toBe(before.currentId);
    expect(after.audiobooks).toEqual(before.audiobooks);
    expect(after.audio).toEqual(before.audio);
    expect(after.place).toEqual(before.place);
    expect(g.calls.filter((call) => call.startsWith('refresh:'))).toEqual(['refresh:b1']);
    expect(g.makes).toEqual([]);
    expect(g.puts).toEqual([]);
  });

  it.each(['chapter_structure_changed', 'source_unavailable'])('keeps every loaded resource and returns %s without making audio', async (code) => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 2, 'Mara', { active_job_id: 'j1' })], place: place('free1'), states: { c1: 'ready', c2: 'ready' } });
    g.gw.refreshChapters = async () => bad(409, 'Chapter metadata was kept.', code);
    const store = await loaded(g);
    const before = get(store);
    expect(await store.refreshChapters()).toEqual({ ok: false, code, detail: 'Chapter metadata was kept.' });
    expect(get(store)).toEqual(before);
    expect(g.makes).toEqual([]);
    expect(g.puts).toEqual([]);
  });

  it('exposes the busy state and sends one mutation for repeated presses', async () => {
    const g = fakeGateway({ audiobooks: [ab('free1', 'free', 0)] });
    let settle!: (result: R<Chapter[]>) => void;
    let requests = 0;
    g.gw.refreshChapters = () => {
      requests++;
      return new Promise((resolve) => { settle = resolve; });
    };
    const store = await loaded(g);
    const pending = store.refreshChapters();
    expect(get(store).refreshingChapters).toBe(true);
    expect(await store.refreshChapters()).toMatchObject({ ok: false, code: 'refresh_in_progress' });
    expect(requests).toBe(1);
    settle(bad(409, 'Chapter metadata was kept.', 'source_unavailable'));
    await pending;
    expect(get(store).refreshingChapters).toBe(false);
  });

  it('cannot apply a late refresh to another configured book', async () => {
    const g = fakeGateway({ audiobooks: [] });
    g.gw.book = async (_listener, id) => ok({ ...book, id });
    let settle!: (result: R<Chapter[]>) => void;
    g.gw.refreshChapters = () => new Promise((resolve) => { settle = resolve; });
    const store = await loaded(g);
    const pending = store.refreshChapters();
    store.configure('l2', 'b2');
    await store.load();
    const next = get(store);
    settle(ok([{ ...chapters[0]!, title: 'A stale title' }]));
    expect(await pending).toMatchObject({ ok: false, code: 'refresh_abandoned' });
    expect(get(store)).toEqual(next);
    expect(get(store).book?.id).toBe('b2');
  });
});

describe('change notices', () => {
  it('audio notices reload the audio, page notices the page, others are ignored', () => {
    expect(noticeNeeds({ type: 'job.updated', book_id: 'b1' }, 'b1', 'l1')).toBe('audio');
    expect(noticeNeeds({ type: 'job.updated', book_id: null }, 'b1', 'l1')).toBe('audio');
    expect(noticeNeeds({ type: 'audiobook.updated', book_id: 'b1' }, 'b1', 'l1')).toBe('audio');
    expect(noticeNeeds({ type: 'place.updated', book_id: 'b1', listener_id: 'l1' }, 'b1', 'l1')).toBe('all');
    expect(noticeNeeds({ type: 'resync' }, 'b1', 'l1')).toBe('all');
    expect(noticeNeeds({ type: 'job.updated', book_id: 'other' }, 'b1', 'l1')).toBeNull();
    expect(noticeNeeds({ type: 'place.updated', book_id: 'b1', listener_id: 'l2' }, 'b1', 'l1')).toBeNull();
    expect(noticeNeeds({ type: 'allowance.updated' }, 'b1', 'l1')).toBeNull();
  });
  it('turns the audio list into word states with sizes', () => {
    const m = toAudio(audioItems({ c1: 'ready', c2: 'making' }));
    expect(m.get('c1')).toEqual({ state: 'ready', durationSeconds: 100, bytes: 800_000 });
    expect(m.get('c2')).toEqual({ state: 'making' });
  });
});
