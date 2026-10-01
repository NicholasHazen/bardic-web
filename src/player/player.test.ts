import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { memoryStorage } from '../lib/clock';
import { cpLength } from '../lib/codepoints';
import type { MediaSessionPort } from './engine';
import { SPEED_KEY, createPlayer, type PlayerDeps } from './player';
import { BOOK_ID, DEVICE, FakeApi, FakeAudioFactory, FakeEvents, FakePlaces, LISTENER, audioUrl, audiobook, job, linesOf, making, notYet, place, readyChapter, textOf } from './testing';

function make(o: { tier?: 'free' | 'premium'; mediaSession?: MediaSessionPort | null } = {}) {
  const clock = new FakeClock();
  const audio = new FakeAudioFactory();
  for (const id of ['c0', 'c1', 'c2', 'c3', 'c4']) audio.durations[audioUrl(id)] = 100;
  const api = new FakeApi();
  if (o.tier) api.audiobooks_ = [audiobook(o.tier)];
  const places = new FakePlaces();
  const events = new FakeEvents();
  const storage = memoryStorage();
  const listener = { id: LISTENER as string | null };
  const deps: PlayerDeps = {
    api,
    places,
    clock,
    createAudio: audio.make,
    storage,
    events,
    mediaSession: o.mediaSession ?? null,
    listener: () => listener.id,
    deviceId: () => DEVICE,
    lifecycle: null,
    deviceName: () => 'This phone',
  };
  const player = createPlayer(deps);
  const st = () => get(player);
  return { clock, audio, api, places, events, storage, listener, player, st, deps, el: () => audio.main };
}
type H = ReturnType<typeof make>;

/** open and let everything settle */
async function open(h: H, opts: Parameters<H['player']['open']>[1] = {}) {
  await h.player.open(BOOK_ID, opts);
  await h.clock.flush();
}

describe('opening', () => {
  it('starts at the first story chapter when there is no place, paused, with the text and lines', async () => {
    const h = make();
    await open(h);
    const s = h.st();
    expect(s.loaded).toBe(true);
    expect(s.chapter).toMatchObject({ id: 'c1', index: 1, total: 5, storyNumber: 1, storyTotal: 3, matter: false });
    expect(s.book).toMatchObject({ title: 'The Ash Ledger', author: 'Odile Brandt' });
    expect(s.voice).toEqual({ id: 'v-mara', name: 'Mara', tier: 'free' });
    expect(s.text).toBe(textOf('c1'));
    expect(s.lines).toEqual(linesOf('c1'));
    expect(s.playing).toBe(false);
    expect(s.listening).toBeNull();
    expect(s.duration).toBe(100);
    expect(h.el().src).toBe(audioUrl('c1'));
    expect(h.places.puts).toHaveLength(0);
    expect(s.chapters.map((c) => c.audio)).toEqual(['not_yet', 'ready', 'ready', 'ready', 'not_yet']);
  });

  it('restores the server place: chapter and code point offset become audio time through the timings', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c2', offset: 10, device_id: DEVICE, revision: 4 });
    await open(h);
    const s = h.st();
    expect(s.chapter!.id).toBe('c2');
    expect(h.el().src).toBe(audioUrl('c2'));
    expect(h.el().currentTime).toBeCloseTo(30, 3);
    expect(s.currentLineId).toBe('c2-l2');
  });

  it('a place inside a line is spread across that line', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c2', offset: 14, device_id: DEVICE, revision: 4 }); // 4 of 9 code points into line 2
    await open(h);
    expect(h.el().currentTime).toBeCloseTo(30 + (4 / 9) * 30, 2);
  });

  it("uses this device's exact audio time when the server holds the same place", async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c2', offset: 10, device_id: DEVICE, revision: 4 });
    h.deps.storage.setItem(`bardic.place.${LISTENER}.${BOOK_ID}`, JSON.stringify({ chapterId: 'c2', offset: 10, time: 33.25, mode: 'listening', audiobookId: 'ab1', rev: 4, updatedAt: 1 }));
    await open(h);
    expect(h.el().currentTime).toBeCloseTo(33.25, 3);
  });

  it('without timings the lines are spread by length', async () => {
    const h = make();
    h.api.timingsFor.clear();
    h.places.server = place({ chapter_id: 'c2', offset: 20, device_id: DEVICE, revision: 4 });
    await open(h);
    const s = h.st();
    expect(s.timings.length).toBe(3);
    expect(s.currentLineId).toBe('c2-l3');
    expect(h.el().currentTime).toBeGreaterThan(0);
  });

  it('opens at a given chapter and offset (a search result) without asking about conflicts', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, revision: 4 }); // another device
    await open(h, { chapterId: 'c3', offset: 20 });
    expect(h.st().chapter!.id).toBe('c3');
    expect(h.st().conflict).toBeNull();
  });

  it('with no voice yet, the text still opens and play says what to do', async () => {
    const h = make();
    h.api.audiobooks_ = [];
    h.api.audio.clear();
    await open(h);
    h.player.play();
    await h.clock.flush();
    const s = h.st();
    expect(s.text).toBe(textOf('c1'));
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.code).toBe('no_voice');
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });

  it('an unreachable server with nothing on this device is Needs you, and the place is kept', async () => {
    const h = make();
    h.api.unreachable = true;
    await open(h);
    const s = h.st();
    expect(s.loaded).toBe(false);
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.code).toBe('offline_not_downloaded');
    expect(s.needsYou!.text.startsWith('Your place')).toBe(true);
  });
});

