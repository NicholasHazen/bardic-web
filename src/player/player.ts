// The player: one store that implements PlayerState and PlayerCommands (src/player/types.ts) over the audio
// engine, the place writer and the API. No screens live here.
//
// Rules kept here (docs/PRODUCT-SPEC.md, AGENTS.md):
// - Words are never changed: the text and its lines are shown exactly as the server stores them; places are text
//   offsets in Unicode code points; audio time is only a way to find the line.
// - Nothing paid starts from the player. A chapter of a PREMIUM audiobook that has no audio is never requested
//   (requestChapterAudio is `may_charge` for it): the state is Needs you, "Premium audio is made under a plan".
//   Free voices are made on demand and ahead, which costs nothing.
// - Four listening states only: Playing, Getting ready, Waiting, Needs you (rules.ts).
// - The place is saved through src/sync/place.ts, always with base_revision, never discarding the other place.
import { derived, get, writable, type Readable } from 'svelte/store';
import { chapterWord, type AudioWord } from '../lib/bookAudio';
import { browserStorage, systemClock, type Clock, type KeyValueStorage } from '../lib/clock';
import { cpLength } from '../lib/codepoints';
import { lineAtOffset, lineAtTime, normalizeTimings, offsetAtTime, spreadTimings, timeForOffset } from '../lib/timings';
import { listenerStore } from '../state/listener';
import { chosenAudiobook } from '../state/book';
import { offline } from '../offline/offline';
import { PlaceSync, apiPlaceApi, type HeldConflict, type Place, type PlaceApi, type Position, type Lifecycle } from '../sync/place';
import { AudioEngine, SKIP_SECONDS, browserAudioFactory, browserMediaSession, type AudioLike, type MediaSessionPort } from './engine';
import { apiPlayerApi, sseEvents, type Audiobook, type AudiobookChapter, type Book, type Chapter, type EventsPort, type Job, type ListenerSettings, type Notice, type PlayerApi, type R } from './gateway';
import {
  BACK_RESTART_SECONDS,
  deriveListening,
  firstPlayable,
  needsFromServer,
  needsYou,
  nextPlayable,
  premiumNeeds,
  previousPlayable,
  progressEstimate,
} from './rules';
import type { HeldBookInfo, HeldChapter } from '../offline/types';
import { SPEED_MAX, SPEED_MIN, type LineTiming, type Mode, type NeedsYou, type PlaceConflictInfo, type PlaceSnapshot, type PlayerCommands, type PlayerState, type SleepTimer, type TextLine } from './types';

// --------------------------------------------------------------------------- dependencies

export interface PlayerDeps {
  api: PlayerApi;
  places: PlaceApi;
  clock: Clock;
  /** makes the one audio element (and a second, silent one for preloading) */
  createAudio: () => AudioLike;
  storage: KeyValueStorage;
  /** null: no live notices; the player polls */
  events: EventsPort | null;
  mediaSession: MediaSessionPort | null;
  /** the listener selected on this device */
  listener: () => string | null;
  /** this device's name for the place conflict sheet */
  deviceName?: () => string;
  /** page lifecycle for the place writer (null: none) */
  lifecycle?: Lifecycle | null;
  /** chapter ids this device holds (offline, W5); none until then */
  heldChapters?: (audiobookId: string) => ReadonlySet<string>;
  /** Runtime of the held copy without loading its content; may differ from newer server audio. */
  heldDuration?: (audiobookId: string, chapterId: string) => number | null;
  /** a downloaded chapter's audio, text and timings, usable with no server; null when this device does not hold it */
  held?: (audiobookId: string, chapterId: string) => Promise<HeldChapter | null>;
  /** a downloaded book as the device remembers it, for opening it with no server; null when nothing of it is held */
  heldBook?: (bookId: string, preferAudiobookId?: string | null) => HeldBookInfo | null;
  /** false while the Bardic computer is known to be unreachable; going back to true reconnects quietly */
  online?: Readable<boolean>;
  /** the audiobook the listener chose for a book on this device */
  chosenAudiobook?: (listenerId: string, bookId: string) => string | null;
  /** a place writer to use instead of making one (tests) */
  sync?: PlaceSync;
  /** this device's id, for the place writer */
  deviceId?: () => string;
}

export type RestoreResult = 'restored' | 'conflict_before' | 'conflict_after' | 'failed';

export interface Player extends Readable<PlayerState>, PlayerCommands {
  /** Update display metadata only when the complete chapter order is unchanged. */
  updateChapterMetadata(bookId: string, chapters: readonly Chapter[]): boolean;
  /** Restore a recent text place, paused, through the same revision/conflict flow as ordinary places. */
  restorePlace(bookId: string, place: Place): Promise<RestoreResult>;
  /** The end of the book screen: mark finished (true) or reopen (false). The server computes the automatic finish itself (C6). */
  markFinished(finished: boolean): Promise<boolean>;
  /** The end of the book screen: listen again from the start of the story. */
  listenAgain(): void;
  /** The place writer, for tests and for a "saved" indicator. */
  readonly sync: PlaceSync;
  /** Stop everything and release the audio element. */
  destroy(): void;
}

// --------------------------------------------------------------------------- constants

export const SPEED_KEY = 'bardic.player.speed';
export const POLL_MS = 2000;
export const ACTIVE_JOB_POLL_MS = 10_000;
/** chapters kept made ahead of the one playing, for a free voice */
export const KEEP_AHEAD = 2;
/** chapters asked for after the one the listener pressed play on */
export const AHEAD_ON_DEMAND = 2;
export const PRELOAD_WITHIN_SECONDS = 30;
export const IDLE_PRELOAD_MS = 3000;
export const SEEK_FLUSH_MS = 600;
export const FADE_MS = 1500;

const HELD_PREFIX = 'held:';
const DEFAULT_SETTINGS: ListenerSettings = { default_voice_id: null, place_conflict: 'ask', continue_into_next_chapter: true };

const toMode = (m: Place['mode']): Mode => (m === 'reading' ? 'read' : 'listen');
const toPlaceMode = (m: Mode): Place['mode'] => (m === 'read' ? 'reading' : 'listening');

export function initialState(speed = 1): PlayerState {
  return {
    offlineNext: null,
    loaded: false,
    book: null,
    chapter: null,
    voice: null,
    audiobookId: null,
    listening: null,
    detail: null,
    needsYou: null,
    playing: false,
    position: 0,
    duration: 0,
    aheadSeconds: null,
    bookProgress: 0,
    remainingSeconds: null,
    speed,
    sleep: { kind: 'off' },
    mode: 'listen',
    text: '',
    lines: [],
    timings: [],
    currentLineId: null,
    chapterOffset: 0,
    chapters: [],
    conflict: null,
    finishedBook: false,
    placeSync: 'saved',
  };
}

interface Target {
  offset?: number;
  time?: number | null;
}

interface Pending {
  chapterId: string;
  target: Target;
  requested: boolean;
  tries: number;
}

interface AudiobookSwitch {
  audiobook: Audiobook;
  requestedChapter: string | null;
  checking: boolean;
  makeAudio: boolean;
}

type TextEntry = { text: string; lines: TextLine[] };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// --------------------------------------------------------------------------- the implementation

class PlayerImpl {
  private readonly store: ReturnType<typeof writable<PlayerState>>;
  private st: PlayerState;
  readonly engine: AudioEngine;
  readonly sync: PlaceSync;
  private readonly clock: Clock;
  private speed: number;

  private listenerId: string | null = null;
  private bookId: string | null = null;
  private book: Book | null = null;
  private chapters: Chapter[] = [];
  /** Legacy caches used equal weights for whole-book progress; do not display those weights as word counts. */
  private unknownWordCounts = new Set<string>();
  private audiobooks: Audiobook[] = [];
  private audiobook: Audiobook | null = null;
  private audio = new Map<string, AudiobookChapter>();
  private settings: ListenerSettings = DEFAULT_SETTINGS;

  private run = 0;
  private metadataRun = 0;
  private chapterRun = 0;
  private curChapterId: string | null = null;
  /** the chapter whose audio the element holds */
  private audioChapterId: string | null = null;
  private text = '';
  private lines: TextLine[] = [];
  private timings: LineTiming[] = [];
  private cursorOffset = 0;
  private anchor: { chapterId: string; offset: number; time: number } | null = null;
  private wantPlay = false;
  private transition = false;
  private switching: AudiobookSwitch | null = null;
  private switchTimer: number | undefined;
  private switchRun = 0;
  private adopting: Promise<void> = Promise.resolve();
  private pending: Pending | null = null;
  private job: Job | null = null;
  private needs: NeedsYou | null = null;
  private waiting: { until: number | null } | null = null;
  private buffering = false;
  private held: HeldConflict | null = null;
  /** the Bardic computer could not be reached on the last try */
  private serverDown = false;
  /** false for an audiobook opened from this device's memory: its tier is not known, so nothing is requested for it */
  private tierKnown = true;
  private offer: { chapterId: string; title: string } | null = null;
  private lastOnline: boolean | undefined;
  private heldCache = new Map<string, Promise<HeldChapter | null>>();

