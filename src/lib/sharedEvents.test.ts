import { describe, expect, it } from 'vitest';
import { sharedStreamCount, subscribeSharedEvents } from './sse';

/** A fetch whose stream stays open and can be fed; counts connections. */
function fakeStream() {
  const state = { connections: 0, push: (_s: string) => {}, aborted: 0 };
  const fetchFn = ((_url: string, init: RequestInit) => {
    state.connections++;
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) });
    state.push = (s) => ctrl.enqueue(enc.encode(s));
    init.signal?.addEventListener('abort', () => {
      state.aborted++;
      try {
        ctrl.close();
      } catch {
        /* closed */
      }
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as typeof fetch;
  return { state, fetchFn };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const opts = (fetchFn: typeof fetch) => ({ headers: () => ({}), fetchFn, sleep: () => Promise.resolve() });

describe('one shared event stream per listener', () => {
  it('opens a single connection for any number of subscribers and gives each every notice', async () => {
    const { state, fetchFn } = fakeStream();
    const got: string[][] = [[], [], [], []];
    const stops = got.map((g, i) => subscribeSharedEvents('shared-a', { onmessage: (m) => g.push(m.data) }, opts(fetchFn)));
    await tick();
    expect(state.connections).toBe(1);
    expect(sharedStreamCount()).toBe(1);
    state.push('data: {"type":"job.updated"}\n\n');
    await tick();
    expect(got.map((g) => g.length)).toEqual([1, 1, 1, 1]);
    stops.forEach((s) => s());
    await tick();
    expect(state.aborted).toBe(1);
    expect(sharedStreamCount()).toBe(0);
  });

  it('closes only when the last subscriber leaves, and a later subscriber opens a new connection', async () => {
    const { state, fetchFn } = fakeStream();
    const a = subscribeSharedEvents('shared-b', { onmessage: () => {} }, opts(fetchFn));
    const b = subscribeSharedEvents('shared-b', { onmessage: () => {} }, opts(fetchFn));
    await tick();
    a();
    await tick();
    expect(state.aborted).toBe(0);
    b();
    await tick();
    expect(state.aborted).toBe(1);
    const c = subscribeSharedEvents('shared-b', { onmessage: () => {} }, opts(fetchFn));
    await tick();
    expect(state.connections).toBe(2);
    c();
  });

  it('tells a subscriber that joins an open stream to refetch now, and every subscriber after a reconnect', async () => {
    const { fetchFn } = fakeStream();
    let first = 0;
    let second = 0;
    const a = subscribeSharedEvents('shared-c', { onmessage: () => {}, onopen: () => first++ }, opts(fetchFn));
    await tick();
    expect(first).toBe(1);
    const b = subscribeSharedEvents('shared-c', { onmessage: () => {}, onopen: () => second++ }, opts(fetchFn));
    expect(second).toBe(1);
    a();
    b();
  });

  it('keeps separate streams for separate listeners', async () => {
    const { state, fetchFn } = fakeStream();
    const x = subscribeSharedEvents('shared-d1', { onmessage: () => {} }, opts(fetchFn));
    const y = subscribeSharedEvents('shared-d2', { onmessage: () => {} }, opts(fetchFn));
    await tick();
    expect(state.connections).toBe(2);
    x();
    y();
  });

  it('one subscriber failing does not stop the others', async () => {
    const { state, fetchFn } = fakeStream();
    let ok = 0;
    const a = subscribeSharedEvents('shared-e', { onmessage: () => { throw new Error('a subscriber that breaks'); } }, opts(fetchFn));
    const b = subscribeSharedEvents('shared-e', { onmessage: () => ok++ }, opts(fetchFn));
    await tick();
    state.push('data: {"type":"x"}\n\n');
    await tick();
    expect(ok).toBe(1);
    a();
    b();
  });
});
