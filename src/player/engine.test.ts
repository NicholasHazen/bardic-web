import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../lib/fakeClock';
import { AudioEngine, type EngineHandlers, type MediaSessionPort } from './engine';
import { FakeAudioFactory } from './testing';
import type { LineTiming } from './types';

function setup(session: MediaSessionPort | null = null) {
  const factory = new FakeAudioFactory();
  factory.durations['/a'] = 100;
  factory.durations['/b'] = 50;
  const clock = new FakeClock();
  const h = {
    time: vi.fn(),
    line: vi.fn(),
    ended: vi.fn(),
    playState: vi.fn(),
    buffering: vi.fn(),
    error: vi.fn(),
  } satisfies EngineHandlers;
  const engine = new AudioEngine({ factory: factory.make, clock, handlers: h, session });
  return { factory, clock, h, engine };
}

const timings: LineTiming[] = [
  { lineId: 'a', startMs: 0, endMs: 30_000 },
  { lineId: 'b', startMs: 30_000, endMs: 60_000 },
];

describe('AudioEngine', () => {
  it('loads, starts at the requested time and applies speed with pitch kept', () => {
    const { factory, engine } = setup();
    engine.load('/a', { startAt: 42, rate: 1.5 });
    const el = factory.main;
    expect(el.src).toBe('/a');
    expect(el.currentTime).toBe(42);
    expect(el.playbackRate).toBe(1.5);
    expect(el.preservesPitch).toBe(true);
    expect(engine.duration).toBe(100);
    engine.setRate(2);
    expect(el.playbackRate).toBe(2);
  });

  it('waits for the length before seeking when the audio is not cached', () => {
    const { factory, engine } = setup();
    factory.durations['/a'] = undefined as unknown as number;
    delete factory.durations['/a'];
    engine.load('/a', { startAt: 12 });
    const el = factory.main;
    expect(engine.position).toBe(12); // pending
    el.loadMeta(100);
    expect(el.currentTime).toBe(12);
  });

  it('play resolves playing; a refusal by the autoplay rules is blocked, not an error', async () => {
    const { factory, engine, h } = setup();
    engine.load('/a');
    expect(await engine.play()).toBe('playing');
    engine.pause();
    factory.main.playRejection = 'NotAllowedError';
    expect(await engine.play()).toBe('blocked');
    expect(h.error).not.toHaveBeenCalled();
    factory.main.playRejection = 'AbortError';
    expect(await engine.play()).toBe('interrupted');
    factory.main.playRejection = 'EncodingError';
    expect(await engine.play()).toBe('error');
  });

  it('play with nothing loaded does nothing', async () => {
    const { engine } = setup();
    expect(await engine.play()).toBe('nothing');
  });

  it('timeupdate gives the current line from the timings, only when it changes', () => {
    const { factory, engine, h } = setup();
    engine.load('/a', { timings });
    const el = factory.main;
    expect(h.line).toHaveBeenLastCalledWith('a');
    h.line.mockClear();
    el.tick(10);
    el.tick(20);
    expect(h.line).not.toHaveBeenCalled();
    el.tick(31);
    expect(h.line).toHaveBeenCalledWith('b');
    expect(h.time).toHaveBeenLastCalledWith(31, 100);
  });

  it('waiting and stalled mean buffering while playing; playing again clears it', async () => {
    const { factory, engine, h } = setup();
    engine.load('/a');
    await engine.play();
    factory.main.emit('waiting');
    expect(h.buffering).toHaveBeenLastCalledWith(true);
    factory.main.emit('playing');
    expect(h.buffering).toHaveBeenLastCalledWith(false);
    engine.pause();
    h.buffering.mockClear();
    factory.main.emit('stalled');
    expect(h.buffering).not.toHaveBeenCalled();
  });

  it('ended is reported', () => {
    const { factory, engine, h } = setup();
    engine.load('/a');
    factory.main.finish();
    expect(h.ended).toHaveBeenCalledTimes(1);
    expect(engine.hasEnded).toBe(true);
  });

  it('seek clamps to the audio', () => {
    const { factory, engine } = setup();
    engine.load('/a');
    engine.seek(500);
    expect(factory.main.currentTime).toBe(100);
    engine.seek(-4);
    expect(factory.main.currentTime).toBe(0);
  });

  it('preloads the next chapter on a second element and does not repeat itself', () => {
    const { factory, engine } = setup();
    engine.load('/a');
    engine.preload('/b', 'metadata');
    expect(factory.pre!.src).toBe('/b');
    expect(factory.pre!.preload).toBe('metadata');
    engine.preload('/b', 'auto');
    expect(factory.elements).toHaveLength(2);
    expect(factory.pre!.preload).toBe('auto');
    expect(engine.preloaded).toBe('/b');
    engine.preload(null);
    expect(engine.preloaded).toBeNull();
  });

  it('fades out then pauses; a play in between cancels the fade', async () => {
    const { factory, engine, clock } = setup();
    engine.load('/a');
    await engine.play();
    const done = engine.fadeOutAndPause(1000);
    await clock.advance(500);
    expect(factory.main.volume).toBeLessThan(1);
    expect(factory.main.paused).toBe(false);
    await clock.advance(600);
    expect(await done).toBe(true);
    expect(factory.main.paused).toBe(true);
    expect(factory.main.volume).toBe(1);

    await engine.play();
    const cancelled = engine.fadeOutAndPause(1000);
    await clock.advance(300);
    await engine.play();
    expect(await cancelled).toBe(false);
    expect(factory.main.volume).toBe(1);
    await clock.advance(2000);
    expect(factory.main.paused).toBe(false);
  });

  it('plays a moment of silence to earn the element its permission before audio exists', () => {
    const { factory, engine } = setup();
    engine.unlock();
    expect(factory.main.playCalls).toBe(1);
    engine.unlock();
    expect(factory.main.playCalls).toBe(1);
  });

  it('unload and destroy release the element', () => {
    const { factory, engine } = setup();
    engine.load('/a');
    engine.unload();
    expect(engine.loaded).toBe(false);
    expect(factory.main.src).toBe('');
    engine.destroy();
  });
});