  private textCache = new Map<string, Promise<TextEntry | null>>();
  private timingsCache = new Map<string, Promise<LineTiming[]>>();
  private requestedAhead = new Set<string>();
  private preloadedFor: string | null = null;

  private pollTimer: number | undefined;
  private tickTimer: number | undefined;
  private seekTimer: number | undefined;
  private sleepTimer: number | undefined;
  private idleTimer: number | undefined;
  private refreshTimer: number | undefined;
  private stopEvents: (() => void) | null = null;
  private unsubs: (() => void)[] = [];

  constructor(private readonly d: PlayerDeps) {
    this.clock = d.clock;
    this.speed = this.readSpeed();
    this.st = initialState(this.speed);
    this.store = writable(this.st);
    this.engine = new AudioEngine({
      factory: d.createAudio,
      clock: d.clock,
      session: d.mediaSession,
      handlers: {
        time: (p, dur) => this.onTime(p, dur),
        line: (id) => this.onLine(id),
        ended: () => this.onEnded(),
        playState: (playing) => this.onPlayState(playing),
        buffering: (b) => this.onBuffering(b),
        error: () => this.onAudioError(),
      },
    });
    this.sync =
      d.sync ??
      new PlaceSync({
        api: d.places,
        storage: d.storage,
        clock: d.clock,
        deviceId: d.deviceId,
        policy: () => this.settings.place_conflict,
        lifecycle: d.lifecycle,
      });
    this.sync.onAdopt = (place) => { this.adopting = this.adoptPlace(place); };
    this.unsubs.push(
      this.sync.conflict.subscribe((c) => this.onConflict(c)),
      this.sync.status.subscribe((s) => this.push({ placeSync: s })),
    );
    if (d.online) {
      this.unsubs.push(
        d.online.subscribe((on) => {
          const was = this.lastOnline;
          this.lastOnline = on;
          if (was === false && on) void this.reconnect();
        }),
      );
    }
  }

  // ----------------------------------------------------------------------------- state

  readonly subscribe: Readable<PlayerState>['subscribe'] = (run, invalidate) => this.store.subscribe(run, invalidate);

  private push(patch: Partial<PlayerState>): void {
    this.st = { ...this.st, ...patch };
    this.store.set(this.st);
  }

  private readSpeed(): number {
    try {
      const v = Number(this.d.storage.getItem(SPEED_KEY));
      return Number.isFinite(v) && v >= SPEED_MIN && v <= SPEED_MAX ? v : 1;
    } catch {
      return 1;
    }
  }

  private route(): string {
    return this.bookId ? `/book/${this.bookId}` : '/';
  }

  /** The four states and their detail line, from what is true now. */
  private refreshState(): void {
    const awaitingAudio = (!!this.switching || (!!this.pending && this.wantPlay)) && !this.needs;
    const { listening, detail } = deriveListening({
      needs: this.needs,
      waiting: this.waiting,
      awaitingAudio,
      buffering: this.buffering,
      playing: this.st.playing,
      aheadSeconds: this.st.aheadSeconds,
      now: this.clock.now(),
    });
    const offer = this.needs?.code === 'offline_not_downloaded' ? this.offer : null;
    if (listening !== this.st.listening || detail !== this.st.detail || this.needs !== this.st.needsYou || offer !== (this.st.offlineNext ?? null)) this.push({ listening, detail, needsYou: this.needs, offlineNext: offer });
    // the countdown of Waiting moves by itself
    this.clock.clearTimeout(this.tickTimer ?? 0);
    this.tickTimer = undefined;
    if (listening === 'waiting') this.tickTimer = this.clock.setTimeout(() => this.refreshState(), 1000);
  }

  private chapterList(): PlayerState['chapters'] {
    const held = this.audiobook ? (this.d.heldChapters?.(this.audiobook.id) ?? new Set<string>()) : new Set<string>();
    let story = 0;
    return this.chapters.map((c) => {
      const matter = c.kind !== 'story';
      const word: AudioWord = chapterWord(this.audio.get(c.id)?.state, held.has(c.id) ? 'held' : undefined);
      const audio = word === 'on_device' || word === 'ready' || word === 'making' ? word : 'not_yet';
      const ready = this.audio.get(c.id);
      const seconds = held.has(c.id)
        ? this.d.heldDuration?.(this.audiobook!.id, c.id) ?? (c.id === this.audioChapterId && this.st.duration > 0 ? this.st.duration : undefined)
        : ready?.state === 'ready' ? ready.audio?.duration_seconds : undefined;
      return {
        id: c.id, title: c.title, index: c.index, storyNumber: matter ? null : ++story, matter, audio,
        ...(this.unknownWordCounts.has(c.id) ? {} : { wordCount: c.word_count }),
        textLength: c.text_length, pageCount: c.page_count,
        ...(seconds === undefined || seconds === null ? {} : { durationSeconds: seconds }),
      };
    });
  }

  /** Metadata changes never replace text, audio, places or the currently loaded media. */
  updateChapterMetadata(bookId: string, chapters: readonly Chapter[]): boolean {
    if (!this.st.loaded || this.bookId !== bookId || chapters.length !== this.chapters.length || chapters.some((c, i) => c.id !== this.chapters[i]?.id)) return false;
    // An explicit refresh also supersedes an older event read still in flight.
    this.metadataRun++;
    this.chapters = this.chapters.map((c, i) => ({
      ...c, title: chapters[i]!.title, kind: chapters[i]!.kind,
      text_length: chapters[i]!.text_length, page_count: chapters[i]!.page_count,
      // Existing immutable text facts are retained; a legacy cache can gain a real count.
      ...(this.unknownWordCounts.has(c.id) ? { word_count: chapters[i]!.word_count } : {}),
    }));
    this.unknownWordCounts.clear();
    const current = this.chapters.find((c) => c.id === this.curChapterId);
    if (this.offer) {
      const offered = this.chapters.find((c) => c.id === this.offer?.chapterId);
      if (offered) this.offer = { ...this.offer, title: offered.title };
    }
    this.push({ chapters: this.chapterList(), ...(current ? { chapter: this.chapterInfo(current) } : {}) });
    this.setSessionMeta();
    this.recompute();
    this.refreshState();
    return true;
  }

  private async refreshChapterMetadata(): Promise<void> {
    const bookId = this.bookId;
    const listenerId = this.listenerId;
    const run = this.run;
    if (!bookId || !listenerId || !this.st.loaded) return;
    const mine = ++this.metadataRun;
    const chapters = await this.d.api.chapters(bookId);
    if (mine !== this.metadataRun || run !== this.run || this.bookId !== bookId || this.listenerId !== listenerId || this.d.listener() !== listenerId) return;
    if (chapters.ok) this.updateChapterMetadata(bookId, chapters.value);
  }

  /** In play order: the chapters after `chapterId`, matter skipped. */
  private following(chapterId: string): Chapter[] {
    const out: Chapter[] = [];
    let at = chapterId;
    for (let n = 0; n < this.chapters.length; n++) {
      const next = nextPlayable(this.chapters, at);
      if (!next) break;
      out.push(next);
      at = next.id;
    }
    return out;
  }

  private isReady = (id: string): boolean => this.audio.get(id)?.state === 'ready' && !!this.audio.get(id)?.audio;

  /** Numbers that depend on the audio map and the position. */
  private recompute(): void {
    const cur = this.curChapterId;
    if (!cur) return;
    const fol = this.following(cur);
    let ahead = 0;
    let allReady = true;
    let contiguous = true;
    for (const c of fol) {
      const a = this.audio.get(c.id);
      if (a?.state === 'ready' && a.audio) {
        if (contiguous) ahead += a.audio.duration_seconds;
      } else {
        contiguous = false;
        allReady = false;
      }
    }
    const curAudio = this.audio.get(cur)?.audio;
    const dur = this.st.duration || curAudio?.duration_seconds || 0;
    const left = Math.max(0, dur - this.st.position);
    const known = this.audioChapterId === cur && dur > 0;
    const remaining = known && allReady ? left + fol.reduce((n, c) => n + (this.audio.get(c.id)?.audio?.duration_seconds ?? 0), 0) : null;
    const frac = this.fractionOf(cur);
    this.push({
      aheadSeconds: known ? left + ahead : null,
      remainingSeconds: remaining,
      bookProgress: progressEstimate(this.chapters, cur, frac),
      chapterOffset: this.currentPosition()?.offset ?? this.cursorOffset,
    });
  }

  /** How far into the chapter, 0 to 1, by the text when it is known. */
  private fractionOf(chapterId: string): number {
    if (chapterId !== this.curChapterId) return 0;
    const len = this.lines.length ? this.lines.reduce((m, l) => Math.max(m, l.end), 0) : 0;
    if (this.audioChapterId === chapterId && this.st.duration > 0) return this.st.position / this.st.duration;
    return len > 0 ? this.cursorOffset / len : 0;
  }

  // ----------------------------------------------------------------------------- loading data

  /** What this device holds of a chapter of the current audiobook (cached; a chapter not held is asked again next time). */
  private heldOf(chapterId: string): Promise<HeldChapter | null> {
    const ab = this.audiobook;
    if (!ab || !this.d.held) return Promise.resolve(null);
    const key = `${ab.id}:${chapterId}`;
    const hit = this.heldCache.get(key);
    if (hit) return hit;
    const p = this.d.held(ab.id, chapterId).catch(() => null);
    this.heldCache.set(key, p);
    void p.then((v) => {
      if (!v) this.heldCache.delete(key);
    });
    return p;
  }

