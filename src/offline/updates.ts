// Newer audio (D6, O6). The server says a held chapter was made again; the device shows the comparison and the
// listener chooses. Nothing here replaces anything by itself:
//  * check() only asks (`checkDownloads` is read-only) and produces offers;
//  * apply() downloads the newer audio for the chapters the listener chose, verifies it, and only then swaps it in, in
//    one store commit; until that commit the old copy is exactly as it was and keeps playing; a failure leaves it alone;
//  * keepOld() records the choice with the server's new audio id, so the same offer is not made again until the server
//    makes yet newer audio.
import type { Clock } from '../lib/clock';
import type { Downloader } from './downloader';
import { FetchError, fetchChapter } from './fetchChapter';
import type { AudioRef, ConnectionPort, OfflineApi } from './ports';
import type { OfflineStore } from './store';
import type { UpdateOffer } from './types';

export interface UpdatesDeps {
  api: OfflineApi;
  store: OfflineStore;
  clock: Clock;
  downloads: Downloader;
  connection: ConnectionPort;
  idleMs?: number;
  partBytes?: number;
}

interface Known {
  audiobookId: string;
  chapterId: string;
  audio: AudioRef;
  voiceName: string;
}

const key = (audiobookId: string, chapterId: string) => `${audiobookId}\u0000${chapterId}`;
const keepKey = (audiobookId: string, chapterId: string) => `keepold:${audiobookId}:${chapterId}`;

export class Updates {
  offers: UpdateOffer[] = [];
  /** the newer audio behind each offer, as the server last said */
  private newer = new Map<string, Known>();
  /** audiobook+chapter to the server audio id the listener chose not to take */
  private kept = new Map<string, string>();
  /** 0 to 1 for chapters being swapped now */
  readonly updating = new Map<string, number>();
  /** why a chosen update did not go through, in words that begin with what is kept */
  readonly errors = new Map<string, string>();
  changed: () => void = () => {};
  problem: (text: string) => void = () => {};

  constructor(private d: UpdatesDeps) {}

  async init(): Promise<void> {
    for (const { key: k, value } of await this.d.store.listValues<string>('keepold:')) {
      const rest = k.slice('keepold:'.length);
      const i = rest.indexOf(':');
      if (i > 0 && typeof value === 'string') this.kept.set(key(rest.slice(0, i), rest.slice(i + 1)), value);
    }
  }

  isOutOfDate(audiobookId: string, chapterId: string): boolean {
    return this.newer.has(key(audiobookId, chapterId));
  }

  progress(audiobookId: string, chapterId: string): number | undefined {
    return this.updating.get(key(audiobookId, chapterId));
  }

  error(audiobookId: string, chapterId: string): string | null {
    return this.errors.get(key(audiobookId, chapterId)) ?? null;
  }

  /** Ask the server about the chapters held (all audiobooks, or one) and rebuild the offers. */
  async check(audiobookId?: string): Promise<void> {
    const ids = audiobookId ? [audiobookId] : [...this.d.downloads.held.keys()];
    for (const aid of ids) {
      const held = [...(this.d.downloads.held.get(aid)?.values() ?? [])];
      if (held.length === 0) {
        this.dropAudiobook(aid);
        continue;
      }
      const r = await this.d.api.checkDownloads(aid, held.map((h) => ({ chapter_id: h.chapterId, audio_id: h.audioId })));
      if (!r.ok) continue; // unknown stays unknown: the previous offers stand
      const meta = this.d.downloads.metas.get(aid);
      const byChapter = new Map(held.map((h) => [h.chapterId, h]));
      const now = new Map<string, Known>();
      const offers: UpdateOffer[] = [];
      for (const n of r.value.newer) {
        const rec = byChapter.get(n.chapter_id);
        if (!rec || rec.audioId !== n.old_audio_id) continue;
        if (this.kept.get(key(aid, n.chapter_id)) === n.new_audio.id) continue; // the listener said keep this copy
        now.set(key(aid, n.chapter_id), { audiobookId: aid, chapterId: n.chapter_id, audio: n.new_audio, voiceName: n.changes.voice_name });
        offers.push({
          audiobookId: aid,
          bookId: rec.bookId,
          chapterId: n.chapter_id,
          chapterTitle: meta?.chapters.find((c) => c.id === n.chapter_id)?.title ?? '',
          held: { voiceName: rec.voiceName, revision: rec.voiceRevision, seconds: rec.durationSeconds, bytes: rec.bytes, madeAt: null },
          newer: { voiceName: n.changes.voice_name, revision: n.changes.new_voice_revision, seconds: n.changes.new_duration_seconds, bytes: n.changes.new_bytes, madeAt: null },
        });
      }
      // a choice to keep a copy is forgotten once the server has nothing newer than it any more, or has changed again
      for (const k of [...this.kept.keys()]) {
        if (!k.startsWith(`${aid}\u0000`)) continue;
        const cid = k.slice(aid.length + 1);
        const stillNewer = r.value.newer.find((n) => n.chapter_id === cid);
        if (!stillNewer || stillNewer.new_audio.id !== this.kept.get(k)) {
          this.kept.delete(k);
          void this.d.store.deleteValue(keepKey(aid, cid)).catch(() => {});
        }
      }
      this.dropAudiobook(aid, true);
      for (const [k, v] of now) this.newer.set(k, v);
      this.offers = [...this.offers, ...offers];
    }
    this.sort();
    this.changed();
  }

