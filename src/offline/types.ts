// The contract between the offline engine (src/offline/**) and the offline screens (src/views/offline/**).
// The engine keeps what this device holds and produces an OfflineState; the screens are presentational
// components of (a slice of) OfflineState plus callbacks, so the design boards render them from fixtures.
// Nothing here touches the network or the DOM. Unknown is unknown: a size or free space the browser cannot
// state is `null`, never 0.

/** The audio words of the UI guide, as they apply on a device. */
export type DeviceChapterState =
  | 'not_downloaded' // Ready on the server, not on this device
  | 'queued'
  | 'downloading'
  | 'on_device' // "On this device"
  | 'failed' // "Couldn't download"
  | 'out_of_date'; // "Out of date": the server has newer audio

export interface DeviceChapter {
  chapterId: string;
  index: number;
  title: string;
  /** Display classification from cached chapter metadata; older device records may omit it. */
  kind?: 'story' | 'front_matter' | 'back_matter';
  state: DeviceChapterState;
  /** size of the audio on the server (manifest) */
  bytes: number | null;
  /** 0 to 1 while downloading */
  progress: number | null;
  /** why it failed, in words that begin with what is kept ("The other chapters are kept. ...") */
  error: string | null;
}

export type DownloadStatus =
  | 'idle' // nothing running
  | 'running'
  | 'paused' // by the listener
  | 'waiting_wifi' // Wi-Fi only is on and the connection is not Wi-Fi (or unknown)
  | 'device_full' // stopped: the device has no room; what finished is kept
  | 'offline'; // the Bardic computer cannot be reached; resumes by itself

export interface DownloadedBook {
  bookId: string;
  audiobookId: string;
  title: string;
  author: string;
  coverColor: string;
  coverSrc?: string;
  voiceName: string;
  chapters: DeviceChapter[];
  status: DownloadStatus;
  /** bytes held on this device for this audiobook */
  heldBytes: number;
  /** bytes still to download for the chapters asked for; null when unknown */
  remainingBytes: number | null;
  wifiOnly: boolean;
  /** keep downloading new chapters as they are made */
  keepNew: boolean;
  /** epoch ms of the last time the chapter list was checked against the server; null if never */
  checkedAt: number | null;
}

export interface StorageInfo {
  /** bytes this app uses on this device (audio, text, timings); null if the browser cannot say */
  usedBytes: number | null;
  /** bytes the browser will still let this app store; null if it cannot say (never shown as 0) */
  freeBytes: number | null;
  /** the browser promised not to evict our data (navigator.storage.persist) */
  persisted: boolean;
  /** the connection is known to be Wi-Fi/ethernet; null when the browser cannot say */
  unmetered: boolean | null;
}

export interface AudioFacts {
  voiceName: string;
  /** voice revision, short form */
  revision: string;
  seconds: number | null;
  bytes: number | null;
  /** epoch ms the audio was made */
  madeAt: number | null;
}

/** The server has newer audio for a chapter the device holds (D6, O6). Nothing is replaced without a choice. */
export interface UpdateOffer {
  audiobookId: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  held: AudioFacts;
  newer: AudioFacts;
}

/** A downloaded book that has since been removed from the library (O8): offered for removal. */
export interface RemovedDownload {
  bookId: string;
  audiobookId: string;
  title: string;
  heldBytes: number;
}

export interface OfflineState {
  /** the Bardic computer was reachable on the last attempt */
  online: boolean;
  /** epoch ms of the last successful contact; null if never */
  lastContact: number | null;
  storage: StorageInfo;
  books: DownloadedBook[];
  updates: UpdateOffer[];
  removedBooks: RemovedDownload[];
  /** device rule: remove finished books after N days; null = off (the default) */
  removeFinishedAfterDays: number | null;
}

export type DownloadScope =
  | { kind: 'ready_now' } // everything ready at this moment
  | { kind: 'whole_book' } // what is ready now and the rest as it is made (implies keepNew)
  | { kind: 'chapters'; chapterIds: string[] };

