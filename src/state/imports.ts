// Adding a book (A2 to A4): choose a file, check it against the library, upload it, follow the server's
// stages, and say what went wrong in the words of the `Import` board.
//
// Everything that decides something is a plain function here (fingerprint, duplicate decision, state
// reducer, error copy, progress), so it is unit tested. The `ImportController` joins them to the network
// through `ImportDeps`; `realImportDeps` is the one that talks to the server.
import { get, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { deviceId } from '../lib/device';
import { formatBytes } from '../lib/bytes';

export type ServerImport = components['schemas']['Import'];
export type DuplicateBooks = components['schemas']['DuplicateBooks'];
export type DuplicateBook = components['schemas']['DuplicateBook'];
export type ApiError = components['schemas']['Error'];

// --------------------------------------------------------------------------- the file

export interface FileInfo {
  name: string;
  size: number;
  /** "EPUB" or "Text" */
  kind: 'EPUB' | 'Text';
}

/** The default limit the board quotes; the server's `max_upload_bytes` replaces it when known. */
export const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

export function fileKind(name: string, type = ''): FileInfo['kind'] | null {
  const n = name.toLowerCase();
  if (n.endsWith('.epub') || type === 'application/epub+zip') return 'EPUB';
  if (n.endsWith('.txt') || type === 'text/plain') return 'Text';
  return null;
}

export function describeFile(file: Pick<File, 'name' | 'size' | 'type'>): FileInfo {
  return { name: file.name, size: file.size, kind: fileKind(file.name, file.type) ?? 'Text' };
}

/** A problem with the file that can be told before anything is uploaded; null when it looks fine. */
export function validateFile(file: Pick<File, 'name' | 'size' | 'type'>, maxBytes = DEFAULT_MAX_BYTES): string | null {
  if (fileKind(file.name, file.type) === null) return 'import_unsupported_type';
  if (file.size === 0) return 'import_no_text';
  if (file.size > maxBytes) return 'import_too_large';
  return null;
}

/** "30 MB" as the board says it (binary megabytes, like the server's limit). */
export function limitLabel(maxBytes = DEFAULT_MAX_BYTES): string {
  return `${Math.round(maxBytes / (1024 * 1024))} MB`;
}

/** Lowercase hex SHA-256 of the file: the fingerprint the duplicate check sends (A3). */
export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------------------------------- duplicate decision

export type DuplicateDecision =
  | { kind: 'upload' }
  /** `open`: the book is in the library. `restore`: it was removed and can be brought back. */
  | { kind: 'duplicate'; existing: DuplicateBook; action: 'open' | 'restore' };

/**
 * Only an exact match (the same file) stops the add (A3, acceptance test A3). A book with the same title
 * but a different file is listed under `similar` and never warns. A book being deleted cannot be opened
 * or restored, so it does not count.
 */
export function decideAfterCheck(res: Pick<DuplicateBooks, 'exact'>): DuplicateDecision {
  const usable = res.exact.filter((b) => b.state !== 'deleting');
  const live = usable.filter((b) => b.state !== 'removed');
  const pick = (list: DuplicateBook[]) => [...list].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))[0];
  const existing = pick(live) ?? pick(usable);
  if (!existing) return { kind: 'upload' };
  return { kind: 'duplicate', existing, action: existing.state === 'removed' ? 'restore' : 'open' };
}

/** "Added 12 March" plus " · 34% listened" when the listener has started it. */
export function existingDetail(addedAt: string, progress?: number | null, locale = 'en-GB'): string {
  const d = new Date(addedAt);
  const date = Number.isNaN(d.getTime()) ? '' : `Added ${d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}`;
  const pct = progress !== undefined && progress !== null && progress > 0 ? `${Math.round(progress * 100)}% listened` : '';
  return [date, pct].filter(Boolean).join(' · ');
}

// --------------------------------------------------------------------------- the words

export interface ErrorCopy {
  title: string;
  body: string;
  /** "You can" list; empty for a plain retry. */
  can: string[];
  /** The primary button. */
  action: string;
}

const CHOOSE_ANOTHER = 'Choose another file';