describe('playing', () => {
  it('a refusal by the browser autoplay rules leaves the player paused, not in error', async () => {
    const h = make();
    await open(h);
    h.el().playRejection = 'NotAllowedError';
    h.player.play();
    await h.clock.flush();
    const s = h.st();
    expect(s.playing).toBe(false);
    expect(s.listening).toBeNull();
    expect(s.needsYou).toBeNull();
    // the next tap works
    h.el().playRejection = null;
    h.player.play();
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
  });

  it('autoplay on open that the browser refuses stays paused and says nothing is wrong', async () => {
    const h = make();
    h.audio.rejectPlay = 'NotAllowedError';
    await open(h, { autoplay: true });
    const s = h.st();
    expect(s.loaded).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.listening).toBeNull();
    expect(s.needsYou).toBeNull();
    h.audio.main.playRejection = null;
    h.player.play();
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
  });

  it('Playing says how much audio is ahead', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c2', offset: 0, device_id: DEVICE, revision: 4 });
    await open(h);
    h.player.play();
    await h.clock.flush();
    const s = h.st();
    expect(s.playing).toBe(true);
    expect(s.listening).toBe('playing');
    expect(s.detail).toBe('3 min ahead'); // 100 s left here plus chapter 3's 100 s
  });

  it('timeupdate moves the position and the current line; ahead counts down', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(31);
    expect(h.st().position).toBe(31);
    expect(h.st().currentLineId).toBe('c1-l2');
    h.el().tick(80);
    expect(h.st().currentLineId).toBe('c1-l3');
    expect(h.st().aheadSeconds).toBe(20 + 200);
    expect(h.st().remainingSeconds).toBe(220); // every story chapter after this one is made
  });

  it('book progress follows the chapter', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c2', offset: 0, device_id: DEVICE, revision: 4 });
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(50);
    expect(h.st().bookProgress).toBeCloseTo((1500 + 0.5 * 1500) / 4500, 3);
  });

  it('pause writes the place at once; resume carries on', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(40);
    h.player.pause();
    await h.clock.flush();
    expect(h.st().playing).toBe(false);
    expect(h.st().listening).toBeNull();
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.input).toMatchObject({ chapter_id: 'c1', offset: 10, mode: 'listening', audiobook_id: 'ab1', base_revision: 0 });
    expect(h.places.puts[0]!.listenerId).toBe(LISTENER);
    h.player.toggle();
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
  });

  it('while playing the server is written at most every 30 seconds', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(5);
    await h.clock.advance(20_000);
    h.el().tick(35);
    expect(h.places.puts).toHaveLength(0);
    await h.clock.advance(11_000);
    h.el().tick(46);
    await h.clock.flush();
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.input.offset).toBe(10);
  });

  it('the element waiting for data is Getting ready, then Playing again', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().emit('waiting');
    expect(h.st().listening).toBe('getting_ready');
    h.el().emit('playing');
    expect(h.st().listening).toBe('playing');
  });

  it('a pause from outside (headset, system) is a pause', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().pause();
    await h.clock.flush();
    expect(h.st().playing).toBe(false);
    expect(h.places.puts).toHaveLength(1);
  });
});

