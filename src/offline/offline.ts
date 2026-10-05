// The offline engine: what this device holds, what it is downloading, whether the Bardic computer can be reached, and
// every rule that goes with it. `createOffline(deps)` takes its world as arguments (server, store, clock, connection,
// events, storage) so every rule runs in a unit test; `offline` is the one of the page.
//
// Rules this file keeps: remove is the device only (this engine has no way to call a server delete); nothing held is replaced
// without the listener choosing (updates.ts); a downloaded book of a removed library entry is only offered for removal;
// unknown stays null; every message starts with what is kept.
import { writable, type Readable } from 'svelte/store';
import type { Clock } from '../lib/clock';
import { Downloader, bookKey, coverKey, keptLead, type BookMeta } from './downloader';
import type { ConnectionPort, Notice, OfflineApi, OfflineEvents, R, StoragePort, UrlPort } from './ports';
import type { OfflineStore } from './store';
import { Updates } from './updates';
import { verifyHeld } from './verify';
import type {
  DeviceChapter,
  DownloadPreview,
  DownloadScope,
  DownloadStatus,
  HeldBookInfo,
  HeldChapter,
  OfflineBook,
  OfflineCommands,
  OfflineStateX,
  RemovedDownload,
  StorageInfo,
  VerifyReport,
} from './types';

export interface OfflineDeps {
  api: OfflineApi;
  store: OfflineStore;
  clock: Clock;
  connection: ConnectionPort;
  /** null: no live notices (the periodic check still runs) */
  events: OfflineEvents | null;
  storage: StoragePort;
  urls: UrlPort;
  /** the listener selected on this device (needed to read a book's state for removal and finished rules) */
  listener: () => string | null;
  /** chapters downloaded at once, 1 or 2 (default 1) */
  concurrency?: number;
  /** a stalled download counts as dropped after this long without data (default 30 s) */
  idleMs?: number;
  /** size of the blocks written as audio arrives (default 1 MiB) */
  partBytes?: number;
  /** how often to look for new chapters, newer audio, removed books (default 5 min) */
  checkEveryMs?: number;
  /** held audio is fully re-hashed when its last full check is older than this (default 7 days) */
  deepVerifyAfterMs?: number;
  /** first wait between attempts to reach an unreachable server; doubles to 30 s (default 2 s) */
  probeBaseMs?: number;
  /** false: do not start by itself (call `start()`); default true */
  autoStart?: boolean;
}

export interface OfflineEngine extends Readable<OfflineStateX>, OfflineCommands {
  /** resolves when what is held has been read and verified (it does not wait for the network) */
  readonly ready: Promise<void>;
  /** the audio, text, lines and timings of a held chapter, usable with no server; null when not held (or damaged) */
  heldChapter(audiobookId: string, chapterId: string): Promise<HeldChapter | null>;
  /** chapter ids of an audiobook with a copy that plays (on this device, including out of date); for the player's `heldChapters` */
  heldChapters(audiobookId: string): ReadonlySet<string>;
  /**
   * The downloaded book with this book id (the audiobook preferred if it is held, else the one holding the most
   * chapters), for opening it with no server. Read-only; null when nothing of the book is held.
   */
  heldBook(bookId: string, preferAudiobookId?: string | null): HeldBookInfo | null;
  /** audiobook ids that hold at least one chapter */
  heldAudiobookIds(): string[];
  /** check held chapters again; `deep` hashes the whole audio */
  verify(audiobookId?: string, opts?: { deep?: boolean }): Promise<VerifyReport>;
  /** the listener selected on this device changed: follow that listener's notices */
  listenerChanged(): void;
  destroy(): void;
}

const DAY = 86_400_000;
const SETTING_DAYS = 'setting:removeFinishedAfterDays';
const SETTING_CONTACT = 'setting:lastContact';
const finishedKey = (bookId: string) => `finished:${bookId}`;

