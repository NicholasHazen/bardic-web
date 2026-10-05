import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { memoryStorage } from '../lib/clock';
import { DEVICE, FakePlaces, place } from '../player/testing';
import { PlaceSync, type Lifecycle, type Position, type SyncPolicy } from './place';

const L = 'listener-1';
const B = 'b1';

function setup(policy: SyncPolicy = 'ask') {
  const clock = new FakeClock();
  const places = new FakePlaces();
  const storage = memoryStorage();
  let pol = policy;
  const bg: (() => void)[] = [];
  const online: (() => void)[] = [];
  const lifecycle: Lifecycle = {
    onBackground: (cb) => (bg.push(cb), () => {}),
    onOnline: (cb) => (online.push(cb), () => {}),
  };
  const mk = () => new PlaceSync({ api: places, storage, clock, deviceId: () => DEVICE, policy: () => pol, lifecycle });
  const sync = mk();
  sync.start();
  const pos = (offset: number, extra: Partial<Position> = {}): Position => ({ chapterId: 'c1', offset, time: offset, mode: 'listening', audiobookId: 'ab1', ...extra });
  return { clock, places, storage, sync, mk, pos, setPolicy: (p: SyncPolicy) => (pol = p), bg, online };
}

describe('writing the place', () => {
  it('while playing, the server is written at most every 30 seconds', async () => {
    const { sync, clock, places, pos } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), true);
    await clock.advance(10_000);
    sync.record(pos(20), true);
    await clock.advance(19_000);
    sync.record(pos(29), true);
    expect(places.puts).toHaveLength(0);
    await clock.advance(1500);
    sync.record(pos(31), true);
    await clock.flush();
    expect(places.puts).toHaveLength(1);
    expect(places.puts[0]!.input.offset).toBe(31);
    // the next write waits another 30 seconds
    await clock.advance(5000);
    sync.record(pos(36), true);
    await clock.flush();
    expect(places.puts).toHaveLength(1);
    await clock.advance(26_000);
    sync.record(pos(62), true);
    await clock.flush();
    expect(places.puts).toHaveLength(2);
  });

  it('does nothing while paused until a flush, then writes once with base_revision', async () => {
    const { sync, clock, places, pos } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    await clock.advance(120_000);
    sync.record(pos(12), false);
    expect(places.puts).toHaveLength(0);
    await sync.flush();
    expect(places.puts).toHaveLength(1);
    expect(places.puts[0]!.input).toEqual({ chapter_id: 'c1', offset: 12, mode: 'listening', audiobook_id: 'ab1', base_revision: 0 });
    expect(get(sync.status)).toBe('saved');
    // a flush with nothing new writes nothing
    await sync.flush();
    expect(places.puts).toHaveLength(1);
  });

  it('every write builds on the revision the server last gave', async () => {
    const { sync, places, pos } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    await sync.flush();
    sync.record(pos(50), false);
    await sync.flush();
    sync.record(pos(90), false);
    await sync.flush();
    expect(places.puts.map((p) => p.input.base_revision)).toEqual([0, 1, 2]);
    expect(sync.revision).toBe(3);
  });

  it('backgrounding writes now with keepalive', async () => {
    const { sync, places, pos, bg, clock } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), true);
    bg[0]!();
    await clock.flush();
    expect(places.puts).toHaveLength(1);
    expect(places.puts[0]!.keepalive).toBe(true);
  });

  it('a newer position that replaces the one in flight is not lost when the first is acknowledged', async () => {
    const { sync, places, pos, clock } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    const first = sync.flush();
    sync.record(pos(50), false); // while the first write is on its way
    await first;
    expect(sync.queue.get(L, B)!.input.offset).toBe(50);
    await sync.flush();
    await clock.flush();
    expect(places.puts.map((p) => p.input.offset)).toEqual([10, 50]);
    expect(places.puts[1]!.input.base_revision).toBe(1);
    expect(sync.queue.size).toBe(0);
  });

  it('an identical position is not written twice', async () => {
    const { sync, places, pos } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10, { time: 1 }), false);
    await sync.flush();
    sync.record(pos(10, { time: 2 }), false);
    await sync.flush();
    expect(places.puts).toHaveLength(1);
  });

  it('a write from this device the server already holds is not a conflict', async () => {
    const { sync, places, pos } = setup();
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    await sync.flush();
    // another tab of this device moved the place; we still think the revision is 1
    places.server = place({ device_id: DEVICE, revision: 5, chapter_id: 'c1', offset: 3 });
    sync.record(pos(40), false);
    await sync.flush();
    expect(get(sync.conflict)).toBeNull();
    expect(places.server!.offset).toBe(40);
  });

  it('a write the server rejects for good is dropped, not retried forever', async () => {
    const { sync, places, pos } = setup();
    places.put.mockResolvedValueOnce({ kind: 'rejected', status: 400, code: 'offset_out_of_range' });
    sync.begin(L, B, null);
    sync.record(pos(9999), false);
    await sync.flush();
    expect(sync.queue.size).toBe(0);
  });
});