describe('seeking and chapters', () => {
  it('skip, seek and the chapter buttons', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(40);
    h.player.skip(15);
    expect(h.el().currentTime).toBe(55);
    h.player.skip(-15);
    h.player.skip(-15);
    expect(h.el().currentTime).toBe(25);
    h.player.seek(500);
    expect(h.el().currentTime).toBe(100);
    h.player.seek(20);
    // previous: past 3 s restarts the chapter, like players do
    h.player.previousChapter();
    expect(h.el().currentTime).toBe(0);
    expect(h.st().chapter!.id).toBe('c1');
    // within 3 s of the start: the one before; there is none before chapter 1 (front matter is skipped), so it restarts
    h.el().tick(1);
    h.player.previousChapter();
    expect(h.st().chapter!.id).toBe('c1');
    h.player.nextChapter();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.el().src).toBe(audioUrl('c2'));
    expect(h.st().playing).toBe(true);
    h.el().tick(1);
    h.player.previousChapter();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c1');
  });

  it('a seek is written to the server shortly after it stops', async () => {
    const h = make();
    await open(h);
    h.player.seek(35);
    h.player.seek(36);
    expect(h.places.puts).toHaveLength(0);
    await h.clock.advance(700);
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.input.offset).toBe(10);
  });

  it('a chapter change is written at once', async () => {
    const h = make();
    await open(h);
    h.player.gotoChapter('c3');
    await h.clock.flush();
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.input).toMatchObject({ chapter_id: 'c3', offset: 0 });
  });

  it('gotoLine and gotoOffset seek by the timings, in this chapter and in another', async () => {
    const h = make();
    await open(h);
    h.player.gotoLine('c1-l3');
    expect(h.el().currentTime).toBe(60);
    expect(h.st().currentLineId).toBe('c1-l3');
    h.player.gotoOffset('c2', 10);
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.el().currentTime).toBeCloseTo(30, 3);
    h.player.gotoLine('nope');
    expect(h.el().currentTime).toBeCloseTo(30, 3);
  });

  it('the position is written as the start of the line, in code points', async () => {
    const h = make();
    await open(h);
    h.player.gotoOffset('c1', 11); // inside line 2 ("Beta two." starts at 10)
    await h.clock.advance(700);
    expect(h.places.puts[0]!.input.offset).toBe(11); // the listener's own offset is kept until the audio moves on
    h.el().tick(80);
    await h.clock.advance(700);
    h.player.pause();
    await h.clock.flush();
    expect(h.places.puts.at(-1)!.input.offset).toBe(20);
  });
});

describe('the end of a chapter and of the book', () => {
  it('goes on to the next chapter and keeps playing', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.el().src).toBe(audioUrl('c2'));
    expect(h.st().playing).toBe(true);
    expect(h.places.puts.at(-1)!.input.chapter_id).toBe('c2');
  });

  it('the next chapter is warmed up when within 30 seconds of the end, and when idle', async () => {
    const h = make();
    await open(h);
    await h.clock.advance(3500);
    expect(h.audio.pre!.src).toBe(audioUrl('c2'));
    expect(h.audio.pre!.preload).toBe('metadata');
    h.player.play();
    await h.clock.flush();
    h.el().tick(60);
    expect(h.audio.pre!.preload).toBe('metadata');
    h.el().tick(71);
    expect(h.audio.pre!.preload).toBe('auto');
  });

  it('skips back matter: the last story chapter ends the book', async () => {
    const h = make();
    h.api.audio.set('c4', readyChapter('c4'));
    h.places.server = place({ chapter_id: 'c3', offset: 0, device_id: DEVICE, revision: 4 });
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    const s = h.st();
    expect(s.finishedBook).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.chapter!.id).toBe('c3');
    expect(h.el().src).toBe(audioUrl('c3'));
    // the place is the end of the last story chapter; finishing is the server's call (or the reader's)
    const last = h.places.puts.at(-1)!;
    expect(last.input).toMatchObject({ chapter_id: 'c3', offset: cpLength(textOf('c3')) });
    expect(h.api.setFinished).not.toHaveBeenCalled();
    expect(await h.player.markFinished(true)).toBe(true);
    expect(h.api.finished).toEqual([true]);
  });

  it('skips front matter on the way in', async () => {
    const h = make();
    h.api.audio.set('c0', readyChapter('c0'));
    await open(h);
    expect(h.st().chapter!.id).toBe('c1');
    h.player.gotoChapter('c0');
    await h.clock.flush();
    expect(h.st().chapter!.matter).toBe(true);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c1');
  });

  it('honours continue_into_next_chapter = false: the next chapter is ready, nothing plays', async () => {
    const h = make();
    h.api.settings_ = { ...h.api.settings_, continue_into_next_chapter: false };
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.st().playing).toBe(false);
    expect(h.el().paused).toBe(true);
  });

  it('listen again starts the story over', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c3', offset: 0, device_id: DEVICE, revision: 4 });
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.st().finishedBook).toBe(true);
    h.player.play();
    await h.clock.flush();
    expect(h.st().finishedBook).toBe(false);
    expect(h.st().chapter!.id).toBe('c1');
    expect(h.st().playing).toBe(true);
  });
});

