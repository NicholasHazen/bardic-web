// Fakes for the player's unit tests: an audio element, a server, a place server and an event source. Not imported
// by the app. Original synthetic text only.
import { vi } from 'vitest';
import type { AudioLike } from './engine';
import type { Audiobook, AudiobookChapter, Book, Chapter, EventsPort, Job, ListenerSettings, Notice, PlayerApi, R } from './gateway';
import type { GetResult, Place, PlaceApi, PutResult } from '../sync/place';
import type { PlaceInput } from '../sync/queue';

export class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  readyState = 0;
  playbackRate = 1;
  preservesPitch = false;
  volume = 1;
  preload = '';
  /** the error name play() rejects with (NotAllowedError), or null */
  playRejection: string | null = null;
  playCalls = 0;
  loads = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor(private readonly durations: Record<string, number>) {}

  addEventListener(type: string, fn: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  play(): Promise<void> {
    this.playCalls++;
    if (this.playRejection) return Promise.reject(Object.assign(new Error('refused'), { name: this.playRejection }));
    this.paused = false;
    this.ended = false;
    this.emit('play');
    this.emit('playing');
    return Promise.resolve();
  }
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }
  load(): void {
    this.loads++;
    this.readyState = 0;
    this.currentTime = 0;
    this.duration = NaN;
    const d = this.durations[this.src];
    if (d !== undefined) this.loadMeta(d);
  }
  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }

  // ---- test controls
  loadMeta(duration: number): void {
    this.duration = duration;
    this.readyState = 1;
    this.emit('loadedmetadata');
    this.emit('durationchange');
  }
  /** play position moves to t seconds */
  tick(t: number): void {
    this.currentTime = t;
    this.emit('timeupdate');
  }
  /** play reaches the end */
  finish(): void {
    this.currentTime = this.duration;
    this.ended = true;
    this.paused = true;
    this.emit('timeupdate');
    this.emit('pause');
    this.emit('ended');
  }
}

export class FakeAudioFactory {
  /** audio url to its length in seconds */
  durations: Record<string, number> = {};
  elements: FakeAudio[] = [];
  /** new elements refuse play() with this error name (the autoplay rules) */
  rejectPlay: string | null = null;
  make = (): AudioLike => {
    const el = new FakeAudio(this.durations);
    el.playRejection = this.rejectPlay;
    this.elements.push(el);
    return el;
  };
  /** the main element: the first one made */
  get main(): FakeAudio {
    return this.elements[0]!;
  }
  /** the preloading element */
  get pre(): FakeAudio | undefined {
    return this.elements[1];
  }
}

export class FakeEvents implements EventsPort {
  handlers: ((n: Notice) => void)[] = [];
  opens: (() => void)[] = [];
  subscribed = 0;
  subscribe(_l: string, onNotice: (n: Notice) => void, onOpen?: () => void): () => void {
    this.subscribed++;
    this.handlers.push(onNotice);
    if (onOpen) this.opens.push(onOpen);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== onNotice);
    };
  }
  emit(n: Partial<Notice> & { type: string }): void {
    for (const h of this.handlers) h({ at: new Date().toISOString(), book_id: BOOK_ID, listener_id: null, id: null, ...n } as Notice);
  }
}

// ---------------------------------------------------------------------------- the book

export const BOOK_ID = 'b1';
export const LISTENER = 'listener-1';
export const DEVICE = 'device-mine';
export const OTHER_DEVICE = 'device-other';

export const book: Book = {
  id: BOOK_ID,
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  state: 'readable',
  added_at: '2026-01-01T00:00:00Z',
  series: null,
  cover: null,
  chapter_count: 5,
  story_chapter_count: 3,
  word_count: 4500,
  source_sha256: null,
  place: null,
};

export const chapters: Chapter[] = [
  { id: 'c0', index: 0, title: 'Title page', kind: 'front_matter', word_count: 10, text_sha256: 'x' },
  { id: 'c1', index: 1, title: 'Ash on the Water', kind: 'story', word_count: 1500, text_sha256: 'x' },
  { id: 'c2', index: 2, title: 'What the Ledger Owes', kind: 'story', word_count: 1500, text_sha256: 'x' },
  { id: 'c3', index: 3, title: 'A Debt in Salt', kind: 'story', word_count: 1500, text_sha256: 'x' },
  { id: 'c4', index: 4, title: 'Afterword', kind: 'back_matter', word_count: 100, text_sha256: 'x' },
];

