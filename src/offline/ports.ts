// What the offline engine needs from the outside world, as small interfaces, so every rule runs against fakes.
import type { components } from '../api/schema';

export type Manifest = components['schemas']['Manifest'];
export type ManifestChapter = Manifest['chapters'][number];
export type AudioRef = components['schemas']['AudioRef'];
export type Audiobook = components['schemas']['Audiobook'];
export type Book = components['schemas']['Book'];
export type BookChapter = components['schemas']['Chapter'];
export type ChapterText = components['schemas']['ChapterText'];
export type AudioTimings = components['schemas']['AudioTimings'];
export type SyncCheck = components['schemas']['SyncCheck'];
export type Notice = components['schemas']['Notice'];

/** status 0 means the server could not be reached at all (no response). */
export type R<T> = { ok: true; value: T } | { ok: false; status: number; code?: string; detail: string };

export interface AudioStream {
  /** 200 (whole file) or 206 (from the requested byte) */
  status: number;
  /** where this body starts in the file (0 for a 200) */
  start: number;
  /** size of the whole file when the server said */
  total: number | null;
  body: ReadableStream<Uint8Array>;
}

export interface OfflineApi {
  /** true when the server answers */
  ping(): Promise<boolean>;
  audiobook(audiobookId: string): Promise<R<Audiobook>>;
  manifest(audiobookId: string): Promise<R<Manifest>>;
  chapters(bookId: string): Promise<R<BookChapter[]>>;
  /** 404 means the server does not know the book (gone) */
  book(listenerId: string, bookId: string): Promise<R<Book>>;
  chapterText(bookId: string, chapterId: string): Promise<R<ChapterText>>;
  timings(audioId: string): Promise<R<AudioTimings>>;
  /** audio from byte `from` (Range); aborting `signal` stops the body */
  audio(audioId: string, from: number, signal: AbortSignal): Promise<R<AudioStream>>;
  /** a cover image, best effort */
  cover(url: string): Promise<Blob | null>;
  checkDownloads(audiobookId: string, have: { chapter_id: string; audio_id: string }[]): Promise<R<SyncCheck>>;
}

export type ConnectionKind = 'wifi' | 'ethernet' | 'cellular' | 'unknown';

export interface ConnectionPort {
  /** what the browser says the connection is; 'unknown' when it cannot say (never guessed) */
  kind(): ConnectionKind;
  /** the browser's own idea of "no network" (navigator.onLine); null if it has none */
  onLine(): boolean | null;
  /** called when the kind or onLine changes; returns the function that stops listening */
  subscribe(fn: () => void): () => void;
}

export interface StoragePort {
  /** null for anything the browser cannot say */
  estimate(): Promise<{ usage: number | null; quota: number | null }>;
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

export interface UrlPort {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface OfflineEvents {
  /** follow change notices for a listener; returns the function that stops. `onOpen` runs after each (re)connect. */
  subscribe(listenerId: string, onNotice: (n: Notice) => void, onOpen?: () => void): () => void;
}