  private isHeld(chapterId: string): boolean {
    const ab = this.audiobook;
    return !!ab && !!this.d.heldChapters?.(ab.id).has(chapterId);
  }

  /** A held chapter in the shape of a made one, so playing it goes the same way. */
  private heldAudio(chapterId: string, h: HeldChapter): AudiobookChapter {
    const ab = this.audiobook!;
    return {
      chapter_id: chapterId,
      state: 'ready',
      audio: {
        id: `${HELD_PREFIX}${ab.id}:${chapterId}`,
        duration_seconds: h.durationSeconds ?? 0,
        bytes: 0,
        sha256: '',
        content_type: 'audio/*',
        voice_revision: ab.voice_revision,
        url: h.audioUrl,
      },
      newer_audio: null,
      detail: null,
    };
  }

  private getText(chapterId: string): Promise<TextEntry | null> {
    const bookId = this.bookId;
    const hit = this.textCache.get(chapterId);
    if (hit) return hit;
    if (!bookId) return Promise.resolve(null);
    // the copy on this device first: it needs no server, and saves the bandwidth
    const p = (async (): Promise<TextEntry | null> => {
      const h = await this.heldOf(chapterId);
      if (h) return { text: h.text, lines: h.lines.map((l) => ({ id: l.id, start: l.start, end: l.end })) };
      const r = await this.d.api.chapterText(bookId, chapterId);
      return r.ok ? { text: r.value.text, lines: r.value.lines.map((l) => ({ id: l.id, start: l.start, end: l.end })) } : null;
    })();
    this.textCache.set(chapterId, p);
    void p.then((v) => {
      if (!v) this.textCache.delete(chapterId);
    });
    return p;
  }

  /** Line timings of a chapter's audio; spread by line length when there are none. */
  private getTimings(a: AudiobookChapter): Promise<LineTiming[]> {
    const ref = a.audio;
    if (!ref) return Promise.resolve([]);
    const hit = this.timingsCache.get(ref.id);
    if (hit) return hit;
    const p = (async (): Promise<LineTiming[]> => {
      const t = await this.getText(a.chapter_id);
      const lines = t?.lines ?? [];
      let raw: { line_id: string; start_ms: number; end_ms: number }[] = [];
      if (ref.id.startsWith(HELD_PREFIX)) {
        const h = await this.heldOf(a.chapter_id);
        raw = (h?.timings ?? []).map((x) => ({ line_id: x.lineId, start_ms: x.startMs, end_ms: x.endMs }));
      } else {
        const r = await this.d.api.timings(ref.id);
        if (r.ok) raw = r.value.lines;
      }
      const norm = normalizeTimings(raw, lines);
      return norm.length ? norm : spreadTimings(lines, ref.duration_seconds * 1000);
    })();
    this.timingsCache.set(ref.id, p);
    return p;
  }

  /** The server's word on each chapter, with the chapters this device holds counted as ready whatever the server says. */
  private async loadAudio(): Promise<boolean> {
    const ab = this.audiobook;
    if (!ab) return false;
    const r = await this.d.api.audioChapters(ab.id);
    if (this.audiobook?.id !== ab.id) return false;
    const map = r.ok ? new Map(r.value.map((c) => [c.chapter_id, c])) : new Map(this.audio);
    if (!r.ok && r.status === 0) this.serverDown = true;
    for (const id of this.d.heldChapters?.(ab.id) ?? []) {
      if (map.get(id)?.state === 'ready') continue;
      const h = await this.heldOf(id);
      if (h && this.audiobook?.id === ab.id) map.set(id, this.heldAudio(id, h));
    }
    this.audio = map;
    this.push({ chapters: this.chapterList() });
    if (r.ok && this.serverDown) {
      this.serverDown = false;
      void this.upgrade();
    }
    return r.ok;
  }

  /** The server is reachable again: read the real book, chapters and audiobooks, without moving the listener. */
  private async upgrade(): Promise<void> {
    const l = this.listenerId;
    const b = this.bookId;
    if (!l || !b) return;
    const [book, chapters, audiobooks, settings] = await Promise.all([this.d.api.book(l, b), this.d.api.chapters(b), this.d.api.audiobooks(b), this.d.api.settings(l)]);
    if (this.bookId !== b || this.listenerId !== l) return;
    if (book.ok) {
      this.book = book.value;
      this.push({ book: bookInfo(book.value) });
    }
    if (chapters.ok) {
      this.chapters = [...chapters.value].sort((a, c) => a.index - c.index);
      this.unknownWordCounts.clear();
      const cur = this.chapters.find((c) => c.id === this.curChapterId);
      if (cur) this.push({ chapter: this.chapterInfo(cur) });
    }
    if (audiobooks.ok) {
      this.audiobooks = audiobooks.value;
      const fresh = audiobooks.value.find((a) => a.id === this.audiobook?.id);
      if (fresh) {
        this.audiobook = fresh;
        this.tierKnown = true;
        this.push({ voice: { id: fresh.voice_id, name: fresh.voice_name, tier: fresh.tier } });
      }
    }
    if (settings.ok) this.settings = settings.value;
    if (this.needs && (this.needs.code === 'offline' || this.needs.code === 'offline_not_downloaded')) {
      this.needs = null;
      this.offer = null;
    }
    await this.loadAudio();
    this.recompute();
    this.refreshState();
  }

  /** The Bardic computer is back (the offline engine says so): reconnect the notices and send the waiting place, quietly. */
  private async reconnect(): Promise<void> {
    const l = this.listenerId;
    if (!l || !this.bookId) return;
    this.serverDown = false;
    this.stopEvents?.();
    this.stopEvents = this.d.events?.subscribe(l, (n) => this.onNotice(n), () => this.afterReconnect()) ?? null;
    void this.sync.replayQueue();
    await this.upgrade();
    void this.checkRemotePlace();
    this.kickRefresh(0);
  }

  private unreachable(): boolean {
    return this.serverDown || (!!this.d.online && get(this.d.online) === false);
  }

  private nextHeldAfter(chapterId: string): Chapter | undefined {
    return this.following(chapterId).find((c) => this.isHeld(c.id));
  }

  // ----------------------------------------------------------------------------- opening

