// The player with no connection to the Bardic computer (O3 to O5): downloaded chapters play and read from this device,
// the others say why and offer the next one that is held, the place is kept and sent when the server is back.
import { get, writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { memoryStorage } from '../lib/clock';
import type { HeldBookInfo, HeldChapter } from '../offline/types';
import { createPlayer, type PlayerDeps } from './player';
import { BOOK_ID, DEVICE, FakeApi, FakeAudioFactory, FakeEvents, FakePlaces, LISTENER, audioUrl, linesOf, notYet, place } from './testing';

const heldText = (id: string) => `HELD copy of ${id}. Second held line. Third held line.`;
function heldChapter(id: string, duration = 50): HeldChapter {
  const t = heldText(id);
  const a = t.indexOf('.') + 1;
  const b = t.indexOf('.', a + 1) + 1;
  const end = [...t].length;
  return {
    audioUrl: `blob:held-${id}`,
    text: t,
    lines: [
      { id: `${id}-h1`, start: 0, end: a },
      { id: `${id}-h2`, start: a + 1, end: b },
      { id: `${id}-h3`, start: b + 1, end: end },
    ],
    timings: [
      { lineId: `${id}-h1`, startMs: 0, endMs: 10_000 },
      { lineId: `${id}-h2`, startMs: 10_000, endMs: 30_000 },
      { lineId: `${id}-h3`, startMs: 30_000, endMs: duration * 1000 },
    ],
    durationSeconds: duration,
  };
}

const heldInfo: HeldBookInfo = {
  bookId: BOOK_ID,
  audiobookId: 'ab1',
  title: 'The Ash Ledger',
  author: 'Odile Brandt',
  coverColor: '#445566',
  voiceName: 'Mara',
  chapters: [
    { id: 'c0', index: 0, title: 'Title page', kind: 'front_matter' },
    { id: 'c1', index: 1, title: 'Ash on the Water', kind: 'story' },
    { id: 'c2', index: 2, title: 'What the Ledger Owes', kind: 'story' },
    { id: 'c3', index: 3, title: 'A Debt in Salt', kind: 'story' },
    { id: 'c4', index: 4, title: 'Afterword', kind: 'back_matter' },
  ],
};

function make(heldIds: string[] = ['c1', 'c3'], o: { heldBook?: HeldBookInfo | null } = {}) {
  const clock = new FakeClock();
  const audio = new FakeAudioFactory();
  for (const id of ['c0', 'c1', 'c2', 'c3', 'c4']) audio.durations[audioUrl(id)] = 100;
  for (const id of ['c1', 'c3']) audio.durations[`blob:held-${id}`] = 50;
  const api = new FakeApi();
  const places = new FakePlaces();
  const events = new FakeEvents();
  const storage = memoryStorage();
  const online = writable(true);
  const held = new Set(heldIds);
  const heldFn = vi.fn(async (_ab: string, id: string) => (held.has(id) ? heldChapter(id) : null));
  const deps: PlayerDeps = {
    api,
    places,
    clock,
    createAudio: audio.make,
    storage,
    events,
    mediaSession: null,
    listener: () => LISTENER,
    deviceId: () => DEVICE,
    lifecycle: null,
    heldChapters: () => held,
    held: heldFn,
    heldBook: () => (o.heldBook === undefined ? heldInfo : o.heldBook),
    online,
  };
  const player = createPlayer(deps);
  const cut = () => {
    api.unreachable = true;
    places.down = true;
    online.set(false);
  };
  const restore = () => {
    api.unreachable = false;
    places.down = false;
    online.set(true);
  };
  return { clock, audio, api, places, events, storage, player, st: () => get(player), el: () => audio.main, heldFn, online, cut, restore, held };
}
type H = ReturnType<typeof make>;
const open = async (h: H, opts: Parameters<H['player']['open']>[1] = {}) => {
  await h.player.open(BOOK_ID, opts);
  await h.clock.flush();
};
const seedLocal = (h: H, chapterId: string, offset: number, time: number | null, rev = 4) =>
  h.storage.setItem(`bardic.place.${LISTENER}.${BOOK_ID}`, JSON.stringify({ chapterId, offset, time, mode: 'listening', audiobookId: 'ab1', rev, updatedAt: 1 }));

describe('this device is preferred', () => {
  it('exposes the runtime of retained audio rather than a newer server copy', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, device_id: DEVICE, revision: 2 });
    await open(h);
    expect(h.st().duration).toBe(50);
    expect(h.st().chapters.find((c) => c.id === 'c1')?.durationSeconds).toBe(50);
  });
  it('a held chapter plays from the copy and reads its held text, online; the others come from the server', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, device_id: DEVICE, revision: 2 });
    await open(h);
    const s = h.st();
    expect(h.el().src).toBe('blob:held-c1');
    expect(s.text).toBe(heldText('c1'));
    expect(s.lines.map((l) => l.id)).toEqual(['c1-h1', 'c1-h2', 'c1-h3']);
    expect(s.duration).toBe(50);
    expect(h.api.chapterText).not.toHaveBeenCalledWith(BOOK_ID, 'c1');
    expect(h.api.timings).not.toHaveBeenCalled();
    h.player.play();
    await h.clock.flush();
    h.el().tick(12);
    expect(h.st().currentLineId).toBe('c1-h2');
    // c2 is not held: the server
    h.player.nextChapter();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.el().src).toBe(audioUrl('c2'));
    expect(h.api.chapterText).toHaveBeenCalledWith(BOOK_ID, 'c2');
  });

  it('a held chapter is ready whatever the server says, and nothing is requested for it', async () => {
    const h = make();
    h.api.audio.set('c1', notYet('c1'));
    await open(h);
    expect(h.st().chapters.find((c) => c.id === 'c1')!.audio).toBe('on_device');
    h.player.play();
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
    expect(h.st().listening).toBe('playing');
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });

  it('opens at the exact place inside a held chapter through its timings', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: heldChapter('c1').lines[1]!.start, device_id: DEVICE, revision: 2 });
    await open(h);
    expect(h.el().currentTime).toBeCloseTo(10, 3);
    expect(h.st().currentLineId).toBe('c1-h2');
  });

  it('never makes an object URL of its own', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});