/** The exact copy of the `Import` board for DRM; the rest follow its pattern (what is kept first, then what you can do). */
export function importErrorCopy(code: string | undefined, maxBytes = DEFAULT_MAX_BYTES): ErrorCopy {
  switch (code) {
    case 'import_drm_protected':
      return {
        title: 'This EPUB is protected',
        body: 'Bardic can’t open books with DRM.',
        can: ['Choose an EPUB without DRM', 'Choose a plain text (.txt) copy', 'Buy a DRM-free edition from the publisher'],
        action: CHOOSE_ANOTHER,
      };
    case 'import_unreadable':
      return {
        title: 'This file can’t be read',
        body: 'It may be damaged or not really an EPUB or text file. Nothing was added to your library.',
        can: ['Download the file again', 'Choose a different copy of the book'],
        action: CHOOSE_ANOTHER,
      };
    case 'import_unsupported_encoding':
      return {
        title: 'This text isn’t UTF-8',
        body: 'Bardic keeps words exactly as written, so it needs UTF-8 text. Nothing was added to your library.',
        can: ['Save the file as UTF-8 text and choose it again', 'Choose an EPUB instead'],
        action: CHOOSE_ANOTHER,
      };
    case 'import_no_text':
      return {
        title: 'There is no text in this file',
        body: 'Bardic found nothing to read or listen to. Nothing was added to your library.',
        can: ['Choose a different copy of the book', 'Choose a plain text (.txt) copy'],
        action: CHOOSE_ANOTHER,
      };
    case 'import_too_large':
      return {
        title: 'This file is too large',
        body: `Files can be up to ${limitLabel(maxBytes)}. Nothing was added to your library.`,
        can: ['Choose a smaller file', 'Choose a plain text (.txt) copy, which is usually smaller'],
        action: CHOOSE_ANOTHER,
      };
    case 'import_unsupported_type':
      return {
        title: 'Bardic can’t add this kind of file',
        body: 'Choose a DRM-free EPUB or a UTF-8 text file (.txt).',
        can: [],
        action: CHOOSE_ANOTHER,
      };
    case 'import_network':
      return {
        title: 'Couldn’t reach your Bardic computer',
        body: 'Nothing was added to your library. Check that it is on and try again.',
        can: [],
        action: 'Try again',
      };
    default:
      return {
        title: 'Couldn’t add this book',
        body: 'Something went wrong on your Bardic computer. Nothing was added to your library.',
        can: [],
        action: 'Try again',
      };
  }
}

// --------------------------------------------------------------------------- stages and progress

export type ImportStage = 'reading' | 'finding_chapters' | 'preparing_text';

export const STAGES: { id: ImportStage; label: string }[] = [
  { id: 'reading', label: 'Reading the file' },
  { id: 'finding_chapters', label: 'Finding chapters' },
  { id: 'preparing_text', label: 'Preparing the text' },
];

export type StepState = 'done' | 'active' | 'pending';

export function stepStates(stage: ImportStage): { id: ImportStage; label: string; state: StepState }[] {
  const at = STAGES.findIndex((s) => s.id === stage);
  return STAGES.map((s, i) => ({ ...s, state: i < at ? 'done' : i === at ? 'active' : 'pending' }));
}

/** The server state as a stage; `queued` counts as reading. Null for the end states. */
export function stageOf(state: ServerImport['state']): ImportStage | null {
  switch (state) {
    case 'queued':
    case 'reading':
      return 'reading';
    case 'finding_chapters':
      return 'finding_chapters';
    case 'preparing_text':
      return 'preparing_text';
    default:
      return null;
  }
}

/** Without a figure from the server a stage stands for this much of the whole. */
const STAGE_FLOOR: Record<ImportStage, number> = { reading: 0.3, finding_chapters: 0.55, preparing_text: 0.8 };
const UPLOAD_SHARE = 0.3;

/**
 * One bar for the whole add. The upload is the first 30%; the server's own progress (or, when it gives
 * none, the stage it is in) fills the rest. It never goes backwards and never reaches 1 before done.
 */
export function overallProgress(p: { stage: ImportStage; uploaded: number; serverProgress?: number | null; uploading: boolean }): number {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  if (p.uploading) return clamp(p.uploaded) * UPLOAD_SHARE;
  const floor = STAGE_FLOOR[p.stage];
  const fromServer = p.serverProgress === undefined || p.serverProgress === null ? floor : UPLOAD_SHARE + clamp(p.serverProgress) * (1 - UPLOAD_SHARE);
  return Math.min(0.99, Math.max(floor, fromServer));
}