  async open(bookId: string, opts: { autoplay?: boolean; chapterId?: string; offset?: number } = {}): Promise<void> {
    const l = this.d.listener();
    if (!l) return;
    if (opts.autoplay) this.preparePlayback();
    if (this.bookId === bookId && this.listenerId === l && this.st.loaded) {
      if (opts.chapterId) this.gotoOffset(opts.chapterId, opts.offset ?? 0);
      if (opts.autoplay) this.play();
      return;
    }
    const run = ++this.run;
    await this.teardown();
    if (run !== this.run) return;
    this.listenerId = l;
    this.bookId = bookId;
    this.sync.start();
    const [book, chapters, audiobooks, place, settings] = await Promise.all([
      this.d.api.book(l, bookId),
      this.d.api.chapters(bookId),
      this.d.api.audiobooks(bookId),
      this.d.places.get(l, bookId),
      this.d.api.settings(l),
    ]);
    if (run !== this.run) return;
    const localPlace = this.sync.readLocal(l, bookId);
    if (!book.ok || !chapters.ok) {
      const bad = !book.ok ? book : (chapters as Extract<typeof chapters, { ok: false }>);
      const held = bad.status === 0 ? this.d.heldBook?.(bookId, localPlace?.audiobookId) : null;
      if (!held) {
        this.needs =
          bad.status === 0
            ? { code: 'offline_not_downloaded', text: "Your place is kept. This book is not on this device, and your Bardic computer can't be reached.", action: { label: 'Open the library', route: '/' } }
            : needsYou('other', bad.detail, '/');
        this.serverDown = bad.status === 0;
        this.push({ loaded: false });
        this.refreshState();
        return;
      }
      // opened from what this device holds
      this.serverDown = true;
      this.tierKnown = false;
      this.book = bookFromHeld(held);
      this.unknownWordCounts = new Set(held.chapters.filter((c) => c.wordCount === undefined).map((c) => c.id));
      this.chapters = held.chapters.map((c) => ({ id: c.id, index: c.index, title: c.title, kind: c.kind, word_count: c.wordCount ?? 1, text_length: c.textLength ?? 0, page_count: c.pageCount ?? null, text_sha256: '' }));
      this.audiobooks = [audiobookFromHeld(held)];
    } else {
      this.book = book.value;
      this.chapters = [...chapters.value].sort((a, b) => a.index - b.index);
      this.audiobooks = audiobooks.ok ? audiobooks.value : [];
    }
    this.settings = settings.ok ? settings.value : DEFAULT_SETTINGS;
    const serverPlace = place.kind === 'ok' ? place.place : null;

    const decision = this.sync.begin(l, bookId, serverPlace, opts.chapterId ? 'this_device' : undefined, { unreachable: place.kind !== 'ok' });
    if (run !== this.run) return;
    let start: { chapterId: string; offset: number; time: number | null; mode: Place['mode']; audiobookId: string | null };
    const first = firstPlayable(this.chapters);
    switch (decision.kind) {
      case 'server': {
        const p = decision.place;
        const l0 = decision.local;
        const sameSpot = !!l0 && l0.chapterId === p.chapter_id && l0.offset === p.offset;
        start = { chapterId: p.chapter_id, offset: p.offset, time: sameSpot ? l0.time : null, mode: p.mode, audiobookId: p.audiobook_id };
        break;
      }
      case 'local':
      case 'ask':
        start = { chapterId: decision.local.chapterId, offset: decision.local.offset, time: decision.local.time, mode: decision.local.mode, audiobookId: decision.local.audiobookId };
        break;
      default: {
        // nothing saved yet: from the start, or from the first chapter on this device when the server cannot be reached
        const firstHeld = this.serverDown ? this.chapters.find((c) => c.kind === 'story' && !!this.d.heldChapters?.(this.audiobooks[0]?.id ?? '').has(c.id)) : undefined;
        start = { chapterId: (firstHeld ?? first)?.id ?? '', offset: 0, time: null, mode: 'listening', audiobookId: null };
      }
    }
    if (opts.chapterId) start = { ...start, chapterId: opts.chapterId, offset: opts.offset ?? 0, time: null };
    if (!this.chapters.some((c) => c.id === start.chapterId)) start = { ...start, chapterId: first?.id ?? '', offset: 0, time: null };

    const chosenFn = this.d.chosenAudiobook;
    const pickPlace = { audiobook_id: start.audiobookId };
    const ab = pickAudiobook(this.audiobooks, pickPlace, chosenFn?.(l, bookId) ?? null, this.settings.default_voice_id);
    this.audiobook = this.audiobooks.find((a) => a.id === ab) ?? null;
    await this.loadAudio();
    if (run !== this.run) return;

    this.st = {
      ...initialState(this.speed),
      loaded: true,
      book: bookInfo(this.book),
      voice: this.audiobook ? { id: this.audiobook.voice_id, name: this.audiobook.voice_name, tier: this.audiobook.tier } : null,
      audiobookId: this.audiobook?.id ?? null,
      mode: toMode(start.mode),
      bookProgress: serverPlace?.progress ?? 0,
      chapters: this.chapterList(),
      placeSync: this.st.placeSync,
      conflict: this.held ? this.snapConflict(this.held) : null,
    };
    this.store.set(this.st);
    this.installSession();
    this.stopEvents = this.d.events?.subscribe(l, (n) => this.onNotice(n), () => this.afterReconnect()) ?? null;
    void this.sync.replayQueue();
    if (!start.chapterId) {
      this.refreshState();
      return;
    }
    const play = !!opts.autoplay && decision.kind !== 'ask';
    await this.enterChapter(start.chapterId, { offset: start.offset, time: start.time }, play, false);
  }

  private installSession(): void {
    this.engine.setActions({
      play: () => this.play(),
      pause: () => this.pause(),
      seekBy: (s) => this.skip(s),
      seekTo: (s) => this.seek(s),
      previous: () => this.previousChapter(),
      next: () => this.nextChapter(),
    });
  }

  private setSessionMeta(): void {
    const ch = this.chapters.find((c) => c.id === this.curChapterId);
    if (!ch || !this.book) return;
    const cover = this.book.cover?.url;
    this.engine.setMetadata({
      title: ch.title,
      artist: this.book.author,
      album: this.book.title,
      artwork: cover ? [{ src: cover, sizes: '512x768' }] : [],
    });
  }

  private async teardown(): Promise<void> {
    this.recordNow(false);
    for (const t of [this.pollTimer, this.tickTimer, this.seekTimer, this.sleepTimer, this.idleTimer, this.refreshTimer]) this.clock.clearTimeout(t ?? 0);
    this.pollTimer = this.tickTimer = this.seekTimer = this.sleepTimer = this.idleTimer = this.refreshTimer = undefined;
    this.stopEvents?.();
    this.stopEvents = null;
    this.chapterRun++;
    this.switchRun++;
    this.clock.clearTimeout(this.switchTimer ?? 0);
    this.switchTimer = undefined;
    this.switching = null;
    this.engine.pause();
    this.engine.unload();
    this.engine.setActions(null);
    this.engine.setMetadata(null);
    this.engine.preload(null);
    this.wantPlay = false;
    this.transition = false;
    this.pending = null;
    this.job = null;
    this.needs = null;
    this.waiting = null;
    this.buffering = false;
    this.audioChapterId = null;
    this.curChapterId = null;
    this.anchor = null;
    this.text = '';
    this.lines = [];
    this.timings = [];
    this.audio = new Map();
    this.preloadedFor = null;
    this.requestedAhead = new Set();
    this.textCache = new Map();
    this.timingsCache = new Map();
    this.held = null;
    this.heldCache = new Map();
    this.offer = null;
    this.serverDown = false;
    this.tierKnown = true;
    this.bookId = null;
    this.listenerId = null;
    this.book = null;
    this.audiobook = null;
    this.chapters = [];
    this.unknownWordCounts.clear();
    this.audiobooks = [];
    this.st = { ...initialState(this.speed), placeSync: this.st.placeSync };
    this.store.set(this.st);
    await this.sync.end();
  }

  // ----------------------------------------------------------------------------- chapters

  private chapterInfo(c: Chapter): PlayerState['chapter'] {
    const story = this.chapters.filter((x) => x.kind === 'story');
    const n = c.kind === 'story' ? story.findIndex((x) => x.id === c.id) + 1 : null;
    return { id: c.id, index: c.index, total: this.chapters.length, storyNumber: n, storyTotal: story.length, title: c.title, matter: c.kind !== 'story' };
  }

  /**
   * Go to a chapter and (if its audio is ready) load it at the target; otherwise wait for it, asking for it only if the
   * listener wants to hear it and the voice is free. `flush` writes the place to the server now (a chapter change).
   */
  private async enterChapter(chapterId: string, target: Target, play: boolean, flush: boolean): Promise<void> {
    const ch = this.chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    const my = ++this.chapterRun;
    this.transition = true;
    this.wantPlay = play;
    this.pending = null;
    this.needs = null;
    this.waiting = null;
    this.buffering = false;
    this.job = null;
    this.curChapterId = chapterId;
    this.anchor = null;
    const t = await this.getText(chapterId);
    if (my !== this.chapterRun) return;
    this.text = t?.text ?? '';
    this.lines = t?.lines ?? [];
    this.timings = [];
    if (t) this.chapters = this.chapters.map((c) => c.id === chapterId ? { ...c, text_length: cpLength(t.text) } : c);
    this.cursorOffset = clamp(target.offset ?? 0, 0, t ? cpLength(this.text) : ch.text_length ?? 0);
    this.push({
      chapter: this.chapterInfo(this.chapters.find((c) => c.id === chapterId) ?? ch),
      text: this.text,
      lines: this.lines,
      timings: [],
      currentLineId: lineAtOffset(this.lines, this.cursorOffset)?.id ?? null,
      chapterOffset: this.cursorOffset,
      chapters: this.chapterList(),
      position: target.time ?? 0,
      duration: this.audio.get(chapterId)?.audio?.duration_seconds ?? 0,
      finishedBook: false,
      playing: this.st.playing && this.audioChapterId !== null,
    });
    this.setSessionMeta();
    // the place is on this chapter from now on, whatever the audio does
    this.sync.record({ chapterId, offset: this.cursorOffset, time: target.time ?? null, mode: toPlaceMode(this.st.mode), audiobookId: this.audiobook?.id ?? null }, this.st.playing);
    if (flush) void this.sync.flush();

    // this device's copy is used whenever it has one, online or not
    const heldCopy = await this.heldOf(chapterId);
    if (my !== this.chapterRun) return;
    if (heldCopy) {
      const a = this.heldAudio(chapterId, heldCopy);
      if (this.audio.get(chapterId)?.state !== 'ready') this.audio.set(chapterId, a);
      await this.attach(a, target, my);
    } else if (this.unreachable()) {
      this.notOnDevice(chapterId, target);
    } else {
      const a = this.audio.get(chapterId);
      if (a?.state === 'ready' && a.audio) await this.attach(a, target, my);
      else await this.awaitAudio(chapterId, target, my);
    }
    if (my === this.chapterRun) this.transition = false;
    this.recompute();
    this.refreshState();
  }

  private async attach(a: AudiobookChapter, target: Target, my: number): Promise<void> {
    const ref = a.audio!;
    this.transition = true;
    const timings = await this.getTimings(a);
    if (my !== this.chapterRun) return;
    const durMs = ref.duration_seconds * 1000;
    let time = target.time ?? null;
    if (time === null && target.offset !== undefined) time = (timeForOffset(timings, this.lines, target.offset, durMs) ?? 0) / 1000;
    time = clamp(time ?? 0, 0, ref.duration_seconds > 0 ? ref.duration_seconds : Infinity);
    this.timings = timings;
    this.anchor = target.offset !== undefined ? { chapterId: a.chapter_id, offset: target.offset, time } : null;
    this.pending = null;
    this.needs = null;
    this.waiting = null;
    this.job = null;
    this.audioChapterId = a.chapter_id;
    this.push({ timings, duration: ref.duration_seconds, position: time, currentLineId: lineAtTime(timings, time * 1000) ?? this.st.currentLineId });
    this.push({ chapters: this.chapterList() });
    this.engine.load(ref.url ?? `/api/audio/${ref.id}`, { startAt: time, rate: this.speed, timings });
    this.recompute();
    if (this.wantPlay) await this.startPlayback(my);
    if (my !== this.chapterRun) return;
    this.transition = false;
    this.afterAttach();
  }

