import { describe, expect, it } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { createOffline } from './offline';
import { AUDIOBOOK as AB, BOOK, FakeConnection, FakeEvents, FakeServer, fakeStorage, fakeUrls } from './testing';
import { memoryStore } from './store';

async function until(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('heldBook', () => {
  it('describes a downloaded book for the player: chapters in order with their kind, null when nothing is held', async () => {
    const server = new FakeServer(3, 20_000);
    server.makeAll();
    const o = createOffline({ api: server.api, store: memoryStore(), clock: new FakeClock(), connection: new FakeConnection(), events: new FakeEvents(), storage: fakeStorage(), urls: fakeUrls(), listener: () => 'L1', partBytes: 8192 });
    await o.ready;
    expect(o.heldBook(BOOK)).toBeNull();
    await o.start(AB, { kind: 'chapters', chapterIds: ['ch2'] }, { wifiOnly: false, keepNew: false });
    await until(() => o.heldChapters(AB).has('ch2'));
    const b = o.heldBook(BOOK, AB)!;
    expect(b).toMatchObject({ bookId: BOOK, audiobookId: AB, title: 'The Lamp', voiceName: 'Mara' });
    expect(b.chapters.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3']);
    expect(b.chapters.every((c) => c.kind === 'story')).toBe(true);
    expect(o.heldBook('other-book')).toBeNull();
  });
});
