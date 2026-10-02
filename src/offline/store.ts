// The durable local store behind an interface: the IndexedDB implementation for the browser and a memory one for tests.
//
// Why IndexedDB for everything (not Cache Storage or OPFS):
//  * One transaction can commit a chapter's index record, text, lines and timings together, and refuses to if the
//    audio parts are not all there. "On this device" therefore only ever means "everything is durable".
//  * Blob parts are normally file-backed. Where a browser cannot prepare them for IndexedDB (including some
//    WebKit contexts), bounded ArrayBuffer parts preserve the same bytes and chapter transaction instead.
//  * Cache Storage cannot commit several entries atomically and does not honour Range for the app itself; OPFS
//    writing from the main thread is not reliably available in Safari (sync access handles are worker-only).
//  * A download is stored as a run of ~1 MiB parts as it arrives, so a pause, a dropped connection or a closed tab
//    keeps every byte already received and resumes from the exact byte (HTTP Range).
// Safari/iOS: storage of sites that are not installed to the home screen can be evicted after about 7 days without a visit;
// `persist()` helps where it is granted, and the engine verifies every held chapter on open.
import type { ChapterText } from './ports';

export interface ChapterRecord {
  audiobookId: string;
  chapterId: string;
  bookId: string;
  audioId: string;
  /** size of the audio, as the manifest said and as stored */
  bytes: number;
  sha256: string;
  contentType: string;
  durationSeconds: number;
  voiceName: string;
  voiceRevision: string;
  textSha256: string;
  textBytes: number;
  /** epoch ms the chapter became durable on this device */
  storedAt: number;
  /** epoch ms of the last full check of the audio against its hash; null if never */
  verifiedAt: number | null;
}

export interface ChapterContent {
  text: string;
  lines: ChapterText['lines'];
  timings: { line_id: string; start_ms: number; end_ms: number }[];
}

export interface StoreUsage {
  audioBytes: number;
  textBytes: number;
  /** bytes of downloads not finished yet (kept so they can resume) */
  partialBytes: number;
  total: number;
}

export interface OfflineStore {
  /** Append the next part of an audio download. `index` must be the number of parts already stored. */
  appendPart(audioId: string, index: number, data: Blob): Promise<void>;
  /** How much of an audio download is stored (always a whole number of contiguous parts from the start). */
  partial(audioId: string): Promise<{ bytes: number; parts: number }>;
  /** The stored parts as one Blob, or null if there are none. */
  readAudio(audioId: string): Promise<Blob | null>;
  dropAudio(audioId: string): Promise<void>;
  /**
   * Make a chapter held: in one step, record + content, provided the audio parts add up to `record.bytes`.
   * If the chapter was already held, the old record, content and (if it differs) audio are replaced in the same step;
   * a failure leaves the old copy exactly as it was. Returns the record that was replaced.
   */
  commitChapter(record: ChapterRecord, content: ChapterContent): Promise<ChapterRecord | null>;
  chapter(audiobookId: string, chapterId: string): Promise<ChapterRecord | null>;
  content(audiobookId: string, chapterId: string): Promise<ChapterContent | null>;
  chapters(audiobookId?: string): Promise<ChapterRecord[]>;
  /** Rewrite a record in place (after a check). Does nothing if the chapter is not held. */
  updateChapter(record: ChapterRecord): Promise<void>;
  /** Remove a chapter's record, content and audio. */
  deleteChapter(audiobookId: string, chapterId: string): Promise<void>;
  /** Audio ids that have parts stored (held or partial). */
  audioIds(): Promise<string[]>;
  getValue<T>(key: string): Promise<T | null>;
  setValue(key: string, value: unknown): Promise<void>;
  deleteValue(key: string): Promise<void>;
  listValues<T>(prefix: string): Promise<{ key: string; value: T }[]>;
  usage(): Promise<StoreUsage>;
}

export function quotaError(): Error {
  return new DOMException('The device has no room for this.', 'QuotaExceededError');
}