  private dropAudiobook(aid: string, keepKept = false): void {
    this.offers = this.offers.filter((o) => o.audiobookId !== aid);
    for (const k of [...this.newer.keys()]) if (k.startsWith(`${aid}\u0000`)) this.newer.delete(k);
    if (!keepKept) {
      for (const k of [...this.kept.keys()]) if (k.startsWith(`${aid}\u0000`)) this.kept.delete(k);
    }
  }

  private sort(): void {
    const order = (o: UpdateOffer) => this.d.downloads.metas.get(o.audiobookId)?.chapters.find((c) => c.id === o.chapterId)?.index ?? 0;
    this.offers.sort((a, b) => a.audiobookId.localeCompare(b.audiobookId) || order(a) - order(b));
  }

  /** A chapter or a whole audiobook left the device: its offers go too. */
  forget(audiobookId: string, chapterIds?: string[]): void {
    if (!chapterIds) {
      this.dropAudiobook(audiobookId);
      for (const k of [...this.errors.keys()]) if (k.startsWith(`${audiobookId}\u0000`)) this.errors.delete(k);
    } else {
      for (const cid of chapterIds) {
        this.newer.delete(key(audiobookId, cid));
        this.errors.delete(key(audiobookId, cid));
        this.kept.delete(key(audiobookId, cid));
      }
      this.offers = this.offers.filter((o) => !(o.audiobookId === audiobookId && chapterIds.includes(o.chapterId)));
    }
    this.changed();
  }

  /** Keep the copies held and stop offering these chapters until the server changes again. */
  keepOld(audiobookId: string, chapterIds: string[]): void {
    for (const cid of chapterIds) {
      const known = this.newer.get(key(audiobookId, cid));
      if (!known) continue;
      this.kept.set(key(audiobookId, cid), known.audio.id);
      void this.d.store.setValue(keepKey(audiobookId, cid), known.audio.id).catch(() => {});
      this.newer.delete(key(audiobookId, cid));
      this.errors.delete(key(audiobookId, cid));
    }
    this.offers = this.offers.filter((o) => !(o.audiobookId === audiobookId && chapterIds.includes(o.chapterId)));
    this.changed();
  }

  /** Replace exactly the chapters the listener chose. The old copy stays until the new one is durable and verified. */
  async apply(audiobookId: string, chapterIds: string[]): Promise<void> {
    const meta = this.d.downloads.metas.get(audiobookId);
    if (meta?.options.wifiOnly && !['wifi', 'ethernet'].includes(this.d.connection.kind())) {
      this.problem('Nothing was replaced; the audio on this device is kept. Wi-Fi only is on and this connection is not known to be Wi-Fi.');
      return;
    }
    for (const cid of chapterIds) {
      const k = key(audiobookId, cid);
      let known = this.newer.get(k);
      const held = this.d.downloads.held.get(audiobookId)?.get(cid);
      if (!known || !held) continue; // not offered: nothing to do, and certainly nothing to replace
      this.errors.delete(k);
      this.updating.set(k, 0);
      this.changed();
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const record = await fetchChapter(
              {
                api: this.d.api,
                store: this.d.store,
                clock: this.d.clock,
                signal: new AbortController().signal,
                idleMs: this.d.idleMs,
                partBytes: this.d.partBytes,
                onProgress: (got, total) => {
                  this.updating.set(k, total > 0 ? got / total : 0);
                  this.changed();
                },
              },
              { audiobookId, bookId: held.bookId, chapterId: cid, audio: known.audio, textSha256: held.textSha256, voiceName: known.voiceName },
            );
            this.d.downloads.setHeld(record);
            this.newer.delete(k);
            this.offers = this.offers.filter((o) => !(o.audiobookId === audiobookId && o.chapterId === cid));
            break;
          } catch (e) {
            if (e instanceof FetchError && e.kind === 'missing' && attempt === 0) {
              // the server made yet newer audio since the offer: ask again and take what it says now
              await this.check(audiobookId);
              const again = this.newer.get(k);
              if (again && again.audio.id !== known.audio.id) {
                known = again;
                continue;
              }
            }
            throw e;
          }
        }
      } catch (e) {
        const why = e instanceof FetchError ? e.message : e instanceof Error ? e.message : 'Something went wrong.';
        const quota = e instanceof FetchError && e.kind === 'quota';
        this.errors.set(k, `The copy on this device is kept and still plays. ${quota ? 'There is no room for the newer one.' : why} Try again.`);
      } finally {
        this.updating.delete(k);
        this.changed();
      }
    }
  }
}
