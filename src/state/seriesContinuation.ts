// S9: suggest an owned volume, using the server's complete series list and only its known gaps.
// This is a read-only lookup. Opening the suggestion goes to the book page, where the existing
// voice and plan flow decides what can play; finding a next volume never generates audio.
import { writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { deviceId } from '../lib/device';
import { subscribeSharedEvents } from '../lib/sse';

type Series = components['schemas']['Series'];

export interface Continuation {
  next: { id: string; title: string } | null;
  missingVolume: string | null;
}

const empty = (): Continuation => ({ next: null, missingVolume: null });
const ordered = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Null/duplicate orders do not establish a successor; fractional orders sort numerically. */
export function seriesContinuation(series: readonly Series[], bookId: string): Continuation {
  const group = series.find((s) => s.books.some((b) => b.id === bookId));
  const current = group?.books.find((b) => b.id === bookId);
  const order = current?.series?.order;
  if (!group || !ordered(order)) return empty();
  // Unicode case variants can arrive as separate groups when the server's SQL sort separates them.
  // Join the same named series, without mistaking a reported gap in one group for a book in another.
  const groups = series.filter((s) => s.name.toLowerCase() === group.name.toLowerCase());
  const books = [...new Map(groups.flatMap((s) => s.books).map((b) => [b.id, b])).values()];
  const orders = books.map((b) => b.series?.order).filter(ordered);
  const next = books
    .filter((b) => b.id !== bookId && b.state === 'readable' && ordered(b.series?.order) && b.series!.order! > order)
    .sort((a, b) => a.series!.order! - b.series!.order! || a.id.localeCompare(b.id))[0];
  if (!next) return empty();
  const gap = orders.every(Number.isInteger)
    ? groups.flatMap((s) => s.missing_orders).filter((n) => ordered(n) && n > order && n < next.series!.order! && !orders.includes(n)).sort((a, b) => a - b)[0]
    : undefined;
  return {
    next: { id: next.id, title: next.title },
    missingVolume: gap === undefined ? null : `Volume ${gap} of ${group.name} is not in your library.`,
  };
}

export interface ContinuationState extends Continuation {
  status: 'idle' | 'loading' | 'ready' | 'error';
}

export interface ContinuationDeps {
  list(listenerId: string, signal: AbortSignal): Promise<Series[]>;
  follow(listenerId: string, refresh: () => void): () => void;
}

/** One end screen's lookup. Leaving the end state cancels reads and clears every suggestion. */
export class SeriesContinuationStore {
  private readonly store = writable<ContinuationState>({ status: 'idle', ...empty() });
  readonly subscribe: Readable<ContinuationState>['subscribe'] = this.store.subscribe;
  private listenerId: string | null = null;
  private bookId: string | null = null;
  private run = 0;
  private abort: AbortController | undefined;
  private stop: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ContinuationDeps) {}

  configure(listenerId: string | null, bookId: string | null): void {
    if (listenerId === this.listenerId && bookId === this.bookId) return;
    this.dispose();
    if (!listenerId || !bookId) return;
    this.listenerId = listenerId;
    this.bookId = bookId;
    void this.refresh();
    this.stop = this.deps.follow(listenerId, () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(), 100);
    });
  }

  async refresh(): Promise<void> {
    const listenerId = this.listenerId;
    const bookId = this.bookId;
    if (!listenerId || !bookId) return;
    clearTimeout(this.timer);
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const run = ++this.run;
    this.store.set({ status: 'loading', ...empty() });
    try {
      const series = await this.deps.list(listenerId, abort.signal);
      if (run === this.run) this.store.set({ status: 'ready', ...seriesContinuation(series, bookId) });
    } catch {
      // A failed/incomplete read says nothing about what the listener owns or what is missing.
      if (run === this.run) this.store.set({ status: 'error', ...empty() });
    }
  }

  dispose(): void {
    ++this.run;
    this.abort?.abort();
    this.abort = undefined;
    this.stop?.();
    this.stop = undefined;
    clearTimeout(this.timer);
    this.listenerId = null;
    this.bookId = null;
    this.store.set({ status: 'idle', ...empty() });
  }
}

export const apiContinuationDeps: ContinuationDeps = {
  async list(listenerId, signal) {
    const r = await api.GET('/api/series', { params: { header: { 'X-Bardic-Listener': listenerId } }, signal });
    if (!r.data) throw r.error ?? new Error('Series could not be checked.');
    return r.data.items;
  },
  follow(listenerId, refresh) {
    return subscribeSharedEvents(listenerId, {
      // Re-read on the first open too: a change between the initial read and subscription has no replay.
      onopen: refresh,
      onmessage(msg) {
        try {
          const notice = JSON.parse(msg.data) as { type?: string };
          if (['book.updated', 'import.updated', 'deletion.updated', 'resync'].includes(notice.type ?? '')) refresh();
        } catch { /* Not a change notice. */ }
      },
    }, { headers: () => ({ 'X-Bardic-Listener': listenerId, 'X-Bardic-Device': deviceId() }) });
  },
};