export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { name?: string; code?: number; message?: string };
  return x.name === 'QuotaExceededError' || x.code === 22 || /quota/i.test(x.message ?? '');
}

type StoredPart = Blob | ArrayBuffer;
const sumParts = (parts: StoredPart[]) => parts.reduce((n, p) => n + (p instanceof Blob ? p.size : p.byteLength), 0);

/** A Blob capability failure can use binary parts; quota and other storage failures must still reach the caller. */
export function isBlobStorageError(e: unknown): boolean {
  if (!e || typeof e !== 'object' || isQuotaError(e)) return false;
  const error = e as { name?: string; message?: string };
  return error.name === 'DataCloneError' || (error.name === 'UnknownError' && /blob|file data/i.test(error.message ?? ''));
}

// --------------------------------------------------------------------------- memory

export function memoryStore(): OfflineStore & { /** test peeks */ raw: { parts: Map<string, Blob[]>; chapters: Map<string, ChapterRecord>; contents: Map<string, ChapterContent>; kv: Map<string, unknown> } } {
  const parts = new Map<string, Blob[]>();
  const chapters = new Map<string, ChapterRecord>();
  const contents = new Map<string, ChapterContent>();
  const kv = new Map<string, unknown>();
  const key = (a: string, c: string) => `${a}\u0000${c}`;
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    raw: { parts, chapters, contents, kv },
    async appendPart(audioId, index, data) {
      const list = parts.get(audioId) ?? [];
      if (index !== list.length) throw new Error(`part ${index} is not the next part of ${audioId}`);
      list.push(data);
      parts.set(audioId, list);
    },
    async partial(audioId) {
      const list = parts.get(audioId) ?? [];
      return { bytes: sumParts(list), parts: list.length };
    },
    async readAudio(audioId) {
      const list = parts.get(audioId);
      return list && list.length ? new Blob(list) : null;
    },
    async dropAudio(audioId) {
      parts.delete(audioId);
    },
    async commitChapter(record, content) {
      const have = sumParts(parts.get(record.audioId) ?? []);
      if (have !== record.bytes) throw new Error(`the audio is ${have} bytes, the record says ${record.bytes}`);
      const k = key(record.audiobookId, record.chapterId);
      const old = chapters.get(k) ?? null;
      chapters.set(k, clone(record));
      contents.set(k, clone(content));
      if (old && old.audioId !== record.audioId) parts.delete(old.audioId);
      return old ? clone(old) : null;
    },
    async chapter(a, c) {
      const r = chapters.get(key(a, c));
      return r ? clone(r) : null;
    },
    async content(a, c) {
      const r = contents.get(key(a, c));
      return r ? clone(r) : null;
    },
    async chapters(a) {
      return [...chapters.values()].filter((r) => !a || r.audiobookId === a).map(clone);
    },
    async updateChapter(record) {
      const k = key(record.audiobookId, record.chapterId);
      if (chapters.has(k)) chapters.set(k, clone(record));
    },
    async deleteChapter(a, c) {
      const k = key(a, c);
      const old = chapters.get(k);
      chapters.delete(k);
      contents.delete(k);
      if (old) parts.delete(old.audioId);
    },
    async audioIds() {
      return [...parts.keys()];
    },
    async getValue<T>(k: string) {
      return kv.has(k) ? (kv.get(k) as T) : null;
    },
    async setValue(k, v) {
      kv.set(k, v);
    },
    async deleteValue(k) {
      kv.delete(k);
    },
    async listValues<T>(prefix: string) {
      return [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ key: k, value: v as T }));
    },
    async usage() {
      const held = new Set<string>();
      let audioBytes = 0;
      let textBytes = 0;
      for (const r of chapters.values()) {
        held.add(r.audioId);
        audioBytes += r.bytes;
        textBytes += r.textBytes;
      }
      let partialBytes = 0;
      for (const [id, list] of parts) if (!held.has(id)) partialBytes += sumParts(list);
      return { audioBytes, textBytes, partialBytes, total: audioBytes + textBytes + partialBytes };
    },
  };
}