  private afterAttach(): void {
    this.clock.clearTimeout(this.idleTimer ?? 0);
    this.idleTimer = this.clock.setTimeout(() => this.preloadNext('metadata'), IDLE_PRELOAD_MS);
    if (this.wantPlay || this.st.playing) this.keepAhead();
  }

  private async startPlayback(my: number): Promise<void> {
    const r = await this.engine.play();
    if (my !== this.chapterRun) return;
    if (r === 'playing') {
      this.push({ playing: true });
    } else if (r === 'blocked') {
      // the browser wants a tap first: stay paused, say nothing is wrong
      this.wantPlay = false;
      this.push({ playing: false });
    } else if (r === 'error') {
      this.wantPlay = false;
      this.push({ playing: false });
      this.needs = needsYou('other', 'The audio could not be played.', this.route());
    }
    this.refreshState();
  }

  private dropAudio(): void {
    if (this.audioChapterId !== null) {
      this.engine.pause();
      this.engine.unload();
      this.audioChapterId = null;
      this.engine.setActions(null);
      this.installSession();
    }
  }

  /** O5: the chapter is not on this device and the server cannot be reached. Say so, and offer the next one that is held. */
  private notOnDevice(chapterId: string, target: Target): void {
    this.dropAudio();
    this.pending = { chapterId, target, requested: false, tries: 0 };
    const ch = this.chapters.find((c) => c.id === chapterId);
    const n = ch && ch.kind === 'story' ? this.chapterInfo(ch)?.storyNumber : null;
    const label = n ? `Chapter ${n}` : `“${ch?.title ?? 'This chapter'}”`;
    const next = this.nextHeldAfter(chapterId);
    this.offer = next ? { chapterId: next.id, title: next.title } : null;
    this.needs = {
      code: 'offline_not_downloaded',
      text: `Your place is kept. ${label} isn't on this device. Your Bardic computer can't be reached.`,
      action: { label: next ? `Go to ${next.title}` : 'Open the book', route: this.route() },
    };
    this.wantPlay = false;
    this.push({ playing: false, timings: [], position: target.time ?? 0 });
    this.refreshState();
  }

  private async awaitAudio(chapterId: string, target: Target, my: number): Promise<void> {
    this.dropAudio();
    this.pending = { chapterId, target, requested: false, tries: 0 };
    this.push({ playing: false, timings: [], position: target.time ?? 0 });
    this.refreshState();
    if (this.wantPlay) await this.demand(my);
  }

  /** The listener wants a chapter that has no audio. A free voice makes it now; a premium one is never asked. */
  private async demand(my: number): Promise<void> {
    const p = this.pending;
    const l = this.listenerId;
    if (!p || !l) return;
    const ab = this.audiobook;
    if (this.unreachable() && !this.isHeld(p.chapterId)) {
      this.notOnDevice(p.chapterId, p.target);
      return;
    }
    if (!ab) {
      this.needs = needsYou('no_voice', 'Choose a voice to start listening.', this.route(), 'Choose a voice');
      this.refreshState();
      return;
    }
    if (ab.tier !== 'free' || !this.tierKnown) {
      // P2: nothing paid starts without an approved plan; requestChapterAudio may charge for a premium voice
      this.needs = premiumNeeds(this.route());
      this.refreshState();
      // a plan may make it meanwhile (W4): keep looking, slowly
      this.schedulePoll(ACTIVE_JOB_POLL_MS);
      return;
    }
    p.requested = true;
    this.needs = null;
    this.refreshState();
    const r = await this.d.api.requestChapter(l, ab.id, p.chapterId, AHEAD_ON_DEMAND);
    if (my !== this.chapterRun || this.pending !== p) return;
    if (!r.ok) {
      this.requestFailed(r);
      return;
    }
    if (r.value.kind === 'ready') {
      this.audio.set(r.value.chapter.chapter_id, r.value.chapter);
      this.push({ chapters: this.chapterList() });
      await this.attach(r.value.chapter, p.target, my);
      if (my === this.chapterRun) {
        this.recompute();
        this.refreshState();
      }
      return;
    }
    this.job = r.value.job;
    this.applyJob(r.value.job);
    this.schedulePoll(POLL_MS);
  }

  private requestFailed(r: Extract<R<unknown>, { ok: false }>): void {
    const route = this.route();
    if (r.status === 0) this.serverDown = true;
    if (r.status === 0) this.needs = needsYou('offline', 'This chapter is not on this device, and your Bardic computer cannot be reached.', route);
    else if (r.code === 'plan_required') this.needs = premiumNeeds(route);
    else this.needs = needsFromServer({ code: r.code ?? 'other', text: r.detail }, route);
    this.refreshState();
  }

  private applyJob(job: Job): void {
    this.waiting = null;
    switch (job.state) {
      case 'waiting':
        this.waiting = { until: job.waiting?.until ? Date.parse(job.waiting.until) : null };
        this.needs = null;
        break;
      case 'needs_you':
        this.needs = needsFromServer(job.needs_you, this.route());
        break;
      case 'paused':
        this.needs = needsYou('other', 'Making this audio is paused.', this.route(), 'Open the book');
        break;
      case 'failed':
        this.needs = needsFromServer(job.needs_you ?? { code: 'repeated_failure', text: 'This chapter could not be made.' }, this.route());
        break;
      default:
        this.needs = null;
    }
    this.refreshState();
  }

  // ----------------------------------------------------------------------------- following the server

  private schedulePoll(ms: number): void {
    this.clock.clearTimeout(this.pollTimer ?? 0);
    this.pollTimer = this.clock.setTimeout(() => void this.refresh(), ms);
  }

  private kickRefresh(delay = 250): void {
    this.clock.clearTimeout(this.refreshTimer ?? 0);
    this.refreshTimer = this.clock.setTimeout(() => void this.refresh(), delay);
  }

  private afterReconnect(): void {
    this.kickRefresh(0);
    void this.checkRemotePlace();
    void this.sync.replayQueue();
  }

  /** Re-read the audio state (and the job) and act on it: start a chapter that became ready, show what the job says. */
  private async refresh(): Promise<void> {
    const ab = this.audiobook;
    const my = this.chapterRun;
    if (!ab || !this.listenerId) return;
    const books = await this.d.api.audiobooks(this.bookId!);
    if (books.ok && this.audiobook?.id === ab.id) {
      const fresh = books.value.find((a) => a.id === ab.id);
      if (fresh) {
        this.audiobook = fresh;
        this.tierKnown = true;
      }
      this.audiobooks = books.value;
    }
    const ok = await this.loadAudio();
    if (my !== this.chapterRun || !ok) {
      this.afterRefresh();
      return;
    }
    const p = this.pending;
    if (p) {
      const a = this.audio.get(p.chapterId);
      if (a?.state === 'ready' && a.audio) {
        await this.attach(a, p.target, my);
      } else if (this.wantPlay && p.requested) {
        await this.followJob(p, a, my);
      } else if (this.wantPlay && !p.requested) {
        await this.demand(my);
      }
    }
    this.recompute();
    this.refreshState();
    if (this.st.playing || this.wantPlay) this.keepAhead();
    this.afterRefresh();
  }

  private async followJob(p: Pending, a: AudiobookChapter | undefined, my: number): Promise<void> {
    const jobId = this.job?.id ?? this.audiobook?.active_job_id ?? null;
    let job: Job | null = null;
    if (jobId) {
      const r = await this.d.api.job(jobId);
      if (my !== this.chapterRun || this.pending !== p) return;
      if (r.ok) job = r.value;
    }
    if (job) {
      this.job = job;
      if (job.state === 'completed' || job.state === 'stopped') {
        // finished without this chapter: ask again, a few times
        if (p.tries < 3) {
          p.tries++;
          p.requested = false;
          await this.demand(my);
        } else {
          this.needs = needsYou('other', 'This chapter could not be made.', this.route());
        }
      } else this.applyJob(job);
    } else if (a?.detail) {
      this.waiting = a.detail.code === 'waiting_quota' ? { until: a.detail.until ? Date.parse(a.detail.until) : null } : null;
    } else if (!a || a.state === 'not_yet') {
      // no job is making it (it finished or never started): ask again
      if (p.tries < 3) {
        p.tries++;
        p.requested = false;
        await this.demand(my);
      }
    }
  }

  private afterRefresh(): void {
    const active = !!this.pending || !!this.audiobook?.active_job_id;
    if (!active) return;
    this.schedulePoll(this.pending && !this.serverDown ? POLL_MS : ACTIVE_JOB_POLL_MS);
  }

