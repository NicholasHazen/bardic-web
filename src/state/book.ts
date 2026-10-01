// The book page as the screen needs it: the book, its chapters, its audiobooks, the audio state of the
// chapters of the current audiobook, the listener's place and the job that is making it ready. The rules
// that decide what is shown are plain functions (tested); the store joins them to a gateway over the typed
// client and to /api/events.
//
// Boundaries kept here (docs/PRODUCT-SPEC.md P2, B3):
// - Only a FREE audiobook is ever made ready from this page. For a premium audiobook the store refuses before
//   any request; plans are W4.
// - The place is anchored to text, so choosing another audiobook writes the same chapter and offset.
import { get, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import {
  chapterRows,
  deviceText,
  estimateMake,
  hasMatter,
  isActiveJob,
  makeOptions,
  measuredBytesPerSecond,
  otherLine,
  readiness,
  readyText,
  runningModel,
  shortList,
  countText,
  spaceText,
  timeText,
  type ChapterAudio,
  type ChapterInfo,
  type DeviceCopy,
  type JobStateName,
  type MakeOption,
  type ScopeBody,
} from '../lib/bookAudio';
import { deviceId } from '../lib/device';
import { subscribeSharedEvents } from '../lib/sse';
import { coverColor, realCoverUrl } from './library';
import type { AudiobookCardModel, BookHeaderModel, ChaptersModel, MakeSheetModel, OtherAudiobookModel } from '../views/book/types';

export type Book = components['schemas']['Book'];
export type Chapter = components['schemas']['Chapter'];
export type Audiobook = components['schemas']['Audiobook'];
export type AudiobookChapter = components['schemas']['AudiobookChapter'];
export type Job = components['schemas']['Job'];
export type Place = components['schemas']['Place'];
export type PlaceInput = components['schemas']['PlaceInput'];
export type VoiceSource = components['schemas']['VoiceSource'];
export type Scope = components['schemas']['Scope'];

// --------------------------------------------------------------------------- gateway

export type R<T> = { ok: true; value: T } | { ok: false; status: number; code?: string; detail: string; body?: unknown };

export const UNREACHABLE = 'Your Bardic computer could not be reached. Nothing was changed.';

export interface BookGateway {
  book(listenerId: string, bookId: string): Promise<R<Book>>;
  chapters(bookId: string): Promise<R<Chapter[]>>;
  audiobooks(bookId: string): Promise<R<Audiobook[]>>;
  /** null when the listener never opened the book. */
  place(listenerId: string, bookId: string): Promise<R<Place | null>>;
  defaultVoice(listenerId: string): Promise<R<string | null>>;
  sources(): Promise<R<VoiceSource[]>>;
  audioChapters(audiobookId: string): Promise<R<AudiobookChapter[]>>;
  job(jobId: string): Promise<R<Job>>;
  makeReady(listenerId: string, audiobookId: string, scope: Scope, key: string): Promise<R<Job>>;
  pauseJob(jobId: string): Promise<R<Job>>;
  resumeJob(jobId: string): Promise<R<Job>>;
  cancelJob(jobId: string): Promise<R<Job>>;
  putPlace(listenerId: string, bookId: string, input: PlaceInput): Promise<R<Place>>;
}

export const hdr = (listenerId: string) => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() });
export const dev = () => ({ 'X-Bardic-Device': deviceId() });

