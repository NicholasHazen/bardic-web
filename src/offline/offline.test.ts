import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { createOffline, type OfflineDeps, type OfflineEngine } from './offline';
import { AUDIOBOOK as AB, BOOK, FakeConnection, FakeEvents, FakeServer, fakeStorage, fakeUrls } from './testing';
import { memoryStore, withQuota, type ChapterContent, type ChapterRecord, type OfflineStore } from './store';
import type { ChapterMetadata, OfflineBook, OfflineStateX } from './types';
import { bookKey, type BookMeta } from './downloader';
import { offlinePage } from '../views/offline/connected/mapping';

const DAY = 86_400_000;

async function until(cond: () => boolean, what = 'condition', ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}

function world(over: Partial<OfflineDeps> & { server?: FakeServer; store?: OfflineStore; chapters?: number; ready?: boolean } = {}) {
  const server = over.server ?? new FakeServer(over.chapters ?? 3, 20_000);
  if (over.ready !== false && !over.server) server.makeAll();
  const clock = new FakeClock();
  const connection = new FakeConnection();
  const events = new FakeEvents();
  const storage = fakeStorage();
  const urls = fakeUrls();
  const store = (over.store ?? memoryStore()) as ReturnType<typeof memoryStore>;
  const o: OfflineEngine = createOffline({ api: server.api, store, clock, connection, events, storage, urls, listener: () => 'L1', partBytes: 8192, checkEveryMs: 60 * 60_000, ...over });
  const book = (): OfflineBook | undefined => get(o).books.find((b) => b.audiobookId === AB);
  const states = () => (book()?.chapters ?? []).map((c) => c.state);
  const ch = (id: string) => book()?.chapters.find((c) => c.chapterId === id);
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 5));
  };
  return { server, clock, connection, events, storage, urls, store, o, book, states, ch, settle };
}

const READY = { wifiOnly: false, keepNew: false };
const allOnDevice = (w: ReturnType<typeof world>) => w.states().length > 0 && w.states().every((s) => s === 'on_device');

describe('preview', () => {
  it('adds up the bytes of what would be downloaded and says whether it fits', async () => {
    const w = world();
    await w.o.ready;
    expect(await w.o.preview(AB, { kind: 'ready_now' })).toEqual({ chaptersToGet: 3, bytes: 60_000, freeBytes: 10_000_000_000 - 1_000_000, fits: true, notReadyYet: 0 });
    w.storage.quota = 1_050_000;
    expect((await w.o.preview(AB, { kind: 'ready_now' })).fits).toBe(false);
  });
  it('keeps unknown free space unknown: fits is null, never a guess and never 0', async () => {
    const w = world();
    w.storage.quota = null;
    const p = await w.o.preview(AB, { kind: 'whole_book' });
    expect(p.freeBytes).toBeNull();
    expect(p.fits).toBeNull();
    expect(p.bytes).toBe(60_000);
  });
  it('counts what is not ready yet, and chosen chapters', async () => {
    const w = world({ ready: false });
    w.server.make('ch1');
    const p = await w.o.preview(AB, { kind: 'ready_now' });
    expect(p).toMatchObject({ chaptersToGet: 1, bytes: 20_000, notReadyYet: 2 });
    const q = await w.o.preview(AB, { kind: 'chapters', chapterIds: ['ch1', 'ch3'] });
    expect(q).toMatchObject({ chaptersToGet: 1, bytes: 20_000, notReadyYet: 1 });
  });
  it('does not count chapters already held, and counts a partial download as already got', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'chapters', chapterIds: ['ch1'] }, READY);
    await until(() => w.ch('ch1')?.state === 'on_device');
    expect(await w.o.preview(AB, { kind: 'ready_now' })).toMatchObject({ chaptersToGet: 2, bytes: 40_000 });
  });
  it('says nothing is known when the manifest cannot be read', async () => {
    const w = world();
    w.server.reachable = false;
    expect(await w.o.preview(AB, { kind: 'ready_now' })).toMatchObject({ chaptersToGet: 0, bytes: null, fits: null });
  });
});

