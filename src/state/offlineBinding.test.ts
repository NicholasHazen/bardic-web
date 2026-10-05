import { get, writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { OfflineBook } from '../offline/types';
import { bindOfflineStores, deviceCopies, heldChapterDurations, onDeviceBookIds } from './offlineBinding';

const book = (audiobookId: string, bookId: string, states: OfflineBook['chapters'][number]['state'][]): OfflineBook => ({
  bookId,
  audiobookId,
  title: bookId,
  author: '',
  coverColor: '#000000',
  voiceName: 'Mara',
  chapters: states.map((state, i) => ({ chapterId: `c${i}`, index: i, title: `C${i}`, state, bytes: 1, progress: null, error: null })),
  status: 'idle',
  heldBytes: 0,
  remainingBytes: 0,
  wifiOnly: false,
  keepNew: false,
  checkedAt: null,
  message: null,
});

describe('offline bindings', () => {
  const state = { books: [book('a1', 'b1', ['on_device', 'downloading', 'queued', 'failed', 'out_of_date', 'not_downloaded']), book('a2', 'b2', ['not_downloaded']), book('a3', 'b3', ['downloading'])] };
  it('maps the engine words to the copies the audio words use', () => {
    const m = deviceCopies(state);
    expect([...m.get('a1')!]).toEqual([['c0', 'held'], ['c1', 'downloading'], ['c2', 'downloading'], ['c3', 'failed'], ['c4', 'out_of_date']]);
    expect(m.has('a2')).toBe(false);
  });
  it('lists the books that have something playable on the device', () => {
    expect([...onDeviceBookIds(state)]).toEqual(['b1']);
  });
  it('publishes held runtimes through replacement states and leaves manifest-only durations out', () => {
    const b = book('a1', 'b1', ['on_device', 'out_of_date', 'downloading', 'failed', 'not_downloaded']);
    b.chapters.forEach((c) => { c.durationSeconds = 240; });
    b.chapters[2]!.hasHeldCopy = true;
    b.chapters[3]!.hasHeldCopy = true;
    expect([...heldChapterDurations({ books: [b] }).get('a1')!]).toEqual([['c0', 240], ['c1', 240], ['c2', 240], ['c3', 240]]);
  });
  it('keeps the stores in step', () => {
    const engine = writable({ ...state, online: true, lastContact: null, storage: { usedBytes: null, freeBytes: null, persisted: false, unmetered: null }, updates: [], removedBooks: [], removeFinishedAfterDays: null, notice: null });
    const target = { deviceChapters: writable(new Map()), deviceChapterDurations: writable(new Map()), onDeviceIds: writable(new Set<string>()) };
    const stop = bindOfflineStores(engine, target);
    expect([...get(target.onDeviceIds)]).toEqual(['b1']);
    engine.update((s) => ({ ...s, books: [] }));
    expect(get(target.onDeviceIds).size).toBe(0);
    expect(get(target.deviceChapters).size).toBe(0);
    expect(get(target.deviceChapterDurations).size).toBe(0);
    stop();
  });
});
