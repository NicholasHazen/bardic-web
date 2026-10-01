// Getting one chapter onto the device: text and timings, then the audio by HTTP Range into the store, then the
// checks, and only then the commit that makes it "On this device". Used for a new download and for an update.
import { sha256Blob, sha256Text } from '../lib/sha256';
import type { Clock } from '../lib/clock';
import type { AudioRef, OfflineApi } from './ports';
import { isQuotaError, type ChapterContent, type ChapterRecord, type OfflineStore } from './store';

export type FetchFailure = 'aborted' | 'network' | 'quota' | 'mismatch' | 'missing' | 'server' | 'store';

export class FetchError extends Error {
  constructor(
    readonly kind: FetchFailure,
    message: string,
    /** bytes of this chapter's audio still stored, so the words can say they are kept */
    readonly keptBytes = 0,
  ) {
    super(message);
  }
}

export interface ChapterTarget {
  audiobookId: string;
  bookId: string;
  chapterId: string;
  audio: AudioRef;
  textSha256: string;
  voiceName: string;
}

export interface FetchContext {
  api: OfflineApi;
  store: OfflineStore;
  clock: Clock;
  signal: AbortSignal;
  /** bytes of the audio held so far (stored plus buffered) and the total */
  onProgress?: (received: number, total: number) => void;
  /** no data for this long counts as a dropped connection */
  idleMs?: number;
  /** size of the blocks written as the audio arrives (default 1 MiB) */
  partBytes?: number;
}

/** Parts are written as ~1 MiB blocks as they arrive, so a pause or a drop keeps what came. */
export const PART_BYTES = 1024 * 1024;

const toNetwork = (what: string, status: number) => (status === 0 ? new FetchError('network', `${what}: the Bardic computer could not be reached.`) : status >= 500 ? new FetchError('server', `${what}: the server had a problem (${status}).`) : null);

export async function fetchChapter(ctx: FetchContext, t: ChapterTarget): Promise<ChapterRecord> {
  const { api, store, signal } = ctx;
  const aborted = () => new FetchError('aborted', 'Stopped.');
  if (signal.aborted) throw aborted();

  // 1. text, lines and timings: small, and a failure here costs nothing
  const [text, timings] = await Promise.all([api.chapterText(t.bookId, t.chapterId), api.timings(t.audio.id)]);
  if (!text.ok) throw toNetwork('The text', text.status) ?? new FetchError(text.status === 404 ? 'missing' : 'server', `The text is not available (${text.status}).`);
  if (!timings.ok) throw toNetwork('The timings', timings.status) ?? new FetchError(timings.status === 404 ? 'missing' : 'server', `The timings are not available (${timings.status}).`);
  if (signal.aborted) throw aborted();
  const textHash = sha256Text(text.value.text);
  if (textHash !== t.textSha256 || textHash !== text.value.text_sha256) throw new FetchError('mismatch', 'The text did not match what the server said it should be.');
  const content: ChapterContent = { text: text.value.text, lines: text.value.lines, timings: timings.value.lines };

  // 2. the audio, resuming from the bytes already stored
  let { bytes: have, parts } = await store.partial(t.audio.id);
  if (have > t.audio.bytes) {
    await store.dropAudio(t.audio.id);
    have = 0;
    parts = 0;
  }
  let restarts = 0;
  while (have < t.audio.bytes) {
    const res = await api.audio(t.audio.id, have, signal);
    if (!res.ok) {
      if (signal.aborted) throw aborted();
      if (res.status === 416 && restarts++ < 1) {
        await store.dropAudio(t.audio.id);
        have = 0;
        parts = 0;
        continue;
      }
      throw toNetwork('The audio', res.status) ?? new FetchError(res.status === 404 ? 'missing' : 'server', `The audio is not available (${res.status}).`, have);
    }
    if (res.value.start !== have) {
      if (res.value.start === 0 && res.value.status === 200) {
        // the server answered the whole file to a Range request: the stored bytes are of no use, start over with this body
        await store.dropAudio(t.audio.id);
        have = 0;
        parts = 0;
      } else {
        void res.value.body.cancel().catch(() => {});
        throw new FetchError('server', 'The server sent a different part of the audio than asked for.', have);
      }
    }
    ({ have, parts } = await readBody(ctx, t, res.value.body, have, parts));
    if (have < t.audio.bytes) {
      if (signal.aborted) throw aborted();
      // the stream ended early: the bytes are kept, the next try continues from here
      throw new FetchError('network', 'The connection dropped part way through the audio.', have);
    }
  }

  // 3. check what is stored against the manifest before anything is marked
  const audio = await store.readAudio(t.audio.id);
  if (!audio || audio.size !== t.audio.bytes) {
    await store.dropAudio(t.audio.id);
    throw new FetchError('mismatch', 'The audio was not the size the server said it would be.');
  }
  const hash = await sha256Blob(audio);
  if (signal.aborted) throw aborted();
  if (hash !== t.audio.sha256) {
    await store.dropAudio(t.audio.id);
    throw new FetchError('mismatch', 'The audio did not match its checksum, so it was not saved.');
  }

  // 4. one step that makes it held: record, text, lines, timings (the store refuses if the audio is not all there)
  const record: ChapterRecord = {
    audiobookId: t.audiobookId,
    chapterId: t.chapterId,
    bookId: t.bookId,
    audioId: t.audio.id,
    bytes: t.audio.bytes,
    sha256: t.audio.sha256,
    contentType: t.audio.content_type,
    durationSeconds: t.audio.duration_seconds,
    voiceName: t.voiceName,
    voiceRevision: t.audio.voice_revision,
    textSha256: textHash,
    textBytes: new TextEncoder().encode(content.text).length + JSON.stringify(content.lines).length + JSON.stringify(content.timings).length,
    storedAt: ctx.clock.now(),
    verifiedAt: ctx.clock.now(),
  };
  try {
    await store.commitChapter(record, content);
  } catch (e) {
    if (isQuotaError(e)) throw new FetchError('quota', 'The device has no room for this chapter.', t.audio.bytes);
    throw new FetchError('store', `The chapter could not be saved on this device (${e instanceof Error ? e.message : 'unknown'}).`, t.audio.bytes);
  }
  return record;
}