describe('a download', () => {
  it('holds every ready chapter with its text, lines and timings, and checks the sizes against the manifest', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w), 'all on device');
    const b = w.book()!;
    expect(b).toMatchObject({ status: 'idle', heldBytes: 60_000, remainingBytes: 0, title: 'The Lamp', voiceName: 'Mara' });
    expect(b.chapters.map((c) => c.bytes)).toEqual([20_000, 20_000, 20_000]);
    const held = await w.o.heldChapter(AB, 'ch2');
    expect(held!.text).toBe(w.server.chapters[1]!.text);
    const cps = [...w.server.chapters[1]!.text].length;
    expect(held!.lines).toEqual([
      { id: 'ch2-l1', start: 0, end: Math.floor(cps / 2) },
      { id: 'ch2-l2', start: Math.floor(cps / 2), end: cps },
    ]);
    expect(held!.timings).toEqual([
      { lineId: 'ch2-l1', startMs: 0, endMs: 500 },
      { lineId: 'ch2-l2', startMs: 500, endMs: 1000 },
    ]);
    const stored = await w.store.readAudio(w.server.current.get('ch2')!);
    expect(stored!.size).toBe(20_000);
    expect(w.o.heldChapters(AB)).toEqual(new Set(['ch1', 'ch2', 'ch3']));
    expect(get(w.o).storage.usedBytes).toBeGreaterThanOrEqual(60_000);
  });

  it('makes a chapter "On this device" only after the audio and everything with it is durable, in that order', async () => {
    const inner = memoryStore();
    const ops: string[] = [];
    const spy: OfflineStore = {
      ...inner,
      appendPart: async (a, i, d) => (ops.push(`part ${a} ${i}`), inner.appendPart(a, i, d)),
      commitChapter: async (r: ChapterRecord, c: ChapterContent) => (ops.push(`commit ${r.chapterId}`), inner.commitChapter(r, c)),
    };
    const w = world({ store: spy });
    const seen: string[] = [];
    w.o.subscribe((s) => {
      for (const c of s.books[0]?.chapters ?? []) if (c.state === 'on_device') seen.push(`on_device ${c.chapterId} after ${ops.filter((x) => x.startsWith('commit')).length} commits`);
    });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    const i1 = ops.findIndex((o) => o === 'commit ch1');
    expect(ops.slice(0, i1).every((o) => o.startsWith('part'))).toBe(true);
    expect(ops.slice(0, i1).length).toBeGreaterThan(0);
    // ch1 was never on_device before its commit happened
    expect(seen.find((s) => s.startsWith('on_device ch1'))).toContain('after 1 commits');
  });

  it('does not mark a chapter when the commit fails', async () => {
    const inner = memoryStore();
    const bad: OfflineStore = { ...inner, commitChapter: async (r, c) => (r.chapterId === 'ch2' ? Promise.reject(new Error('disk said no')) : inner.commitChapter(r, c)) };
    const w = world({ store: bad });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.ch('ch3')?.state === 'on_device' && w.ch('ch2')?.state === 'failed');
    expect(w.ch('ch2')!.error).toMatch(/^The other chapters are kept\./);
    expect(w.o.heldChapters(AB).has('ch2')).toBe(false);
    expect(await w.o.heldChapter(AB, 'ch2')).toBeNull();
  });

  it('treats a hash mismatch as a failed chapter, keeps the others, and downloads it again on retry', async () => {
    const w = world();
    const bad = w.server.current.get('ch2')!;
    w.server.corrupt.add(bad);
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.ch('ch2')?.state === 'failed' && w.ch('ch1')?.state === 'on_device' && w.ch('ch3')?.state === 'on_device');
    expect(w.ch('ch2')!.error).toMatch(/^The other chapters are kept\. .*checksum/);
    expect(w.store.raw.chapters.size).toBe(2);
    expect(await w.store.readAudio(bad)).toBeNull(); // the bad bytes were thrown away
    expect(get(w.o).books[0]!.message).toMatch(/^The 2 chapters on this device are kept\./);
    w.server.corrupt.delete(bad);
    const callsBefore = w.server.log.filter((l) => l.startsWith('audio au_ch1')).length;
    w.o.retry(AB, 'ch2');
    await until(() => allOnDevice(w));
    expect(w.server.log.filter((l) => l.startsWith('audio au_ch1')).length).toBe(callsBefore); // only the failed one again
  });

  it('pauses mid-chapter, keeps the bytes received, and resumes from them by Range', async () => {
    const w = world();
    w.server.holdAfter = 10_000;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => (w.ch('ch1')?.progress ?? 0) >= 0.5 - 1e-9 && w.ch('ch1')?.state === 'downloading');
    w.o.pause(AB);
    await until(() => w.book()!.status === 'paused');
    const kept = (await w.store.partial(w.server.current.get('ch1')!)).bytes;
    expect(kept).toBe(10_000);
    expect(w.book()!.message).toMatch(/^Nothing was lost\./);
    expect(w.ch('ch1')!.state).toBe('queued');
    w.o.resume(AB);
    await until(() => allOnDevice(w));
    expect(w.server.rangeStarts[1]).toBe(10_000); // the second request began at the byte after the last one received
    expect(w.server.log.filter((l) => l.startsWith('audio au_ch1')).length).toBe(2);
  });

  it('keeps the bytes of a dropped connection and carries on from them', async () => {
    const w = world();
    w.server.dropAfter = 9000;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    expect(w.server.rangeStarts.slice(0, 2)).toEqual([0, 9000]);
  });

  it('starts over when a server ignores Range, and still verifies the whole file', async () => {
    const w = world();
    w.server.dropAfter = 9000;
    w.server.ignoreRange = true;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
  });

  it('cancel stops, forgets the queue, and keeps chapters that finished', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'chapters', chapterIds: ['ch1'] }, READY);
    await until(() => w.ch('ch1')?.state === 'on_device');
    w.server.holdAfter = 5000;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.ch('ch2')?.state === 'downloading' && (w.ch('ch2')?.progress ?? 0) > 0);
    w.o.cancel(AB);
    await until(() => w.book()!.status === 'idle' && w.ch('ch2')?.state === 'not_downloaded');
    expect(w.states()).toEqual(['on_device', 'not_downloaded', 'not_downloaded']);
    await w.settle();
    expect((await w.store.partial(w.server.current.get('ch2')!)).bytes).toBe(0);
    expect(w.book()!.remainingBytes).toBe(0);
    w.o.resume(AB);
    await w.settle();
    expect(w.states()).toEqual(['on_device', 'not_downloaded', 'not_downloaded']);
  });

  it('runs two chapters at a time when asked', async () => {
    const w = world({ concurrency: 2 });
    w.server.holdAfter = 4000;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    // the first chapter is held up; the second one is fetched meanwhile
    await until(() => w.ch('ch1')?.state === 'downloading' && w.ch('ch2')?.state === 'on_device');
    w.server.release();
    await until(() => allOnDevice(w));
  });
});