export async function call<T>(run: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<R<T>> {
  try {
    const r = await run();
    if (r.response.ok && r.data !== undefined) return { ok: true, value: r.data };
    if (r.response.ok) return { ok: true, value: undefined as T };
    const e = r.error as { code?: string; detail?: string } | undefined;
    return { ok: false, status: r.response.status, code: e?.code, detail: e?.detail ?? 'Something went wrong.', body: r.error };
  } catch {
    return { ok: false, status: 0, detail: UNREACHABLE };
  }
}

const map = <T, U>(r: R<T>, f: (v: T) => U): R<U> => (r.ok ? { ok: true, value: f(r.value) } : r);

export const apiGateway: BookGateway = {
  book: (l, id) => call(() => api.GET('/api/books/{book_id}', { params: { path: { book_id: id }, header: hdr(l) } })),
  chapters: async (id) => map(await call(() => api.GET('/api/books/{book_id}/chapters', { params: { path: { book_id: id } } })), (v) => v?.items ?? []),
  audiobooks: async (id) => map(await call(() => api.GET('/api/books/{book_id}/audiobooks', { params: { path: { book_id: id } } })), (v) => v?.items ?? []),
  place: async (l, id) => {
    const r = await call(() => api.GET('/api/books/{book_id}/place', { params: { path: { book_id: id }, header: hdr(l) } }));
    if (!r.ok && r.status === 404) return { ok: true, value: null };
    return r;
  },
  defaultVoice: async (l) => map(await call(() => api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: l } } })), (v) => v?.default_voice_id ?? null),
  sources: async () => map(await call(() => api.GET('/api/voice-sources')), (v) => v?.items ?? []),
  audioChapters: async (id) => map(await call(() => api.GET('/api/audiobooks/{audiobook_id}/chapters', { params: { path: { audiobook_id: id } } })), (v) => v?.items ?? []),
  job: (id) => call(() => api.GET('/api/jobs/{job_id}', { params: { path: { job_id: id } } })),
  makeReady: (l, id, scope, key) =>
    call(() =>
      api.POST('/api/audiobooks/{audiobook_id}/make-ready', {
        params: { path: { audiobook_id: id }, header: { ...hdr(l), 'Idempotency-Key': key } },
        body: { scope },
      }),
    ),
  pauseJob: (id) => call(() => api.POST('/api/jobs/{job_id}/pause', { params: { path: { job_id: id }, header: dev() } })),
  resumeJob: (id) => call(() => api.POST('/api/jobs/{job_id}/resume', { params: { path: { job_id: id }, header: dev() } })),
  cancelJob: (id) => call(() => api.POST('/api/jobs/{job_id}/cancel', { params: { path: { job_id: id }, header: dev() } })),
  putPlace: (l, id, input) => call(() => api.PUT('/api/books/{book_id}/place', { params: { path: { book_id: id }, header: hdr(l) }, body: input })),
};

// --------------------------------------------------------------------------- what is held on this device

/**
 * What this device holds of each audiobook: audiobook id to chapter id to the copy's state. Offline storage (W5)
 * fills it; until then the device holds nothing and every chapter shows the server's word.
 */
export const deviceChapters = writable<ReadonlyMap<string, ReadonlyMap<string, DeviceCopy>>>(new Map());

// --------------------------------------------------------------------------- the current audiobook (B3)

const choiceKey = (listenerId: string, bookId: string) => `bardic.audiobook.${listenerId}.${bookId}`;

/** The audiobook this listener chose for a book on this device, kept when there is no place to carry it. */
export function chosenAudiobook(listenerId: string, bookId: string): string | null {
  try {
    return localStorage.getItem(choiceKey(listenerId, bookId));
  } catch {
    return null;
  }
}

function rememberChoice(listenerId: string, bookId: string, audiobookId: string): void {
  try {
    localStorage.setItem(choiceKey(listenerId, bookId), audiobookId);
  } catch {
    /* the place (when there is one) still carries the choice */
  }
}

/**
 * Which audiobook is the listener's current one: the one in their place, else the one they chose here, else the
 * one made with their default voice, else the one with the most ready, else the first.
 */
