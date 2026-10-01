// What the player asks of the server, over the typed client. Every call names the listener it acts for (the
// app-wide listener header is only a default), and returns a result instead of throwing, so the rules in
// player.ts are tested with a fake of `PlayerApi`.
import { api } from '../api/client';
import type { components } from '../api/schema';
import { deviceId } from '../lib/device';
import { followEventStream } from '../lib/sse';

export type Book = components['schemas']['Book'];
export type Chapter = components['schemas']['Chapter'];
export type ChapterText = components['schemas']['ChapterText'];
export type Audiobook = components['schemas']['Audiobook'];
export type AudiobookChapter = components['schemas']['AudiobookChapter'];
export type AudioTimings = components['schemas']['AudioTimings'];
export type Job = components['schemas']['Job'];
export type ListenerSettings = components['schemas']['ListenerSettings'];
export type Notice = components['schemas']['Notice'];

export type R<T> = { ok: true; value: T } | { ok: false; status: number; code?: string; detail: string };

export type RequestResult = { kind: 'ready'; chapter: AudiobookChapter } | { kind: 'job'; job: Job };

export interface PlayerApi {
  book(listenerId: string, bookId: string): Promise<R<Book>>;
  chapters(bookId: string): Promise<R<Chapter[]>>;
  chapterText(bookId: string, chapterId: string): Promise<R<ChapterText>>;
  audiobooks(bookId: string): Promise<R<Audiobook[]>>;
  audioChapters(audiobookId: string): Promise<R<AudiobookChapter[]>>;
  timings(audioId: string): Promise<R<AudioTimings>>;
  /**
   * Make a chapter now. Free voices only: the player never calls this for a premium audiobook (the contract's
   * cost class for it is may_charge).
   */
  requestChapter(listenerId: string, audiobookId: string, chapterId: string, ahead: number): Promise<R<RequestResult>>;
  job(jobId: string): Promise<R<Job>>;
  settings(listenerId: string): Promise<R<ListenerSettings>>;
  setFinished(listenerId: string, bookId: string, finished: boolean): Promise<R<components['schemas']['Place']>>;
}

export const UNREACHABLE = 'Your Bardic computer could not be reached.';

const withDevice = (req: Request) => {
  req.headers.set('X-Bardic-Device', deviceId());
  return fetch(req);
};

async function call<T>(run: () => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<R<T>> {
  try {
    const r = await run();
    if (r.response.ok && r.data !== undefined) return { ok: true, value: r.data };
    const e = r.error as { code?: string; detail?: string } | undefined;
    return { ok: false, status: r.response.status, code: e?.code, detail: e?.detail ?? 'Something went wrong.' };
  } catch {
    return { ok: false, status: 0, detail: UNREACHABLE };
  }
}

const L = (l: string) => ({ 'X-Bardic-Listener': l });

export const apiPlayerApi: PlayerApi = {
  book: (l, id) => call(() => api.GET('/api/books/{book_id}', { params: { path: { book_id: id }, header: L(l) }, fetch: withDevice })),
  chapters: async (id) => {
    const r = await call(() => api.GET('/api/books/{book_id}/chapters', { params: { path: { book_id: id } }, fetch: withDevice }));
    return r.ok ? { ok: true, value: r.value.items } : r;
  },
  chapterText: (id, chapterId) => call(() => api.GET('/api/books/{book_id}/chapters/{chapter_id}/text', { params: { path: { book_id: id, chapter_id: chapterId } }, fetch: withDevice })),
  audiobooks: async (id) => {
    const r = await call(() => api.GET('/api/books/{book_id}/audiobooks', { params: { path: { book_id: id } }, fetch: withDevice }));
    return r.ok ? { ok: true, value: r.value.items } : r;
  },
  audioChapters: async (id) => {
    const r = await call(() => api.GET('/api/audiobooks/{audiobook_id}/chapters', { params: { path: { audiobook_id: id } }, fetch: withDevice }));
    return r.ok ? { ok: true, value: r.value.items } : r;
  },
  timings: (audioId) => call(() => api.GET('/api/audio/{audio_id}/timings', { params: { path: { audio_id: audioId } }, fetch: withDevice })),
  async requestChapter(l, audiobookId, chapterId, ahead) {
    try {
      const r = await api.POST('/api/audiobooks/{audiobook_id}/chapters/{chapter_id}/request', {
        params: { path: { audiobook_id: audiobookId, chapter_id: chapterId }, header: { 'X-Bardic-Listener': l, 'X-Bardic-Device': deviceId() } },
        body: { ahead },
        fetch: withDevice,
      });
      if (r.response.status === 200 && r.data) return { ok: true, value: { kind: 'ready', chapter: r.data as AudiobookChapter } };
      if (r.response.status === 202 && r.data) return { ok: true, value: { kind: 'job', job: r.data as Job } };
      const e = r.error as { code?: string; detail?: string } | undefined;
      return { ok: false, status: r.response.status, code: e?.code, detail: e?.detail ?? 'Something went wrong.' };
    } catch {
      return { ok: false, status: 0, detail: UNREACHABLE };
    }
  },
  job: (id) => call(() => api.GET('/api/jobs/{job_id}', { params: { path: { job_id: id } }, fetch: withDevice })),
  settings: (l) => call(() => api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: l } }, fetch: withDevice })),
  setFinished: (l, id, finished) =>
    call(() =>
      api.PUT('/api/books/{book_id}/place/finished', {
        params: { path: { book_id: id }, header: { 'X-Bardic-Listener': l, 'X-Bardic-Device': deviceId() } },
        body: { finished },
        fetch: withDevice,
      }),
    ),
};

// --------------------------------------------------------------------------- the event stream

export interface EventsPort {
  /** Follow change notices for a listener; returns the function that stops following. `onOpen` runs after each (re)connect. */
  subscribe(listenerId: string, onNotice: (n: Notice) => void, onOpen?: () => void): () => void;
}

export const sseEvents: EventsPort = {
  subscribe(listenerId, onNotice, onOpen) {
    const stop = new AbortController();
    void followEventStream({
      url: '/api/events',
      headers: () => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() }),
      signal: stop.signal,
      onopen: () => onOpen?.(),
      onmessage: (msg) => {
        try {
          const n = JSON.parse(msg.data) as Notice;
          if (n && typeof n.type === 'string') onNotice(n);
        } catch {
          /* not a notice */
        }
      },
    });
    return () => stop.abort();
  },
};