describe('Wi-Fi only', () => {
  it('waits on mobile data and says so, then carries on by itself on Wi-Fi', async () => {
    const w = world();
    w.connection.set('cellular');
    await w.o.start(AB, { kind: 'ready_now' }, { wifiOnly: true, keepNew: false });
    await until(() => w.book()?.status === 'waiting_wifi');
    expect(w.book()!.message).toMatch(/^Nothing was lost\. Waiting for Wi-Fi/);
    expect(w.server.log.some((l) => l.startsWith('audio au_'))).toBe(false);
    expect(get(w.o).storage.unmetered).toBe(false);
    w.connection.set('wifi');
    await until(() => allOnDevice(w)).catch((e) => {
      throw new Error(`${e.message} ${get(w.o).books[0]?.status} ${w.states()} ${w.server.log.join(',')}`);
    });
    expect(get(w.o).storage.unmetered).toBe(true);
  });
  it('does not guess when the connection type is unknown: it waits and says it cannot tell', async () => {
    const w = world();
    w.connection.set('unknown');
    await w.o.start(AB, { kind: 'ready_now' }, { wifiOnly: true, keepNew: false });
    await until(() => w.book()?.status === 'waiting_wifi');
    expect(w.book()!.message).toMatch(/can't tell/);
    expect(get(w.o).storage.unmetered).toBeNull();
    // the listener can turn Wi-Fi only off to go ahead
    w.o.setOptions(AB, { wifiOnly: false });
    await until(() => allOnDevice(w));
  });
  it('stops at once when the connection turns to mobile data mid-download, keeping the bytes', async () => {
    const w = world();
    w.server.holdAfter = 6000;
    await w.o.start(AB, { kind: 'ready_now' }, { wifiOnly: true, keepNew: false });
    await until(() => w.ch('ch1')?.state === 'downloading' && (w.ch('ch1')?.progress ?? 0) > 0);
    w.connection.set('cellular');
    await until(() => w.book()!.status === 'waiting_wifi');
    expect((await w.store.partial(w.server.current.get('ch1')!)).bytes).toBe(6000);
    w.connection.set('wifi');
    await until(() => allOnDevice(w));
    expect(w.server.rangeStarts[1]).toBe(6000);
  });
  it('downloads over any connection when Wi-Fi only is off, even an unknown one', async () => {
    const w = world();
    w.connection.set('unknown');
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
  });
});

describe('keep downloading new chapters', () => {
  it('picks up a chapter when the server makes it, on the notice', async () => {
    const w = world({ ready: false });
    w.server.make('ch1');
    await w.o.start(AB, { kind: 'whole_book' }, { wifiOnly: false, keepNew: false });
    await until(() => w.ch('ch1')?.state === 'on_device');
    expect(w.book()!.keepNew).toBe(true); // the whole book implies it
    expect(w.ch('ch2')!.state).toBe('not_downloaded');
    w.server.make('ch2');
    w.events.emit('chapter.updated');
    await w.clock.advance(400);
    await until(() => w.ch('ch2')?.state === 'on_device');
    expect(w.ch('ch3')!.state).toBe('not_downloaded');
  });
  it('also finds it by the periodic check when no notice comes', async () => {
    const w = world({ ready: false, checkEveryMs: 1000 });
    w.server.make('ch1');
    await w.o.start(AB, { kind: 'ready_now' }, { wifiOnly: false, keepNew: true });
    await until(() => w.ch('ch1')?.state === 'on_device');
    w.server.make('ch3');
    await w.clock.advance(1100);
    await until(() => w.ch('ch3')?.state === 'on_device');
  });
  it('leaves new chapters alone when it is off', async () => {
    const w = world({ ready: false });
    w.server.make('ch1');
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.ch('ch1')?.state === 'on_device');
    w.server.make('ch2');
    w.events.emit('chapter.updated');
    await w.clock.advance(400);
    await w.settle();
    expect(w.ch('ch2')!.state).toBe('not_downloaded');
    // turning it on picks up what is not held and was not ready... ch2 is ready now, so check once
    w.o.setOptions(AB, { keepNew: true });
    await w.settle();
    expect(w.book()!.keepNew).toBe(true);
  });
});

describe('a full device', () => {
  it('stops with what finished kept and a message that begins with what is kept', async () => {
    const inner = memoryStore();
    const store = withQuota(inner, 45_000);
    const w = world({ store });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.book()?.status === 'device_full');
    expect(w.states().filter((s) => s === 'on_device').length).toBe(2);
    expect(w.book()!.message).toMatch(/^The 2 chapters on this device are kept\. This device has no room/);
    expect(await w.o.heldChapter(AB, 'ch1')).not.toBeNull();
    // room appears: resume finishes the rest
    store.limit = 1_000_000;
    w.o.resume(AB);
    await until(() => allOnDevice(w));
  });
  it('stops before asking when the browser says there is no room for the next chapter', async () => {
    const w = world();
    w.storage.estimate = async () => ({ usage: (await w.store.usage()).total, quota: 45_000 });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.book()?.status === 'device_full');
    expect(w.states()).toEqual(['on_device', 'on_device', 'queued']);
    expect(w.server.log.filter((l) => l.startsWith('audio au_ch3')).length).toBe(0); // it did not even ask
  });
});