  private onNotice(n: Notice): void {
    const l = this.listenerId;
    if (!l || (n.listener_id && n.listener_id !== l)) return;
    if (n.type === 'listener.updated') {
      void this.d.api.settings(l).then((r) => {
        if (r.ok && this.listenerId === l) this.settings = r.value;
      });
      return;
    }
    if (n.type === 'place.updated') {
      if (n.book_id === this.bookId) void this.checkRemotePlace();
      return;
    }
    if (n.type === 'book.updated') {
      if (n.book_id === this.bookId || (!n.book_id && n.id === this.bookId)) void this.refreshChapterMetadata();
      return;
    }
    if (n.type === 'resync') {
      void this.refreshChapterMetadata();
      this.kickRefresh();
      void this.checkRemotePlace();
      return;
    }
    if ((n.type === 'job.updated' || n.type === 'chapter.updated' || n.type === 'audiobook.updated') && (!n.book_id || n.book_id === this.bookId)) {
      this.kickRefresh();
      if (this.switching) void this.checkSwitch(this.switching);
    }
  }

  private async checkRemotePlace(): Promise<void> {
    const l = this.listenerId;
    const b = this.bookId;
    if (!l || !b) return;
    const r = await this.d.places.get(l, b);
    if (r.kind === 'ok' && r.place && this.bookId === b) this.sync.remote(r.place, this.st.playing || this.wantPlay);
  }

  /** Keep a few chapters made ahead of the one playing. Free voices only; a premium voice is made under a plan. */
  private keepAhead(): void {
    const ab = this.audiobook;
    const l = this.listenerId;
    const cur = this.curChapterId;
    if (!ab || ab.tier !== 'free' || !this.tierKnown || this.unreachable() || !l || !cur) return;
    const missing = this.following(cur)
      .slice(0, KEEP_AHEAD)
      .filter((c) => {
        const s = this.audio.get(c.id)?.state;
        return s !== 'ready' && s !== 'making';
      });
    const first = missing[0];
    if (!first || this.requestedAhead.has(first.id)) return;
    this.requestedAhead.add(first.id);
    void this.d.api.requestChapter(l, ab.id, first.id, missing.length - 1).then((r) => {
      if (r.ok && r.value.kind === 'job' && this.audiobook?.id === ab.id) this.schedulePoll(ACTIVE_JOB_POLL_MS);
    });
  }

  private preloadNext(mode: 'metadata' | 'auto'): void {
    const cur = this.curChapterId;
    if (!cur || this.audioChapterId !== cur || !this.settings.continue_into_next_chapter) return;
    const next = nextPlayable(this.chapters, cur);
    const a = next ? this.audio.get(next.id) : undefined;
    if (!next || a?.state !== 'ready' || !a.audio) return;
    if (a.audio.id.startsWith(HELD_PREFIX) || this.isHeld(next.id)) {
      // on this device: nothing to download, only get it ready
      void this.heldOf(next.id);
      void this.getText(next.id);
      return;
    }
    this.engine.preload(a.audio.url ?? `/api/audio/${a.audio.id}`, mode);
    if (this.preloadedFor !== next.id) {
      this.preloadedFor = next.id;
      void this.getText(next.id);
      void this.getTimings(a);
    }
  }

  // ----------------------------------------------------------------------------- engine events

  private offsetFor(pos: number, dur: number): number {
    const a = this.anchor;
    if (a && a.chapterId === this.curChapterId && Math.abs(pos - a.time) < 1) return a.offset;
    this.anchor = null;
    return offsetAtTime(this.timings, this.lines, pos * 1000, dur * 1000);
  }

  private currentPosition(): Position | null {
    const chapterId = this.curChapterId;
    if (!chapterId) return null;
    const mode = toPlaceMode(this.st.mode);
    const audiobookId = this.switching?.audiobook.id ?? this.audiobook?.id ?? null;
    if (this.audioChapterId === chapterId && this.engine.loaded) {
      const pos = this.engine.position;
      const dur = this.engine.duration || this.st.duration;
      return { chapterId, offset: this.offsetFor(pos, dur), time: this.switching ? null : pos, mode, audiobookId };
    }
    return { chapterId, offset: this.cursorOffset, time: null, mode, audiobookId };
  }

  private recordNow(flush: boolean): void {
    const pos = this.currentPosition();
    if (!pos) return;
    this.sync.record(pos, this.st.playing);
    if (flush) void this.sync.flush();
  }

  private flushSoon(): void {
    this.clock.clearTimeout(this.seekTimer ?? 0);
    this.seekTimer = this.clock.setTimeout(() => void this.sync.flush(), SEEK_FLUSH_MS);
  }

  private onTime(pos: number, dur: number): void {
    const cur = this.curChapterId;
    if (!cur || this.audioChapterId !== cur) return;
    this.push({ position: pos, duration: dur || this.st.duration });
    this.recompute();
    const p = this.currentPosition();
    if (p) this.sync.record(p, this.st.playing);
    if (this.st.playing) {
      if (dur > 0 && dur - pos <= PRELOAD_WITHIN_SECONDS) this.preloadNext('auto');
      this.refreshState();
    }
  }

  private onLine(id: string | null): void {
    if (this.audioChapterId !== this.curChapterId || !id) return;
    this.push({ currentLineId: id });
  }

  private onBuffering(b: boolean): void {
    if (this.buffering === b) return;
    this.buffering = b;
    this.refreshState();
  }

  private onAudioError(): void {
    if (this.audioChapterId !== this.curChapterId || !this.curChapterId) return;
    this.wantPlay = false;
    this.push({ playing: false });
    this.needs = needsYou('other', 'The audio could not be played.', this.route());
    this.refreshState();
  }

  private onPlayState(playing: boolean): void {
    if (this.transition || this.audioChapterId !== this.curChapterId) return;
    if (playing) {
      if (!this.st.playing) {
        this.wantPlay = true;
        this.push({ playing: true });
        this.refreshState();
      }
      return;
    }
    if (this.engine.hasEnded || this.engine.playing || !this.st.playing) return;
    // paused from outside (headset, system): the listener paused
    this.wantPlay = false;
    this.push({ playing: false });
    this.afterPause();
  }

  private afterPause(): void {
    this.buffering = false;
    this.refreshState();
    this.recordNow(false);
    void this.sync.flush();
    this.sync.settle();
  }

  private onEnded(): void {
    const cur = this.curChapterId;
    if (!cur || this.audioChapterId !== cur) return;
    const next = nextPlayable(this.chapters, cur);
    if (this.st.sleep.kind === 'end_of_chapter') {
      // the listener asked to stop here: the next chapter is ready to resume, nothing plays
      this.push({ sleep: { kind: 'off' }, playing: false });
      this.wantPlay = false;
      if (next) void this.enterChapter(next.id, { offset: 0, time: 0 }, false, true);
      else this.endOfBook();
      return;
    }
    if (!next) {
      this.endOfBook();
      return;
    }
    const keep = this.settings.continue_into_next_chapter;
    if (!keep) this.push({ playing: false });
    void this.enterChapter(next.id, { offset: 0, time: 0 }, keep, true);
  }

  private endOfBook(): void {
    const cur = this.curChapterId;
    if (!cur) return;
    this.wantPlay = false;
    this.engine.pause();
    this.push({ playing: false, finishedBook: true, listening: null, detail: null, bookProgress: 1, chapterOffset: cpLength(this.text) });
    // the place is the end of the last chapter; the server decides when that makes the book finished (C6)
    this.sync.record({ chapterId: cur, offset: cpLength(this.text), time: this.st.duration || null, mode: toPlaceMode(this.st.mode), audiobookId: this.audiobook?.id ?? null }, false);
    void this.sync.flush();
    this.refreshState();
  }

  // ----------------------------------------------------------------------------- the place conflict

  private onConflict(c: HeldConflict | null): void {
    this.held = c;
    if (!c) {
      this.push({ conflict: null });
      return;
    }
    // wait for the listener: nothing plays, nothing is written
    this.wantPlay = false;
    if (this.engine.playing) this.engine.pause();
    this.push({ playing: false, conflict: this.snapConflict(c) });
    this.refreshState();
  }

  private snapConflict(c: HeldConflict): PlaceConflictInfo {
    const title = (id: string) => this.chapters.find((x) => x.id === id);
    const mineCh = title(c.mine.chapterId);
    const theirCh = title(c.theirs.chapter_id);
    const frac = c.mine.chapterId === this.curChapterId && this.lines.length ? c.mine.offset / Math.max(1, this.lines.reduce((m, l) => Math.max(m, l.end), 0)) : 0;
    const mine: PlaceSnapshot = {
      chapterTitle: mineCh?.title ?? '',
      chapterIndex: mineCh?.index ?? 0,
      progress: progressEstimate(this.chapters, c.mine.chapterId, frac),
      deviceName: this.d.deviceName?.() ?? 'This device',
      updatedAt: c.mine.updatedAt,
      mode: toMode(c.mine.mode),
    };
    const theirs: PlaceSnapshot = {
      chapterTitle: theirCh?.title ?? '',
      chapterIndex: theirCh?.index ?? 0,
      progress: c.theirs.progress,
      deviceName: c.theirs.device_name ?? 'Another device',
      updatedAt: Date.parse(c.theirs.updated_at),
      mode: toMode(c.theirs.mode),
    };
    return { mine, theirs };
  }