describe('offline', () => {
  it('queues, coalesces to the latest, and replays on reconnect', async () => {
    const { sync, places, pos, online, clock } = setup();
    places.down = true;
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    await sync.flush();
    expect(get(sync.status)).toBe('queued_offline');
    sync.record(pos(20), false);
    await sync.flush();
    sync.record(pos(30), false);
    await sync.flush();
    expect(sync.queue.size).toBe(1);
    expect(sync.queue.get(L, B)!.input.offset).toBe(30);
    places.down = false;
    places.puts.length = 0;
    online[0]!();
    await clock.flush();
    expect(places.puts).toHaveLength(1);
    expect(places.puts[0]!.input.offset).toBe(30);
    expect(sync.queue.size).toBe(0);
    expect(get(sync.status)).toBe('saved');
  });

  it('retries by itself after a while', async () => {
    const { sync, places, pos, clock } = setup();
    places.down = true;
    sync.begin(L, B, null);
    sync.record(pos(10), false);
    await sync.flush();
    places.down = false;
    places.puts.length = 0;
    await clock.advance(16_000);
    expect(places.puts).toHaveLength(1);
    expect(get(sync.status)).toBe('saved');
  });

  it('survives a reload: the queue and the local copy are in storage', async () => {
    const { sync, places, pos, mk, clock } = setup();
    places.down = true;
    sync.begin(L, B, null);
    sync.record(pos(10, { time: 7.5 }), false);
    await sync.flush();
    const again = mk();
    expect(again.queue.get(L, B)!.input.offset).toBe(10);
    expect(again.readLocal(L, B)).toMatchObject({ chapterId: 'c1', offset: 10, time: 7.5, rev: 0 });
    places.down = false;
    await again.replayQueue();
    await clock.flush();
    expect(places.server!.offset).toBe(10);
  });

  it('replays books in the order they were first queued, the latest of each', async () => {
    const { sync, places, pos, online, clock } = setup();
    places.down = true;
    sync.begin(L, 'bookA', null);
    sync.record(pos(1), false);
    await sync.flush();
    await clock.advance(10);
    sync.begin(L, 'bookB', null);
    sync.record(pos(2), false);
    await sync.flush();
    await clock.advance(10);
    sync.begin(L, 'bookA', null);
    sync.record(pos(3), false); // the same book again: still first in line
    await sync.flush();
    places.down = false;
    places.puts.length = 0;
    online[0]!();
    await clock.flush();
    expect(places.puts.map((p) => `${p.bookId}:${p.input.offset}`)).toEqual(['bookA:3', 'bookB:2']);
  });
});

