import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, type Writable } from 'svelte/store';

const calls = vi.hoisted(() => ({
  get: vi.fn(), choose: vi.fn(), plan: vi.fn(), open: vi.fn(), close: vi.fn(), prepare: vi.fn(), change: vi.fn(),
}));
vi.mock('../../api/client', () => ({ api: { GET: calls.get } }));
vi.mock('../../state/voices', () => ({ chooseVoiceForBook: calls.choose }));
vi.mock('../../state/plans', () => ({ planStore: { open: calls.plan } }));
vi.mock('../../state/listener', async () => {
  const { writable } = await import('svelte/store');
  return { listenerStore: writable({ currentId: 'listener-a' }) };
});
vi.mock('../../player/player', async () => {
  const { writable } = await import('svelte/store');
  return { player: { ...writable({ book: null, audiobookId: null, loaded: false, playing: false, listening: 'idle' }),
    preparePlayback: calls.prepare, switchAudiobook: calls.change, open: calls.open, close: calls.close } };
});

import { player } from '../../player/player';
import { listenerStore } from '../../state/listener';
import { startListening } from './start';

type State = { book: { id: string } | null; audiobookId: string | null; loaded: boolean; playing: boolean; listening: string };
const state = player as unknown as Writable<State>;
const listener = listenerStore as unknown as Writable<{ currentId: string | null }>;
const empty = (): State => ({ book: null, audiobookId: null, loaded: false, playing: false, listening: 'idle' });
const free = { id: 'mara', name: 'Mara', tier: 'free' };
const premium = { id: 'kore', name: 'Kore', tier: 'premium' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function navigate(hash: string) {
  location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
}

beforeEach(() => {
  listener.set({ currentId: null }); // dispose any unfinished intent from the preceding test
  vi.clearAllMocks();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('location', { hash: '#/book/first' });
  state.set(empty());
  listener.set({ currentId: 'listener-a' });
  calls.get.mockImplementation(async (path: string) => ({ data: path === '/api/voices'
    ? { items: [free, premium] } : path.includes('/settings') ? { default_voice_id: free.id } : { items: [] } }));
  calls.choose.mockResolvedValue({ ok: true, value: { id: 'audio-mara' } });
  calls.plan.mockResolvedValue(undefined);
  calls.change.mockResolvedValue(true);
  calls.open.mockImplementation(async (id: string) => {
    state.set({ book: { id }, audiobookId: 'audio-mara', loaded: true, playing: true, listening: 'playing' });
  });
  calls.close.mockImplementation(() => state.set(empty()));
});
afterEach(() => {
  listener.set({ currentId: null });
  vi.unstubAllGlobals();
});

describe('first Listen intent', () => {
  it('never creates or plays for a listener who changed away, even if they return before the response', async () => {
    const waiting = deferred<{ data: { default_voice_id: string } }>();
    calls.get.mockImplementation(async (path: string) => path.includes('/settings') ? waiting.promise : { data: { items: [] } });
    const started = startListening('first');
    listener.set({ currentId: 'listener-b' });
    listener.set({ currentId: 'listener-a' });
    waiting.resolve({ data: { default_voice_id: free.id } });
    await started;
    expect(calls.choose).not.toHaveBeenCalled();
    expect(calls.open).not.toHaveBeenCalled();
    expect(calls.plan).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/book/first');
  });

  it('does not create a premium audiobook or open its plan after leaving during the voice lookup', async () => {
    const catalog = deferred<{ data: { items: typeof premium[] } }>();
    calls.get.mockImplementation(async (path: string) => path === '/api/voices' ? catalog.promise
      : { data: path.includes('/settings') ? { default_voice_id: premium.id } : { items: [] } });
    const started = startListening('first');
    await vi.waitFor(() => expect(calls.get).toHaveBeenCalledWith('/api/voices'));
    navigate('#/library');
    catalog.resolve({ data: { items: [premium] } });
    await started;
    expect(calls.choose).not.toHaveBeenCalled();
    expect(calls.plan).not.toHaveBeenCalled();
    expect(calls.open).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/library');
  });

  it('binds the record mutation to the captured listener and ignores its late premium response', async () => {
    const created = deferred<{ ok: true; value: { id: string } }>();
    calls.choose.mockReturnValue(created.promise);
    calls.get.mockImplementation(async (path: string) => ({ data: path === '/api/voices' ? { items: [premium] }
      : path.includes('/settings') ? { default_voice_id: premium.id } : { items: [] } }));
    const started = startListening('first');
    await vi.waitFor(() => expect(calls.choose).toHaveBeenCalledWith('first', premium.id, 'listener-a'));
    listener.set({ currentId: 'listener-b' });
    created.resolve({ ok: true, value: { id: 'audio-kore' } });
    await started;
    expect(calls.plan).not.toHaveBeenCalled();
    expect(calls.open).not.toHaveBeenCalled();
  });

  it('lets the latest tap win when two first-Listen responses finish in the opposite order', async () => {
    const old = deferred<{ data: { default_voice_id: string } }>();
    let settings = 0;
    calls.get.mockImplementation(async (path: string) => path === '/api/voices' ? { data: { items: [free, { ...free, id: 'tobias' }] } }
      : path.includes('/settings') ? ++settings === 1 ? old.promise : { data: { default_voice_id: 'tobias' } } : { data: { items: [] } });
    const first = startListening('first');
    await startListening('first');
    old.resolve({ data: { default_voice_id: free.id } });
    await first;
    expect(calls.choose.mock.calls).toEqual([['first', 'tobias', 'listener-a']]);
    expect(calls.open).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe('#/listen/first');
  });

  it('invalidates the player opening before a late open response can play or navigate', async () => {
    const opening = deferred<void>();
    calls.get.mockResolvedValue({ data: { items: [{ id: 'already-chosen' }] } });
    calls.open.mockReturnValue(opening.promise);
    const started = startListening('first');
    await vi.waitFor(() => expect(calls.open).toHaveBeenCalledOnce());
    navigate('#/book/second');
    expect(calls.close).toHaveBeenCalledOnce();
    opening.resolve();
    await started;
    expect(location.hash).toBe('#/book/second');
    expect(get(state).playing).toBe(false);
  });

  it('removes its pending-audio observer when the listener leaves', async () => {
    calls.open.mockImplementation(async (id: string) => state.set({ book: { id }, audiobookId: 'audio-mara', loaded: true, playing: false, listening: 'getting_ready' }));
    await startListening('first');
    navigate('#/library');
    expect(calls.close).toHaveBeenCalledOnce();
    state.set({ book: { id: 'first' }, audiobookId: 'audio-mara', loaded: true, playing: true, listening: 'playing' });
    expect(location.hash).toBe('#/library');
  });

  it('keeps normal playing audio after the intent completes and the listener navigates', async () => {
    await startListening('first');
    navigate('#/library');
    expect(calls.close).not.toHaveBeenCalled();
    expect(get(state).playing).toBe(true);
  });
});