describe('pressing play on a chapter that is not made yet (7.2)', () => {
  async function notYetBook() {
    const h = make();
    h.api.audio.set('c1', notYet('c1'));
    await open(h);
    return h;
  }

  it('opening alone asks for nothing; play makes it now and shows Getting ready', async () => {
    const h = await notYetBook();
    expect(h.api.requestChapter).not.toHaveBeenCalled();
    expect(h.st().listening).toBeNull();
    h.player.play();
    await h.clock.flush();
    expect(h.api.requests).toEqual([{ audiobookId: 'ab1', chapterId: 'c1', ahead: 2 }]);
    const s = h.st();
    expect(s.listening).toBe('getting_ready');
    expect(s.detail).toBe('First audio in about 10 s');
    expect(s.playing).toBe(false);
  });

  it('starts by itself when the chapter is ready (found by polling)', async () => {
    const h = await notYetBook();
    h.player.play();
    await h.clock.flush();
    h.api.audio.set('c1', readyChapter('c1'));
    await h.clock.advance(2100);
    const s = h.st();
    expect(s.playing).toBe(true);
    expect(s.listening).toBe('playing');
    expect(h.el().src).toBe(audioUrl('c1'));
  });

  it('starts by itself when a job notice arrives', async () => {
    const h = await notYetBook();
    h.player.play();
    await h.clock.flush();
    h.api.audio.set('c1', readyChapter('c1'));
    h.events.emit({ type: 'job.updated', listener_id: null });
    await h.clock.advance(400);
    expect(h.st().playing).toBe(true);
  });

  it('is ready at once when the server already has it', async () => {
    const h = await notYetBook();
    h.api.onRequest = () => ({ ok: true, value: { kind: 'ready', chapter: readyChapter('c1') } });
    h.player.play();
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
  });

  it('Waiting counts down to when the job continues', async () => {
    const h = await notYetBook();
    const until = new Date(h.clock.now() + 40_000).toISOString();
    h.api.onRequest = () => ({ ok: true, value: { kind: 'job', job: job('waiting', { waiting: { code: 'waiting_quota', text: 'Waiting for the daily quota.', until } }) } });
    h.player.play();
    await h.clock.flush();
    expect(h.st().listening).toBe('waiting');
    expect(h.st().detail).toBe('Continues in about 40 s');
    await h.clock.advance(10_000);
    expect(h.st().detail).toBe('Continues in about 30 s');
  });

  it('Needs you from the job says what is kept first', async () => {
    const h = await notYetBook();
    h.api.onRequest = () => ({ ok: true, value: { kind: 'job', job: job('needs_you', { needs_you: { code: 'provider_refused', text: 'The voice service refused this chapter.' } }) } });
    h.player.play();
    await h.clock.flush();
    const s = h.st();
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.code).toBe('provider_refused');
    expect(s.needsYou!.text.startsWith('Your place and the chapters already made are kept.')).toBe(true);
    expect(s.needsYou!.text).toContain('refused');
    expect(s.needsYou!.action!.route).toBe('/book/b1');
  });

  it('a voice server that cannot be reached is Needs you', async () => {
    const h = await notYetBook();
    h.api.onRequest = () => ({ ok: false, status: 409, code: 'source_unreachable', detail: 'Your Breeze server cannot be reached.' });
    h.player.play();
    await h.clock.flush();
    expect(h.st().needsYou!.code).toBe('source_unreachable');
  });

  it('pausing while waiting is not a problem and clears the state', async () => {
    const h = await notYetBook();
    h.player.play();
    await h.clock.flush();
    h.player.pause();
    expect(h.st().listening).toBeNull();
    expect(h.st().needsYou).toBeNull();
  });

  it('a chapter ending with the next one missing asks for it and goes on when it is there (S8)', async () => {
    const h = make();
    h.api.audio.set('c2', notYet('c2'));
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(h.st().listening).toBe('getting_ready');
    expect(h.api.requests.some((r) => r.chapterId === 'c2')).toBe(true);
    h.api.audio.set('c2', readyChapter('c2'));
    await h.clock.advance(2100);
    expect(h.st().playing).toBe(true);
    expect(h.el().src).toBe(audioUrl('c2'));
  });
});

