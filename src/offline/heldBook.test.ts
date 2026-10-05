import { describe, expect, it } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { createOffline } from './offline';
import { AUDIOBOOK as AB, BOOK, FakeConnection, FakeEvents, FakeServer, fakeStorage, fakeUrls } from './testing';
import { memoryStore } from './store';
import { get } from 'svelte/store';
import { cpLength } from '../lib/codepoints';
import { offlinePage } from '../views/offline/connected/mapping';

async function until(cond: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('heldBook', () => {
  it('persists chapter metrics through metadata refresh and offline reopen without replacing held content', async () => {
    const server = new FakeServer(1, 20_000);
    server.chapters[0]!.text = '🕯️ Door 🌙.';
    server.chapters[0]!.pageCount = 2;
    server.makeAll();
    const store = memoryStore();
    const clock = new FakeClock();
    const connection = new FakeConnection();
    const deps = { api: server.api, store, clock, connection, events: null, storage: fakeStorage(), urls: fakeUrls(), listener: () => 'L1', partBytes: 8192 };
    const o = createOffline(deps);
    await o.ready;
    await o.start(AB, { kind: 'ready_now' }, { wifiOnly: false, keepNew: false });
    await until(() => o.heldChapters(AB).has('ch1'));
    const held = await o.heldChapter(AB, 'ch1');
    const records = await store.chapters(AB);
    const beforeContent = await store.content(AB, 'ch1');
    const bytes = new Uint8Array(await (await store.readAudio(records[0]!.audioId))!.arrayBuffer());
    expect(o.heldBook(BOOK)!.chapters[0]).toMatchObject({ wordCount: 5, textLength: cpLength(server.chapters[0]!.text), pageCount: 2 });
    expect(o.heldDuration(AB, 'ch1')).toBe(held?.durationSeconds);
    const metadata = await server.api.chapters(BOOK);
    if (!metadata.ok) throw new Error('synthetic metadata unavailable');
    await o.updateChapterMetadata(BOOK, metadata.value.map((c) => ({ ...c, title: 'The Lantern', page_count: 3 })));
    expect(await o.heldChapter(AB, 'ch1')).toEqual(held);
    expect(await store.chapters(AB)).toEqual(records);
    expect(await store.content(AB, 'ch1')).toEqual(beforeContent);
    expect(new Uint8Array(await (await store.readAudio(records[0]!.audioId))!.arrayBuffer())).toEqual(bytes);
    o.destroy();
    server.reachable = false;
    const reopened = createOffline({ ...deps, urls: fakeUrls() });
    await reopened.ready;
    const row = offlinePage(get(reopened).books[0]!, { chapterId: 'ch1', offset: 5, updatedAt: 1 }, true).chapters.rows[0]!;
    expect(row).toMatchObject({ title: 'The Lantern', wordText: 'On this device', metadata: '5 words · 3 pages · <1 min audio', progressText: '50% through chapter' });
    expect(await reopened.heldChapter(AB, 'ch1')).toMatchObject({ text: beforeContent!.text });
    expect(await store.chapters(AB)).toEqual(records);
    reopened.destroy();
  });

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
