// The offline engine's view of the server, over the typed client. Returns results instead of throwing; status 0 means
// the server could not be reached. Audio is read with a plain `fetch` and a Range header so the body can be streamed
// into the store as it arrives.
import { api } from '../api/client';
import { deviceId } from '../lib/device';
import type { OfflineApi, R } from './ports';

const UNREACHABLE = 'Your Bardic computer could not be reached.';

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

export const apiOffline: OfflineApi = {
  async ping() {
    try {
      return (await fetch('/api/health', { cache: 'no-store' })).ok;
    } catch {
      return false;
    }
  },
  audiobook: (id) => call(() => api.GET('/api/audiobooks/{audiobook_id}', { params: { path: { audiobook_id: id } }, fetch: withDevice })),
  manifest: (id) => call(() => api.GET('/api/audiobooks/{audiobook_id}/manifest', { params: { path: { audiobook_id: id } }, fetch: withDevice })),
  chapters: async (bookId) => {
    const r = await call(() => api.GET('/api/books/{book_id}/chapters', { params: { path: { book_id: bookId } }, fetch: withDevice }));
    return r.ok ? { ok: true, value: r.value.items } : r;
  },
  book: (listenerId, bookId) => call(() => api.GET('/api/books/{book_id}', { params: { path: { book_id: bookId }, header: { 'X-Bardic-Listener': listenerId } }, fetch: withDevice })),
  chapterText: (bookId, chapterId) => call(() => api.GET('/api/books/{book_id}/chapters/{chapter_id}/text', { params: { path: { book_id: bookId, chapter_id: chapterId } }, fetch: withDevice })),
  timings: (audioId) => call(() => api.GET('/api/audio/{audio_id}/timings', { params: { path: { audio_id: audioId } }, fetch: withDevice })),
  async audio(audioId, from, signal) {
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(audioId)}`, { headers: from > 0 ? { Range: `bytes=${from}-` } : {}, signal, cache: 'no-store' });
      if ((res.status !== 200 && res.status !== 206) || !res.body) return { ok: false, status: res.status, detail: 'The audio could not be read.' };
      let start = 0;
      let total: number | null = null;
      const cr = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get('Content-Range') ?? '');
      if (res.status === 206 && cr) {
        start = Number(cr[1]);
        total = cr[3] === '*' ? null : Number(cr[3]);
      } else if (res.status === 206) {
        start = from;
      } else {
        const len = Number(res.headers.get('Content-Length'));
        total = Number.isFinite(len) && len > 0 ? len : null;
      }
      return { ok: true, value: { status: res.status, start, total, body: res.body } };
    } catch {
      return { ok: false, status: 0, detail: UNREACHABLE };
    }
  },
  async cover(url) {
    try {
      const res = await fetch(url);
      return res.ok ? await res.blob() : null;
    } catch {
      return null;
    }
  },
  checkDownloads: (id, have) => call(() => api.POST('/api/audiobooks/{audiobook_id}/sync-check', { params: { path: { audiobook_id: id }, header: { 'X-Bardic-Device': deviceId() } }, body: { have }, fetch: withDevice })),
};