export function createOffline(deps: OfflineDeps): OfflineEngine {
  const { store, clock, connection, storage, urls } = deps;
  const checkEveryMs = deps.checkEveryMs ?? 5 * 60_000;
  const probeBase = deps.probeBaseMs ?? 2000;
  const deepAfter = deps.deepVerifyAfterMs ?? 7 * DAY;

  let destroyed = false;
  let online = typeof connection.onLine() === 'boolean' ? connection.onLine()! : true;
  let lastContact: number | null = null;
  let lastContactSaved = 0;
  let notice: string | null = null;
  let removeFinishedAfterDays: number | null = null;
  let removed: RemovedDownload[] = [];
  let storageInfo = { usedBytes: null as number | null, freeBytes: null as number | null, persisted: false };
  const finishedAt = new Map<string, number>();
  const urlCache = new Map<string, string>();
  const coverUrls = new Map<string, string>();

  // ----------------------------------------------------------------------- online tracking
  // Every request the engine makes goes through `tracked`: a response of any kind means the server is there, no
  // response means it is not. That is the only way `online` changes, apart from the browser saying it has no network.
  /** damaged copies waiting for the server so they can be fetched again: audiobook + chapter */
  const repairs = new Set<string>();
  let probeTimer: number | undefined;
  let probeN = 0;
  const reached = (ok: boolean) => {
    if (destroyed) return;
    if (ok) {
      lastContact = clock.now();
      if (lastContact - lastContactSaved > 60_000) {
        lastContactSaved = lastContact;
        void store.setValue(SETTING_CONTACT, lastContact).catch(() => {});
      }
      if (repairs.size) {
        for (const k of [...repairs]) {
          repairs.delete(k);
          const [a, c] = k.split('\u0000');
          downloads.retry(a!, c);
        }
      }
      if (!online) {
        online = true;
        stopProbe();
        probeN = 0;
        downloads.reachableAgain();
        void refresh();
      }
    } else if (online) {
      online = false;
      scheduleProbe();
    }
    flush();
  };
  const stopProbe = () => {
    if (probeTimer !== undefined) clock.clearTimeout(probeTimer);
    probeTimer = undefined;
  };
  const scheduleProbe = () => {
    if (probeTimer !== undefined || destroyed) return;
    const delay = Math.min(probeBase * 2 ** probeN, 30_000);
    probeTimer = clock.setTimeout(() => {
      probeTimer = undefined;
      probeN += 1;
      void api.ping().then((ok) => {
        if (!ok) scheduleProbe();
      });
    }, delay);
  };
  const track = async <T>(p: Promise<R<T>>): Promise<R<T>> => {
    const r = await p;
    reached(r.ok || r.status !== 0);
    return r;
  };
  const raw = deps.api;
  const api: OfflineApi = {
    ping: async () => {
      const ok = await raw.ping();
      reached(ok);
      return ok;
    },
    audiobook: (id) => track(raw.audiobook(id)),
    manifest: (id) => track(raw.manifest(id)),
    chapters: (id) => track(raw.chapters(id)),
    book: (l, id) => track(raw.book(l, id)),
    chapterText: (b, c) => track(raw.chapterText(b, c)),
    timings: (id) => track(raw.timings(id)),
    audio: (id, from, signal) => track(raw.audio(id, from, signal)),
    cover: (url) => raw.cover(url),
    checkDownloads: (id, have) => track(raw.checkDownloads(id, have)),
  };

  // ----------------------------------------------------------------------- parts
  const freeBytes = async (): Promise<number | null> => {
    const e = await storage.estimate();
    return e.quota !== null && e.usage !== null ? Math.max(0, e.quota - e.usage) : null;
  };
  const downloads = new Downloader({ api, store, clock, connection, freeBytes, listener: deps.listener, concurrency: deps.concurrency, idleMs: deps.idleMs, partBytes: deps.partBytes });
  const updates = new Updates({ api, store, clock, downloads, connection, idleMs: deps.idleMs, partBytes: deps.partBytes });

  // ----------------------------------------------------------------------- state
  const state = writable<OfflineStateX>(build());
  let dirty = false;
  let heldSignature = '';
  function flush(): void {
    dirty = false;
    if (destroyed) return;
    state.set(build());
    let sig = '';
    for (const [a, m] of downloads.held) sig += `${a}:${m.size}:${[...m.values()].reduce((n, r) => n + r.bytes, 0)};`;
    if (sig !== heldSignature) {
      heldSignature = sig;
      void refreshStorage();
    }
  }
  function changed(): void {
    if (dirty || destroyed) return;
    dirty = true;
    queueMicrotask(() => {
      if (dirty) flush();
    });
  }
  downloads.changed = changed;
  updates.changed = changed;
  downloads.problem = (t) => {
    notice = t;
    changed();
  };
  updates.problem = downloads.problem;

  async function refreshStorage(): Promise<void> {
    const [usage, est, persisted] = await Promise.all([store.usage().catch(() => null), storage.estimate(), storage.persisted()]);
    storageInfo = {
      usedBytes: usage ? usage.total : null,
      freeBytes: est.quota !== null && est.usage !== null ? Math.max(0, est.quota - est.usage) : null,
      persisted,
    };
    changed();
  }

  function build(): OfflineStateX {
    const kind = connection.kind();
    const info: StorageInfo = { ...storageInfo, unmetered: kind === 'wifi' || kind === 'ethernet' ? true : kind === 'cellular' ? false : null };
    const books: OfflineBook[] = [];
    for (const meta of downloads.metas.values()) {
      const held = downloads.held.get(meta.audiobookId);
      const view = downloads.view(meta.audiobookId);
      if ((held?.size ?? 0) === 0 && view.chapters.size === 0 && meta.pending.length === 0) continue; // nothing here to show
      let heldBytes = 0;
      let remaining: number | null = 0;
      const chapters: DeviceChapter[] = meta.chapters.map((c) => {
        const record = held?.get(c.id);
        const job = view.chapters.get(c.id);
        const manifestBytes = meta.manifest[c.id]?.audio.bytes ?? null;
        if (record) heldBytes += record.bytes;
        const upProgress = updates.progress(meta.audiobookId, c.id);
        let st: DeviceChapter['state'] = 'not_downloaded';
        let progress: number | null = null;
        let error: string | null = null;
        let bytes = record?.bytes ?? manifestBytes;
        if (upProgress !== undefined) {
          st = 'downloading';
          progress = upProgress;
        } else if (job) {
          st = job.state === 'failed' ? 'failed' : job.state;
          if (job.state === 'downloading') progress = job.total > 0 ? Math.min(1, job.received / job.total) : null;
          error = job.error;
          bytes = job.total > 0 ? job.total : bytes;
          if (remaining !== null) remaining = job.total > 0 ? remaining + Math.max(0, job.total - job.received) : null;
        } else if (record) {
          st = updates.isOutOfDate(meta.audiobookId, c.id) ? 'out_of_date' : 'on_device';
          error = updates.error(meta.audiobookId, c.id);
        }
        const chapterKind = c.kind === 'front_matter' || c.kind === 'back_matter' ? c.kind : 'story';
        return { chapterId: c.id, index: c.index, title: c.title, kind: chapterKind, state: st, bytes, progress, error };
      });
      const book: OfflineBook = {
        bookId: meta.bookId,
        audiobookId: meta.audiobookId,
        title: meta.title,
        author: meta.author,
        coverColor: meta.coverColor,
        voiceName: meta.voiceName,
        chapters,
        status: view.status as DownloadStatus,
        heldBytes,
        remainingBytes: remaining,
        wifiOnly: meta.options.wifiOnly,
        keepNew: meta.options.keepNew,
        checkedAt: meta.checkedAt,
        message: view.message,
      };
      const cover = coverUrls.get(meta.bookId) ?? meta.coverUrl;
      if (cover) book.coverSrc = cover;
      books.push(book);
    }
    books.sort((a, b) => a.title.localeCompare(b.title) || a.audiobookId.localeCompare(b.audiobookId));
    return { online, lastContact, storage: info, books, updates: [...updates.offers], removedBooks: removed, removeFinishedAfterDays, notice };
  }

  // ----------------------------------------------------------------------- contact with the server
  let refreshing: Promise<void> | null = null;
  function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!(await api.ping())) return;
      await Promise.all([checkBooks(), downloads.checkNew(), updates.check()]);
      applyFinishedRule();
      watchEvents();
    })()
      .catch(() => {})
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  /** O8 and the finished rule: ask the server about each downloaded book. Offers removal; never removes. */
  async function checkBooks(): Promise<void> {
    const listener = deps.listener();
    if (!listener) return;
    const offered: RemovedDownload[] = [];
    const seen = new Map<string, R<import('./ports').Book>>();
    for (const meta of downloads.metas.values()) {
      const held = downloads.held.get(meta.audiobookId);
      if (!held || held.size === 0) continue;
      let r = seen.get(meta.bookId);
      if (!r) {
        r = await api.book(listener, meta.bookId);
        seen.set(meta.bookId, r);
      }
      if (!r.ok && r.status === 0) return; // unreachable: nothing is learned, nothing changes
      const gone = (!r.ok && r.status === 404) || (r.ok && (r.value.state === 'removed' || r.value.state === 'deleting'));
      if (gone) {
        offered.push({ bookId: meta.bookId, audiobookId: meta.audiobookId, title: meta.title, heldBytes: [...held.values()].reduce((n, x) => n + x.bytes, 0) });
      } else if (r.ok) {
        const place = r.value.place;
        if (place?.finished) {
          const at = Date.parse(place.updated_at);
          if (Number.isFinite(at) && finishedAt.get(meta.bookId) !== at) {
            finishedAt.set(meta.bookId, at);
            void store.setValue(finishedKey(meta.bookId), at).catch(() => {});
          }
        } else if (finishedAt.delete(meta.bookId)) {
          void store.deleteValue(finishedKey(meta.bookId)).catch(() => {});
        }
      }
    }
    removed = offered;
    changed();
  }

  /** The device rule: finished books' downloads go after N days (off by default). */
  function applyFinishedRule(): void {
    const days = removeFinishedAfterDays;
    if (days === null) return;
    for (const meta of [...downloads.metas.values()]) {
      const at = finishedAt.get(meta.bookId);
      if (at !== undefined && clock.now() - at >= days * DAY && (downloads.held.get(meta.audiobookId)?.size ?? 0) > 0) void remove(meta.audiobookId);
    }
  }

  // ----------------------------------------------------------------------- notices from the server
  let stopEvents: (() => void) | null = null;
  let eventsFor: string | null = null;
  let eventTimer: number | undefined;
  let eventNeeds = { new: false, updates: false, books: false };
  function watchEvents(): void {
    const listener = deps.listener();
    if (!deps.events || destroyed) return;
    if (eventsFor === listener && stopEvents) return;
    stopEvents?.();
    stopEvents = null;
    eventsFor = listener;
    if (!listener) return;
    stopEvents = deps.events.subscribe(
      listener,
      (n: Notice) => {
        if (n.type === 'resync') eventNeeds = { new: true, updates: true, books: true };
        else if (n.type === 'job.updated') eventNeeds.new = true;
        else if (n.type === 'audiobook.updated' || n.type === 'chapter.updated') {
          eventNeeds.new = true;
          eventNeeds.updates = true;
        } else if (n.type === 'book.updated' || n.type === 'deletion.updated' || n.type === 'place.updated') eventNeeds.books = true;
        else return;
        if (eventTimer === undefined) {
          eventTimer = clock.setTimeout(() => {
            eventTimer = undefined;
            const need = eventNeeds;
            eventNeeds = { new: false, updates: false, books: false };
            void (async () => {
              if (need.new) await downloads.checkNew();
              if (need.updates) await updates.check();
              if (need.books) {
                await checkBooks();
                applyFinishedRule();
              }
            })().catch(() => {});
          }, 300);
        }
      },
      () => reached(true),
    );
  }

  let tickTimer: number | undefined;
  const tick = () => {
    tickTimer = clock.setTimeout(() => {
      if (destroyed) return;
      void refresh();
      tick();
    }, checkEveryMs);
  };

  // ----------------------------------------------------------------------- verify
  async function runVerify(audiobookId: string | undefined, opts: { deep?: boolean } = {}): Promise<VerifyReport> {
    const records = [...downloads.held.entries()].filter(([a]) => !audiobookId || a === audiobookId).flatMap(([, m]) => [...m.values()]);
    const report = await verifyHeld(store, records, { clock, deep: opts.deep, deepAfterMs: deepAfter });
    for (const d of report.damaged) {
      // never served again; shown as "Couldn't download", and fetched again when the server can be reached
      downloads.dropHeld(d.audiobookId, d.chapterId);
      downloads.failChapter(d.audiobookId, d.chapterId, `The other chapters are kept. The copy of this chapter on this device was damaged (${d.reason.replace(/\.$/, '')}), so it is not played. Download it again.`);
      dropUrl(d.audiobookId, d.chapterId, records);
      repairs.add(`${d.audiobookId}\u0000${d.chapterId}`);
    }
    for (const r of report.good) downloads.setHeld(r);
    changed();
    return { checked: report.checked, damaged: report.damaged };
  }

  function dropUrl(audiobookId: string, chapterId: string, records: { audiobookId: string; chapterId: string; audioId: string }[]): void {
    const r = records.find((x) => x.audiobookId === audiobookId && x.chapterId === chapterId);
    const url = r && urlCache.get(r.audioId);
    if (r && url) {
      urlCache.delete(r.audioId);
      // a player may still be on this URL: give it time before it stops working
      clock.setTimeout(() => urls.revoke(url), 10 * 60_000);
    }
  }

  // ----------------------------------------------------------------------- commands
  async function remove(audiobookId: string, chapterIds?: string[]): Promise<void> {
    const before = [...(downloads.held.get(audiobookId)?.values() ?? [])];
    const meta = downloads.metas.get(audiobookId);
    const res = await downloads.removeChapters(audiobookId, chapterIds && chapterIds.length ? chapterIds : null);
    for (const r of res.removed) dropUrl(audiobookId, r.chapterId, before);
    updates.forget(audiobookId, res.forgotten ? undefined : res.removed.map((r) => r.chapterId));
    if (res.forgotten && meta) {
      await store.deleteValue(coverKey(meta.bookId)).catch(() => {});
      const u = coverUrls.get(meta.bookId);
      if (u) urls.revoke(u);
      coverUrls.delete(meta.bookId);
      for (const { key } of await store.listValues<string>(`keepold:${audiobookId}:`).catch(() => [])) await store.deleteValue(key).catch(() => {});
    }
    removed = removed.filter((x) => x.audiobookId !== audiobookId || (!res.forgotten && downloads.heldIds(audiobookId).size > 0));
    void refreshStorage();
    downloads.roomMayHaveChanged();
    changed();
  }

  async function heldChapter(audiobookId: string, chapterId: string): Promise<HeldChapter | null> {
    const record = downloads.held.get(audiobookId)?.get(chapterId);
    if (!record) return null;
    const [audio, content] = await Promise.all([store.readAudio(record.audioId), store.content(audiobookId, chapterId)]);
    if (!audio || audio.size !== record.bytes || !content) return null; // never serve what is not whole
    let url = urlCache.get(record.audioId);
    if (!url) {
      url = urls.create(audio.type ? audio : new Blob([audio], { type: record.contentType }));
      urlCache.set(record.audioId, url);
    }
    return {
      audioUrl: url,
      text: content.text,
      lines: content.lines.map((l) => ({ id: l.id, start: l.start, end: l.end })),
      timings: content.timings.map((t) => ({ lineId: t.line_id, startMs: t.start_ms, endMs: t.end_ms })),
      durationSeconds: Number.isFinite(record.durationSeconds) ? record.durationSeconds : null,
    };
  }

  const commands: OfflineCommands = {
    preview: (audiobookId: string, scope: DownloadScope): Promise<DownloadPreview> => downloads.preview(audiobookId, scope),
    async start(audiobookId, scope, opts) {
      await engine.ready; // what the device holds is read before anything is added to it
      notice = null;
      void storage.persist().then(() => refreshStorage());
      await downloads.start(audiobookId, scope, opts);
      changed();
    },
    pause: (id) => {
      downloads.pause(id);
      flush();
    },
    resume: (id) => {
      notice = null;
      downloads.resume(id);
      flush();
    },
    cancel: (id) => {
      downloads.cancel(id);
      flush();
    },
    retry: (id, chapterId) => {
      notice = null;
      downloads.retry(id, chapterId);
      repairs.delete(`${id}\u0000${chapterId ?? ''}`);
      flush();
    },
    setOptions: (id, opts) => {
      downloads.setOptions(id, opts);
      flush();
    },
    remove,
    async checkUpdates(audiobookId) {
      await updates.check(audiobookId);
    },
    async applyUpdate(audiobookId, chapterIds) {
      notice = null;
      await updates.apply(audiobookId, chapterIds);
      void refreshStorage();
    },
    keepOld: (audiobookId, chapterIds) => {
      updates.keepOld(audiobookId, chapterIds);
      flush();
    },
    async updateChapterMetadata(bookId, chapters) {
      await engine.ready;
      if (destroyed) return;
      const writes: Promise<void>[] = [];
      for (const meta of downloads.metas.values()) {
        if (meta.bookId !== bookId || meta.chapters.length !== chapters.length || meta.chapters.some((c, i) => c.id !== chapters[i]!.id)) continue;
        if (meta.chapters.every((c, i) => c.title === chapters[i]!.title && c.kind === chapters[i]!.kind)) continue;
        // Keep the shared meta object: a running download may be holding it while updating its queue/settings.
        const before = meta.chapters;
        const updated = before.map((c, i) => ({ ...c, title: chapters[i]!.title, kind: chapters[i]!.kind }));
        meta.chapters = updated;
        writes.push(store.setValue(bookKey(meta.audiobookId), meta).catch((error) => {
          // A retry must still see the old names. Do not undo a newer refresh or concurrent queue/settings changes.
          if (downloads.metas.get(meta.audiobookId) === meta && meta.chapters === updated) meta.chapters = before;
          throw error;
        }));
      }
      const results = await Promise.allSettled(writes);
      if (writes.length) flush();
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    },
    setRemoveFinishedAfterDays(days) {
      removeFinishedAfterDays = days !== null && Number.isFinite(days) && days > 0 ? Math.floor(days) : null;
      void (removeFinishedAfterDays === null ? store.deleteValue(SETTING_DAYS) : store.setValue(SETTING_DAYS, removeFinishedAfterDays)).catch(() => {});
      applyFinishedRule();
      flush();
    },
    async refresh() {
      await refresh();
    },
  };

  // ----------------------------------------------------------------------- start
  let stopConnection: (() => void) | null = null;
  async function init(): Promise<void> {
    stopConnection = connection.subscribe(() => {
      downloads.connectionChanged();
      if (connection.onLine() === false) reached(false);
      else if (!online) {
        stopProbe();
        probeN = 0;
        void api.ping();
      }
      flush();
    });
    await downloads.init();
    await updates.init();
    removeFinishedAfterDays = (await store.getValue<number>(SETTING_DAYS).catch(() => null)) ?? null;
    lastContact = (await store.getValue<number>(SETTING_CONTACT).catch(() => null)) ?? null;
    lastContactSaved = lastContact ?? 0;
    for (const { key, value } of await store.listValues<number>('finished:').catch(() => [])) finishedAt.set(key.slice('finished:'.length), value);
    for (const meta of downloads.metas.values()) {
      const blob = await store.getValue<Blob>(coverKey(meta.bookId)).catch(() => null);
      if (blob) coverUrls.set(meta.bookId, urls.create(blob));
    }
    changed();
    await refreshStorage();
    await runVerify(undefined);
    tick();
    void refresh().then(() => {
      // the slow check goes last and in the background: whole audio hashed against the manifest, once in a while
      void runVerify(undefined).catch(() => {});
    });
  }

  const ready: Promise<void> = deps.autoStart === false ? new Promise(() => {}) : init().catch(() => {});
  let startedLate: Promise<void> | null = null;

  const engine: OfflineEngine = {
    subscribe: state.subscribe,
    ...commands,
    get ready() {
      return deps.autoStart === false ? (startedLate ??= init().catch(() => {})) : ready;
    },
    heldChapter,
    heldChapters: (audiobookId) => downloads.heldIds(audiobookId),
    heldAudiobookIds: () => [...downloads.held.keys()],
    heldBook(bookId, preferAudiobookId) {
      const held = (id: string) => downloads.held.get(id)?.size ?? 0;
      const candidates = [...downloads.metas.values()].filter((m) => m.bookId === bookId && held(m.audiobookId) > 0);
      const meta = candidates.find((m) => m.audiobookId === preferAudiobookId) ?? candidates.sort((a, b) => held(b.audiobookId) - held(a.audiobookId))[0];
      if (!meta) return null;
      const kinds = ['story', 'front_matter', 'back_matter'] as const;
      const info: HeldBookInfo = {
        bookId: meta.bookId,
        audiobookId: meta.audiobookId,
        title: meta.title,
        author: meta.author,
        coverColor: meta.coverColor,
        voiceName: meta.voiceName,
        chapters: [...meta.chapters].sort((a, b) => a.index - b.index).map((c) => ({ id: c.id, index: c.index, title: c.title, kind: kinds.find((k) => k === c.kind) ?? 'story' })),
      };
      const cover = coverUrls.get(meta.bookId) ?? meta.coverUrl;
      if (cover) info.coverSrc = cover;
      return info;
    },
    verify: (audiobookId, opts) => runVerify(audiobookId, opts),
    listenerChanged() {
      stopEvents?.();
      stopEvents = null;
      eventsFor = null;
      void refresh();
    },
    destroy() {
      destroyed = true;
      stopEvents?.();
      stopConnection?.();
      stopProbe();
      if (tickTimer !== undefined) clock.clearTimeout(tickTimer);
      if (eventTimer !== undefined) clock.clearTimeout(eventTimer);
      for (const u of urlCache.values()) urls.revoke(u);
      for (const u of coverUrls.values()) urls.revoke(u);
      urlCache.clear();
      coverUrls.clear();
    },
  };
  return engine;
}

void bookKey;
void keptLead;

import { browserDeps, watchListener } from './browser';

/** The offline engine of the page. It starts by itself in a browser and stays idle in tests that import this module. */
export const offline: OfflineEngine = createOffline({ ...browserDeps(), autoStart: typeof window !== 'undefined' });
if (typeof window !== 'undefined') watchListener(offline);