describe('Media Session', () => {
  it('sets metadata and wires play, pause, seek 15, previous and next', () => {
    const handlers = new Map<string, ((d: { seekOffset?: number; seekTime?: number }) => void) | null>();
    const session: MediaSessionPort = {
      setMetadata: vi.fn(),
      setPlaybackState: vi.fn(),
      setActionHandler: (a, fn) => void handlers.set(a, fn),
      setPositionState: vi.fn(),
    };
    const { engine } = setup(session);
    const calls: string[] = [];
    engine.setActions({
      play: () => calls.push('play'),
      pause: () => calls.push('pause'),
      seekBy: (s) => calls.push(`by ${s}`),
      seekTo: (s) => calls.push(`to ${s}`),
      previous: () => calls.push('prev'),
      next: () => calls.push('next'),
    });
    handlers.get('play')!({});
    handlers.get('pause')!({});
    handlers.get('seekbackward')!({});
    handlers.get('seekforward')!({});
    handlers.get('seekbackward')!({ seekOffset: 30 });
    handlers.get('seekto')!({ seekTime: 12 });
    handlers.get('previoustrack')!({});
    handlers.get('nexttrack')!({});
    expect(calls).toEqual(['play', 'pause', 'by -15', 'by 15', 'by -30', 'to 12', 'prev', 'next']);
    engine.setMetadata({ title: 'Ash on the Water', artist: 'Odile Brandt', album: 'The Ash Ledger', artwork: [{ src: '/cover.jpg' }] });
    expect(session.setMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ash on the Water', artist: 'Odile Brandt' }));
    engine.setActions(null);
    expect(handlers.get('play')).toBeNull();
  });

  it('publishes the position', () => {
    const session: MediaSessionPort = { setMetadata: vi.fn(), setPlaybackState: vi.fn(), setActionHandler: vi.fn(), setPositionState: vi.fn() };
    const { engine, factory } = setup(session);
    engine.load('/a');
    factory.main.tick(10);
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 100, position: 10, playbackRate: 1 });
  });
});