/** three lines per chapter, one per sentence */
export const textOf = (id: string) => `Alpha ${id}. Beta two. Gamma three.`;
export function linesOf(id: string): { id: string; start: number; end: number }[] {
  const t = textOf(id);
  const out: { id: string; start: number; end: number }[] = [];
  let start = 0;
  for (const m of t.matchAll(/\./g)) {
    const end = m.index! + 1;
    out.push({ id: `${id}-l${out.length + 1}`, start, end });
    start = end + 1;
  }
  return out;
}

export const audioUrl = (id: string) => `/api/audio/a-${id}`;
export const DURATION = 100;

export const readyChapter = (id: string, duration = DURATION): AudiobookChapter => ({
  chapter_id: id,
  state: 'ready',
  audio: { id: `a-${id}`, duration_seconds: duration, bytes: 1000, sha256: 's', content_type: 'audio/wav', voice_revision: 'r1', url: audioUrl(id), timings_url: `${audioUrl(id)}/timings` },
  newer_audio: null,
  detail: null,
});
export const notYet = (id: string): AudiobookChapter => ({ chapter_id: id, state: 'not_yet', audio: null, newer_audio: null, detail: null });
export const making = (id: string): AudiobookChapter => ({ chapter_id: id, state: 'making', audio: null, newer_audio: null, detail: null });

export const audiobook = (tier: 'free' | 'premium' = 'free', extra: Partial<Audiobook> = {}): Audiobook => ({
  id: 'ab1',
  book_id: BOOK_ID,
  voice_id: 'v-mara',
  voice_name: 'Mara',
  source_id: tier === 'free' ? 'breeze' : 'gemini',
  tier,
  voice_revision: 'r1',
  chapters_total: 5,
  chapters_ready: 3,
  bytes: 0,
  created_at: '2026-01-01T00:00:00Z',
  active_job_id: null,
  ...extra,
});

export const job = (state: Job['state'], extra: Partial<Job> = {}): Job => ({
  id: 'job1',
  kind: 'make_ready',
  state,
  audiobook_id: 'ab1',
  book_id: BOOK_ID,
  plan_id: null,
  chapters_total: 1,
  chapters_done: 0,
  waiting: null,
  needs_you: null,
  started_by: { listener_id: LISTENER, device_id: DEVICE },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
} as Job);

export const place = (extra: Partial<Place> = {}): Place => ({
  book_id: BOOK_ID,
  chapter_id: 'c2',
  offset: 10 + 1,
  progress: 0.34,
  mode: 'listening',
  audiobook_id: 'ab1',
  device_id: OTHER_DEVICE,
  device_name: 'Tablet',
  revision: 7,
  updated_at: '2026-01-02T00:00:00Z',
  finished: { finished: false, since: null, reason: null },
  ...extra,
});

const ok = <T>(value: T): R<T> => ({ ok: true, value });

// ---------------------------------------------------------------------------- the fake server

export class FakeApi implements PlayerApi {
  audiobooks_: Audiobook[] = [audiobook()];
  audio = new Map<string, AudiobookChapter>([
    ['c0', notYet('c0')],
    ['c1', readyChapter('c1')],
    ['c2', readyChapter('c2')],
    ['c3', readyChapter('c3')],
    ['c4', notYet('c4')],
  ]);
  settings_: ListenerSettings = { default_voice_id: null, place_conflict: 'ask', continue_into_next_chapter: true };
  /** per audio id; absent: 404 (the player spreads by line length) */
  timingsFor = new Map<string, { line_id: string; start_ms: number; end_ms: number }[]>();
  /** what requestChapter answers; default: a running job */
  onRequest: (audiobookId: string, chapterId: string, ahead: number) => R<{ kind: 'ready'; chapter: AudiobookChapter } | { kind: 'job'; job: Job }> = () => ok({ kind: 'job', job: job('running') });
  jobs = new Map<string, Job>();
  requests: { audiobookId: string; chapterId: string; ahead: number }[] = [];
  finished: boolean[] = [];
  unreachable = false;