describe('opening with no connection', () => {
  it('keeps unknown legacy word counts unknown and uses cached real counts when they exist', async () => {
    const legacy = make();
    legacy.cut();
    await open(legacy);
    expect(legacy.st().chapters.every((c) => c.wordCount === undefined)).toBe(true);
    expect(legacy.st().chapters.find((c) => c.id === 'c1')?.textLength).toBe([...heldText('c1')].length);
    const cached = make(['c1', 'c3'], { heldBook: { ...heldInfo, chapters: heldInfo.chapters.map((c) => ({ ...c, wordCount: 400, textLength: [...heldText(c.id)].length, pageCount: c.id === 'c1' ? 2 : null })) } });
    cached.cut();
    await open(cached);
    expect(cached.st().chapters.find((c) => c.id === 'c1')).toMatchObject({ wordCount: 400, pageCount: 2, durationSeconds: 50 });
  });
  it('builds the book from what the device remembers and the place from the local copy', async () => {
    const h = make();
    seedLocal(h, 'c3', heldChapter('c3').lines[1]!.start, 14);
    h.cut();
    await open(h);
    const s = h.st();
    expect(s.loaded).toBe(true);
    expect(s.book).toMatchObject({ title: 'The Ash Ledger', author: 'Odile Brandt', coverColor: '#445566' });
    expect(s.voice).toMatchObject({ name: 'Mara' });
    expect(s.chapter).toMatchObject({ id: 'c3', storyNumber: 3, storyTotal: 3, total: 5 });
    expect(h.el().src).toBe('blob:held-c3');
    expect(h.el().currentTime).toBeCloseTo(14, 3);
    expect(s.text).toBe(heldText('c3'));
    expect(s.conflict).toBeNull();
    expect(s.needsYou).toBeNull();
    expect(s.chapters.map((c) => c.audio)).toEqual(['not_yet', 'on_device', 'not_yet', 'on_device', 'not_yet']);
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });

  it('plays and reads held chapters; the position is kept locally and queued, no conflict is invented', async () => {
    const h = make();
    seedLocal(h, 'c1', 0, 0);
    h.cut();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(35);
    expect(h.st().currentLineId).toBe('c1-h3');
    h.player.pause();
    await h.clock.flush();
    expect(h.st().placeSync).toBe('queued_offline');
    expect(JSON.parse(h.storage.getItem(`bardic.place.${LISTENER}.${BOOK_ID}`)!)).toMatchObject({ chapterId: 'c1', time: 35 });
    expect(h.st().conflict).toBeNull();
    h.restore();
    await h.clock.advance(16_000);
    expect(h.places.server).toMatchObject({ chapter_id: 'c1', offset: heldChapter('c1').lines[2]!.start });
    expect(h.st().placeSync).toBe('saved');
    expect(h.st().conflict).toBeNull();
  });

  it('with nothing from the book on the device it says so, beginning with what is kept', async () => {
    const h = make([], { heldBook: null });
    h.cut();
    await open(h);
    const s = h.st();
    expect(s.loaded).toBe(false);
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.code).toBe('offline_not_downloaded');
    expect(s.needsYou!.text).toBe("Your place is kept. This book is not on this device, and your Bardic computer can't be reached.");
  });

  it('with no place yet it starts at the first chapter that is held', async () => {
    const h = make(['c2', 'c3']);
    h.cut();
    await open(h);
    expect(h.st().chapter!.id).toBe('c2');
  });
});

