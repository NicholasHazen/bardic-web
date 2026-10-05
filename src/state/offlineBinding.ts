// Connects the offline engine to the two places the rest of the app already waits for it:
//   * `deviceChapters` (src/state/book.ts): what this device holds of each audiobook, for the audio words;
//   * `onDeviceIds` (src/state/library.ts): the books with something on this device.
// Nothing here imports those modules: the lead passes their stores in (see bindOfflineStores), so this file and its
// test have no network or DOM dependencies.
import type { Readable, Writable } from 'svelte/store';
import type { DeviceCopy } from '../lib/bookAudio';
import type { OfflineStateX } from '../offline/types';

/** audiobook id to chapter id to the device's word for that chapter (not_downloaded chapters are left out). */
export function deviceCopies(state: Pick<OfflineStateX, 'books'>): Map<string, Map<string, DeviceCopy>> {
  const out = new Map<string, Map<string, DeviceCopy>>();
  for (const b of state.books) {
    const m = new Map<string, DeviceCopy>();
    for (const c of b.chapters) {
      if (c.state === 'on_device') m.set(c.chapterId, 'held');
      else if (c.state === 'downloading' || c.state === 'queued') m.set(c.chapterId, 'downloading');
      else if (c.state === 'failed') m.set(c.chapterId, 'failed');
      else if (c.state === 'out_of_date') m.set(c.chapterId, 'out_of_date');
    }
    if (m.size) out.set(b.audiobookId, m);
  }
  return out;
}

/** book ids with at least one chapter that plays from this device (on this device, or out of date but still held). */
export function onDeviceBookIds(state: Pick<OfflineStateX, 'books'>): Set<string> {
  const out = new Set<string>();
  for (const b of state.books) if (b.chapters.some((c) => c.state === 'on_device' || c.state === 'out_of_date')) out.add(b.bookId);
  return out;
}

/** Runtime of audio retained on this device, so an Out of date copy keeps its own duration. */
export function heldChapterDurations(state: Pick<OfflineStateX, 'books'>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const b of state.books) {
    const durations = new Map<string, number>();
    for (const c of b.chapters) {
      if (typeof c.durationSeconds === 'number' && Number.isFinite(c.durationSeconds) && c.durationSeconds > 0 &&
          (c.state === 'on_device' || c.state === 'out_of_date' || c.hasHeldCopy)) durations.set(c.chapterId, c.durationSeconds);
    }
    if (durations.size) out.set(b.audiobookId, durations);
  }
  return out;
}

export interface OfflineStoresTarget {
  deviceChapters: Writable<ReadonlyMap<string, ReadonlyMap<string, DeviceCopy>>>;
  onDeviceIds: Writable<ReadonlySet<string>>;
  deviceChapterDurations?: Writable<ReadonlyMap<string, ReadonlyMap<string, number>>>;
}

/** Keep both stores in step with the engine. Returns the function that stops. */
export function bindOfflineStores(engine: Readable<OfflineStateX>, target: OfflineStoresTarget): () => void {
  return engine.subscribe((s) => {
    target.deviceChapters.set(deviceCopies(s));
    target.onDeviceIds.set(onDeviceBookIds(s));
    target.deviceChapterDurations?.set(heldChapterDurations(s));
  });
}
