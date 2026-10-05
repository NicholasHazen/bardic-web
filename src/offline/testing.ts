// Fakes for the offline engine's unit tests: a server with a few chapters, a connection, a clock-driven world. Not imported by the app.
import { sha256Bytes, sha256Text } from '../lib/sha256';
import type { AudioRef, AudioStream, Book, ConnectionKind, ConnectionPort, ManifestChapter, Notice, OfflineApi, OfflineEvents, R, StoragePort, SyncCheck, UrlPort } from './ports';

export const AUDIOBOOK = 'ab1';
export const BOOK = 'bk1';

export interface FakeChapter {
  id: string;
  index: number;
  title: string;
  kind: 'story' | 'front_matter' | 'back_matter';
  text: string;
  pageCount?: number | null;
}

const SENTENCES = ['The lamp burned low.', ' A door opened somewhere below.', ' Nobody spoke for a long moment.'];

export function makeAudioBytes(seed: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let x = seed * 2654435761 + 1;
  for (let i = 0; i < size; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

interface AudioFile {
  id: string;
  chapterId: string;
  bytes: Uint8Array;
  sha: string;
  revision: string;
  voiceName: string;
  seconds: number;
  /** order the server made it in */
  seq: number;
}

export class FakeServer {
  chapters: FakeChapter[];
  /** audio id to file; a chapter is ready when it has a current (not freed) audio */
  files = new Map<string, AudioFile>();
  current = new Map<string, string>(); // chapter id to current audio id
  freed = new Set<string>();
  reachable = true;
  bookState: Book['state'] | 'gone' = 'readable';
  finished: { at: string } | null = null;
  log: string[] = [];
  /** Range starts the audio endpoint saw, in order */
  rangeStarts: number[] = [];
  /** serve this many bytes of the next audio response, then stop mid-stream (a dropped connection) */
  dropAfter: number | null = null;
  /** serve this many bytes, then wait until `release()` (or the request is aborted) */
  holdAfter: number | null = null;
  /** runs when a response is cut by `dropAfter` */
  onDrop: (() => void) | null = null;
  private held: (() => void) | null = null;
  /** answer Range requests with the whole file (a server that ignores Range) */
  ignoreRange = false;
  /** change the bytes served for an audio id (corruption on the wire) */
  corrupt = new Set<string>();
  chunk = 4096;
  seq = 0;
  voiceName = 'Mara';
  revision = 'r1';
  audioSize: number;
  generatedAt = 1;

  constructor(chapterCount = 3, audioSize = 20_000) {
    this.audioSize = audioSize;
    this.chapters = Array.from({ length: chapterCount }, (_, i) => ({
      id: `ch${i + 1}`,
      index: i,
      title: `Chapter ${i + 1}`,
      kind: 'story' as const,
      text: `${i + 1}. ${SENTENCES.join('')}`,
    }));
  }

  /** make a chapter's audio (again, if it has some) */
  make(chapterId: string, opts: { revision?: string; voiceName?: string; size?: number } = {}): AudioFile {
    const i = this.chapters.findIndex((c) => c.id === chapterId);
    const seq = ++this.seq;
    const size = opts.size ?? this.audioSize;
    const bytes = makeAudioBytes(i * 100 + seq, size);
    const file: AudioFile = { id: `au_${chapterId}_${seq}`, chapterId, bytes, sha: sha256Bytes(bytes), revision: opts.revision ?? this.revision, voiceName: opts.voiceName ?? this.voiceName, seconds: size / 48000, seq };
    this.files.set(file.id, file);
    this.current.set(chapterId, file.id);
    return file;
  }

  makeAll(): void {
    for (const c of this.chapters) this.make(c.id);
  }

  release(): void {
    this.held?.();
    this.held = null;
  }

  private ref(f: AudioFile): AudioRef {
    return { id: f.id, duration_seconds: f.seconds, bytes: f.bytes.length, sha256: f.sha, content_type: 'audio/wav', voice_revision: f.revision };
  }

  private gate<T>(label: string, fn: () => T): R<T> {
    this.log.push(label);
    if (!this.reachable) return { ok: false, status: 0, detail: 'unreachable' };
    return { ok: true, value: fn() };
  }

  readonly api: OfflineApi = {
    ping: async () => {
      this.log.push('ping');
      return this.reachable;
    },
    audiobook: async (id) =>
      this.gate(`audiobook ${id}`, () => ({
        id,
        book_id: BOOK,
        voice_id: 'v1',
        voice_name: this.voiceName,
        source_id: 'breeze',
        tier: 'free' as const,
        voice_revision: this.revision,
        chapters_total: this.chapters.length,
        chapters_ready: this.current.size,
        bytes: 0,
        created_at: '2026-01-01T00:00:00Z',
        active_job_id: null,
      })),
    manifest: async (id) =>
      this.gate(`manifest ${id}`, () => ({
        audiobook_id: id,
        generated_at: new Date(this.generatedAt).toISOString(),
        chapters: this.chapters.filter((c) => this.current.has(c.id)).map((c): ManifestChapter => ({ chapter_id: c.id, audio: this.ref(this.files.get(this.current.get(c.id)!)!), text_sha256: sha256Text(c.text) })),
      })),
    chapters: async () => this.gate('chapters', () => this.chapters.map((c) => ({ id: c.id, index: c.index, title: c.title, kind: c.kind, word_count: 5, text_length: [...c.text].length, page_count: c.pageCount ?? null, text_sha256: sha256Text(c.text) }))),
    book: async (_l, id) => {
      this.log.push(`book ${id}`);
      if (!this.reachable) return { ok: false, status: 0, detail: 'unreachable' };
      if (this.bookState === 'gone') return { ok: false, status: 404, detail: 'not found' };
      return {
        ok: true,
        value: {
          id,
          title: 'The Lamp',
          author: 'Odile Brandt',
          state: this.bookState,
          added_at: '2026-01-01T00:00:00Z',
          series: null,
          cover: null,
          chapter_count: this.chapters.length,
          story_chapter_count: this.chapters.length,
          word_count: 100,
          source_sha256: null,
          place: this.finished ? { chapter_id: 'ch1', progress: 1, finished: true, updated_at: this.finished.at } : null,
        },
      };
    },
    chapterText: async (_b, chapterId) =>
      this.gate(`text ${chapterId}`, () => {
        const c = this.chapters.find((x) => x.id === chapterId)!;
        const cps = [...c.text];
        return { chapter_id: chapterId, text: c.text, text_sha256: sha256Text(c.text), lines: [{ id: `${chapterId}-l1`, start: 0, end: Math.floor(cps.length / 2) }, { id: `${chapterId}-l2`, start: Math.floor(cps.length / 2), end: cps.length }] };
      }),
    timings: async (audioId) =>
      this.gate(`timings ${audioId}`, () => {
        const f = this.files.get(audioId);
        if (!f) throw new Error('no such audio');
        return { audio_id: audioId, lines: [{ line_id: `${f.chapterId}-l1`, start_ms: 0, end_ms: 500 }, { line_id: `${f.chapterId}-l2`, start_ms: 500, end_ms: 1000 }] };
      }),
    audio: async (audioId, from, signal) => {
      this.log.push(`audio ${audioId} from ${from}`);
      this.rangeStarts.push(from);
      if (!this.reachable) return { ok: false, status: 0, detail: 'unreachable' };
      const f = this.files.get(audioId);
      if (!f || this.freed.has(audioId)) return { ok: false, status: 404, detail: 'not found' };
      if (from > f.bytes.length) return { ok: false, status: 416, detail: 'range' };
      const start = this.ignoreRange ? 0 : from;
      let data = f.bytes.subarray(start);
      if (this.corrupt.has(audioId)) {
        data = new Uint8Array(data);
        data[data.length >> 1] = data[data.length >> 1]! ^ 0xff;
      }
      const limit = this.dropAfter ?? Infinity;
      let hold = this.holdAfter ?? Infinity;
      this.dropAfter = null;
      this.holdAfter = null;
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        pull: async (c) => {
          if (signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
          if (sent >= data.length) return c.close();
          if (sent >= limit) {
            this.onDrop?.();
            return c.error(new TypeError('network error'));
          }
          if (sent >= hold) {
            await new Promise<void>((resolve) => {
              this.held = resolve;
              signal.addEventListener('abort', () => resolve(), { once: true });
            });
            if (signal.aborted) return c.error(new DOMException('Aborted', 'AbortError'));
            hold = Infinity;
          }
          const end = Math.min(data.length, sent + this.chunk, limit, hold);
          c.enqueue(data.slice(sent, end));
          sent = end;
        },
      });
      const value: AudioStream = { status: this.ignoreRange || from === 0 ? 200 : 206, start, total: f.bytes.length, body };
      return { ok: true, value };
    },
    cover: async () => null,
    checkDownloads: async (_id, have) =>
      this.gate('sync-check', () => {
        const upToDate: string[] = [];
        const newer: SyncCheck['newer'] = [];
        for (const h of have) {
          const old = this.files.get(h.audio_id);
          const cur = this.current.get(h.chapter_id);
          const now = cur ? this.files.get(cur) : undefined;
          if (!old || !now || now.id === old.id || now.seq < old.seq) {
            upToDate.push(h.chapter_id);
            continue;
          }
          newer.push({
            chapter_id: h.chapter_id,
            old_audio_id: old.id,
            new_audio: this.ref(now),
            changes: { voice_name: now.voiceName, old_voice_revision: old.revision, new_voice_revision: now.revision, old_duration_seconds: old.seconds, new_duration_seconds: now.seconds, old_bytes: old.bytes.length, new_bytes: now.bytes.length },
          });
        }
        return { up_to_date: upToDate, newer };
      }),
  };
}

export class FakeConnection implements ConnectionPort {
  k: ConnectionKind = 'wifi';
  line: boolean | null = true;
  private subs = new Set<() => void>();
  kind = () => this.k;
  onLine = () => this.line;
  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }
  set(kind: ConnectionKind, line: boolean | null = this.line): void {
    this.k = kind;
    this.line = line;
    for (const s of [...this.subs]) s();
  }
}

