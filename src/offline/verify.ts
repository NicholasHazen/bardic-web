// Verify held chapters on open: never serve a copy that is not what the server made.
//  * quick (every open, cheap): the audio is there and is exactly the recorded size and readable at both ends; the text
//    is there and hashes to the recorded text hash; lines and timings are there.
//  * deep (once in a while, in the background): the whole audio hashed against the manifest's sha256.
// A copy that is definitely wrong (missing, wrong size, wrong hash) is removed so it can never play, and reported so the
// chapter shows "Couldn't download" and is fetched again. A copy that merely could not be read right now is not served
// this session but is not deleted: it may be a passing storage hiccup.
import { sha256Blob, sha256Text } from '../lib/sha256';
import type { Clock } from '../lib/clock';
import type { ChapterRecord, OfflineStore } from './store';
import type { VerifyReport } from './types';

export type Verdict = { ok: true } | { ok: false; reason: string; definite: boolean };

export async function checkChapter(store: OfflineStore, r: ChapterRecord, deep: boolean): Promise<Verdict> {
  try {
    const audio = await store.readAudio(r.audioId);
    if (!audio) return { ok: false, reason: 'The audio is missing from this device.', definite: true };
    if (audio.size !== r.bytes) return { ok: false, reason: `The audio is ${audio.size} bytes but should be ${r.bytes}.`, definite: true };
    if (r.bytes > 0) {
      await audio.slice(0, 1).arrayBuffer();
      await audio.slice(r.bytes - 1, r.bytes).arrayBuffer();
    }
    const content = await store.content(r.audiobookId, r.chapterId);
    if (!content || typeof content.text !== 'string' || !Array.isArray(content.lines) || !Array.isArray(content.timings)) return { ok: false, reason: 'The text or timings are missing from this device.', definite: true };
    if (sha256Text(content.text) !== r.textSha256) return { ok: false, reason: 'The saved text does not match its checksum.', definite: true };
    if (deep && (await sha256Blob(audio)) !== r.sha256) return { ok: false, reason: 'The audio does not match its checksum.', definite: true };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `The copy could not be read (${e instanceof Error ? e.message : 'unknown'}).`, definite: false };
  }
}

export interface VerifyOptions {
  clock: Clock;
  /** hash the whole audio, not just check its size (default false) */
  deep?: boolean;
  /** deep-check records whose last full check is older than this, or that never had one */
  deepAfterMs?: number;
}

/** Check the given records. Definitely bad ones are deleted from the store; the report names every bad one. */
export async function verifyHeld(store: OfflineStore, records: ChapterRecord[], o: VerifyOptions): Promise<VerifyReport & { good: ChapterRecord[] }> {
  const good: ChapterRecord[] = [];
  const damaged: VerifyReport['damaged'] = [];
  for (const r of records) {
    const stale = o.deepAfterMs !== undefined && (r.verifiedAt === null || o.clock.now() - r.verifiedAt >= o.deepAfterMs);
    const deep = !!o.deep || stale;
    const v = await checkChapter(store, r, deep);
    if (v.ok) {
      if (deep) {
        const next = { ...r, verifiedAt: o.clock.now() };
        await store.updateChapter(next).catch(() => {});
        good.push(next);
      } else good.push(r);
      continue;
    }
    damaged.push({ audiobookId: r.audiobookId, chapterId: r.chapterId, reason: v.reason });
    if (v.definite) await store.deleteChapter(r.audiobookId, r.chapterId).catch(() => {});
  }
  return { checked: records.length, damaged, good };
}