export function pickCurrent(
  audiobooks: readonly Pick<Audiobook, 'id' | 'voice_id' | 'chapters_ready' | 'created_at'>[],
  place: Pick<Place, 'audiobook_id'> | null | undefined,
  chosen: string | null | undefined,
  defaultVoiceId: string | null | undefined,
): string | null {
  const has = (id: string | null | undefined): id is string => !!id && audiobooks.some((a) => a.id === id);
  if (has(place?.audiobook_id)) return place.audiobook_id;
  if (has(chosen)) return chosen;
  const byDefault = defaultVoiceId ? audiobooks.find((a) => a.voice_id === defaultVoiceId) : undefined;
  if (byDefault) return byDefault.id;
  const best = [...audiobooks].sort((a, b) => b.chapters_ready - a.chapters_ready || Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return best?.id ?? null;
}

// --------------------------------------------------------------------------- shaping

export const seriesLine = (series: Book['series']): string | undefined => {
  if (!series) return undefined;
  return series.order === null || series.order === undefined ? series.name : `${series.name} · Volume ${series.order}`;
};

export const wordsText = (n: number) => n.toLocaleString('en-US');

export function toHeader(book: Book): BookHeaderModel {
  const m: BookHeaderModel = {
    title: book.title,
    author: book.author,
    meta: `${book.chapter_count} ${book.chapter_count === 1 ? 'chapter' : 'chapters'} · ${wordsText(book.word_count)} words`,
    color: coverColor(book),
  };
  const s = seriesLine(book.series);
  if (s) m.seriesLine = s;
  const src = realCoverUrl(book.cover);
  if (src) m.coverSrc = src;
  return m;
}

/** "Breeze voice · from your Breeze server": where a voice comes from, in the words of the UI guide. */
export function sourceLine(source: Pick<VoiceSource, 'kind' | 'name'> | undefined): string {
  if (!source) return 'Voice';
  switch (source.kind) {
    case 'local':
      return 'Built-in voice · on your Bardic computer';
    case 'breeze':
      return `${source.name} voice · from your Breeze server`;
    case 'gemini':
      return `${source.name} voice · from Google`;
  }
}

export interface BookState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'missing';
  error?: string;
  book?: Book;
  chapters: Chapter[];
  audiobooks: Audiobook[];
  sources: VoiceSource[];
  place: Place | null;
  defaultVoiceId: string | null;
  currentId: string | null;
  /** Audio state of every chapter of the current audiobook. */
  audio: Map<string, ChapterAudio>;
  /** Measured size of audio made on this server, in bytes per second. */
  bytesPerSecond?: number;
  job: Job | null;
  /** When the job was last read (for the time left). */
  at: number;
}

export const emptyState = (): BookState => ({
  status: 'idle',
  chapters: [],
  audiobooks: [],
  sources: [],
  place: null,
  defaultVoiceId: null,
  currentId: null,
  audio: new Map(),
  job: null,
  at: 0,
});

export const currentAudiobook = (s: Pick<BookState, 'audiobooks' | 'currentId'>): Audiobook | undefined => s.audiobooks.find((a) => a.id === s.currentId);

export function toAudio(items: readonly AudiobookChapter[]): Map<string, ChapterAudio> {
  const m = new Map<string, ChapterAudio>();
  for (const c of items) {
    const a: ChapterAudio = { state: c.state };
    if (c.audio) {
      a.durationSeconds = c.audio.duration_seconds;
      a.bytes = c.audio.bytes;
    }
    m.set(c.chapter_id, a);
  }
  return m;
}

const info = (c: Chapter): ChapterInfo => ({ id: c.id, title: c.title, kind: c.kind });

export interface PageUi {
  expanded: boolean;
  storyOnly: boolean;
}

export interface PageModel {
  header: BookHeaderModel;
  primaryLabel: string;
  audiobook: AudiobookCardModel | null;
  others: OtherAudiobookModel[];
  chapters: ChaptersModel;
  premium: boolean;
}

const heldOf = (s: Pick<BookState, 'currentId'>, device: ReadonlyMap<string, ReadonlyMap<string, DeviceCopy>>) => device.get(s.currentId ?? '') ?? new Map<string, DeviceCopy>();

/** The count of chapters of an audiobook that this device holds. */
const heldCount = (id: string, device: ReadonlyMap<string, ReadonlyMap<string, DeviceCopy>>) => [...(device.get(id)?.values() ?? [])].filter((d) => d === 'held').length;