describe('the Bardic computer cannot be reached', () => {
  it('marks the download offline, keeps what it has, and resumes by itself when the server is back', async () => {
    const w = world();
    w.server.dropAfter = 5000;
    w.server.onDrop = () => (w.server.reachable = false);
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.book()?.status === 'offline');
    expect(get(w.o).online).toBe(false);
    expect(w.book()!.message).toMatch(/^Nothing was lost\. The Bardic computer can't be reached/);
    expect((await w.store.partial(w.server.current.get('ch1')!)).bytes).toBe(5000);
    w.server.reachable = true;
    await w.clock.advance(2500);
    await until(() => allOnDevice(w));
    expect(get(w.o).online).toBe(true);
    expect(get(w.o).lastContact).not.toBeNull();
    expect(w.server.rangeStarts[1]).toBe(5000);
  });
  it('tracks online and lastContact from requests', async () => {
    const w = world();
    await w.o.ready;
    await w.o.refresh();
    expect(get(w.o).online).toBe(true);
    const at = get(w.o).lastContact;
    expect(at).toBe(w.clock.now());
    w.server.reachable = false;
    await w.o.refresh();
    expect(get(w.o).online).toBe(false);
    expect(get(w.o).lastContact).toBe(at); // unknown stays what it was; not reset, not invented
    w.server.reachable = true;
    await w.clock.advance(2500);
    await until(() => get(w.o).online);
  });
  it('is offline when the browser says it has no network', async () => {
    const w = world();
    await w.o.ready;
    w.connection.set('unknown', false);
    expect(get(w.o).online).toBe(false);
  });
});

describe('verify on open', () => {
  async function held() {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    return w;
  }
  const reopen = (w: ReturnType<typeof world>, over: Partial<OfflineDeps> = {}) => createOffline({ api: w.server.api, store: w.store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1', partBytes: 8192, ...over });

  it('remembers what is held across a restart', async () => {
    const w = await held();
    const o2 = reopen(w);
    await o2.ready;
    expect([...o2.heldChapters(AB)].sort()).toEqual(['ch1', 'ch2', 'ch3']);
    expect(get(o2).books[0]!.chapters.map((c) => c.state)).toEqual(['on_device', 'on_device', 'on_device']);
  });

  it('repairs a truncated copy by downloading it again, and does not serve it meanwhile', async () => {
    const w = await held();
    const id = w.server.current.get('ch2')!;
    const parts = w.store.raw.parts.get(id)!;
    parts.pop(); // the end of the file is gone
    const o2 = reopen(w);
    await o2.ready;
    expect(o2.heldChapters(AB).has('ch2')).toBe(false);
    expect(await o2.heldChapter(AB, 'ch2')).toBeNull();
    await until(() => get(o2).books[0]!.chapters.every((c) => c.state === 'on_device'));
    expect(await o2.heldChapter(AB, 'ch2')).not.toBeNull();
  });

  it('marks a damaged copy failed (words begin with what is kept) when the server cannot be reached to repair it', async () => {
    const w = await held();
    w.store.raw.contents.get('ab1\u0000ch1')!.text = 'tampered text';
    w.server.reachable = false;
    const o2 = reopen(w);
    await o2.ready;
    await w.settle();
    const c1 = get(o2).books[0]!.chapters[0]!;
    expect(c1.state).toBe('failed');
    expect(c1.error).toMatch(/^The other chapters are kept\./);
    expect(await o2.heldChapter(AB, 'ch1')).toBeNull();
    expect(await o2.heldChapter(AB, 'ch3')).not.toBeNull();
  });

  it('finds a flipped byte by hashing the whole audio when asked to', async () => {
    const w = await held();
    const id = w.server.current.get('ch3')!;
    const parts = w.store.raw.parts.get(id)!;
    const first = new Uint8Array(await parts[0]!.arrayBuffer());
    first[10] = first[10]! ^ 1;
    parts[0] = new Blob([first]);
    const quick = await w.o.verify(AB);
    expect(quick.damaged).toEqual([]); // same size: the cheap check cannot see it
    const deep = await w.o.verify(AB, { deep: true });
    expect(deep.damaged.map((d) => d.chapterId)).toEqual(['ch3']);
    expect(await w.o.heldChapter(AB, 'ch3')).toBeNull();
  });
});

describe('newer audio', () => {
  async function held() {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    return w;
  }

  it('offers newer audio with what changed, marks the chapter out of date, and keeps it playing', async () => {
    const w = await held();
    w.server.make('ch2', { revision: 'r2', voiceName: 'Mara', size: 30_000 });
    await w.o.checkUpdates();
    const [offer] = get(w.o).updates;
    expect(get(w.o).updates).toHaveLength(1);
    expect(offer).toMatchObject({ audiobookId: AB, bookId: BOOK, chapterId: 'ch2', chapterTitle: 'Chapter 2', held: { voiceName: 'Mara', revision: 'r1', bytes: 20_000 }, newer: { voiceName: 'Mara', revision: 'r2', bytes: 30_000 } });
    expect(offer!.newer.seconds).toBeCloseTo(30_000 / 48000);
    expect(w.states()).toEqual(['on_device', 'out_of_date', 'on_device']);
    expect(w.o.heldChapters(AB).has('ch2')).toBe(true);
    expect((await w.o.heldChapter(AB, 'ch2'))!.audioUrl).toMatch(/^blob:/);
  });

  it('never replaces anything by itself, however often it checks', async () => {
    const w = await held();
    const before = w.server.current.get('ch2')!;
    w.server.make('ch2', { revision: 'r2' });
    await w.o.checkUpdates();
    await w.o.refresh();
    w.events.emit('chapter.updated');
    await w.clock.advance(1000);
    expect((await w.store.chapter(AB, 'ch2'))!.audioId).toBe(before);
  });

  it('replaces only the chosen chapters, and the old copy stays until the new one is durable and verified', async () => {
    const w = await held();
    const old1 = w.server.current.get('ch1')!;
    const old2 = w.server.current.get('ch2')!;
    w.server.make('ch1', { revision: 'r2' });
    w.server.make('ch2', { revision: 'r2' });
    await w.o.checkUpdates();
    expect(get(w.o).updates).toHaveLength(2);
    await w.o.applyUpdate(AB, ['ch1']);
    expect((await w.store.chapter(AB, 'ch1'))!.audioId).toBe(w.server.current.get('ch1'));
    expect((await w.store.chapter(AB, 'ch1'))!.voiceRevision).toBe('r2');
    expect((await w.store.chapter(AB, 'ch2'))!.audioId).toBe(old2);
    expect(await w.store.readAudio(old1)).toBeNull(); // swapped
    expect(get(w.o).updates.map((u) => u.chapterId)).toEqual(['ch2']);
    expect(w.states()).toEqual(['on_device', 'out_of_date', 'on_device']);
  });

  it('keeps the old copy, playing, when the newer one fails to download or does not verify', async () => {
    const w = await held();
    const old = w.server.current.get('ch1')!;
    const fresh = w.server.make('ch1', { revision: 'r2' });
    w.server.corrupt.add(fresh.id);
    await w.o.checkUpdates();
    await w.o.applyUpdate(AB, ['ch1']);
    expect((await w.store.chapter(AB, 'ch1'))!.audioId).toBe(old);
    expect(await w.o.heldChapter(AB, 'ch1')).not.toBeNull();
    expect(w.ch('ch1')!.state).toBe('out_of_date');
    expect(w.ch('ch1')!.error).toMatch(/^The copy on this device is kept and still plays\./);
    expect(await w.store.readAudio(fresh.id)).toBeNull();
    // the same, when the commit itself fails
    w.server.corrupt.clear();
    const real = w.store.commitChapter;
    w.store.commitChapter = async () => Promise.reject(new Error('disk said no'));
    await w.o.applyUpdate(AB, ['ch1']);
    w.store.commitChapter = real;
    expect((await w.store.chapter(AB, 'ch1'))!.audioId).toBe(old);
    expect(await w.o.heldChapter(AB, 'ch1')).not.toBeNull();
  });

  it('does nothing for a chapter that was not offered', async () => {
    const w = await held();
    const before = w.server.log.length;
    await w.o.applyUpdate(AB, ['ch1']);
    expect(w.server.log.length).toBe(before);
  });

  it('keeping what is held stops the offer until the server changes again, even after a restart', async () => {
    const w = await held();
    w.server.make('ch2', { revision: 'r2' });
    await w.o.checkUpdates();
    w.o.keepOld(AB, ['ch2']);
    expect(get(w.o).updates).toEqual([]);
    expect(w.states()).toEqual(['on_device', 'on_device', 'on_device']);
    await w.o.checkUpdates();
    expect(get(w.o).updates).toEqual([]);
    const o2 = createOffline({ api: w.server.api, store: w.store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1', partBytes: 8192 });
    await o2.ready;
    await o2.checkUpdates();
    expect(get(o2).updates).toEqual([]);
    // the server makes it again: a new offer
    w.server.make('ch2', { revision: 'r3' });
    await o2.checkUpdates();
    expect(get(o2).updates.map((u) => [u.chapterId, u.newer.revision])).toEqual([['ch2', 'r3']]);
  });
});

describe('removing from the device', () => {
  async function held() {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    return w;
  }

  it('never asks the server for anything, and leaves the server\'s audio where it is', async () => {
    const w = await held();
    const files = new Map(w.server.files);
    const before = w.server.log.length;
    await w.o.remove(AB);
    expect(w.server.log.length).toBe(before);
    expect(w.server.files).toEqual(files);
    expect(get(w.o).books).toEqual([]);
    expect(w.store.raw.chapters.size).toBe(0);
    expect(w.store.raw.parts.size).toBe(0);
    expect(w.o.heldChapters(AB).size).toBe(0);
    expect(await w.o.heldChapter(AB, 'ch1')).toBeNull();
  });

  it('removes only the chapters named, and does not download them again with keepNew', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'whole_book' }, READY);
    await until(() => allOnDevice(w));
    await w.o.remove(AB, ['ch2']);
    expect(w.states()).toEqual(['on_device', 'not_downloaded', 'on_device']);
    w.events.emit('chapter.updated');
    await w.clock.advance(400);
    await w.settle();
    expect(w.states()).toEqual(['on_device', 'not_downloaded', 'on_device']);
  });

  it('stops a running download first', async () => {
    const w = world();
    w.server.holdAfter = 5000;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => w.ch('ch1')?.state === 'downloading');
    await w.o.remove(AB);
    expect(get(w.o).books).toEqual([]);
    expect(w.store.raw.parts.size).toBe(0);
  });
});