/**
 * A store that refuses writes beyond `limitBytes` the way a full device does (QuotaExceededError). Tests and the
 * end-to-end suite use it to see the engine's device-full path. `limit` can be changed while it runs.
 */
export function withQuota(inner: OfflineStore, limitBytes: number): OfflineStore & { limit: number } {
  const w = {
    limit: limitBytes,
    ...inner,
    async appendPart(audioId: string, index: number, data: Blob) {
      if ((await inner.usage()).total + data.size > w.limit) throw quotaError();
      return inner.appendPart(audioId, index, data);
    },
    async commitChapter(record: ChapterRecord, content: ChapterContent) {
      if ((await inner.usage()).total + record.textBytes * 2 > w.limit) throw quotaError();
      return inner.commitChapter(record, content);
    },
  };
  return w;
}

// --------------------------------------------------------------------------- IndexedDB

const DB_NAME = 'bardic-offline';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = (event) => reject(tx.error ?? (event.target as IDBRequest | null)?.error ?? new Error('IndexedDB transaction failed'));
  });
}

const partRange = (audioId: string) => IDBKeyRange.bound([audioId, 0], [audioId, Number.MAX_SAFE_INTEGER]);
const chapterRange = (audiobookId: string) => IDBKeyRange.bound([audiobookId, ''], [audiobookId, '￿']);