export function pageModel(s: BookState, ui: PageUi, device: ReadonlyMap<string, ReadonlyMap<string, DeviceCopy>> = new Map(), nowMs = s.at): PageModel | null {
  const book = s.book;
  if (!book) return null;
  const current = currentAudiobook(s);
  const copies = heldOf(s, device);
  const held = new Set([...copies].filter(([, d]) => d === 'held').map(([id]) => id));
  const infos = s.chapters.map(info);

  let card: AudiobookCardModel | null = null;
  if (current) {
    const ids = s.audio.size ? [...s.audio.keys()] : [];
    const r = ids.length ? readiness(ids, s.audio, held) : { total: current.chapters_total, ready: current.chapters_ready, onDevice: held.size, fraction: current.chapters_total ? current.chapters_ready / current.chapters_total : 0 };
    card = {
      id: current.id,
      voice: current.voice_name,
      tier: current.tier,
      sourceLine: sourceLine(s.sources.find((x) => x.id === current.source_id)),
      readyText: readyText(r),
      deviceText: deviceText(r.onDevice),
      ready: r.fraction,
      canMakeReady: r.ready < r.total,
    };
    // A job that belongs to a plan is shown by the plan card (src/views/plans), which pauses and stops it as a plan.
    if (s.job && s.job.audiobook_id === current.id && !s.job.plan_id && isActiveJob(s.job.state as JobStateName)) {
      card.running = runningModel(s.job, { chapters_ready: r.ready, chapters_total: r.total }, nowMs);
    }
  }

  const others: OtherAudiobookModel[] = s.audiobooks
    .filter((a) => a.id !== s.currentId)
    .map((a) => ({ id: a.id, voice: a.voice_name, tier: a.tier, line: otherLine(a.chapters_ready, a.chapters_total, heldCount(a.id, device)) }));

  const rows = chapterRows({
    chapters: infos,
    audio: s.audio,
    held,
    deviceState: new Map([...copies].filter(([, d]) => d !== 'held')),
    currentId: s.place?.chapter_id,
    progress: s.place?.progress,
    filter: ui.storyOnly ? 'story' : 'all',
  });
  const list = shortList(rows, ui.expanded);

  return {
    header: toHeader(book),
    primaryLabel: s.place && !s.place.finished.finished ? 'Continue listening' : 'Listen',
    audiobook: card,
    others,
    chapters: { rows: list.rows, more: list.more, total: list.total, hasMatter: hasMatter(infos), storyOnly: ui.storyOnly },
    premium: current?.tier === 'premium',
  };
}

/** The options and figures of the Make ready sheet for the current audiobook. Undefined when there is nothing to choose. */
export function makeSheet(s: BookState, selected: string): { model: MakeSheetModel; options: MakeOption[]; chosen: MakeOption } | undefined {
  const current = currentAudiobook(s);
  if (!current || current.tier !== 'free' || !s.chapters.length) return undefined;
  const chapters = s.chapters.map((c) => ({ ...info(c), word_count: c.word_count }));
  const options = makeOptions({ chapters, audio: s.audio, currentId: s.place?.chapter_id });
  const chosen = options.find((o) => o.id === selected) ?? options[0]!;
  const est = estimateMake(chapters, chosen.chapterIds, s.audio, s.bytesPerSecond);
  return {
    options,
    chosen,
    model: {
      eyebrow: `${current.voice_name} · free`,
      options: options.map((o) => ({ id: o.id, title: o.title, detail: o.detail })),
      selected: chosen.id,
      toMake: countText(est.toMake),
      time: timeText(est.seconds),
      space: spaceText(est.bytes),
      nothingToMake: est.toMake === 0,
    },
  };
}

// --------------------------------------------------------------------------- the store

export type ActionResult = { ok: true } | { ok: false; detail: string; code?: string };

const fail = (r: { detail: string; code?: string }): ActionResult => ({ ok: false, detail: r.detail, code: r.code });

/** Notices that change what the book page shows; the first group only changes audio. */
const AUDIO_NOTICES = new Set(['audiobook.updated', 'chapter.updated', 'job.updated', 'plan.updated']);
const PAGE_NOTICES = new Set(['book.updated', 'place.updated', 'resync', 'listener.updated', 'source.updated']);

export function noticeNeeds(notice: { type?: string; book_id?: string | null; listener_id?: string | null }, bookId: string, listenerId: string): 'audio' | 'all' | null {
  if (!notice.type) return null;
  if (notice.listener_id && notice.listener_id !== listenerId) return null;
  if (notice.type === 'resync') return 'all';
  if (notice.book_id && notice.book_id !== bookId) return null;
  if (PAGE_NOTICES.has(notice.type)) return 'all';
  if (AUDIO_NOTICES.has(notice.type)) return 'audio';
  return null;
}