describe('books removed from the library', () => {
  async function held() {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    return w;
  }
  it('offers the download for removal after reconnecting, and removes nothing by itself', async () => {
    const w = await held();
    w.server.bookState = 'removed';
    await w.o.refresh();
    expect(get(w.o).removedBooks).toEqual([{ bookId: BOOK, audiobookId: AB, title: 'The Lamp', heldBytes: 60_000 }]);
    expect(w.states()).toEqual(['on_device', 'on_device', 'on_device']);
    expect(await w.o.heldChapter(AB, 'ch1')).not.toBeNull();
    await w.o.remove(AB);
    expect(get(w.o).removedBooks).toEqual([]);
  });
  it('treats a book the server no longer knows the same way', async () => {
    const w = await held();
    w.server.bookState = 'gone';
    await w.o.refresh();
    expect(get(w.o).removedBooks).toHaveLength(1);
    expect(w.o.heldChapters(AB).size).toBe(3);
  });
  it('learns nothing while the server is out of reach', async () => {
    const w = await held();
    w.server.bookState = 'removed';
    await w.o.refresh();
    w.server.reachable = false;
    await w.o.refresh();
    expect(get(w.o).removedBooks).toHaveLength(1); // what was learned stands; nothing was removed
    expect(w.o.heldChapters(AB).size).toBe(3);
  });
  it('offers nothing for a book still in the library', async () => {
    const w = await held();
    await w.o.refresh();
    expect(get(w.o).removedBooks).toEqual([]);
  });
});