describe('O5: a chapter that is not on this device', () => {
  async function offlineAt(chapter: string) {
    const h = make();
    seedLocal(h, chapter, 0, 0);
    h.cut();
    await open(h);
    return h;
  }

  it('going to it says why and offers the next chapter that is held, and does not hang or skip', async () => {
    const h = await offlineAt('c1');
    h.player.gotoChapter('c2');
    await h.clock.flush();
    const s = h.st();
    expect(s.chapter!.id).toBe('c2');
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.code).toBe('offline_not_downloaded');
    expect(s.needsYou!.text.startsWith('Your place is kept.')).toBe(true);
    expect(s.needsYou!.text).toContain("Chapter 2 isn't on this device.");
    expect(s.offlineNext).toEqual({ chapterId: 'c3', title: 'A Debt in Salt' });
    expect(s.playing).toBe(false);
    expect(h.el().paused).toBe(true);
    expect(h.api.requestChapter).not.toHaveBeenCalled();
    // taking the offer plays that chapter
    h.player.gotoChapter(s.offlineNext!.chapterId);
    h.player.play();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c3');
    expect(h.st().offlineNext).toBeNull();
    expect(h.st().needsYou).toBeNull();
    expect(h.st().playing).toBe(true);
    expect(h.el().src).toBe('blob:held-c3');
  });

  it('next, previous and play say the same; pressing play again changes nothing', async () => {
    const h = await offlineAt('c1');
    h.player.nextChapter();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.st().offlineNext!.chapterId).toBe('c3');
    h.player.play();
    await h.clock.flush();
    expect(h.st().needsYou!.text).toContain("Chapter 2 isn't on this device.");
    expect(h.st().playing).toBe(false);
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });

  it('the end of a held chapter running into one that is not held stops there with the offer', async () => {
    const h = await offlineAt('c1');
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    const s = h.st();
    expect(s.chapter!.id).toBe('c2');
    expect(s.needsYou!.code).toBe('offline_not_downloaded');
    expect(s.offlineNext!.chapterId).toBe('c3');
  });

  it('with no later chapter held there is no offer, only the reason', async () => {
    const h = make(['c1']);
    seedLocal(h, 'c1', 0, 0);
    h.cut();
    await open(h);
    h.player.gotoChapter('c3');
    await h.clock.flush();
    expect(h.st().needsYou!.text).toContain("Chapter 3 isn't on this device.");
    expect(h.st().offlineNext).toBeNull();
  });

  it('matter is named by its title', async () => {
    const h = await offlineAt('c1');
    h.player.gotoChapter('c4');
    await h.clock.flush();
    expect(h.st().needsYou!.text).toContain('“Afterword” isn\'t on this device.');
  });
});

describe('the Bardic computer comes back', () => {
  it('reconnects quietly: the real book arrives, the waiting place is sent, the position does not move', async () => {
    const h = make();
    seedLocal(h, 'c1', 0, 0);
    h.cut();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(20);
    h.player.pause();
    await h.clock.flush();
    h.player.gotoChapter('c2');
    await h.clock.flush();
    expect(h.st().offlineNext).not.toBeNull();
    const subscribed = h.events.subscribed;
    h.restore();
    await h.clock.advance(1000);
    const s = h.st();
    expect(h.events.subscribed).toBe(subscribed + 1);
    expect(h.places.server).toMatchObject({ chapter_id: 'c2' });
    expect(s.chapter!.id).toBe('c2');
    expect(s.voice).toMatchObject({ id: 'v-mara', tier: 'free' });
    expect(s.needsYou).toBeNull();
    expect(s.offlineNext).toBeNull();
    expect(s.conflict).toBeNull();
    expect(s.playing).toBe(false);
  });

  it('a held chapter keeps playing through the reconnect without a jump', async () => {
    const h = make();
    seedLocal(h, 'c1', 0, 0);
    h.cut();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(20);
    h.restore();
    await h.clock.advance(1000);
    expect(h.st().playing).toBe(true);
    expect(h.el().currentTime).toBe(20);
    expect(h.el().src).toBe('blob:held-c1');
  });

  it('nothing is requested for a book opened from the device until its voice is known to be free', async () => {
    const h = make();
    seedLocal(h, 'c1', 0, 0);
    h.cut();
    await open(h);
    h.api.audiobooks_ = [{ ...h.api.audiobooks_[0]!, tier: 'premium' }];
    h.player.gotoChapter('c2');
    await h.clock.flush();
    h.api.unreachable = false; // reachable again, but the online signal has not been seen yet
    h.player.play();
    await h.clock.flush();
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });
});
