// The download queue, one per audiobook, in the foreground. Rules (spec O1 to O3, ARCHITECTURE s5):
//  * a chapter becomes "On this device" only when its audio is complete, matches the manifest hash and size, and
//    its text, lines and timings are stored with it, all in one commit (the server's rule: ready only after durable);
//  * a pause, a dropped connection or a closed tab keeps the bytes received; the next try continues by Range;
//  * Wi-Fi only waits (and says so) when the connection is not known to be Wi-Fi; an unknown connection is not guessed;
//  * a full device stops the download and keeps everything that finished; an unreachable server pauses it until it is back;
//  * nothing here ever replaces a held chapter: an update is a separate, chosen action (updates.ts).
import type { Clock } from '../lib/clock';
import { coverColor, realCoverUrl } from '../state/library';
import { FetchError, fetchChapter, type ChapterTarget } from './fetchChapter';
import type { Audiobook, BookChapter, ConnectionPort, ManifestChapter, OfflineApi } from './ports';
import type { ChapterRecord, OfflineStore } from './store';
import type { DownloadPreview, DownloadScope, DownloadStatus } from './types';

export interface DownloaderDeps {
  api: OfflineApi;
  store: OfflineStore;
  clock: Clock;
  connection: ConnectionPort;
  /** bytes the browser will still let us store; null if it cannot say */
  freeBytes: () => Promise<number | null>;
  listener: () => string | null;
  /** chapters downloaded at once (one or two); default 1 */
  concurrency?: number;
  idleMs?: number;
  partBytes?: number;
}

/** Everything the device remembers about a downloaded audiobook (kv key `book:<audiobookId>`). */
export interface BookMeta {
  audiobookId: string;
  bookId: string;
  title: string;
  author: string;
  coverColor: string;
  coverUrl: string | null;
  voiceName: string;
  voiceRevision: string;
  chapters: { id: string; index: number; title: string; kind: string; wordCount?: number; textLength?: number; pageCount?: number | null }[];
  /** the last manifest read: chapter id to its entry */
  manifest: Record<string, ManifestChapter>;
  /** epoch ms of the last manifest read */
  checkedAt: number | null;
  options: { wifiOnly: boolean; keepNew: boolean };
  wholeBook: boolean;
  /** asked for and ready: the queue */
  wanted: string[];
  /** asked for and not ready yet: picked up when they are made, if keepNew */
  pending: string[];
  paused: boolean;
}

export interface ChapterJob {
  state: 'queued' | 'downloading' | 'failed';
  received: number;
  total: number;
  error: string | null;
  attempts: number;
}

type Stop = 'none' | 'pause' | 'cancel' | 'wifi' | 'full' | 'offline';

interface Job {
  audiobookId: string;
  status: DownloadStatus;
  message: string | null;
  chapters: Map<string, ChapterJob>;
  abort: AbortController | null;
  running: Promise<void> | null;
  stop: Stop;
}

export interface RemoveResult {
  /** chapters taken off the device */
  removed: ChapterRecord[];
  /** the audiobook has nothing left (no chapters, no queue) and was forgotten */
  forgotten: boolean;
}