  /** The server's place was chosen (by the listener or the setting): go there, paused. */
  private async adoptPlace(place: Place): Promise<void> {
    if (place.book_id !== this.bookId) return;
    // Choosing the other place supersedes a voice change whose write conflicted with it.
    this.switchRun++;
    this.switching = null;
    this.clock.clearTimeout(this.switchTimer ?? 0);
    this.switchTimer = undefined;
    this.wantPlay = false;
    if (this.engine.playing) this.engine.pause();
    this.push({ playing: false, mode: toMode(place.mode), bookProgress: place.progress });
    if (place.audiobook_id && place.audiobook_id !== this.audiobook?.id) {
      const ab = this.audiobooks.find((a) => a.id === place.audiobook_id);
      if (ab) {
        this.audiobook = ab;
        this.push({ audiobookId: ab.id, voice: { id: ab.voice_id, name: ab.voice_name, tier: ab.tier } });
        await this.loadAudio();
      }
    }
    await this.enterChapter(place.chapter_id, { offset: place.offset }, false, false);
  }

  // ----------------------------------------------------------------------------- commands

  preparePlayback = (): void => {
    if (!this.engine.loaded) this.engine.unlock();
  };

  /** Select a voice without replacing the sound that is already playing while its chapter is made. */
  switchAudiobook = async (audiobookId: string, opts: { makeAudio?: boolean } = {}): Promise<boolean> => {
    const l = this.listenerId;
    const b = this.bookId;
    if (!l || !b || !this.st.loaded || this.held) return false;
    const run = ++this.switchRun;
    const r = await this.d.api.audiobooks(b);
    if (run !== this.switchRun || this.listenerId !== l || this.bookId !== b || !r.ok) return false;
    this.audiobooks = r.value;
    const next = r.value.find((a) => a.id === audiobookId);
    if (!next) return false;
    this.clock.clearTimeout(this.switchTimer ?? 0);
    this.switchTimer = undefined;
    this.switching = null;
    this.needs = null;
    this.waiting = null;
    if (next.id === this.audiobook?.id) {
      this.recordNow(false);
      await this.sync.flush();
      this.refreshState();
      return true;
    }
    const pending: AudiobookSwitch = { audiobook: next, requestedChapter: null, checking: false, makeAudio: opts.makeAudio !== false };
    this.switching = pending;
    // The free Make ready confirmation can select a voice without starting its background job or a prior failed play.
    if (!pending.makeAudio) this.wantPlay = this.st.playing;
    // The chosen audiobook follows the precise local text place, including while the previous audio is playing.
    this.recordNow(false);
    await this.sync.flush();
    if (this.switching !== pending || this.held) return false;
    this.refreshState();
    await this.checkSwitch(pending);
    return true;
  };

  private async checkSwitch(pending: AudiobookSwitch): Promise<void> {
    if (this.switching !== pending || pending.checking || this.held) return;
    pending.checking = true;
    try {
      const l = this.listenerId;
      const chapterId = this.curChapterId;
      if (!l || !chapterId) return;
      const ab = pending.audiobook;
      const r = await this.d.api.audioChapters(ab.id);
      const held = await this.d.held?.(ab.id, chapterId).catch(() => null);
      if (this.switching !== pending || this.curChapterId !== chapterId) return;
      const made = r.ok ? r.value.find((c) => c.chapter_id === chapterId) : undefined;
      if (held || (made?.state === 'ready' && made.audio)) {
        const pos = this.currentPosition();
        if (!pos) return;
        const play = this.st.playing || this.wantPlay;
        this.audiobook = ab;
        this.tierKnown = true;
        this.audio = new Map(r.ok ? r.value.map((c) => [c.chapter_id, c]) : []);
        if (held) {
          this.heldCache.set(`${ab.id}:${chapterId}`, Promise.resolve(held));
          this.audio.set(chapterId, this.heldAudio(chapterId, held));
        }
        this.switching = null;
        this.requestedAhead.clear();
        this.preloadedFor = null;
        this.engine.preload(null);
        this.push({ audiobookId: ab.id, voice: { id: ab.voice_id, name: ab.voice_name, tier: ab.tier }, chapters: this.chapterList() });
        // Audio clocks differ between voices: only the text offset carries across.
        await this.enterChapter(chapterId, { offset: pos.offset }, play, true);
        return;
      }
      if (!r.ok) {
        this.needs = needsYou('offline', r.detail, this.route());
      } else if (ab.tier !== 'free') {
        this.needs = premiumNeeds(this.route());
      } else if (made?.detail) {
        this.needs = needsFromServer(made.detail, this.route());
      } else if (pending.makeAudio && pending.requestedChapter !== chapterId) {
        pending.requestedChapter = chapterId;
        const request = await this.d.api.requestChapter(l, ab.id, chapterId, AHEAD_ON_DEMAND);
        if (this.switching !== pending) return;
        if (!request.ok) this.needs = needsFromServer({ code: request.code ?? 'other', text: request.detail }, this.route());
        else if (request.value.kind === 'job') this.applyJob(request.value.job);
        else pending.requestedChapter = null; // the next check attaches the now-ready chapter
      }
      this.refreshState();
    } finally {
      pending.checking = false;
      if (this.switching === pending) {
        this.clock.clearTimeout(this.switchTimer ?? 0);
        this.switchTimer = this.clock.setTimeout(() => void this.checkSwitch(pending), POLL_MS);
      }
    }
  }

  restorePlace = async (bookId: string, place: Place): Promise<RestoreResult> => {
    if (place.book_id !== bookId) return 'failed';
    await this.adopting;
    this.pause();
    await this.sync.flush();
    await this.adopting;
    await this.open(bookId, { autoplay: false });
    await this.adopting;
    if (this.bookId !== bookId || !this.st.loaded || !this.chapters.some((c) => c.id === place.chapter_id)) return 'failed';
    if (this.held) return 'conflict_before';
    this.switchRun++;
    this.switching = null;
    this.clock.clearTimeout(this.switchTimer ?? 0);
    const ab = this.audiobooks.find((a) => a.id === place.audiobook_id);
    if (ab && ab.id !== this.audiobook?.id) {
      this.audiobook = ab;
      this.push({ audiobookId: ab.id, voice: { id: ab.voice_id, name: ab.voice_name, tier: ab.tier } });
      await this.loadAudio();
    } else if (!place.audiobook_id) {
      this.audiobook = null;
      this.audio.clear();
      this.dropAudio();
      this.push({ audiobookId: null, voice: null });
    }
    this.push({ mode: toMode(place.mode), playing: false });
    await this.enterChapter(place.chapter_id, { offset: place.offset }, false, false);
    await this.sync.flush();
    await this.adopting;
    return this.held ? 'conflict_after' : 'restored';
  };

  play = (): void => {
    if (!this.st.loaded || this.held) return;
    if (this.switching) {
      this.wantPlay = true;
      this.switching.makeAudio = true;
      if (this.needs) {
        this.needs = null;
        this.switching.requestedChapter = null;
      }
      if (this.engine.loaded) void this.startPlayback(this.chapterRun);
      else this.preparePlayback();
      void this.checkSwitch(this.switching);
      this.refreshState();
      return;
    }
    if (this.st.finishedBook) {
      this.listenAgain();
      return;
    }
    // inside the tap: earn the element's permission even if the audio is still to be made
    if (!this.engine.loaded) this.engine.unlock();
    this.wantPlay = true;
    if (this.pending) {
      this.needs = null;
      this.refreshState();
      void this.demand(this.chapterRun);
      return;
    }
    if (this.audioChapterId && this.audioChapterId === this.curChapterId) {
      const my = this.chapterRun;
      void this.startPlayback(my).then(() => this.keepAhead());
      return;
    }
    // loaded but the audio was never attached (audio appeared since): go through the chapter again
    if (this.curChapterId) void this.enterChapter(this.curChapterId, { offset: this.cursorOffset }, true, false);
  };

  pause = (): void => {
    if (!this.st.loaded) return;
    this.wantPlay = false;
    this.engine.pause();
    this.needs = this.pending ? null : this.needs;
    this.waiting = null;
    this.push({ playing: false });
    this.afterPause();
  };

  toggle = (): void => {
    if (this.st.playing || this.wantPlay) this.pause();
    else this.play();
  };

  skip = (seconds: number): void => {
    if (!this.engine.loaded || this.audioChapterId !== this.curChapterId) return;
    this.seek(this.engine.position + seconds);
  };

  seek = (seconds: number): void => {
    if (!this.engine.loaded || this.audioChapterId !== this.curChapterId) return;
    this.anchor = null;
    this.engine.seek(seconds);
    this.push({ finishedBook: false });
    this.recordNow(false);
    this.flushSoon();
  };

  nextChapter = (): void => {
    const cur = this.curChapterId;
    if (!cur) return;
    const next = nextPlayable(this.chapters, cur);
    if (next) void this.enterChapter(next.id, { offset: 0, time: 0 }, this.st.playing || this.wantPlay, true);
  };