describe('a premium voice is never asked to make audio', () => {
  it('play on a premium chapter that is not ready: Needs you, and no request at all', async () => {
    const h = make({ tier: 'premium' });
    h.api.audio.set('c1', notYet('c1'));
    await open(h);
    h.player.play();
    await h.clock.flush();
    await h.clock.advance(10_000);
    const s = h.st();
    expect(h.api.requestChapter).not.toHaveBeenCalled();
    expect(s.listening).toBe('needs_you');
    expect(s.needsYou!.text).toContain('Premium audio is made under a plan');
    expect(s.needsYou!.text.startsWith('Your place is kept')).toBe(true);
    expect(s.needsYou!.action!.route).toBe('/book/b1');
  });

  it('nor when a chapter ends, nor to keep ahead', async () => {
    const h = make({ tier: 'premium' });
    h.api.audio.set('c2', notYet('c2'));
    h.api.audio.set('c3', notYet('c3'));
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(50);
    await h.clock.advance(5000);
    h.el().finish();
    await h.clock.flush();
    await h.clock.advance(5000);
    expect(h.api.requestChapter).not.toHaveBeenCalled();
    expect(h.st().listening).toBe('needs_you');
    expect(h.st().chapter!.id).toBe('c2');
    // it plays once someone made it under a plan
    h.api.audio.set('c2', readyChapter('c2'));
    await h.clock.advance(10_500);
    expect(h.st().playing).toBe(true);
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });

  it("even a server that answers plan_required is shown as the plan rule", async () => {
    const h = make();
    h.api.audio.set('c1', notYet('c1'));
    h.api.onRequest = () => ({ ok: false, status: 409, code: 'plan_required', detail: 'x' });
    await open(h);
    h.player.play();
    await h.clock.flush();
    expect(h.st().needsYou!.text).toContain('Premium audio is made under a plan');
  });

  it('a free voice keeps the next chapters made ahead', async () => {
    const h = make();
    h.api.audio.set('c2', notYet('c2'));
    h.api.audio.set('c3', notYet('c3'));
    await open(h);
    h.player.play();
    await h.clock.flush();
    expect(h.api.requests).toEqual([{ audiobookId: 'ab1', chapterId: 'c2', ahead: 1 }]);
    h.player.pause();
    h.player.play();
    await h.clock.flush();
    expect(h.api.requests).toHaveLength(1); // not again
  });

  it('chapters being made are left alone', async () => {
    const h = make();
    h.api.audio.set('c2', making('c2'));
    h.api.audio.set('c3', making('c3'));
    await open(h);
    h.player.play();
    await h.clock.flush();
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });
});

describe('speed', () => {
  it('is applied, snapped to the list and kept per device', async () => {
    const h = make();
    await open(h);
    h.player.setSpeed(1.5);
    expect(h.st().speed).toBe(1.5);
    expect(h.el().playbackRate).toBe(1.5);
    expect(h.storage.getItem(SPEED_KEY)).toBe('1.5');
    h.player.setSpeed(1.6);
    expect(h.st().speed).toBe(1.5);
    h.player.setSpeed(0.2);
    expect(h.st().speed).toBe(0.75);
    h.player.setSpeed(1.75);
    // a new page on this device starts at the speed it had, and the next chapter keeps it
    const again = createPlayer({ ...h.deps, createAudio: new FakeAudioFactory().make });
    expect(get(again).speed).toBe(1.75);
    h.player.play();
    await h.clock.flush();
    h.el().finish();
    await h.clock.flush();
    expect(h.el().playbackRate).toBe(1.75);
  });
});