export const bookKey = (audiobookId: string) => `book:${audiobookId}`;
export const coverKey = (bookId: string) => `cover:${bookId}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The first words of every message: what is kept. */
export const keptLead = (held: number) => (held === 0 ? 'Nothing was lost.' : held === 1 ? 'The 1 chapter on this device is kept.' : `The ${held} chapters on this device are kept.`);

const MAX_ATTEMPTS = 3;

export class Downloader {
  readonly metas = new Map<string, BookMeta>();
  /** the chapters this device holds, mirrored in memory so the player can ask synchronously */
  readonly held = new Map<string, Map<string, ChapterRecord>>();
  private jobs = new Map<string, Job>();
  private concurrency: number;
  /** a refresh of the manifest per audiobook, so a burst of notices makes one request */
  private checking = new Map<string, Promise<void>>();
  /** called whenever anything a screen shows changed */
  changed: () => void = () => {};
  /** called when a command hits a problem the listener should read */
  problem: (text: string) => void = () => {};

  constructor(private d: DownloaderDeps) {
    this.concurrency = Math.max(1, Math.min(2, d.concurrency ?? 1));
  }

  // ------------------------------------------------------------------------- loading

  async init(): Promise<void> {
    const metas = await this.d.store.listValues<BookMeta>('book:');
    for (const { value } of metas) this.metas.set(value.audiobookId, value);
    for (const r of await this.d.store.chapters()) this.setHeld(r);
    for (const meta of this.metas.values()) {
      const job = this.jobFor(meta);
      for (const id of meta.wanted) if (!this.isHeld(meta.audiobookId, id) && !job.chapters.has(id)) job.chapters.set(id, this.newChapterJob(meta, id));
      if (meta.paused) job.status = 'paused';
    }
    this.changed();
    for (const job of this.jobs.values()) if (!this.metas.get(job.audiobookId)?.paused && job.chapters.size) this.kick(job);
  }

  // ------------------------------------------------------------------------- views

  heldIds(audiobookId: string): ReadonlySet<string> {
    return new Set(this.held.get(audiobookId)?.keys() ?? []);
  }

  isHeld(audiobookId: string, chapterId: string): boolean {
    return this.held.get(audiobookId)?.has(chapterId) ?? false;
  }

  setHeld(r: ChapterRecord): void {
    let m = this.held.get(r.audiobookId);
    if (!m) this.held.set(r.audiobookId, (m = new Map()));
    m.set(r.chapterId, r);
  }

  dropHeld(audiobookId: string, chapterId: string): void {
    const m = this.held.get(audiobookId);
    m?.delete(chapterId);
    if (m && m.size === 0) this.held.delete(audiobookId);
  }

  view(audiobookId: string): { status: DownloadStatus; message: string | null; chapters: ReadonlyMap<string, ChapterJob> } {
    const job = this.jobs.get(audiobookId);
    return { status: job?.status ?? 'idle', message: job?.message ?? null, chapters: job?.chapters ?? new Map() };
  }

  // ------------------------------------------------------------------------- preview

  async preview(audiobookId: string, scope: DownloadScope): Promise<DownloadPreview> {
    const [manifest, audiobook, free] = await Promise.all([this.d.api.manifest(audiobookId), this.d.api.audiobook(audiobookId), this.d.freeBytes()]);
    if (!manifest.ok) return { chaptersToGet: 0, bytes: null, freeBytes: free, fits: null, notReadyYet: 0 };
    const ready = new Map(manifest.value.chapters.map((c) => [c.chapter_id, c]));
    const total = audiobook.ok ? audiobook.value.chapters_total : ready.size;
    let ids: string[];
    let notReadyYet: number;
    if (scope.kind === 'chapters') {
      ids = scope.chapterIds.filter((id) => ready.has(id));
      notReadyYet = scope.chapterIds.length - ids.length;
    } else {
      ids = [...ready.keys()];
      notReadyYet = Math.max(0, total - ready.size);
    }
    const toGet = ids.filter((id) => !this.isHeld(audiobookId, id));
    let bytes = 0;
    for (const id of toGet) {
      const entry = ready.get(id)!;
      const stored = (await this.d.store.partial(entry.audio.id)).bytes;
      bytes += Math.max(0, entry.audio.bytes - stored);
    }
    return { chaptersToGet: toGet.length, bytes, freeBytes: free, fits: free === null ? null : bytes <= free, notReadyYet };
  }

  // ------------------------------------------------------------------------- commands

  async start(audiobookId: string, scope: DownloadScope, opts: { wifiOnly: boolean; keepNew: boolean }): Promise<void> {
    const [audiobook, manifest] = await Promise.all([this.d.api.audiobook(audiobookId), this.d.api.manifest(audiobookId)]);
    if (!audiobook.ok || !manifest.ok) {
      const unreachable = (!audiobook.ok && audiobook.status === 0) || (!manifest.ok && manifest.status === 0);
      this.problem(unreachable ? 'Nothing was downloaded. The Bardic computer could not be reached; try again when it is.' : 'Nothing was downloaded. The server could not list this audiobook.');
      return;
    }
    let meta = this.metas.get(audiobookId);
    if (!meta) {
      const made = await this.makeMeta(audiobook.value);
      if (!made) {
        this.problem('Nothing was downloaded. The Bardic computer could not be reached; try again when it is.');
        return;
      }
      meta = made;
      this.metas.set(audiobookId, meta);
    }
    this.takeManifest(meta, manifest.value.chapters);
    const wholeBook = scope.kind === 'whole_book';
    meta.wholeBook = meta.wholeBook || wholeBook;
    meta.options = { wifiOnly: opts.wifiOnly, keepNew: opts.keepNew || wholeBook || meta.wholeBook };
    meta.paused = false;
    const ready = new Set(Object.keys(meta.manifest));
    const allIds = meta.chapters.map((c) => c.id);
    const asked = scope.kind === 'chapters' ? scope.chapterIds.filter((id) => allIds.includes(id)) : allIds;
    for (const id of asked) {
      if (this.isHeld(audiobookId, id)) continue;
      if (ready.has(id)) {
        if (!meta.wanted.includes(id)) meta.wanted.push(id);
      } else if (meta.options.keepNew && !meta.pending.includes(id)) meta.pending.push(id);
    }
    // keepNew with a partial scope still waits for the chapters that were not ready when it was asked for
    if (meta.options.keepNew && scope.kind === 'ready_now') {
      for (const id of allIds) if (!ready.has(id) && !this.isHeld(audiobookId, id) && !meta.pending.includes(id)) meta.pending.push(id);
    }
    await this.saveMeta(meta);
    const job = this.jobFor(meta);
    for (const id of meta.wanted) if (!job.chapters.has(id)) job.chapters.set(id, this.newChapterJob(meta, id));
    job.message = null;
    this.changed();
    this.kick(job);
  }

  pause(audiobookId: string): void {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (!meta || !job) return;
    meta.paused = true;
    void this.saveMeta(meta);
    this.stopJob(job, 'pause');
    for (const [id, c] of job.chapters) if (c.state === 'downloading') job.chapters.set(id, { ...c, state: 'queued' });
    job.status = 'paused';
    job.message = `${keptLead(this.heldCount(audiobookId))} Paused. The part already downloaded is kept; resume carries on from there.`;
    this.changed();
  }

  resume(audiobookId: string): void {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (!meta || !job) return;
    meta.paused = false;
    void this.saveMeta(meta);
    for (const [id, c] of job.chapters) if (c.state === 'downloading') job.chapters.set(id, { ...c, state: 'queued' });
    job.message = null;
    job.status = 'idle';
    this.kick(job);
    this.changed();
  }

  cancel(audiobookId: string): void {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (!meta || !job) return;
    this.stopJob(job, 'cancel');
    const dropped = [...job.chapters.keys()];
    job.chapters.clear();
    job.status = 'idle';
    job.message = null;
    meta.wanted = [];
    meta.pending = [];
    meta.wholeBook = false;
    meta.options = { ...meta.options, keepNew: false };
    meta.paused = false;
    void (async () => {
      await this.saveMeta(meta);
      // the unfinished bytes of the chapters that were stopped go; finished chapters stay
      for (const id of dropped) {
        const entry = meta.manifest[id];
        if (entry && !this.isHeld(audiobookId, id)) await this.d.store.dropAudio(entry.audio.id);
      }
      this.changed();
    })();
    this.changed();
  }

  retry(audiobookId: string, chapterId?: string): void {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (!meta || !job) return;
    for (const [id, c] of job.chapters) {
      if (c.state === 'failed' && (!chapterId || chapterId === id)) job.chapters.set(id, { ...c, state: 'queued', error: null, attempts: 0, received: 0 });
    }
    if (chapterId && !job.chapters.has(chapterId) && !this.isHeld(audiobookId, chapterId) && meta.manifest[chapterId]) {
      job.chapters.set(chapterId, this.newChapterJob(meta, chapterId));
      if (!meta.wanted.includes(chapterId)) meta.wanted.push(chapterId);
      void this.saveMeta(meta);
    }
    meta.paused = false;
    job.message = null;
    this.kick(job);
    this.changed();
  }

  /** Queue one chapter again by id (a damaged copy found on open, or a retry from the manager). */
  queueChapter(audiobookId: string, chapterId: string): void {
    const meta = this.metas.get(audiobookId);
    if (!meta || this.isHeld(audiobookId, chapterId)) return;
    const job = this.jobFor(meta);
    if (!meta.wanted.includes(chapterId)) meta.wanted.push(chapterId);
    if (!job.chapters.has(chapterId)) job.chapters.set(chapterId, this.newChapterJob(meta, chapterId));
    void this.saveMeta(meta);
    this.changed();
    if (!meta.paused) this.kick(job);
  }

  /** Set a chapter to "Couldn't download" with words (used when a held copy turned out damaged). */
  failChapter(audiobookId: string, chapterId: string, error: string): void {
    const meta = this.metas.get(audiobookId);
    if (!meta) return;
    const job = this.jobFor(meta);
    job.chapters.set(chapterId, { state: 'failed', received: 0, total: meta.manifest[chapterId]?.audio.bytes ?? 0, error, attempts: MAX_ATTEMPTS });
    if (!meta.wanted.includes(chapterId)) meta.wanted.push(chapterId);
    void this.saveMeta(meta);
    this.changed();
  }

  setOptions(audiobookId: string, opts: Partial<{ wifiOnly: boolean; keepNew: boolean }>): void {
    const meta = this.metas.get(audiobookId);
    if (!meta) return;
    meta.options = { ...meta.options, ...opts };
    if (opts.keepNew === false) {
      meta.pending = [];
      meta.wholeBook = false;
    }
    if (opts.keepNew === true) {
      const ready = new Set(Object.keys(meta.manifest));
      for (const c of meta.chapters) if (!ready.has(c.id) && !this.isHeld(audiobookId, c.id) && !meta.pending.includes(c.id)) meta.pending.push(c.id);
    }
    void this.saveMeta(meta);
    const job = this.jobFor(meta);
    if (opts.wifiOnly !== undefined) this.connectionChanged();
    if (opts.keepNew === true) void this.checkNew(audiobookId);
    if (!job.running && !meta.paused) this.kick(job);
    this.changed();
  }

  /** Forget a book's queue and its settings (the chapters' own removal is the caller's). */
  forget(audiobookId: string): void {
    const job = this.jobs.get(audiobookId);
    if (job) this.stopJob(job, 'cancel');
    this.jobs.delete(audiobookId);
    this.metas.delete(audiobookId);
    this.held.delete(audiobookId);
    void this.d.store.deleteValue(bookKey(audiobookId));
    this.changed();
  }

  /** Take chapters out of the queue and out of keepNew (the listener removed them). */
  unqueue(audiobookId: string, chapterIds: string[]): void {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (!meta) return;
    meta.wanted = meta.wanted.filter((id) => !chapterIds.includes(id));
    meta.pending = meta.pending.filter((id) => !chapterIds.includes(id));
    for (const id of chapterIds) job?.chapters.delete(id);
    void this.saveMeta(meta);
  }

  // ------------------------------------------------------------------------- keepNew

  /** Read the manifest and queue chapters that have become ready since (for books with keepNew). */
  checkNew(audiobookId?: string): Promise<void> {
    const ids = audiobookId ? [audiobookId] : [...this.metas.values()].filter((m) => m.options.keepNew || m.wholeBook).map((m) => m.audiobookId);
    return Promise.all(ids.map((id) => this.refreshOne(id))).then(() => {});
  }

  private refreshOne(audiobookId: string): Promise<void> {
    const running = this.checking.get(audiobookId);
    if (running) return running;
    const p = (async () => {
      const meta = this.metas.get(audiobookId);
      if (!meta) return;
      const m = await this.d.api.manifest(audiobookId);
      if (!m.ok) return;
      this.takeManifest(meta, m.value.chapters);
      const job = this.jobFor(meta);
      if (meta.options.keepNew || meta.wholeBook) {
        const ready = new Set(Object.keys(meta.manifest));
        const nowReady = meta.pending.filter((id) => ready.has(id));
        meta.pending = meta.pending.filter((id) => !ready.has(id));
        for (const id of nowReady) {
          if (this.isHeld(audiobookId, id)) continue;
          if (!meta.wanted.includes(id)) meta.wanted.push(id);
          if (!job.chapters.has(id)) job.chapters.set(id, this.newChapterJob(meta, id));
        }
      }
      await this.saveMeta(meta);
      this.changed();
      if (job.chapters.size && !meta.paused) this.kick(job);
    })().finally(() => this.checking.delete(audiobookId));
    this.checking.set(audiobookId, p);
    return p;
  }

  // ------------------------------------------------------------------------- the world changed

  /** The connection kind changed: stop what Wi-Fi only forbids, start what it now allows. */
  connectionChanged(): void {
    for (const job of this.jobs.values()) {
      const meta = this.metas.get(job.audiobookId);
      if (!meta) continue;
      if (this.wifiBlocked(meta)) {
        if (job.running) this.stopJob(job, 'wifi');
        else if (job.chapters.size && job.status !== 'paused') {
          job.status = 'waiting_wifi';
          job.message = this.wifiMessage(job.audiobookId);
        }
      } else if (job.status === 'waiting_wifi' && !meta.paused) {
        this.kick(job);
      }
    }
    this.changed();
  }

  /** The server answers again: downloads that waited for it carry on by themselves. */
  reachableAgain(): void {
    for (const job of this.jobs.values()) {
      const meta = this.metas.get(job.audiobookId);
      if (!meta || meta.paused) continue;
      if (job.status === 'offline' || (job.status === 'idle' && [...job.chapters.values()].some((c) => c.state === 'queued'))) this.kick(job);
    }
  }

  /** The device may have more room (the listener freed some): a stopped download tries again. */
  roomMayHaveChanged(): void {
    for (const job of this.jobs.values()) if (job.status === 'device_full') this.kick(job);
  }

  // ------------------------------------------------------------------------- removal (device only)

  /** Take chapters (or everything, with null) off this device. Stops the queue first. Never touches the server. */
  async removeChapters(audiobookId: string, chapterIds: string[] | null): Promise<RemoveResult> {
    const meta = this.metas.get(audiobookId);
    const job = this.jobs.get(audiobookId);
    if (job?.running) {
      this.stopJob(job, 'cancel');
      await job.running;
    }
    const heldHere = [...(this.held.get(audiobookId)?.values() ?? [])];
    const targets = chapterIds ? heldHere.filter((r) => chapterIds.includes(r.chapterId)) : heldHere;
    if (meta) {
      const ids = chapterIds ?? meta.chapters.map((c) => c.id);
      // the unfinished bytes of a chapter being removed go with it
      for (const id of ids) {
        const entry = meta.manifest[id];
        if (entry && !targets.some((r) => r.chapterId === id)) await this.d.store.dropAudio(entry.audio.id).catch(() => {});
      }
      this.unqueue(audiobookId, ids);
    }
    for (const r of targets) {
      await this.d.store.deleteChapter(audiobookId, r.chapterId);
      this.dropHeld(audiobookId, r.chapterId);
    }
    let forgotten = false;
    if (meta && (!chapterIds || (this.heldCount(audiobookId) === 0 && meta.wanted.length === 0 && meta.pending.length === 0))) {
      this.forget(audiobookId);
      forgotten = true;
    } else if (job) {
      job.status = 'idle';
      if (job.chapters.size && !meta?.paused) this.kick(job);
    }
    this.changed();
    return { removed: targets, forgotten };
  }

  // ------------------------------------------------------------------------- internals

  private heldCount(audiobookId: string): number {
    return this.held.get(audiobookId)?.size ?? 0;
  }

  private jobFor(meta: BookMeta): Job {
    let job = this.jobs.get(meta.audiobookId);
    if (!job) {
      job = { audiobookId: meta.audiobookId, status: 'idle', message: null, chapters: new Map(), abort: null, running: null, stop: 'none' };
      this.jobs.set(meta.audiobookId, job);
    }
    return job;
  }

  private newChapterJob(meta: BookMeta, chapterId: string): ChapterJob {
    return { state: 'queued', received: 0, total: meta.manifest[chapterId]?.audio.bytes ?? 0, error: null, attempts: 0 };
  }

  private takeManifest(meta: BookMeta, chapters: ManifestChapter[]): void {
    meta.manifest = Object.fromEntries(chapters.map((c) => [c.chapter_id, c]));
    meta.checkedAt = this.d.clock.now();
  }

  private async makeMeta(ab: Audiobook): Promise<BookMeta | null> {
    const listener = this.d.listener();
    const [chapters, book] = await Promise.all([this.d.api.chapters(ab.book_id), listener ? this.d.api.book(listener, ab.book_id) : Promise.resolve(null)]);
    if (!chapters.ok) return null;
    const info = book && book.ok ? book.value : null;
    const meta: BookMeta = {
      audiobookId: ab.id,
      bookId: ab.book_id,
      title: info?.title ?? 'Audiobook',
      author: info?.author ?? '',
      coverColor: info ? coverColor(info) : '#c65a43',
      coverUrl: info ? (realCoverUrl(info.cover) ?? null) : null,
      voiceName: ab.voice_name,
      voiceRevision: ab.voice_revision,
      chapters: [...chapters.value].sort((a: BookChapter, b: BookChapter) => a.index - b.index).map((c) => ({ id: c.id, index: c.index, title: c.title, kind: c.kind, wordCount: c.word_count, textLength: c.text_length, pageCount: c.page_count })),
      manifest: {},
      checkedAt: null,
      options: { wifiOnly: false, keepNew: false },
      wholeBook: false,
      wanted: [],
      pending: [],
      paused: false,
    };
    if (meta.coverUrl) {
      const blob = await this.d.api.cover(meta.coverUrl);
      if (blob) await this.d.store.setValue(coverKey(meta.bookId), blob).catch(() => {});
    }
    return meta;
  }

  async saveMeta(meta: BookMeta): Promise<void> {
    try {
      await this.d.store.setValue(bookKey(meta.audiobookId), meta);
    } catch {
      /* the in-memory copy still drives this session; the next change tries again */
    }
  }

  private wifiBlocked(meta: BookMeta): boolean {
    if (!meta.options.wifiOnly) return false;
    const kind = this.d.connection.kind();
    return kind !== 'wifi' && kind !== 'ethernet';
  }

  private wifiMessage(audiobookId: string): string {
    const kind = this.d.connection.kind();
    const lead = keptLead(this.heldCount(audiobookId));
    return kind === 'unknown'
      ? `${lead} Waiting for Wi-Fi: Wi-Fi only is on and this browser can't tell what kind of connection this is, so it does not guess. Turn Wi-Fi only off to download now.`
      : `${lead} Waiting for Wi-Fi: Wi-Fi only is on and this connection is mobile data. It carries on by itself on Wi-Fi.`;
  }

  /** the reason, read fresh (workers change it while the loop awaits) */
  private stopOf(job: Job): Stop {
    return job.stop;
  }

  private stopJob(job: Job, why: Stop): void {
    job.stop = why;
    job.abort?.abort();
  }

  private kick(job: Job): void {
    if (job.running) {
      // a loop that is stopping must not swallow this: start again when it has ended
      if (job.stop !== 'none') void job.running.then(() => (job.running ? undefined : this.kick(job)));
      return;
    }
    job.running = this.loop(job).finally(() => {
      job.running = null;
      this.changed();
    });
  }

  private nextQueued(job: Job, meta: BookMeta): string | null {
    for (const c of meta.chapters) if (job.chapters.get(c.id)?.state === 'queued') return c.id;
    return null;
  }

  private async loop(job: Job): Promise<void> {
    const meta = this.metas.get(job.audiobookId);
    if (!meta) return;
    job.stop = 'none';
    const ac = (job.abort = new AbortController());
    const workers = new Set<Promise<void>>();
    job.message = null;
    for (;;) {
      if (this.stopOf(job) !== 'none') break;
      if (meta.paused) {
        job.stop = 'pause';
        break;
      }
      if (this.wifiBlocked(meta)) {
        job.stop = 'wifi';
        break;
      }
      const next = this.nextQueued(job, meta);
      if (next && workers.size < this.concurrency) {
        job.status = 'running';
        const cj = job.chapters.get(next)!;
        job.chapters.set(next, { ...cj, state: 'downloading' });
        const w: Promise<void> = this.work(job, meta, next, ac).finally(() => workers.delete(w));
        workers.add(w);
        this.changed();
        continue;
      }
      if (workers.size === 0) break;
      await Promise.race(workers);
    }
    if (this.stopOf(job) !== 'none') ac.abort();
    await Promise.allSettled(workers);
    // chapters that were mid-way go back to the queue; their bytes are kept
    for (const [id, c] of job.chapters) if (c.state === 'downloading') job.chapters.set(id, { ...c, state: 'queued' });
    switch (this.stopOf(job)) {
      case 'pause':
        job.status = 'paused';
        break;
      case 'wifi':
        job.status = 'waiting_wifi';
        job.message = this.wifiMessage(job.audiobookId);
        break;
      case 'full':
        job.status = 'device_full';
        job.message = `${keptLead(this.heldCount(job.audiobookId))} This device has no room for the rest. Free up some space, then resume.`;
        break;
      case 'offline':
        job.status = 'offline';
        job.message = `${keptLead(this.heldCount(job.audiobookId))} The Bardic computer can't be reached. Downloading carries on by itself when it is back.`;
        break;
      case 'cancel':
        job.status = 'idle';
        break;
      default:
        job.status = 'idle';
    }
    if (this.stopOf(job) === 'none' && [...job.chapters.values()].some((c) => c.state === 'failed')) {
      const n = [...job.chapters.values()].filter((c) => c.state === 'failed').length;
      job.message = `${keptLead(this.heldCount(job.audiobookId))} ${plural(n, 'chapter', 'chapters')} could not be downloaded. Try again.`;
    }
  }

  private async work(job: Job, meta: BookMeta, chapterId: string, ac: AbortController): Promise<void> {
    const set = (patch: Partial<ChapterJob>) => {
      const cur = job.chapters.get(chapterId);
      if (cur) job.chapters.set(chapterId, { ...cur, ...patch });
      this.changed();
    };
    const entry = meta.manifest[chapterId];
    if (!entry) {
      set({ state: 'failed', error: 'The other chapters are kept. This chapter is not ready on the server yet.' });
      return;
    }
    const free = await this.d.freeBytes();
    const stored = (await this.d.store.partial(entry.audio.id)).bytes;
    if (free !== null && free < entry.audio.bytes - stored) {
      job.stop = 'full';
      ac.abort();
      set({ state: 'queued' });
      return;
    }
    const target: ChapterTarget = { audiobookId: job.audiobookId, bookId: meta.bookId, chapterId, audio: entry.audio, textSha256: entry.text_sha256, voiceName: meta.voiceName };
    try {
      const record = await fetchChapter(
        {
          api: this.d.api,
          store: this.d.store,
          clock: this.d.clock,
          signal: ac.signal,
          idleMs: this.d.idleMs,
          partBytes: this.d.partBytes,
          onProgress: (received, total) => {
            const cur = job.chapters.get(chapterId);
            if (cur) job.chapters.set(chapterId, { ...cur, received, total });
            this.changed();
          },
        },
        target,
      );
      this.setHeld(record);
      job.chapters.delete(chapterId);
      meta.wanted = meta.wanted.filter((id) => id !== chapterId);
      await this.saveMeta(meta);
      this.changed();
    } catch (e) {
      const err = e instanceof FetchError ? e : new FetchError('store', e instanceof Error ? e.message : 'Something went wrong.');
      switch (err.kind) {
        case 'aborted':
          set({ state: 'queued' });
          return;
        case 'quota':
          job.stop = 'full';
          ac.abort();
          set({ state: 'queued' });
          return;
        case 'network':
        case 'server': {
          const up = await this.d.api.audiobook(job.audiobookId).then((r) => r.ok || r.status !== 0);
          if (!up) {
            job.stop = 'offline';
            ac.abort();
            set({ state: 'queued' });
            return;
          }
          const attempts = (job.chapters.get(chapterId)?.attempts ?? 0) + 1;
          if (attempts < MAX_ATTEMPTS) set({ state: 'queued', attempts });
          else set({ state: 'failed', attempts, error: `The other chapters are kept. ${err.message} Try again.` });
          return;
        }
        case 'missing': {
          // the server no longer has this audio: if it made newer audio, a chapter that is not held yet may take that
          await this.refreshOne(job.audiobookId);
          const fresh = meta.manifest[chapterId];
          if (fresh && fresh.audio.id !== entry.audio.id && (job.chapters.get(chapterId)?.attempts ?? 0) < MAX_ATTEMPTS) {
            set({ state: 'queued', attempts: (job.chapters.get(chapterId)?.attempts ?? 0) + 1, total: fresh.audio.bytes, received: 0 });
            return;
          }
          set({ state: 'failed', error: `The other chapters are kept. This one is not on the server any more, so it can't be downloaded.` });
          return;
        }
        default:
          set({ state: 'failed', error: `The other chapters are kept. ${err.message} Try again.` });
      }
    }
  }
}
