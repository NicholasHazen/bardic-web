import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { components } from '../api/schema';
import { subscribeSharedEvents } from '../lib/sse';
import { SeriesContinuationStore, apiContinuationDeps, seriesContinuation, type ContinuationDeps } from './seriesContinuation';

vi.mock('../lib/sse', () => ({ subscribeSharedEvents: vi.fn() }));

type Book = components['schemas']['Book'];
type Series = components['schemas']['Series'];

const NAME = 'The Copper Orchard';
const EMPTY = { next: null, missingVolume: null };

function book(id: string, order: number | null, over: Partial<Book> = {}): Book {
  return {
    id,
    title: `Synthetic volume ${id}`,
    author: 'Liora Vale',
    state: 'readable',
    added_at: '2026-01-01T00:00:00Z',
    series: { name: NAME, order },
    cover: null,
    chapter_count: 1,
    story_chapter_count: 1,
    word_count: 90,
    source_sha256: null,
    place: null,
    ...over,
  };
}

function group(books: Book[], missing_orders: number[] = [], name = NAME): Series {
  return { name, books, missing_orders };
}

const successor = (id: string) => ({ id, title: `Synthetic volume ${id}` });

describe('S9 owned series continuation', () => {
  it('selects the nearest higher readable volume from an unsorted series', () => {
    const series = group([
      book('later', 8), book('current', 2), book('earlier', 1),
      book('still-adding', 2.25, { state: 'adding' }),
      book('removed', 2.5, { state: 'removed' }),
      book('deleting', 2.75, { state: 'deleting' }),
      book('nearest', 3), book('farther', 5),
    ]);
    expect(seriesContinuation([series], 'current')).toEqual({ next: successor('nearest'), missingVolume: null });
  });

  it('sorts fractional volumes numerically without treating null or equal orders as successors', () => {
    const series = group([
      book('current', 2), book('unknown', null), book('same-order', 2),
      book('third', 3), book('two-and-a-half', 2.5), book('two-and-a-quarter', 2.25),
    ]);
    expect(seriesContinuation([series], 'current')).toEqual({ next: successor('two-and-a-quarter'), missingVolume: null });
  });

  it('does not choose another edition at the current volume or an unnumbered book', () => {
    expect(seriesContinuation([group([book('current', 2), book('other-edition', 2), book('unknown', null)])], 'current')).toEqual(EMPTY);
  });

  it('chooses deterministically when the next volume has duplicate numbered editions', () => {
    const result = seriesContinuation([group([book('current', 2), book('edition-z', 3), book('edition-a', 3)])], 'current');
    expect(result).toEqual({ next: successor('edition-a'), missingVolume: null });
  });

  it('uses only the first server-known gap strictly between the current and next owned volumes', () => {
    const result = seriesContinuation([group([book('current', 2), book('next', 5)], [9, 5, 1, 4, 2, 3])], 'current');
    expect(result).toEqual({ next: successor('next'), missingVolume: `Volume 3 of ${NAME} is not in your library.` });
  });

  it('does not turn gaps before the current book or after the next book into a warning', () => {
    const result = seriesContinuation([group([book('current', 2), book('next', 4)], [1, 2, 4, 5])], 'current');
    expect(result).toEqual({ next: successor('next'), missingVolume: null });
  });

  it('never fabricates a missing integer or fractional volume from the distance to the next book', () => {
    expect(seriesContinuation([group([book('current', 1), book('next', 4)])], 'current')).toEqual({ next: successor('next'), missingVolume: null });
    expect(seriesContinuation([group([book('current', 2.5), book('next', 4.5)])], 'current')).toEqual({ next: successor('next'), missingVolume: null });
  });

  it('has no suggestion or missing-volume claim at the last known volume', () => {
    expect(seriesContinuation([group([book('first', 1), book('last', 3)], [2, 4])], 'last')).toEqual(EMPTY);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])('does not infer a successor when the current order is %s', (order) => {
    expect(seriesContinuation([group([book('current', order), book('next', 4)], [3])], 'current')).toEqual(EMPTY);
  });

  it('has no suggestion when the completed book is absent or has no series membership', () => {
    const series = [group([book('other', 1), book('later', 3)], [2])];
    expect(seriesContinuation(series, 'absent')).toEqual(EMPTY);
    expect(seriesContinuation([group([book('standalone', null, { series: null }), book('later', 3)], [2])], 'standalone')).toEqual(EMPTY);
    expect(seriesContinuation([], 'current')).toEqual(EMPTY);
  });

  it('finds the current series by book identity instead of choosing another series with lower volume numbers', () => {
    const result = seriesContinuation([
      group([book('unrelated-first', 1), book('unrelated-second', 2)], [], 'The Paper Harbor'),
      group([book('current', 8), book('owned-next', 9)]),
    ], 'current');
    expect(result).toEqual({ next: successor('owned-next'), missingVolume: null });
  });

  it('still offers an owned next volume whose listener place is already finished', () => {
    const finished = { chapter_id: 'synthetic-chapter', progress: 1, finished: true, updated_at: '2026-01-02T00:00:00Z' };
    const result = seriesContinuation([group([book('current', 1), book('owned-next', 2, { place: finished }), book('farther', 3)])], 'current');
    expect(result).toEqual({ next: successor('owned-next'), missingVolume: null });
  });

  it('merges Unicode case variants split into separate groups and uses their reported gaps', () => {
    const name = 'Örn Orchard';
    const lower = name.toLowerCase();
    const current = book('current', 2, { series: { name, order: 2 } });
    const result = seriesContinuation([
      group([current, book('later', 6, { series: { name, order: 6 } })], [], name),
      group([book('unrelated', 3)], [], 'Paper Harbor'),
      group([
        { ...current, series: { name: lower, order: 2 } },
        book('owned-next', 4, { series: { name: lower, order: 4 } }),
      ], [3, 5], lower),
    ], 'current');
    expect(result).toEqual({ next: successor('owned-next'), missingVolume: `Volume 3 of ${name} is not in your library.` });
  });

  it('does not report an owned volume as missing when another case-variant group knows it is still adding', () => {
    const name = 'Örn Orchard';
    const lower = name.toLowerCase();
    const result = seriesContinuation([
      group([book('current', 2, { series: { name, order: 2 } }), book('later', 6, { series: { name, order: 6 } })], [3, 4, 5], name),
      group([
        book('owned-adding', 3, { state: 'adding', series: { name: lower, order: 3 } }),
        book('owned-next', 4, { series: { name: lower, order: 4 } }),
      ], [3], lower),
    ], 'current');
    expect(result).toEqual({ next: successor('owned-next'), missingVolume: null });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const stores: SeriesContinuationStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function harness() {
  const requests: { listener: string; signal: AbortSignal; pending: ReturnType<typeof deferred<Series[]>> }[] = [];
  const follows: { listener: string; notice: () => void; stop: ReturnType<typeof vi.fn> }[] = [];
  const list = vi.fn<ContinuationDeps['list']>((listener, signal) => {
    const pending = deferred<Series[]>();
    requests.push({ listener, signal, pending });
    // Deliberately ignore abort: stale responses must remain harmless even when a transport cannot cancel.
    return pending.promise;
  });
  const follow = vi.fn<ContinuationDeps['follow']>((listener, refresh) => {
    let active = true;
    const stop = vi.fn(() => { active = false; });
    follows.push({ listener, notice: () => { if (active) refresh(); }, stop });
    return stop;
  });
  const store = new SeriesContinuationStore({ list, follow });
  stores.push(store);
  return {
    store, requests, follows, list, follow,
    async answer(index: number, books: Book[], gaps: number[] = []) {
      requests[index]!.pending.resolve([group(books, gaps)]);
      await Promise.resolve();
    },
    async fail(index: number) {
      requests[index]!.pending.reject(new Error('Synthetic server unavailable'));
      await Promise.resolve();
    },
  };
}

describe('S9 series lookup lifetime', () => {
  it('stays idle with no active listener and end book', async () => {
    const h = harness();
    h.store.configure(null, null);
    await h.store.refresh();
    expect(get(h.store)).toEqual({ status: 'idle', ...EMPTY });
    expect(h.list).not.toHaveBeenCalled();
    expect(h.follow).not.toHaveBeenCalled();
  });

  it('does not duplicate reads or subscriptions when the same end screen is configured repeatedly', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.store.configure('listener-a', 'current');
    expect(h.list).toHaveBeenCalledOnce();
    expect(h.follow).toHaveBeenCalledOnce();
    expect(h.requests[0]!.signal.aborted).toBe(false);
    await h.answer(0, [book('current', 1), book('next', 2)]);
    h.store.configure('listener-a', 'current');
    expect(h.list).toHaveBeenCalledOnce();
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('next'), missingVolume: null });
  });

  it('ignores the old listener response even if it arrives after the new listener suggestion', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.store.configure('listener-b', 'current');
    expect(h.requests.map((r) => r.listener)).toEqual(['listener-a', 'listener-b']);
    expect(h.requests[0]!.signal.aborted).toBe(true);
    expect(h.follows[0]!.stop).toHaveBeenCalledOnce();
    expect(h.follows[1]!.listener).toBe('listener-b');
    await h.answer(1, [book('current', 1), book('new-suggestion', 2)]);
    await h.answer(0, [book('current', 1), book('old-suggestion', 3)], [2]);
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('new-suggestion'), missingVolume: null });
  });

  it('ignores a late response for the previous completed book', async () => {
    const h = harness();
    h.store.configure('listener-a', 'first');
    h.store.configure('listener-a', 'second');
    expect(h.requests[0]!.signal.aborted).toBe(true);
    await h.answer(1, [book('second', 4), book('correct-next', 5)]);
    await h.answer(0, [book('first', 1), book('stale-next', 3)], [2]);
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('correct-next'), missingVolume: null });
  });

  it.each([
    [null, 'current'], ['listener-a', null], [null, null],
  ] as const)('clears and cancels when listener/book becomes %s/%s', async (listener, current) => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.store.configure(listener, current);
    expect(h.requests[0]!.signal.aborted).toBe(true);
    expect(h.follows[0]!.stop).toHaveBeenCalledOnce();
    expect(get(h.store)).toEqual({ status: 'idle', ...EMPTY });
    await h.answer(0, [book('current', 1), book('stale-next', 3)], [2]);
    expect(get(h.store)).toEqual({ status: 'idle', ...EMPTY });
    expect(h.list).toHaveBeenCalledOnce();
  });

  it('disposal aborts the read, unsubscribes, and prevents its late suggestion', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.store.dispose();
    expect(h.requests[0]!.signal.aborted).toBe(true);
    expect(h.follows[0]!.stop).toHaveBeenCalledOnce();
    await h.answer(0, [book('current', 1), book('stale-next', 3)], [2]);
    await h.store.refresh();
    expect(get(h.store)).toEqual({ status: 'idle', ...EMPTY });
    expect(h.list).toHaveBeenCalledOnce();
  });

  it('ignores a superseded refresh failure after a newer refresh has succeeded', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    const latest = h.store.refresh();
    expect(h.requests[0]!.signal.aborted).toBe(true);
    await h.answer(1, [book('current', 1), book('next', 2)]);
    await latest;
    await h.fail(0);
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('next'), missingVolume: null });
  });

  it('clears old suggestions during a refresh, keeps failed reads unknown, and recovers on explicit retry', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    await h.answer(0, [book('current', 1), book('old-next', 3)], [2]);
    expect(get(h.store).missingVolume).toBe(`Volume 2 of ${NAME} is not in your library.`);
    const refresh = h.store.refresh();
    expect(get(h.store)).toEqual({ status: 'loading', ...EMPTY });
    await h.fail(1);
    await refresh;
    expect(get(h.store)).toEqual({ status: 'error', ...EMPTY });
    const retry = h.store.refresh();
    await h.answer(2, [book('current', 1), book('newly-owned', 2), book('old-next', 3)]);
    await retry;
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('newly-owned'), missingVolume: null });
  });

  it('coalesces change notices and rereads ownership so a newly imported volume replaces the old gap', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.store.configure('listener-a', 'current');
    await h.answer(0, [book('current', 1), book('third', 3)], [2]);
    h.follows[0]!.notice();
    await vi.advanceTimersByTimeAsync(60);
    h.follows[0]!.notice();
    h.follows[0]!.notice();
    await vi.advanceTimersByTimeAsync(99);
    expect(h.list).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(get(h.store)).toEqual({ status: 'loading', ...EMPTY });
    await h.answer(1, [book('current', 1), book('new-second', 2), book('third', 3)]);
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('new-second'), missingVolume: null });
  });

  it('cancels queued old-listener notices when reconfigured and does not refresh after disposal', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.follows[0]!.notice();
    h.store.configure('listener-b', 'current');
    h.follows[0]!.notice(); // The stopped subscription cannot deliver further events.
    await vi.advanceTimersByTimeAsync(150);
    expect(h.requests.map((r) => r.listener)).toEqual(['listener-a', 'listener-b']);
    h.follows[1]!.notice();
    h.store.dispose();
    await vi.advanceTimersByTimeAsync(150);
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(get(h.store)).toEqual({ status: 'idle', ...EMPTY });
  });

  it('can configure the same book again after disposing its previous end screen', async () => {
    const h = harness();
    h.store.configure('listener-a', 'current');
    h.store.dispose();
    h.store.configure('listener-a', 'current');
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(h.follow).toHaveBeenCalledTimes(2);
    await h.answer(1, [book('current', 1), book('next', 2)]);
    expect(get(h.store)).toEqual({ status: 'ready', next: successor('next'), missingVolume: null });
  });
});