export class FakeEvents implements OfflineEvents {
  handlers: { listener: string; on: (n: Notice) => void; open?: () => void }[] = [];
  subscribe(listener: string, on: (n: Notice) => void, open?: () => void) {
    const h = { listener, on, open };
    this.handlers.push(h);
    return () => void (this.handlers = this.handlers.filter((x) => x !== h));
  }
  emit(type: string): void {
    for (const h of this.handlers) h.on({ type, at: '2026-01-01T00:00:00Z', book_id: BOOK });
  }
}

export function fakeStorage(init: { usage: number | null; quota: number | null; persisted?: boolean } = { usage: 1_000_000, quota: 10_000_000_000 }): StoragePort & { usage: number | null; quota: number | null; persisted_: boolean; persistCalls: number } {
  const s = {
    usage: init.usage,
    quota: init.quota,
    persisted_: init.persisted ?? false,
    persistCalls: 0,
    estimate: async () => ({ usage: s.usage, quota: s.quota }),
    persisted: async () => s.persisted_,
    persist: async () => {
      s.persistCalls++;
      s.persisted_ = true;
      return true;
    },
  };
  return s;
}

export function fakeUrls(): UrlPort & { live: Map<string, Blob> } {
  let n = 0;
  const live = new Map<string, Blob>();
  return {
    live,
    create: (b) => {
      const u = `blob:fake/${++n}`;
      live.set(u, b);
      return u;
    },
    revoke: (u) => void live.delete(u),
  };
}