  constructor() {
    for (const id of ['c1', 'c2', 'c3']) {
      const l = linesOf(id);
      this.timingsFor.set(`a-${id}`, [
        { line_id: l[0]!.id, start_ms: 0, end_ms: 30_000 },
        { line_id: l[1]!.id, start_ms: 30_000, end_ms: 60_000 },
        { line_id: l[2]!.id, start_ms: 60_000, end_ms: 100_000 },
      ]);
    }
  }

  private guard<T>(v: R<T>): R<T> {
    return this.unreachable ? { ok: false, status: 0, detail: 'unreachable' } : v;
  }
  book = vi.fn(async () => this.guard(ok(book)));
  chapters = vi.fn(async () => this.guard(ok(chapters)));
  chapterText = vi.fn(async (_b: string, id: string) => this.guard(ok({ chapter_id: id, text: textOf(id), text_sha256: 'x', lines: linesOf(id) })));
  audiobooks = vi.fn(async () => this.guard(ok(this.audiobooks_)));
  audioChapters = vi.fn(async () => this.guard(ok([...this.audio.values()])));
  timings = vi.fn(async (audioId: string): Promise<R<{ audio_id: string; lines: { line_id: string; start_ms: number; end_ms: number }[] }>> => {
    const lines = this.timingsFor.get(audioId);
    return lines ? ok({ audio_id: audioId, lines }) : { ok: false, status: 404, detail: 'no timings' };
  });
  requestChapter = vi.fn(async (_l: string, audiobookId: string, chapterId: string, ahead: number) => {
    this.requests.push({ audiobookId, chapterId, ahead });
    if (this.unreachable) return { ok: false as const, status: 0, detail: 'unreachable' };
    return this.onRequest(audiobookId, chapterId, ahead);
  });
  job_ = vi.fn(async (id: string) => (this.jobs.has(id) ? ok(this.jobs.get(id)!) : ({ ok: false, status: 404, detail: 'no job' } as R<Job>)));
  job = this.job_;
  settings = vi.fn(async () => this.guard(ok(this.settings_)));
  setFinished = vi.fn(async (_l: string, _b: string, finished: boolean) => {
    this.finished.push(finished);
    return ok(place({ finished: { finished, since: null, reason: finished ? 'marked' : null } }));
  });
}

/** An in-memory place server with the contract's rule: a write on a stale base from another device conflicts. */
export class FakePlaces implements PlaceApi {
  server: Place | null = null;
  puts: { listenerId: string; bookId: string; input: PlaceInput; keepalive: boolean }[] = [];
  down = false;
  deviceId = DEVICE;
  private t = 0;

  get = vi.fn(async (): Promise<GetResult> => (this.down ? { kind: 'offline' } : { kind: 'ok', place: this.server }));

  put = vi.fn(async (listenerId: string, bookId: string, input: PlaceInput, opts?: { keepalive?: boolean }): Promise<PutResult> => {
    this.puts.push({ listenerId, bookId, input, keepalive: !!opts?.keepalive });
    if (this.down) return { kind: 'offline' };
    const s = this.server;
    if (s) {
      const identical = s.chapter_id === input.chapter_id && s.offset === input.offset && s.mode === input.mode;
      if (!identical && input.base_revision !== s.revision && s.device_id !== this.deviceId) return { kind: 'conflict', server: s };
    }
    this.t++;
    this.server = place({
      chapter_id: input.chapter_id,
      offset: input.offset,
      mode: input.mode,
      audiobook_id: input.audiobook_id ?? null,
      device_id: this.deviceId,
      device_name: 'This device',
      revision: (s?.revision ?? 0) + 1,
      updated_at: new Date(Date.parse('2026-06-01T00:00:00Z') + this.t * 1000).toISOString(),
    });
    return { kind: 'ok', place: this.server };
  });

  /** another device writes */
  other(extra: Partial<Place> = {}): Place {
    this.server = place({ revision: (this.server?.revision ?? 0) + 1, device_id: OTHER_DEVICE, ...extra });
    return this.server;
  }
}