describe('conflicts', () => {
  async function conflicted(policy: SyncPolicy, theirs: Parameters<FakePlaces['other']>[0] = {}) {
    const s = setup(policy);
    s.places.server = place({ device_id: DEVICE, revision: 2, chapter_id: 'c1', offset: 1 });
    s.sync.begin(L, B, s.places.server);
    s.places.other({ chapter_id: 'c3', offset: 20, revision: 5, ...theirs }); // another device
    s.sync.record(s.pos(40), false);
    await s.sync.flush();
    return s;
  }

  it('ask: holds the write, shows both places, and writes nothing more', async () => {
    const { sync, places, pos } = await conflicted('ask');
    const c = get(sync.conflict)!;
    expect(c.mine.offset).toBe(40);
    expect(c.theirs.chapter_id).toBe('c3');
    const n = places.puts.length;
    sync.record(pos(45), true);
    await sync.flush();
    expect(places.puts).toHaveLength(n);
  });

  it("ask, 'mine': writes this device's place on the server's revision", async () => {
    const { sync, places } = await conflicted('ask');
    await sync.resolve('mine');
    const last = places.puts[places.puts.length - 1]!;
    expect(last.input.base_revision).toBe(5);
    expect(last.input.offset).toBe(40);
    expect(places.server!.offset).toBe(40);
    expect(get(sync.conflict)).toBeNull();
    expect(sync.queue.size).toBe(0);
  });

  it("ask, 'theirs': adopts the server's place, and this device's unsynced position is kept in the server's history first", async () => {
    const { sync, places } = await conflicted('ask');
    const adopted = vi.fn();
    sync.onAdopt = adopted;
    const n = places.puts.length;
    await sync.resolve('theirs');
    // ours is written on the server's revision (so the server keeps the place it replaced), then theirs on top of it
    const writes = places.puts.slice(n);
    expect(writes.map((w) => `${w.input.chapter_id}:${w.input.offset}:${w.input.base_revision}`)).toEqual(['c1:40:5', 'c3:20:6']);
    expect(places.server).toMatchObject({ chapter_id: 'c3', offset: 20 });
    expect(places.history.some((h) => h.chapter_id === 'c1' && h.offset === 40)).toBe(true);
    expect(places.history.some((h) => h.chapter_id === 'c3' && h.offset === 20)).toBe(true);
    expect(adopted).toHaveBeenCalledWith(expect.objectContaining({ chapter_id: 'c3', offset: 20 }));
    expect(sync.revision).toBe(7);
    expect(sync.queue.size).toBe(0);
    expect(get(sync.conflict)).toBeNull();
    sync.record({ chapterId: 'c3', offset: 25, time: null, mode: 'listening', audiobookId: 'ab1' }, false);
    await sync.flush();
    expect(places.puts[places.puts.length - 1]!.input.base_revision).toBe(7);
  });

  it("ask, 'theirs' while offline: both writes wait in the queue and go out in order on reconnect", async () => {
    const { sync, places, online, clock } = await conflicted('ask');
    places.down = true;
    await sync.resolve('theirs');
    expect(sync.queue.get(L, B)!.after).toMatchObject({ chapter_id: 'c3', offset: 20 });
    places.down = false;
    places.puts.length = 0;
    online[0]!();
    await clock.flush();
    expect(places.puts.map((w) => `${w.input.chapter_id}:${w.input.base_revision}`)).toEqual(['c1:5', 'c3:6']);
    expect(places.history.some((h) => h.chapter_id === 'c1')).toBe(true);
    expect(sync.queue.size).toBe(0);
  });

  it("ask, 'theirs' with nothing unsynced writes nothing", async () => {
    const s = setup('ask');
    s.places.server = place({ device_id: DEVICE, revision: 2, chapter_id: 'c1', offset: 1 });
    s.sync.begin(L, B, s.places.server);
    const theirs = s.places.other({ chapter_id: 'c3', offset: 20, revision: 5 });
    s.sync.remote(theirs, false);
    expect(get(s.sync.conflict)).not.toBeNull();
    const n = s.places.puts.length;
    await s.sync.resolve('theirs');
    expect(s.places.puts).toHaveLength(n);
  });

  it('newest keeps this device when its change is later', async () => {
    const { sync, places } = await conflicted('newest', { updated_at: '2020-01-01T00:00:00Z' });
    expect(get(sync.conflict)).toBeNull();
    const last = places.puts[places.puts.length - 1]!;
    expect(last.input.base_revision).toBe(5);
    expect(places.server!.offset).toBe(40);
  });

  it('newest adopts the server when the other device is later', async () => {
    const adopted = vi.fn();
    const s = setup('newest');
    s.places.server = place({ device_id: DEVICE, revision: 2, chapter_id: 'c1', offset: 1 });
    s.sync.begin(L, B, s.places.server);
    s.sync.onAdopt = adopted;
    s.places.other({ chapter_id: 'c3', offset: 20, revision: 5, updated_at: '2090-01-01T00:00:00Z' });
    s.sync.record(s.pos(40), false);
    await s.sync.flush();
    await s.clock.flush();
    expect(adopted).toHaveBeenCalled();
    expect(s.places.server!.chapter_id).toBe('c3');
    // this device's position lost, and is in the server's history all the same
    expect(s.places.history.some((h) => h.chapter_id === 'c1' && h.offset === 40)).toBe(true);
    expect(get(s.sync.conflict)).toBeNull();
  });

  it('this_device keeps this device on the server revision', async () => {
    const { sync, places } = await conflicted('this_device');
    expect(get(sync.conflict)).toBeNull();
    const last = places.puts[places.puts.length - 1]!;
    expect(last.input.base_revision).toBe(5);
    expect(places.server!.offset).toBe(40);
    expect(places.history.some((h) => h.chapter_id === 'c3')).toBe(true);
  });

  it('the same spot on both is not a conflict', async () => {
    const s = setup('ask');
    s.places.server = place({ device_id: DEVICE, revision: 2, chapter_id: 'c1', offset: 1 });
    s.sync.begin(L, B, s.places.server);
    s.places.other({ chapter_id: 'c1', offset: 40, revision: 5 });
    s.sync.record(s.pos(40), false);
    await s.sync.flush();
    expect(get(s.sync.conflict)).toBeNull();
    expect(s.sync.queue.size).toBe(0);
  });
});