describe('S9 series change subscription', () => {
  it('refreshes after first open and reconnect so the initial read-to-subscribe interval cannot hide a change', () => {
    const subscribe = vi.mocked(subscribeSharedEvents);
    subscribe.mockReset();
    const stop = vi.fn();
    subscribe.mockReturnValue(stop);
    const refresh = vi.fn();
    const dispose = apiContinuationDeps.follow('listener-a', refresh);
    const [listener, subscriber] = subscribe.mock.calls[0]!;
    expect(listener).toBe('listener-a');
    subscriber.onopen?.();
    expect(refresh).toHaveBeenCalledOnce();
    subscriber.onopen?.();
    expect(refresh).toHaveBeenCalledTimes(2);
    dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('refreshes for ownership and resync notices, while ignoring playback, unrelated, or malformed messages', () => {
    const subscribe = vi.mocked(subscribeSharedEvents);
    subscribe.mockReset();
    subscribe.mockReturnValue(vi.fn());
    const refresh = vi.fn();
    const dispose = apiContinuationDeps.follow('listener-a', refresh);
    const subscriber = subscribe.mock.calls[0]![1];
    for (const type of ['book.updated', 'import.updated', 'deletion.updated', 'resync']) {
      subscriber.onmessage({ data: JSON.stringify({ type }) });
    }
    expect(refresh).toHaveBeenCalledTimes(4);
    for (const type of ['place.updated', 'chapter.updated', 'listener.updated', 'other']) {
      subscriber.onmessage({ data: JSON.stringify({ type }) });
    }
    subscriber.onmessage({ data: 'not valid JSON' });
    subscriber.onmessage({ data: '{}' });
    expect(refresh).toHaveBeenCalledTimes(4);
    dispose();
  });
});