/** The browser's store. `indexedDB` is injectable for tests that bring their own implementation. */
export function indexedDbStore(factory: IDBFactory = indexedDB): OfflineStore {
  let opened: Promise<IDBDatabase> | null = null;
  let binaryParts = false;
  const open = () =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('parts');
        db.createObjectStore('chapters');
        db.createObjectStore('content');
        db.createObjectStore('kv');
      };
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      r.onerror = () => reject(r.error ?? new Error('could not open the offline store'));
      r.onblocked = () => reject(new Error('the offline store is blocked by another tab'));
    }).catch((e) => {
      opened = null;
      throw e;
    }));
  const tx = async (names: string[], mode: IDBTransactionMode, strict = false) => {
    const db = await open();
    if (strict && mode === 'readwrite') {
      try {
        return db.transaction(names, mode, { durability: 'strict' });
      } catch {
        /* older engines: the default durability */
      }
    }
    return db.transaction(names, mode);
  };
  const putPart = async (audioId: string, index: number, data: StoredPart) => {
    const t = await tx(['parts'], 'readwrite');
    const finished = done(t);
    finished.catch(() => {});
    try {
      const store = t.objectStore('parts');
      const have = await req(store.count(partRange(audioId)));
      if (have !== index) throw new Error(`part ${index} is not the next part of ${audioId}`);
      await req(store.put(data, [audioId, index]));
      await finished;
    } catch (e) {
      try { t.abort(); } catch { /* already aborted */ }
      await finished.catch(() => {});
      throw e;
    }
  };

  return {
    async appendPart(audioId, index, data) {
      if (!binaryParts) {
        try {
          await putPart(audioId, index, data);
          return;
        } catch (e) {
          if (!isBlobStorageError(e)) throw e;
          binaryParts = true;
        }
      }
      // Read the bounded download part before creating its transaction: async Blob conversion must not let it expire.
      await putPart(audioId, index, await data.arrayBuffer());
    },
    async partial(audioId) {
      const t = await tx(['parts'], 'readonly');
      const list = (await req(t.objectStore('parts').getAll(partRange(audioId)))) as StoredPart[];
      return { bytes: sumParts(list), parts: list.length };
    },
    async readAudio(audioId) {
      const t = await tx(['parts'], 'readonly');
      const list = (await req(t.objectStore('parts').getAll(partRange(audioId)))) as StoredPart[];
      return list.length ? new Blob(list) : null;
    },
    async dropAudio(audioId) {
      const t = await tx(['parts'], 'readwrite');
      t.objectStore('parts').delete(partRange(audioId));
      await done(t);
    },
    async commitChapter(record, content) {
      const t = await tx(['parts', 'chapters', 'content'], 'readwrite', true);
      const finished = done(t);
      finished.catch(() => {});
      try {
        const list = (await req(t.objectStore('parts').getAll(partRange(record.audioId)))) as StoredPart[];
        const have = sumParts(list);
        if (have !== record.bytes) throw new Error(`the audio is ${have} bytes, the record says ${record.bytes}`);
        const k = [record.audiobookId, record.chapterId];
        const old = ((await req(t.objectStore('chapters').get(k))) as ChapterRecord | undefined) ?? null;
        t.objectStore('chapters').put(record, k);
        t.objectStore('content').put(content, k);
        if (old && old.audioId !== record.audioId) t.objectStore('parts').delete(partRange(old.audioId));
        await finished;
        return old;
      } catch (e) {
        try {
          t.abort();
        } catch {
          /* already finished */
        }
        throw e;
      }
    },
    async chapter(a, c) {
      const t = await tx(['chapters'], 'readonly');
      return ((await req(t.objectStore('chapters').get([a, c]))) as ChapterRecord | undefined) ?? null;
    },
    async content(a, c) {
      const t = await tx(['content'], 'readonly');
      return ((await req(t.objectStore('content').get([a, c]))) as ChapterContent | undefined) ?? null;
    },
    async chapters(a) {
      const t = await tx(['chapters'], 'readonly');
      return (await req(t.objectStore('chapters').getAll(a ? chapterRange(a) : undefined))) as ChapterRecord[];
    },
    async updateChapter(record) {
      const t = await tx(['chapters'], 'readwrite');
      const k = [record.audiobookId, record.chapterId];
      if ((await req(t.objectStore('chapters').count(k))) > 0) t.objectStore('chapters').put(record, k);
      await done(t);
    },
    async deleteChapter(a, c) {
      const t = await tx(['parts', 'chapters', 'content'], 'readwrite');
      const old = ((await req(t.objectStore('chapters').get([a, c]))) as ChapterRecord | undefined) ?? null;
      t.objectStore('chapters').delete([a, c]);
      t.objectStore('content').delete([a, c]);
      if (old) t.objectStore('parts').delete(partRange(old.audioId));
      await done(t);
    },
    async audioIds() {
      const t = await tx(['parts'], 'readonly');
      const keys = (await req(t.objectStore('parts').getAllKeys())) as [string, number][];
      return [...new Set(keys.map((k) => k[0]))];
    },
    async getValue<T>(key: string) {
      const t = await tx(['kv'], 'readonly');
      const v = await req(t.objectStore('kv').get(key));
      return v === undefined ? null : (v as T);
    },
    async setValue(key, value) {
      const t = await tx(['kv'], 'readwrite');
      t.objectStore('kv').put(value, key);
      await done(t);
    },
    async deleteValue(key) {
      const t = await tx(['kv'], 'readwrite');
      t.objectStore('kv').delete(key);
      await done(t);
    },
    async listValues<T>(prefix: string) {
      const t = await tx(['kv'], 'readonly');
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const store = t.objectStore('kv');
      const [keys, values] = await Promise.all([req(store.getAllKeys(range)), req(store.getAll(range))]);
      return keys.map((k, i) => ({ key: String(k), value: values[i] as T }));
    },
    async usage() {
      const t = await tx(['parts', 'chapters'], 'readonly');
      const [records, keys] = await Promise.all([req(t.objectStore('chapters').getAll()) as Promise<ChapterRecord[]>, req(t.objectStore('parts').getAll()) as Promise<StoredPart[]>]);
      // parts of held chapters are counted from their records; every other part is a download waiting to finish
      let audioBytes = 0;
      let textBytes = 0;
      for (const r of records) {
        audioBytes += r.bytes;
        textBytes += r.textBytes;
      }
      const all = sumParts(keys);
      const partialBytes = Math.max(0, all - audioBytes);
      return { audioBytes, textBytes, partialBytes, total: audioBytes + textBytes + partialBytes };
    },
  };
}