  previousChapter = (): void => {
    const cur = this.curChapterId;
    if (!cur) return;
    if (this.engine.loaded && this.audioChapterId === cur && this.engine.position > BACK_RESTART_SECONDS) {
      this.seek(0);
      return;
    }
    const prev = previousPlayable(this.chapters, cur);
    if (prev) void this.enterChapter(prev.id, { offset: 0, time: 0 }, this.st.playing || this.wantPlay, true);
    else this.seek(0);
  };

  gotoChapter = (chapterId: string): void => {
    if (!this.chapters.some((c) => c.id === chapterId)) return;
    void this.enterChapter(chapterId, { offset: 0, time: 0 }, this.st.playing || this.wantPlay, true);
  };

  gotoLine = (lineId: string): void => {
    const line = this.lines.find((l) => l.id === lineId);
    if (line && this.curChapterId) this.gotoOffset(this.curChapterId, line.start);
  };

  gotoOffset = (chapterId: string, offset: number): void => {
    if (!this.chapters.some((c) => c.id === chapterId)) return;
    if (chapterId !== this.curChapterId) {
      void this.enterChapter(chapterId, { offset }, this.st.playing || this.wantPlay, true);
      return;
    }
    const off = clamp(offset, 0, cpLength(this.text));
    this.cursorOffset = off;
    this.push({ currentLineId: lineAtOffset(this.lines, off)?.id ?? null, finishedBook: false, chapterOffset: off });
    if (this.engine.loaded && this.audioChapterId === chapterId) {
      const t = (timeForOffset(this.timings, this.lines, off, this.st.duration * 1000) ?? 0) / 1000;
      this.anchor = { chapterId, offset: off, time: t };
      this.engine.seek(t);
    }
    this.recordNow(false);
    this.flushSoon();
  };

  setSpeed = (speed: number): void => {
    const s = Number.isFinite(speed) ? Math.round(clamp(speed, SPEED_MIN, SPEED_MAX) * 100) / 100 : 1;
    this.speed = s;
    try {
      this.d.storage.setItem(SPEED_KEY, String(s));
    } catch {
      /* the speed lasts until the page closes */
    }
    this.engine.setRate(s);
    this.push({ speed: s });
  };

  setSleep = (timer: SleepTimer): void => {
    this.clock.clearTimeout(this.sleepTimer ?? 0);
    this.sleepTimer = undefined;
    if (timer.kind === 'minutes') {
      const ms = Math.max(0, timer.minutes) * 60_000;
      const endsAt = this.clock.now() + ms;
      this.sleepTimer = this.clock.setTimeout(() => void this.sleepExpired(), ms);
      this.push({ sleep: { kind: 'minutes', minutes: timer.minutes, endsAt } });
    } else {
      this.push({ sleep: timer.kind === 'end_of_chapter' ? { kind: 'end_of_chapter' } : { kind: 'off' } });
    }
  };

  private async sleepExpired(): Promise<void> {
    this.sleepTimer = undefined;
    if (this.st.sleep.kind !== 'minutes') return;
    this.push({ sleep: { kind: 'off' } });
    if (!this.st.playing && !this.wantPlay) return;
    const paused = await this.engine.fadeOutAndPause(FADE_MS);
    if (paused || !this.st.playing) {
      this.wantPlay = false;
      this.push({ playing: false });
      this.afterPause();
    }
  }

  setMode = (mode: Mode): void => {
    if (!this.st.loaded || this.st.mode === mode) return;
    this.push({ mode });
    this.recordNow(true);
  };

  resolveConflict = (choice: 'mine' | 'theirs'): void => {
    void this.sync.resolve(choice);
  };

  close = (): void => {
    ++this.run; // invalidate metadata awaited by an opening player, as well as chapter work
    void this.teardown();
  };

  listenerChanged = (): void => {
    // the place is written under the listener the book was opened with (the sync session keeps it)
    ++this.run;
    void this.teardown();
  };

  listenAgain = (): void => {
    const first = firstPlayable(this.chapters);
    if (first) void this.enterChapter(first.id, { offset: 0, time: 0 }, true, true);
  };

  markFinished = async (finished: boolean): Promise<boolean> => {
    const l = this.listenerId;
    const b = this.bookId;
    if (!l || !b) return false;
    await this.sync.flush();
    const r = await this.d.api.setFinished(l, b, finished);
    return r.ok;
  };

  destroy = (): void => {
    ++this.run;
    void this.teardown();
    this.engine.destroy();
    this.sync.dispose();
    for (const u of this.unsubs) u();
    this.unsubs = [];
  };
}

function pickAudiobook(
  audiobooks: readonly Pick<Audiobook, 'id' | 'voice_id' | 'chapters_ready' | 'created_at'>[],
  place: { audiobook_id: string | null },
  chosen: string | null,
  defaultVoiceId: string | null,
): string | null {
  const has = (id: string | null | undefined): id is string => !!id && audiobooks.some((a) => a.id === id);
  if (has(place.audiobook_id)) return place.audiobook_id;
  if (has(chosen)) return chosen;
  const byDefault = defaultVoiceId ? audiobooks.find((a) => a.voice_id === defaultVoiceId) : undefined;
  if (byDefault) return byDefault.id;
  const best = [...audiobooks].sort((a, b) => b.chapters_ready - a.chapters_ready || Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return best?.id ?? null;
}

/** A book opened from what the device remembers: just enough of a `Book` for the player. */
function bookFromHeld(h: HeldBookInfo): Book {
  const cover = { url: h.coverSrc ?? '', generated: !h.coverSrc, sha256: '', width: 0, height: 0, sample: { hex: h.coverColor, hue: 0, saturation: 0, lightness: 0, vivid: true, version: 1 } };
  return { id: h.bookId, title: h.title, author: h.author, cover } as unknown as Book;
}

/** The audiobook of a held book. Its tier is not remembered: `tierKnown` stays false, so nothing is requested for it. */
function audiobookFromHeld(h: HeldBookInfo): Audiobook {
  return {
    id: h.audiobookId,
    book_id: h.bookId,
    voice_id: h.voiceName,
    voice_name: h.voiceName,
    source_id: '',
    tier: 'free',
    voice_revision: '',
    chapters_total: h.chapters.length,
    chapters_ready: 0,
    bytes: 0,
    created_at: '1970-01-01T00:00:00Z',
    active_job_id: null,
  };
}

function bookInfo(book: Book): NonNullable<PlayerState['book']> {
  const info: NonNullable<PlayerState['book']> = { id: book.id, title: book.title, author: book.author, coverColor: book.cover?.sample?.hex ?? '#c65a43' };
  if (book.cover && !book.cover.generated) info.coverSrc = book.cover.url;
  return info;
}

// --------------------------------------------------------------------------- public

export function createPlayer(deps: PlayerDeps): Player {
  const impl = new PlayerImpl(deps);
  return {
    subscribe: impl.subscribe,
    preparePlayback: impl.preparePlayback,
    open: (bookId, opts) => impl.open(bookId, opts),
    updateChapterMetadata: (bookId, chapters) => impl.updateChapterMetadata(bookId, chapters),
    switchAudiobook: impl.switchAudiobook,
    restorePlace: impl.restorePlace,
    play: impl.play,
    pause: impl.pause,
    toggle: impl.toggle,
    skip: impl.skip,
    seek: impl.seek,
    nextChapter: impl.nextChapter,
    previousChapter: impl.previousChapter,
    gotoChapter: impl.gotoChapter,
    gotoLine: impl.gotoLine,
    gotoOffset: impl.gotoOffset,
    setSpeed: impl.setSpeed,
    setSleep: impl.setSleep,
    setMode: impl.setMode,
    resolveConflict: impl.resolveConflict,
    close: impl.close,
    listenerChanged: impl.listenerChanged,
    markFinished: impl.markFinished,
    listenAgain: impl.listenAgain,
    sync: impl.sync,
    destroy: impl.destroy,
  };
}

/** The dependencies of the app: the real server, the real element, the listener selected on this device. */
export function browserDeps(): PlayerDeps {
  return {
    api: apiPlayerApi,
    places: apiPlaceApi,
    clock: systemClock,
    createAudio: browserAudioFactory,
    storage: browserStorage(),
    events: sseEvents,
    mediaSession: browserMediaSession(),
    listener: () => get(listenerStore).currentId,
    heldChapters: (audiobookId) => offline.heldChapters(audiobookId),
    heldDuration: (audiobookId, chapterId) => offline.heldDuration(audiobookId, chapterId),
    held: (audiobookId, chapterId) => offline.heldChapter(audiobookId, chapterId),
    heldBook: (bookId, prefer) => offline.heldBook(bookId, prefer),
    online: derived(offline, (o) => o.online),
    chosenAudiobook,
  };
}

/** The one player of the page. */
export const player: Player = createPlayer(browserDeps());

// Switching listener pauses, saves the place under the previous listener and unloads (ARCHITECTURE s3, s6).
let watchedListener: string | null | undefined;
if (typeof window !== 'undefined') {
  listenerStore.subscribe((s) => {
    if (watchedListener !== undefined && watchedListener !== s.currentId) player.listenerChanged();
    watchedListener = s.currentId;
  });
}

export { SKIP_SECONDS };