// --------------------------------------------------------------------------- the state machine

export type ImportState =
  | { kind: 'closed' }
  | { kind: 'choose' }
  | { kind: 'chosen'; file: FileInfo }
  | { kind: 'checking'; file: FileInfo }
  | { kind: 'duplicate'; file: FileInfo; existing: DuplicateBook; action: 'open' | 'restore'; detail: string }
  | { kind: 'adding'; file: FileInfo; stage: ImportStage; uploading: boolean; uploaded: number; progress: number; importId?: string }
  | { kind: 'failed'; file?: FileInfo; code: string; copy: ErrorCopy }
  | { kind: 'done'; file: FileInfo; bookId: string | null };

export type ImportAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'pick'; file: FileInfo }
  | { type: 'remove' }
  | { type: 'check' }
  | { type: 'duplicate'; existing: DuplicateBook; action: 'open' | 'restore'; detail: string }
  | { type: 'start-upload' }
  | { type: 'uploaded'; fraction: number }
  | { type: 'server'; import: ServerImport }
  | { type: 'fail'; code: string; maxBytes?: number }
  | { type: 'reset-to-choose' };

export const CLOSED: ImportState = { kind: 'closed' };

function fileOf(s: ImportState): FileInfo | undefined {
  return 'file' in s ? s.file : undefined;
}

export function importReducer(s: ImportState, a: ImportAction): ImportState {
  switch (a.type) {
    case 'open':
      return s.kind === 'closed' || s.kind === 'done' ? { kind: 'choose' } : s;
    case 'close':
      return CLOSED;
    case 'reset-to-choose':
      return { kind: 'choose' };
    case 'pick':
      return s.kind === 'choose' || s.kind === 'chosen' || s.kind === 'failed' ? { kind: 'chosen', file: a.file } : s;
    case 'remove':
      return s.kind === 'chosen' ? { kind: 'choose' } : s;
    case 'check': {
      const file = fileOf(s);
      return file && (s.kind === 'chosen' || s.kind === 'duplicate') ? { kind: 'checking', file } : s;
    }
    case 'duplicate':
      return s.kind === 'checking' ? { kind: 'duplicate', file: s.file, existing: a.existing, action: a.action, detail: a.detail } : s;
    case 'start-upload': {
      const file = fileOf(s);
      if (!file || !(s.kind === 'checking' || s.kind === 'chosen' || s.kind === 'duplicate')) return s;
      return { kind: 'adding', file, stage: 'reading', uploading: true, uploaded: 0, progress: 0 };
    }
    case 'uploaded':
      if (s.kind !== 'adding' || !s.uploading) return s;
      return { ...s, uploaded: a.fraction, progress: Math.max(s.progress, overallProgress({ stage: 'reading', uploaded: a.fraction, uploading: true })) };
    case 'server': {
      if (s.kind !== 'adding') return s;
      const imp = a.import;
      if (imp.state === 'done') return { kind: 'done', file: s.file, bookId: imp.book_id };
      if (imp.state === 'cancelled') return CLOSED;
      if (imp.state === 'failed') {
        const code = imp.error?.code ?? 'import_failed';
        return { kind: 'failed', file: s.file, code, copy: importErrorCopy(code) };
      }
      const stage = stageOf(imp.state) ?? s.stage;
      const progress = Math.max(s.progress, overallProgress({ stage, uploaded: 1, serverProgress: imp.progress, uploading: false }));
      return { ...s, stage, uploading: false, uploaded: 1, progress, importId: imp.id };
    }
    case 'fail':
      return { kind: 'failed', file: fileOf(s), code: a.code, copy: importErrorCopy(a.code, a.maxBytes) };
  }
}

// --------------------------------------------------------------------------- talking to the server

export interface UploadResult {
  import?: ServerImport;
  error?: ApiError;
  status: number;
}