describe('remove finished books after N days', () => {
  async function held() {
    const w = world({ checkEveryMs: 12 * 3600_000 });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    return w;
  }
  it('is off by default', async () => {
    const w = await held();
    expect(get(w.o).removeFinishedAfterDays).toBeNull();
    w.server.finished = { at: new Date(w.clock.now()).toISOString() };
    await w.o.refresh();
    await w.clock.advance(60 * DAY);
    await w.settle();
    expect(w.o.heldChapters(AB).size).toBe(3);
  });
  it('removes a finished book\'s downloads once N days have passed since it was finished, by the clock', async () => {
    const w = await held();
    w.server.finished = { at: new Date(w.clock.now()).toISOString() };
    w.o.setRemoveFinishedAfterDays(7);
    await w.o.refresh();
    expect(get(w.o).removeFinishedAfterDays).toBe(7);
    await w.clock.advance(6 * DAY);
    await w.settle();
    expect(w.o.heldChapters(AB).size).toBe(3);
    await w.clock.advance(2 * DAY);
    await until(() => w.o.heldChapters(AB).size === 0);
    expect(get(w.o).books).toEqual([]);
  });
  it('leaves an unfinished book alone however long it sits', async () => {
    const w = await held();
    w.o.setRemoveFinishedAfterDays(1);
    await w.o.refresh();
    await w.clock.advance(10 * DAY);
    await w.settle();
    expect(w.o.heldChapters(AB).size).toBe(3);
  });
  it('can be turned off again', async () => {
    const w = await held();
    w.o.setRemoveFinishedAfterDays(3);
    w.o.setRemoveFinishedAfterDays(null);
    expect(get(w.o).removeFinishedAfterDays).toBeNull();
  });
});