describe('opening a book (C3)', () => {
  const local = { chapterId: 'c1', offset: 5, time: 5, mode: 'listening' as const, audiobookId: 'ab1', rev: 3, updatedAt: Date.parse('2027-01-01T00:00:00Z') };
  const seed = (s: ReturnType<typeof setup>) => s.storage.setItem(`bardic.place.${L}.${B}`, JSON.stringify(local));

  it('no place anywhere: fresh. Only the server: the server. Only this device: this device, and it is queued', () => {
    const a = setup();
    expect(a.sync.begin(L, B, null).kind).toBe('fresh');
    const b = setup();
    expect(b.sync.begin(L, B, place()).kind).toBe('server');
    const c = setup();
    seed(c);
    expect(c.sync.begin(L, B, null).kind).toBe('local');
    expect(c.sync.queue.has(L, B)).toBe(true);
  });

  it('the server has not moved since: the local copy, with its exact time', () => {
    const s = setup();
    seed(s);
    const d = s.sync.begin(L, B, place({ revision: 3, chapter_id: 'c1', offset: 5 }));
    expect(d.kind).toBe('local');
  });

  it('another device moved it: ask shows both, newest compares, this_device keeps ours', () => {
    const ask = setup('ask');
    seed(ask);
    expect(ask.sync.begin(L, B, place({ revision: 9 })).kind).toBe('ask');
    expect(get(ask.sync.conflict)!.theirs.revision).toBe(9);

    const newest = setup('newest');
    seed(newest);
    expect(newest.sync.begin(L, B, place({ revision: 9, updated_at: '2090-01-01T00:00:00Z' })).kind).toBe('server');
    const newest2 = setup('newest');
    seed(newest2);
    expect(newest2.sync.begin(L, B, place({ revision: 9, updated_at: '2020-01-01T00:00:00Z' })).kind).toBe('local');

    const mine = setup('this_device');
    seed(mine);
    const d = mine.sync.begin(L, B, place({ revision: 9 }));
    expect(d.kind).toBe('local');
    expect(mine.sync.revision).toBe(9);
    expect(mine.sync.queue.get(L, B)!.input.base_revision).toBe(9);
  });

  it('the same place from another device is no conflict', () => {
    const s = setup('ask');
    seed(s);
    expect(s.sync.begin(L, B, place({ revision: 9, chapter_id: 'c1', offset: 5 })).kind).toBe('server');
  });

  it('a place this device wrote itself is the server place, not a conflict', () => {
    const s = setup('ask');
    seed(s);
    expect(s.sync.begin(L, B, place({ revision: 9, device_id: DEVICE })).kind).toBe('server');
  });
});