describe('sleep timer', () => {
  it('minutes: sets its end by the clock, fades and pauses, then is off', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.player.setSleep({ kind: 'minutes', minutes: 10, endsAt: 0 });
    expect(h.st().sleep).toEqual({ kind: 'minutes', minutes: 10, endsAt: h.clock.now() + 600_000 });
    await h.clock.advance(599_000);
    expect(h.st().playing).toBe(true);
    await h.clock.advance(1500);
    expect(h.el().volume).toBeLessThan(1);
    await h.clock.advance(2000);
    expect(h.st().playing).toBe(false);
    expect(h.el().paused).toBe(true);
    expect(h.st().sleep).toEqual({ kind: 'off' });
    expect(h.places.puts.length).toBeGreaterThan(0);
  });

  it('minutes survive a chapter change and expire cleanly; setting again replaces it; off cancels', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.player.setSleep({ kind: 'minutes', minutes: 5, endsAt: 0 });
    h.player.nextChapter();
    await h.clock.flush();
    expect(h.st().sleep.kind).toBe('minutes');
    h.player.setSleep({ kind: 'minutes', minutes: 60, endsAt: 0 });
    await h.clock.advance(6 * 60_000);
    expect(h.st().playing).toBe(true);
    h.player.setSleep({ kind: 'off' });
    expect(h.clock.pending).toBeGreaterThanOrEqual(0);
    await h.clock.advance(2 * 3600_000);
    expect(h.st().playing).toBe(true);
    expect(h.st().sleep).toEqual({ kind: 'off' });
  });

  it('minutes while paused do nothing when they end', async () => {
    const h = make();
    await open(h);
    h.player.setSleep({ kind: 'minutes', minutes: 1, endsAt: 0 });
    await h.clock.advance(70_000);
    expect(h.st().sleep).toEqual({ kind: 'off' });
    expect(h.st().playing).toBe(false);
  });

  it('end of chapter: pauses at the end, the next chapter is ready to resume, and it is off', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.player.setSleep({ kind: 'end_of_chapter' });
    h.player.nextChapter(); // moving on does not cancel it
    await h.clock.flush();
    expect(h.st().sleep).toEqual({ kind: 'end_of_chapter' });
    h.el().finish();
    await h.clock.flush();
    const s = h.st();
    expect(s.playing).toBe(false);
    expect(s.sleep).toEqual({ kind: 'off' });
    expect(s.chapter!.id).toBe('c3');
    expect(h.el().paused).toBe(true);
    expect(h.places.puts.at(-1)!.input.chapter_id).toBe('c3');
  });
});

describe('mode', () => {
  it('Read mode is part of the place', async () => {
    const h = make();
    await open(h);
    h.player.setMode('read');
    await h.clock.flush();
    expect(h.st().mode).toBe('read');
    expect(h.places.puts.at(-1)!.input.mode).toBe('reading');
    const h2 = make();
    h2.places.server = place({ mode: 'reading', device_id: DEVICE, revision: 2, chapter_id: 'c1', offset: 0 });
    await open(h2);
    expect(h2.st().mode).toBe('read');
  });

  it('Read mode works on a chapter with no audio: the line follows the reader', async () => {
    const h = make();
    h.api.audio.set('c1', notYet('c1'));
    await open(h);
    h.player.setMode('read');
    h.player.gotoLine('c1-l3');
    await h.clock.advance(700);
    expect(h.st().currentLineId).toBe('c1-l3');
    expect(h.places.puts.at(-1)!.input).toMatchObject({ chapter_id: 'c1', offset: 20, mode: 'reading' });
    expect(h.api.requestChapter).not.toHaveBeenCalled();
  });
});