export interface ImportDeps {
  maxBytes(): number | undefined;
  sha256(file: Blob): Promise<string>;
  findDuplicates(sha256: string): Promise<DuplicateBooks>;
  /** Detail line for the duplicate sheet; may call the server for the listener's progress. */
  describeExisting(existing: DuplicateBook): Promise<string>;
  upload(file: File, opts: { onProgress: (fraction: number) => void; signal: AbortSignal; key: string }): Promise<UploadResult>;
  getImport(id: string): Promise<ServerImport>;
  cancelImport(id: string): Promise<void>;
  restoreBook(id: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  newKey(): string;
}

/** The polling interval while an import runs. */
export const POLL_MS = 600;

/**
 * Runs one add at a time. State is a store the sheet renders; the `File` itself stays here (it is not state).
 */
export class ImportController {
  private readonly store = writable<ImportState>(CLOSED);
  readonly subscribe: Readable<ImportState>['subscribe'] = this.store.subscribe;
  private file: File | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  /** Called once when a book has been added or restored, so lists can refresh. */
  onbookchanged?: (bookId: string | null) => void;

  constructor(private readonly deps: ImportDeps) {}

  get state(): ImportState {
    return get(this.store);
  }
  private dispatch(a: ImportAction): void {
    this.store.update((s) => importReducer(s, a));
  }

  open(): void {
    this.dispatch({ type: 'open' });
  }

  /** Close the sheet. An add in progress is cancelled: a failed or cancelled add leaves no book (A4). */
  close(): void {
    void this.cancel();
  }

  pick(file: File): void {
    if (this.state.kind === 'closed') this.dispatch({ type: 'open' });
    const code = validateFile(file, this.deps.maxBytes());
    this.file = file;
    this.dispatch({ type: 'pick', file: describeFile(file) });
    if (code === 'import_unsupported_type' || code === 'import_too_large') {
      this.dispatch({ type: 'fail', code, maxBytes: this.deps.maxBytes() });
    }
  }

  remove(): void {
    this.file = null;
    this.dispatch({ type: 'remove' });
  }

  /** "Choose another file" after a failure. */
  again(): void {
    this.file = null;
    this.dispatch({ type: 'reset-to-choose' });
  }

  /** Retry the same file after a failure that was not the file's fault. */
  retry(): void {
    const s = this.state;
    if (s.kind === 'failed' && this.file) {
      this.dispatch({ type: 'pick', file: describeFile(this.file) });
      void this.add();
    }
  }

  /** Add: check the library first (A3), then upload. `force` skips the check ("Add another copy"). */
  async add(force = false): Promise<void> {
    const file = this.file;
    const s = this.state;
    if (!file || !(s.kind === 'chosen' || s.kind === 'duplicate')) return;
    const gen = ++this.generation;
    const alive = () => gen === this.generation;
    const maxBytes = this.deps.maxBytes();
    const bad = validateFile(file, maxBytes);
    if (bad) {
      this.dispatch({ type: 'fail', code: bad, maxBytes });
      return;
    }
    try {
      if (!force) {
        this.dispatch({ type: 'check' });
        const sha = await this.deps.sha256(file);
        if (!alive()) return;
        const res = await this.deps.findDuplicates(sha);
        if (!alive()) return;
        const decision = decideAfterCheck(res);
        if (decision.kind === 'duplicate') {
          const detail = await this.deps.describeExisting(decision.existing);
          if (!alive()) return;
          this.dispatch({ type: 'duplicate', existing: decision.existing, action: decision.action, detail });
          return;
        }
      } else if (this.state.kind === 'duplicate') {
        this.dispatch({ type: 'check' });
      }
      this.dispatch({ type: 'start-upload' });
      await this.run(file, gen);
    } catch {
      if (alive()) this.dispatch({ type: 'fail', code: 'import_network' });
    }
  }

  private async run(file: File, gen: number): Promise<void> {
    const alive = () => gen === this.generation;
    const ctl = new AbortController();
    this.abort = ctl;
    const res = await this.deps.upload(file, {
      key: this.deps.newKey(),
      signal: ctl.signal,
      onProgress: (f) => alive() && this.dispatch({ type: 'uploaded', fraction: f }),
    });
    if (!alive()) return;
    if (!res.import) {
      this.dispatch({ type: 'fail', code: res.error?.code ?? 'import_network', maxBytes: this.deps.maxBytes() });
      return;
    }
    let imp = res.import;
    this.dispatch({ type: 'server', import: imp });
    while (alive() && !['done', 'failed', 'cancelled'].includes(imp.state)) {
      await this.deps.sleep(POLL_MS);
      if (!alive()) return;
      try {
        imp = await this.deps.getImport(imp.id);
      } catch {
        continue; // a blip while polling; the server keeps working
      }
      if (!alive()) return;
      this.dispatch({ type: 'server', import: imp });
    }
    if (alive() && imp.state === 'done') this.onbookchanged?.(imp.book_id);
  }