describe('a position that loses is never dropped', () => {
  const local = { chapterId: 'c1', offset: 5, time: 5, mode: 'listening' as const, audiobookId: 'ab1', rev: 3, updatedAt: Date.parse('2027-01-01T00:00:00Z') };

  it('newest at open: a queued position that is older than the server place is written first, then theirs', async () => {
    const s = setup('newest');
    s.storage.setItem(`bardic.place.${L}.${B}`, JSON.stringify(local));
    s.sync.queue.put(L, B, { chapter_id: 'c1', offset: 5, mode: 'listening', audiobook_id: 'ab1', base_revision: 3 }, 1);
    s.places.server = place({ revision: 9, chapter_id: 'c3', offset: 0, updated_at: '2090-01-01T00:00:00Z' });
    expect(s.sync.begin(L, B, s.places.server).kind).toBe('server');
    await s.clock.flush();
    expect(s.places.puts.map((w) => `${w.input.chapter_id}:${w.input.base_revision}`)).toEqual(['c1:9', 'c3:10']);
    expect(s.places.history.some((h) => h.chapter_id === 'c1')).toBe(true);
    expect(s.places.server).toMatchObject({ chapter_id: 'c3' });
  });

  it('a queued write of a book that is not open waits for that book, and is kept when it loses', async () => {
    const s = setup('newest');
    s.storage.setItem(`bardic.place.${L}.${B}`, JSON.stringify(local));
    s.places.server = place({ revision: 9, chapter_id: 'c3', offset: 0, updated_at: '2090-01-01T00:00:00Z' });
    s.sync.queue.put(L, B, { chapter_id: 'c1', offset: 5, mode: 'listening', audiobook_id: 'ab1', base_revision: 3 }, 1);
    await s.sync.replayQueue(); // meets the conflict: stays queued
    expect(s.sync.queue.has(L, B)).toBe(true);
    expect(s.places.server!.chapter_id).toBe('c3');
    s.sync.begin(L, B, s.places.server);
    await s.clock.flush();
    expect(s.places.history.some((h) => h.chapter_id === 'c1')).toBe(true);
    expect(s.places.server!.chapter_id).toBe('c3');
  });

  it('the same spot is simply dropped', async () => {
    const s = setup('newest');
    s.storage.setItem(`bardic.place.${L}.${B}`, JSON.stringify(local));
    s.sync.queue.put(L, B, { chapter_id: 'c3', offset: 0, mode: 'listening', audiobook_id: 'ab1', base_revision: 3 }, 1);
    s.places.server = place({ revision: 9, chapter_id: 'c3', offset: 0, updated_at: '2090-01-01T00:00:00Z' });
    s.sync.begin(L, B, s.places.server);
    await s.clock.flush();
    expect(s.places.puts).toHaveLength(0);
    expect(s.sync.queue.size).toBe(0);
  });
});

describe('another device while listening', () => {
  it('is only remembered while playing and offered at the pause', async () => {
    const s = setup('ask');
    s.sync.begin(L, B, place({ device_id: DEVICE, revision: 2 }));
    s.sync.record(s.pos(10), true);
    const theirs = s.places.other({ chapter_id: 'c3', offset: 20, revision: 6 });
    expect(s.sync.remote(theirs, true)).toBe(true);
    expect(get(s.sync.conflict)).toBeNull();
    s.sync.settle();
    expect(get(s.sync.conflict)!.theirs.revision).toBe(6);
  });

  it('newest adopts it at the pause when it is later; this_device ignores it', () => {
    const adopted = vi.fn();
    const s = setup('newest');
    s.sync.begin(L, B, place({ device_id: DEVICE, revision: 2 }));
    s.sync.onAdopt = adopted;
    s.sync.record(s.pos(10), false);
    s.sync.remote(place({ chapter_id: 'c3', offset: 20, revision: 6, updated_at: '2090-01-01T00:00:00Z' }), false);
    expect(adopted).toHaveBeenCalled();

    const t = setup('this_device');
    t.sync.begin(L, B, place({ device_id: DEVICE, revision: 2 }));
    t.sync.onAdopt = adopted.mockClear();
    t.sync.remote(place({ chapter_id: 'c3', offset: 20, revision: 6 }), false);
    expect(adopted).not.toHaveBeenCalled();
    expect(get(t.sync.conflict)).toBeNull();
  });

  it("its own writes and older revisions are ignored", () => {
    const s = setup('ask');
    s.sync.begin(L, B, place({ device_id: DEVICE, revision: 5 }));
    expect(s.sync.remote(place({ device_id: DEVICE, revision: 9 }), false)).toBe(false);
    expect(s.sync.remote(place({ revision: 4 }), false)).toBe(false);
    expect(get(s.sync.conflict)).toBeNull();
  });
});

describe('ending', () => {
  it('writes under the listener the book was opened with', async () => {
    const { sync, places, pos } = setup();
    sync.begin('old-listener', B, null);
    sync.record(pos(10), false);
    await sync.end();
    expect(places.puts[0]!.listenerId).toBe('old-listener');
    sync.record(pos(11), false); // nothing is attached any more
    await sync.flush();
    expect(places.puts).toHaveLength(1);
  });
});