export class BookStore {
  private readonly store = writable<BookState>(emptyState());
  readonly subscribe: Readable<BookState>['subscribe'] = this.store.subscribe;
  private listenerId: string | null = null;
  private bookId: string | null = null;
  private run = 0;
  private audioRun = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingAll = false;

  constructor(
    private readonly gw: BookGateway = apiGateway,
    private readonly now: () => number = Date.now,
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}

  /** Set what to show. Returns true when that started a load. */
  configure(listenerId: string | null, bookId: string | null): boolean {
    if (listenerId === this.listenerId && bookId === this.bookId) return false;
    this.listenerId = listenerId;
    this.bookId = bookId;
    this.run++;
    this.audioRun++;
    this.store.set(emptyState());
    if (listenerId && bookId) void this.load();
    return true;
  }

  /** Reload after change notices; bursts collapse into one pass. */
  refreshSoon(kind: 'audio' | 'all' = 'all', delay = 250): void {
    if (kind === 'all') this.pendingAll = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const all = this.pendingAll;
      this.pendingAll = false;
      void (all ? this.load(false) : this.loadAudio());
    }, delay);
  }

  async load(showLoading = true): Promise<void> {
    const l = this.listenerId;
    const id = this.bookId;
    if (!l || !id) return;
    const mine = ++this.run;
    if (showLoading) this.store.update((s) => (s.status === 'ready' ? s : { ...s, status: 'loading' }));
    const [book, chapters, audiobooks, place, voice, sources] = await Promise.all([
      this.gw.book(l, id),
      this.gw.chapters(id),
      this.gw.audiobooks(id),
      this.gw.place(l, id),
      this.gw.defaultVoice(l),
      this.gw.sources(),
    ]);
    if (mine !== this.run) return;
    if (!book.ok) {
      this.store.update((s) => ({ ...s, status: book.status === 404 ? 'missing' : 'error', error: book.detail }));
      return;
    }
    // The page needs the book, chapters and audiobooks; the place, default voice and sources only refine it.
    if (!chapters.ok || !audiobooks.ok) {
      const bad = !chapters.ok ? chapters : (audiobooks as Extract<typeof audiobooks, { ok: false }>);
      this.store.update((s) => ({ ...s, status: 'error', error: bad.detail }));
      return;
    }
    const currentId = pickCurrent(audiobooks.value, place.ok ? place.value : null, chosenAudiobook(l, id), voice.ok ? voice.value : null);
    this.store.update((s) => ({
      ...s,
      status: 'ready',
      error: undefined,
      book: book.value,
      chapters: chapters.value,
      audiobooks: audiobooks.value,
      place: place.ok ? place.value : s.place,
      defaultVoiceId: voice.ok ? voice.value : s.defaultVoiceId,
      sources: sources.ok ? sources.value : s.sources,
      currentId,
    }));
    await this.loadAudio();
  }

  /** The audiobooks, the audio state of the current one and its job. */
  async loadAudio(): Promise<void> {
    const id = this.bookId;
    if (!id) return;
    const mine = ++this.audioRun;
    const books = await this.gw.audiobooks(id);
    if (mine !== this.audioRun) return;
    if (books.ok) {
      const l = this.listenerId;
      this.store.update((s) => {
        const cur = s.currentId && books.value.some((a) => a.id === s.currentId) ? s.currentId : l ? pickCurrent(books.value, s.place, chosenAudiobook(l, id), s.defaultVoiceId) : null;
        return { ...s, audiobooks: books.value, currentId: cur };
      });
    }
    const s0 = get(this.store);
    const cur = currentAudiobook(s0);
    if (!cur) {
      this.store.update((s) => ({ ...s, audio: new Map(), job: null }));
      return;
    }
    const [audio, job] = await Promise.all([this.gw.audioChapters(cur.id), cur.active_job_id ? this.gw.job(cur.active_job_id) : Promise.resolve(null)]);
    if (mine !== this.audioRun) return;
    this.store.update((s) => {
      if (s.currentId !== cur.id) return s;
      const next = audio.ok ? toAudio(audio.value) : s.audio;
      const bps = measuredBytesPerSecond(next.values());
      return { ...s, audio: next, bytesPerSecond: bps ?? s.bytesPerSecond, job: job && job.ok ? job.value : null, at: this.now() };
    });
  }

  // ---- choosing the current audiobook (B3)

  /** Make another audiobook this listener's current one. The place is kept: same chapter, same offset. */
  async choose(audiobookId: string): Promise<ActionResult> {
    const l = this.listenerId;
    const bookId = this.bookId;
    const s = get(this.store);
    if (!l || !bookId || !s.audiobooks.some((a) => a.id === audiobookId)) return { ok: false, detail: 'That audiobook is not on this book.' };
    rememberChoice(l, bookId, audiobookId);
    const place = s.place;
    this.store.update((x) => ({ ...x, currentId: audiobookId, audio: new Map(), job: null }));
    if (place) {
      const r = await this.gw.putPlace(l, bookId, {
        chapter_id: place.chapter_id,
        offset: place.offset,
        mode: place.mode,
        audiobook_id: audiobookId,
        base_revision: place.revision,
      });
      if (r.ok) this.store.update((x) => ({ ...x, place: r.value }));
      else {
        // Another device moved the place first. Nothing is overwritten: show the server's place and the audiobook it uses.
        await this.load(false);
        return r.code === 'place_conflict'
          ? { ok: false, code: r.code, detail: 'Another device moved your place just now. Your place was not changed; try again.' }
          : fail(r);
      }
    }
    await this.loadAudio();
    return { ok: true };
  }

  // ---- making ready (free voices only)

  /** Start making the current audiobook ready. Refuses a premium audiobook before any request (P2). */
  async makeReady(scope: ScopeBody): Promise<ActionResult> {
    const l = this.listenerId;
    const cur = currentAudiobook(get(this.store));
    if (!l || !cur) return { ok: false, detail: 'There is no audiobook to make ready.' };
    if (cur.tier !== 'free') return { ok: false, code: 'plan_required', detail: 'A premium voice needs a plan you approve first. Nothing was started.' };
    const r = await this.gw.makeReady(l, cur.id, scope as Scope, this.newKey());
    if (!r.ok) return fail(r);
    this.store.update((s) => ({ ...s, job: r.value, at: this.now() }));
    void this.loadAudio();
    return { ok: true };
  }

  private async jobAction(run: (id: string) => Promise<R<Job>>): Promise<ActionResult> {
    const job = get(this.store).job;
    if (!job) return { ok: false, detail: 'Nothing is being made.' };
    const r = await run(job.id);
    if (!r.ok) return fail(r);
    this.store.update((s) => ({ ...s, job: r.value, at: this.now() }));
    void this.loadAudio();
    return { ok: true };
  }

  pause = () => this.jobAction((id) => this.gw.pauseJob(id));
  resume = () => this.jobAction((id) => this.gw.resumeJob(id));
  /** Stop: finished chapters are kept. */
  stop = () => this.jobAction((id) => this.gw.cancelJob(id));

  dispose(): void {
    clearTimeout(this.timer);
    this.run++;
    this.audioRun++;
  }
}

export const bookStore = new BookStore();

/**
 * Follow /api/events for one book while it is shown: audio notices reload the audio state, the others the whole page.
 * Returns the function that stops following.
 */
export function followBookEvents(store: BookStore, listenerId: string, bookId: string, onnotice?: (notice: { type?: string }) => void): () => void {
  return subscribeSharedEvents(
    listenerId,
    {
      onopen: () => store.refreshSoon('all', 0),
      onmessage: (msg) => {
        try {
          const notice = JSON.parse(msg.data);
          onnotice?.(notice);
          const kind = noticeNeeds(notice, bookId, listenerId);
          if (kind) store.refreshSoon(kind);
        } catch {
          /* not a notice */
        }
      },
    },
    { headers: () => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() }) },
  );
}