  /** Cancel whatever is running and close the sheet. */
  async cancel(): Promise<void> {
    const s = this.state;
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.file = null;
    this.dispatch({ type: 'close' });
    if (s.kind === 'adding' && s.importId) {
      try {
        await this.deps.cancelImport(s.importId);
      } catch {
        /* nothing to undo: a failed add leaves no book */
      }
    }
  }

  /** Duplicate sheet: restore a removed book instead of adding it again. */
  async restoreExisting(): Promise<string | null> {
    const s = this.state;
    if (s.kind !== 'duplicate') return null;
    const id = s.existing.book_id;
    try {
      await this.deps.restoreBook(id);
    } catch {
      this.dispatch({ type: 'fail', code: 'import_network' });
      return null;
    }
    this.onbookchanged?.(id);
    this.generation++;
    this.file = null;
    this.dispatch({ type: 'close' });
    return id;
  }

  /** Reset after the "added" state has been shown. */
  finish(): void {
    this.generation++;
    this.file = null;
    this.dispatch({ type: 'close' });
  }
}

// --------------------------------------------------------------------------- the real thing

let serverMax: number | undefined;

export const serverLimit = (): number | undefined => serverMax;

export async function loadServerLimits(): Promise<void> {
  const { data } = await api.GET('/api/server');
  serverMax = data?.max_upload_bytes;
}

function postImport(file: File, opts: { onProgress: (f: number) => void; signal: AbortSignal; key: string }): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/imports');
    xhr.setRequestHeader('X-Bardic-Device', deviceId());
    xhr.setRequestHeader('Idempotency-Key', opts.key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* no body */
      }
      if (xhr.status === 202 && body) resolve({ status: 202, import: body as ServerImport });
      else resolve({ status: xhr.status, error: (body as ApiError) ?? { code: 'import_failed', detail: 'Unexpected response' } });
    };
    xhr.onerror = () => resolve({ status: 0, error: { code: 'import_network', detail: 'Network error' } });
    xhr.onabort = () => resolve({ status: 0, error: { code: 'cancelled', detail: 'Cancelled' } });
    opts.signal.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

export const realImportDeps = (listenerId: () => string | undefined): ImportDeps => ({
  maxBytes: () => serverMax,
  sha256: (f) => sha256Hex(f),
  async findDuplicates(sha256) {
    const { data, error } = await api.GET('/api/books/duplicates', { params: { query: { sha256 } } });
    if (!data) throw new Error(error?.detail ?? 'duplicate check failed');
    return data;
  },
  async describeExisting(existing) {
    const id = listenerId();
    let progress: number | null | undefined;
    if (id) {
      const { data } = await api.GET('/api/books/{book_id}', { params: { path: { book_id: existing.book_id }, header: { 'X-Bardic-Listener': id } } });
      progress = data?.place?.progress;
    }
    return existingDetail(existing.added_at, progress);
  },
  upload: postImport,
  async getImport(id) {
    const { data, error } = await api.GET('/api/imports/{import_id}', { params: { path: { import_id: id } } });
    if (!data) throw new Error(error?.detail ?? 'import not found');
    return data;
  },
  async cancelImport(id) {
    await api.DELETE('/api/imports/{import_id}', { params: { path: { import_id: id }, header: { 'X-Bardic-Device': deviceId() } } });
  },
  async restoreBook(id) {
    const lid = listenerId();
    const { error } = await api.POST('/api/books/{book_id}/restore', {
      params: { path: { book_id: id }, header: { 'X-Bardic-Device': deviceId(), ...(lid ? { 'X-Bardic-Listener': lid } : {}) } },
    });
    if (error) throw new Error(error.detail);
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  newKey: () => crypto.randomUUID(),
});

/** Helper for views: "2.4 MB · EPUB". */
export function fileLine(f: FileInfo): string {
  return `${formatBytes(f.size)} · ${f.kind === 'EPUB' ? 'EPUB' : 'Text'}`;
}