describe('places across devices', () => {
  it('ask at open: both places are shown, nothing plays, nothing is written, and the listener chooses', async () => {
    const h = make();
    h.deps.storage.setItem(`bardic.place.${LISTENER}.${BOOK_ID}`, JSON.stringify({ chapterId: 'c1', offset: 10, time: 31, mode: 'listening', audiobookId: 'ab1', rev: 3, updatedAt: Date.parse('2027-01-01T00:00:00Z') }));
    h.places.server = place({ chapter_id: 'c3', offset: 0, revision: 9, device_name: 'Tablet', progress: 0.66 });
    await open(h, { autoplay: true });
    let s = h.st();
    expect(s.playing).toBe(false);
    expect(s.conflict!.mine).toMatchObject({ chapterTitle: 'Ash on the Water', deviceName: 'This phone' });
    expect(s.conflict!.theirs).toMatchObject({ chapterTitle: 'A Debt in Salt', deviceName: 'Tablet', progress: 0.66 });
    expect(h.places.puts).toHaveLength(0);
    h.player.play();
    await h.clock.flush();
    expect(h.st().playing).toBe(false); // waits for the choice

    h.player.resolveConflict('theirs');
    await h.clock.flush();
    s = h.st();
    expect(s.conflict).toBeNull();
    expect(s.chapter!.id).toBe('c3');
    expect(h.places.puts).toHaveLength(0);
  });

  it("ask at open, 'mine': this device's place is written on the server's revision", async () => {
    const h = make();
    h.deps.storage.setItem(`bardic.place.${LISTENER}.${BOOK_ID}`, JSON.stringify({ chapterId: 'c1', offset: 10, time: 31, mode: 'listening', audiobookId: 'ab1', rev: 3, updatedAt: Date.parse('2027-01-01T00:00:00Z') }));
    h.places.server = place({ chapter_id: 'c3', offset: 0, revision: 9 });
    await open(h);
    h.player.resolveConflict('mine');
    await h.clock.flush();
    expect(h.st().conflict).toBeNull();
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.input).toMatchObject({ chapter_id: 'c1', offset: 10, base_revision: 9 });
    expect(h.st().chapter!.id).toBe('c1');
  });

  it('newest and this_device apply the setting at open without asking', async () => {
    const seed = (h: H) => h.deps.storage.setItem(`bardic.place.${LISTENER}.${BOOK_ID}`, JSON.stringify({ chapterId: 'c1', offset: 10, time: 31, mode: 'listening', audiobookId: 'ab1', rev: 3, updatedAt: Date.parse('2027-01-01T00:00:00Z') }));
    const a = make();
    a.api.settings_ = { ...a.api.settings_, place_conflict: 'newest' };
    seed(a);
    a.places.server = place({ chapter_id: 'c3', offset: 0, revision: 9, updated_at: '2090-01-01T00:00:00Z' });
    await open(a);
    expect(a.st().conflict).toBeNull();
    expect(a.st().chapter!.id).toBe('c3');

    const b = make();
    b.api.settings_ = { ...b.api.settings_, place_conflict: 'this_device' };
    seed(b);
    b.places.server = place({ chapter_id: 'c3', offset: 0, revision: 9, updated_at: '2090-01-01T00:00:00Z' });
    await open(b);
    expect(b.st().conflict).toBeNull();
    expect(b.st().chapter!.id).toBe('c1');
    b.player.pause();
    await b.clock.flush();
    expect(b.places.puts.at(-1)!.input.base_revision).toBe(9);
  });

  it('a conflict met while playing pauses and waits for the choice', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, device_id: DEVICE, revision: 2 });
    await open(h, { autoplay: false });
    h.player.play();
    await h.clock.flush();
    h.places.other({ chapter_id: 'c3', offset: 0, revision: 8 });
    h.el().tick(50);
    h.player.pause();
    await h.clock.flush();
    const s = h.st();
    expect(s.conflict).not.toBeNull();
    expect(s.playing).toBe(false);
    expect(s.conflict!.theirs.chapterTitle).toBe('A Debt in Salt');
  });

  it('another device writing meanwhile is offered at the pause, never while playing', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, device_id: DEVICE, revision: 2 });
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.places.other({ chapter_id: 'c3', offset: 0, revision: 8 });
    h.events.emit({ type: 'place.updated', listener_id: LISTENER });
    await h.clock.flush();
    expect(h.st().conflict).toBeNull();
    expect(h.st().playing).toBe(true);
    expect(h.st().chapter!.id).toBe('c1');
    h.player.pause();
    await h.clock.flush();
    expect(h.st().conflict!.theirs.chapterTitle).toBe('A Debt in Salt');
  });

  it('notices for other listeners or other books are ignored', async () => {
    const h = make();
    h.places.server = place({ chapter_id: 'c1', offset: 0, device_id: DEVICE, revision: 2 });
    await open(h);
    h.places.other({ chapter_id: 'c3', offset: 0, revision: 8 });
    h.events.emit({ type: 'place.updated', listener_id: 'someone-else' });
    h.events.emit({ type: 'place.updated', listener_id: LISTENER, book_id: 'other-book' });
    await h.clock.flush();
    expect(h.st().conflict).toBeNull();
  });

  it('offline: the place is queued, the state says so, and it is sent when the server is back', async () => {
    const h = make();
    await open(h);
    h.places.down = true;
    h.player.seek(40);
    await h.clock.advance(700);
    expect(h.st().placeSync).toBe('queued_offline');
    h.places.down = false;
    await h.clock.advance(16_000);
    expect(h.st().placeSync).toBe('saved');
    expect(h.places.server!.offset).toBe(10);
  });
});