/** Read a response body into stored parts. Returns how much is stored afterwards; never loses bytes that arrived. */
async function readBody(ctx: FetchContext, t: ChapterTarget, body: ReadableStream<Uint8Array>, startHave: number, startParts: number): Promise<{ have: number; parts: number }> {
  const { store, signal, clock } = ctx;
  let have = startHave;
  let parts = startParts;
  let buf: Uint8Array[] = [];
  let buffered = 0;
  const reader = body.getReader();
  const flush = async () => {
    if (!buffered) return;
    const blob = new Blob(buf as BlobPart[]);
    buf = [];
    buffered = 0;
    await store.appendPart(t.audio.id, parts, blob);
    parts += 1;
    have += blob.size;
  };
  const idle = ctx.idleMs ?? 30_000;
  let idleTimer: number | undefined;
  const arm = () => {
    clock.clearTimeout(idleTimer ?? 0);
    idleTimer = clock.setTimeout(() => void reader.cancel().catch(() => {}), idle);
  };
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', onAbort);
  try {
    arm();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        break; // the connection dropped: keep what came
      }
      if (chunk.done) break;
      buf.push(chunk.value);
      buffered += chunk.value.length;
      arm();
      ctx.onProgress?.(have + buffered, t.audio.bytes);
      if (buffered >= (ctx.partBytes ?? PART_BYTES)) await flush();
      if (have + buffered > t.audio.bytes) break;
    }
    await flush();
  } catch (e) {
    if (isQuotaError(e)) throw new FetchError('quota', 'The device has no room for this chapter.', have);
    throw new FetchError('store', `The download could not be kept on this device (${e instanceof Error ? e.message : 'unknown'}).`, have);
  } finally {
    clock.clearTimeout(idleTimer ?? 0);
    signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
  }
  if (have > t.audio.bytes) {
    await store.dropAudio(t.audio.id);
    throw new FetchError('mismatch', 'The audio was longer than the server said it would be, so it was not saved.');
  }
  ctx.onProgress?.(have, t.audio.bytes);
  return { have, parts };
}