describe('refreshed chapter metadata', () => {
  const refreshed: ChapterMetadata[] = [
    { id: 'ch1', title: 'Dedication', kind: 'front_matter' },
    { id: 'ch2', title: 'The Lantern', kind: 'story' },
    { id: 'ch3', title: 'Acknowledgments', kind: 'back_matter' },
  ];

  it('updates every matching audiobook cache, persists the labels, and preserves held data and download settings without contact', async () => {
    const inner = memoryStore();
    const writes: string[] = [];
    const store: OfflineStore = { ...inner, setValue: async (key, value) => { writes.push(key); await inner.setValue(key, value); } };
    const server = new FakeServer(3, 20_000);
    for (const c of server.chapters) c.title = `Section ${c.index + 1}`;
    server.makeAll();
    const api = {
      ...server.api,
      audiobook: async (id: string) => {
        const r = await server.api.audiobook(id);
        return r.ok && id === 'ab-other' ? { ...r, value: { ...r.value, book_id: 'other-book' } } : r;
      },
    };
    const w = world({ server, store, api });
    for (const id of [AB, 'ab2', 'ab-other']) {
      await w.o.start(id, { kind: 'ready_now' }, READY);
      await until(() => get(w.o).books.find((b) => b.audiobookId === id)?.chapters.every((c) => c.state === 'on_device') === true);
    }
    w.o.setOptions(AB, { wifiOnly: true, keepNew: true });
    w.o.pause(AB);
    await w.settle();
    const metadata = await Promise.all([AB, 'ab2', 'ab-other'].map((id) => store.getValue<BookMeta>(bookKey(id))));
    const records = await store.chapters();
    const contents = new Map(inner.raw.contents);
    const audio = await Promise.all((await store.audioIds()).map(async (id) => [id, new Uint8Array(await (await store.readAudio(id))!.arrayBuffer())] as const));
    const held = new Map(w.o.heldAudiobookIds().map((id) => [id, new Set(w.o.heldChapters(id))]));
    const heldChapter = await w.o.heldChapter(AB, 'ch1');
    server.reachable = false;
    const calls = [...server.log];
    writes.length = 0;

    await w.o.updateChapterMetadata(BOOK, refreshed);

    expect(server.log).toEqual(calls);
    expect(writes.sort()).toEqual([bookKey(AB), bookKey('ab2')].sort());
    for (let i = 0; i < 2; i++) {
      const before = metadata[i]!;
      expect(await store.getValue<BookMeta>(bookKey(before.audiobookId))).toEqual({
        ...before,
        chapters: before.chapters.map((c, index) => ({ ...c, title: refreshed[index]!.title, kind: refreshed[index]!.kind })),
      });
      const book = get(w.o).books.find((b) => b.audiobookId === before.audiobookId)!;
      expect(book.chapters.map((c) => [c.chapterId, c.index, c.title, c.kind])).toEqual(refreshed.map((c, index) => [c.id, index, c.title, c.kind]));
      expect(offlinePage(book, null, true, true).chapters.rows.map((c) => c.id)).toEqual(['ch2']);
    }
    expect(await store.getValue<BookMeta>(bookKey('ab-other'))).toEqual(metadata[2]);
    expect(get(w.o).books.find((b) => b.audiobookId === 'ab-other')!.chapters.map((c) => [c.title, c.kind])).toEqual([['Section 1', 'story'], ['Section 2', 'story'], ['Section 3', 'story']]);
    expect(await store.chapters()).toEqual(records);
    expect(inner.raw.contents).toEqual(contents);
    for (const [id, bytes] of audio) expect(new Uint8Array(await (await store.readAudio(id))!.arrayBuffer())).toEqual(bytes);
    expect(new Map(w.o.heldAudiobookIds().map((id) => [id, new Set(w.o.heldChapters(id))]))).toEqual(held);
    expect(await w.o.heldChapter(AB, 'ch1')).toEqual(heldChapter);
    expect(w.o.heldBook(BOOK, AB)!.chapters.map((c) => [c.id, c.index, c.title, c.kind])).toEqual(refreshed.map((c, index) => [c.id, index, c.title, c.kind]));

    writes.length = 0;
    await w.o.updateChapterMetadata(BOOK, refreshed);
    expect(writes).toEqual([]);
    expect(server.log).toEqual(calls);

    w.o.destroy();
    const reopened = createOffline({ api: server.api, store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1' });
    await reopened.ready;
    expect(reopened.heldBook(BOOK, AB)!.chapters.map((c) => [c.title, c.kind])).toEqual(refreshed.map((c) => [c.title, c.kind]));
    expect(await reopened.heldChapter(AB, 'ch1')).toMatchObject({ text: heldChapter!.text, lines: heldChapter!.lines, timings: heldChapter!.timings });
    expect(get(reopened).books.find((b) => b.audiobookId === AB)).toMatchObject({ wifiOnly: true, keepNew: true, status: 'paused' });
    reopened.destroy();
  });

  it('keeps successful cache writes visible and rolls back failed labels so a retry saves them with concurrent settings', async () => {
    const inner = memoryStore();
    let failNext = false;
    let rejectWrite: (() => void) | undefined;
    const store: OfflineStore = {
      ...inner,
      setValue: async (key, value) => {
        if (failNext && key === bookKey(AB)) {
          failNext = false;
          return new Promise<void>((_resolve, reject) => { rejectWrite = () => reject(new Error('cache write failed')); });
        }
        await inner.setValue(key, value);
      },
    };
    const w = world({ store });
    for (const id of [AB, 'ab2']) {
      await w.o.start(id, { kind: 'ready_now' }, READY);
      await until(() => get(w.o).books.find((b) => b.audiobookId === id)?.chapters.every((c) => c.state === 'on_device') === true);
    }
    await w.settle();
    const before = w.book()!.chapters.map((c) => [c.title, c.kind]);
    const records = await store.chapters();
    failNext = true;
    const update = w.o.updateChapterMetadata(BOOK, refreshed);
    await until(() => rejectWrite !== undefined);
    w.o.setOptions(AB, { wifiOnly: true });
    w.o.pause(AB);
    rejectWrite!();

    await expect(update).rejects.toThrow('cache write failed');

    expect(w.book()!.chapters.map((c) => [c.title, c.kind])).toEqual(before);
    expect(w.book()).toMatchObject({ wifiOnly: true, status: 'paused' });
    expect(get(w.o).books.find((b) => b.audiobookId === 'ab2')!.chapters.map((c) => [c.title, c.kind])).toEqual(refreshed.map((c) => [c.title, c.kind]));
    expect((await store.getValue<BookMeta>(bookKey('ab2')))!.chapters.map((c) => [c.title, c.kind])).toEqual(refreshed.map((c) => [c.title, c.kind]));
    expect(await store.chapters()).toEqual(records);

    await w.o.updateChapterMetadata(BOOK, refreshed);

    expect(w.book()!.chapters.map((c) => [c.title, c.kind])).toEqual(refreshed.map((c) => [c.title, c.kind]));
    expect(await store.getValue<BookMeta>(bookKey(AB))).toMatchObject({ options: { wifiOnly: true, keepNew: false }, paused: true, chapters: refreshed });
    expect(await store.chapters()).toEqual(records);
    w.o.destroy();
  });

  it('updates a matching audiobook while leaving another copy with mismatched cached ordering intact', async () => {
    const w = world();
    for (const id of [AB, 'ab2']) {
      await w.o.start(id, { kind: 'ready_now' }, READY);
      await until(() => get(w.o).books.find((b) => b.audiobookId === id)?.chapters.every((c) => c.state === 'on_device') === true);
    }
    w.o.destroy();
    const mismatched = (await w.store.getValue<BookMeta>(bookKey('ab2')))!;
    mismatched.chapters.reverse();
    await w.store.setValue(bookKey('ab2'), mismatched);
    w.server.reachable = false;
    const reopened = createOffline({ api: w.server.api, store: w.store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1' });
    await reopened.ready;

    await reopened.updateChapterMetadata(BOOK, refreshed);

    expect((await w.store.getValue<BookMeta>(bookKey(AB)))!.chapters.map((c) => [c.title, c.kind])).toEqual(refreshed.map((c) => [c.title, c.kind]));
    expect(await w.store.getValue<BookMeta>(bookKey('ab2'))).toEqual(mismatched);
    expect(reopened.heldChapters(AB)).toEqual(new Set(['ch1', 'ch2', 'ch3']));
    expect(reopened.heldChapters('ab2')).toEqual(new Set(['ch1', 'ch2', 'ch3']));
    reopened.destroy();
  });

  it.each(['missing', 'different', 'reordered', 'duplicate'] as const)('leaves the entire cached audiobook unchanged when chapter IDs are %s', async (caseName) => {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    await w.settle();
    const beforeMeta = await w.store.getValue<BookMeta>(bookKey(AB));
    const beforeBook = structuredClone(w.book());
    const records = await w.store.chapters(AB);
    const calls = [...w.server.log];
    let chapters = refreshed.map((c) => ({ ...c }));
    if (caseName === 'missing') chapters = chapters.slice(1);
    if (caseName === 'different') chapters[2]!.id = 'new-id';
    if (caseName === 'reordered') chapters.reverse();
    if (caseName === 'duplicate') chapters[2]!.id = chapters[1]!.id;

    await w.o.updateChapterMetadata(BOOK, chapters);

    expect(await w.store.getValue<BookMeta>(bookKey(AB))).toEqual(beforeMeta);
    expect(w.book()).toEqual(beforeBook);
    expect(await w.store.chapters(AB)).toEqual(records);
    expect(w.server.log).toEqual(calls);
    w.o.destroy();
  });
});

describe('held chapters for the player', () => {
  it('retains cached matter metadata and all text/audio after offline hiding and reopening', async () => {
    const server = new FakeServer(4, 20_000);
    server.chapters[0]!.kind = 'front_matter';
    server.chapters[3]!.kind = 'back_matter';
    server.makeAll();
    const w = world({ server });
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    const before = await w.store.chapters(AB);
    const content = await w.store.content(AB, 'ch1');
    const bytes = new Uint8Array(await (await w.store.readAudio(before[0]!.audioId))!.arrayBuffer());
    w.o.destroy();
    server.reachable = false;
    const reopened = createOffline({ api: server.api, store: w.store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1' });
    await reopened.ready;
    const cached = get(reopened).books[0]!;
    expect(cached.chapters.map((c) => [c.chapterId, c.index, c.kind])).toEqual([
      ['ch1', 0, 'front_matter'], ['ch2', 1, 'story'], ['ch3', 2, 'story'], ['ch4', 3, 'back_matter'],
    ]);
    expect(offlinePage(cached, null, true, true).chapters.rows.map((row) => row.id)).toEqual(['ch2', 'ch3']);
    expect([...reopened.heldChapters(AB)]).toEqual(['ch1', 'ch2', 'ch3', 'ch4']);
    expect(await w.store.content(AB, 'ch1')).toEqual(content);
    expect(new Uint8Array(await (await w.store.readAudio(before[0]!.audioId))!.arrayBuffer())).toEqual(bytes);
    expect((await w.store.chapters(AB)).map((record) => [record.chapterId, record.audioId, record.textSha256])).toEqual(before.map((record) => [record.chapterId, record.audioId, record.textSha256]));
    expect((await reopened.heldChapter(AB, 'ch1'))?.text).toBe(content?.text);
    reopened.destroy();
  });
  it('treats missing legacy kind metadata as story without dropping cached chapters', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    w.o.destroy();
    const meta = (await w.store.getValue<BookMeta>(bookKey(AB)))!;
    delete (meta.chapters[0] as { kind?: string }).kind;
    meta.chapters[1]!.kind = 'unknown-old-kind';
    await w.store.setValue(bookKey(AB), meta);
    w.server.reachable = false;
    const reopened = createOffline({ api: w.server.api, store: w.store, clock: w.clock, connection: w.connection, events: null, storage: w.storage, urls: w.urls, listener: () => 'L1' });
    await reopened.ready;
    expect(get(reopened).books[0]!.chapters.map((chapter) => chapter.kind)).toEqual(['story', 'story', 'story']);
    expect([...reopened.heldChapters(AB)]).toEqual(['ch1', 'ch2', 'ch3']);
    reopened.destroy();
  });
  it('gives a URL that works without the server, the exact text, lines and timings', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => allOnDevice(w));
    w.server.reachable = false;
    const h = (await w.o.heldChapter(AB, 'ch1'))!;
    expect(h.audioUrl).toMatch(/^blob:/);
    expect(w.urls.live.get(h.audioUrl)!.size).toBe(20_000);
    expect(h.text).toBe(w.server.chapters[0]!.text);
    expect(h.lines.map((l) => l.id)).toEqual(['ch1-l1', 'ch1-l2']);
    expect(h.durationSeconds).toBeCloseTo(20_000 / 48000);
    expect((await w.o.heldChapter(AB, 'ch1'))!.audioUrl).toBe(h.audioUrl);
    expect(await w.o.heldChapter(AB, 'nope')).toBeNull();
    expect(await w.o.heldChapter('other', 'ch1')).toBeNull();
  });
  it('serves the exact bytes the manifest promised', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'chapters', chapterIds: ['ch3'] }, READY);
    await until(() => w.ch('ch3')?.state === 'on_device');
    const blob = w.urls.live.get((await w.o.heldChapter(AB, 'ch3'))!.audioUrl)!;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(w.server.files.get(w.server.current.get('ch3')!)!.bytes);
  });
});

describe('storage', () => {
  it('asks for persistent storage when a download starts and reports it', async () => {
    const w = world();
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    await until(() => get(w.o).storage.persisted);
    expect(w.storage.persistCalls).toBe(1);
  });
  it('keeps what the browser cannot say as null, never 0', async () => {
    const w = world({ ready: false });
    w.storage.quota = null;
    w.storage.usage = null;
    await w.o.ready;
    await w.settle();
    expect(get(w.o).storage.freeBytes).toBeNull();
    expect(get(w.o).storage.unmetered).toBe(true);
    w.connection.set('unknown');
    expect(get(w.o).storage.unmetered).toBeNull();
  });
});

describe('problems with a command', () => {
  it('says nothing was downloaded when the server cannot be reached to list the audiobook', async () => {
    const w = world();
    w.server.reachable = false;
    await w.o.start(AB, { kind: 'ready_now' }, READY);
    expect(get(w.o).notice).toMatch(/^Nothing was downloaded\./);
    expect(get(w.o).books).toEqual([]);
  });
});

void ({} as OfflineStateX);