describe('closing and switching listener', () => {
  it('listenerChanged pauses, saves the place under the OLD listener and unloads', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(45);
    h.listener.id = 'listener-2'; // the app has already switched
    h.player.listenerChanged();
    await h.clock.flush();
    expect(h.el().paused).toBe(true);
    expect(h.st().loaded).toBe(false);
    expect(h.st().playing).toBe(false);
    expect(h.places.puts).toHaveLength(1);
    expect(h.places.puts[0]!.listenerId).toBe(LISTENER);
    expect(h.places.puts[0]!.input).toMatchObject({ chapter_id: 'c1', offset: 10 });
    expect(h.events.handlers).toHaveLength(0);
    // and the new listener can open the book on their own place
    await open(h);
    expect(h.st().loaded).toBe(true);
  });

  it('close stops and saves', async () => {
    const h = make();
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.el().tick(45);
    h.player.close();
    await h.clock.flush();
    expect(h.st().loaded).toBe(false);
    expect(h.places.puts).toHaveLength(1);
    expect(h.el().src).toBe('');
  });

  it('opening another book saves the first one', async () => {
    const h = make();
    await open(h);
    h.player.seek(40);
    await open(h, { chapterId: 'c2' }); // same book again with a chapter: a jump, not a new load
    expect(h.st().chapter!.id).toBe('c2');
  });
});

describe('lock screen', () => {
  it('headset and lock screen buttons drive the player', async () => {
    const handlers = new Map<string, (d: { seekOffset?: number }) => void>();
    const session: MediaSessionPort = {
      setMetadata: vi.fn(),
      setPlaybackState: vi.fn(),
      setActionHandler: (a, fn) => void (fn ? handlers.set(a, fn) : handlers.delete(a)),
      setPositionState: vi.fn(),
    };
    const h = make({ mediaSession: session });
    await open(h);
    expect(session.setMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ash on the Water', artist: 'Odile Brandt', album: 'The Ash Ledger' }));
    handlers.get('play')!({});
    await h.clock.flush();
    expect(h.st().playing).toBe(true);
    h.el().tick(40);
    handlers.get('seekforward')!({});
    expect(h.el().currentTime).toBe(55);
    handlers.get('seekbackward')!({});
    expect(h.el().currentTime).toBe(40);
    handlers.get('nexttrack')!({});
    await h.clock.flush();
    expect(h.st().chapter!.id).toBe('c2');
    expect(session.setMetadata).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'What the Ledger Owes' }));
    handlers.get('pause')!({});
    expect(h.st().playing).toBe(false);
    h.player.close();
    await h.clock.flush();
    expect(handlers.has('play')).toBe(false);
  });
});

describe('words', () => {
  it('no state ever says private or protected', async () => {
    const h = make();
    h.api.audio.set('c1', notYet('c1'));
    const seen: string[] = [];
    h.player.subscribe((s) => seen.push(JSON.stringify({ ...s, text: '' })));
    await open(h);
    h.player.play();
    await h.clock.flush();
    h.api.onRequest = () => ({ ok: false, status: 409, code: 'key_rejected', detail: 'The key was rejected.' });
    expect(seen.join('\n')).not.toMatch(/private|protected/i);
  });
});