/** Server chapter metadata after a successful metadata-only refresh. */
export interface ChapterMetadata {
  id: string;
  title: string;
  kind: 'story' | 'front_matter' | 'back_matter';
}

export interface OfflineCommands {
  /** the numbers the Download sheet shows before anything starts: size, chapters, free space (nothing is downloaded) */
  preview(audiobookId: string, scope: DownloadScope): Promise<DownloadPreview>;
  start(audiobookId: string, scope: DownloadScope, opts: { wifiOnly: boolean; keepNew: boolean }): Promise<void>;
  pause(audiobookId: string): void;
  resume(audiobookId: string): void;
  /** stop and forget the queue; chapters that finished stay */
  cancel(audiobookId: string): void;
  retry(audiobookId: string, chapterId?: string): void;
  setOptions(audiobookId: string, opts: Partial<{ wifiOnly: boolean; keepNew: boolean }>): void;
  /** remove from this device only; never touches the server */
  remove(audiobookId: string, chapterIds?: string[]): Promise<void>;
  /** compare what is held with the server (checkDownloads); produces `updates` */
  checkUpdates(audiobookId?: string): Promise<void>;
  /** replace the listed chapters with the newer audio (the listener chose) */
  applyUpdate(audiobookId: string, chapterIds: string[]): Promise<void>;
  /** keep the copies held; stop offering these chapters until the server changes again */
  keepOld(audiobookId: string, chapterIds: string[]): void;
  /** Reconcile refreshed names/kinds when the complete ordered chapter IDs match; held content/audio stay intact. */
  updateChapterMetadata(bookId: string, chapters: readonly ChapterMetadata[]): Promise<void>;
  setRemoveFinishedAfterDays(days: number | null): void;
  /** re-read the server (online state, removed books) */
  refresh(): Promise<void>;
}

export interface DownloadPreview {
  chaptersToGet: number;
  /** bytes to download; null if the manifest could not be read */
  bytes: number | null;
  freeBytes: number | null;
  /** false when bytes is known and freeBytes is known and bytes does not fit */
  fits: boolean | null;
  /** chapters of the scope not ready on the server yet (they come as they are made when keepNew) */
  notReadyYet: number;
}

/**
 * Held audio the player can use without the server: a URL that works offline (blob/object URL or a
 * Cache Storage URL served by the service worker), plus the chapter's text and timings.
 */
export interface HeldChapter {
  audioUrl: string;
  text: string;
  lines: { id: string; start: number; end: number }[];
  timings: { lineId: string; startMs: number; endMs: number }[];
  durationSeconds: number | null;
}

// ---------------------------------------------------------------------------------------------------------
// Additions by the offline engine (src/offline/**). Nothing above this line changed.

/**
 * A downloaded book as the engine really produces it: a `DownloadedBook` plus one line saying what is going on,
 * in words that begin with what is kept ("What finished is kept. Wi-Fi only is on ..."). null when there is nothing to say.
 */
export interface OfflineBook extends DownloadedBook {
  message: string | null;
}

/** The engine's state: `OfflineState` with `books` carrying the message line. Assignable to `OfflineState`. */
export interface OfflineStateX extends OfflineState {
  books: OfflineBook[];
  /** the last command that could not do what was asked, in words that begin with what is kept; null when there is none */
  notice: string | null;
}

/** What a verify run found (the engine runs one on open). */
export interface VerifyReport {
  checked: number;
  /** chapters whose copy was damaged and is no longer served; they show as "Couldn't download" until fetched again */
  damaged: { audiobookId: string; chapterId: string; reason: string }[];
}

/**
 * What the device remembers about a downloaded book, enough for the player to open it with no server: the book, the
 * voice name and the chapters in order with their kind (front and back matter are skipped by "next").
 */
export interface HeldBookInfo {
  bookId: string;
  audiobookId: string;
  title: string;
  author: string;
  coverColor: string;
  coverSrc?: string;
  voiceName: string;
  chapters: { id: string; index: number; title: string; kind: 'story' | 'front_matter' | 'back_matter' }[];
}
