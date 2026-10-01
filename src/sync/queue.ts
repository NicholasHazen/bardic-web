// Place writes waiting for the server. One entry per listener and book: the latest wins, so a long time
// offline is still one write (docs/ARCHITECTURE.md section 4). Kept in storage so a closed tab or a crash
// does not lose it. Entries are replayed oldest-queued first.
import type { KeyValueStorage } from '../lib/clock';
import type { components } from '../api/schema';

export type PlaceInput = components['schemas']['PlaceInput'];

export interface QueuedWrite {
  listenerId: string;
  bookId: string;
  input: PlaceInput;
  /** when the book first entered the queue (epoch ms); the replay order */
  queuedAt: number;
  /** grows with every replacement, so an acknowledgement for an older write cannot remove a newer one */
  seq: number;
  /**
   * Written right after this one is acknowledged, on the revision it gives. Used when this device's position lost to
   * another device's place: it is written first (so the server keeps it in history), then the place that was chosen.
   */
  after?: Omit<PlaceInput, 'base_revision'>;
}

const KEY = 'bardic.placequeue';

const same = (e: QueuedWrite, l: string, b: string) => e.listenerId === l && e.bookId === b;

export class PlaceQueue {
  private items: QueuedWrite[] | null = null;

  constructor(private readonly storage: KeyValueStorage) {}

  private load(): QueuedWrite[] {
    if (this.items) return this.items;
    let items: QueuedWrite[] = [];
    try {
      const raw = this.storage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        items = parsed.filter(
          (e): e is QueuedWrite =>
            !!e && typeof e.listenerId === 'string' && typeof e.bookId === 'string' && !!e.input && typeof e.input.chapter_id === 'string' && typeof e.seq === 'number',
        );
      }
    } catch {
      items = [];
    }
    this.items = items;
    return items;
  }

  private save(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.load()));
    } catch {
      /* the in-memory queue still serves this page */
    }
  }

  /** Entries in replay order. */
  all(): QueuedWrite[] {
    return [...this.load()].sort((a, b) => a.queuedAt - b.queuedAt || a.seq - b.seq);
  }

  get size(): number {
    return this.load().length;
  }

  get(listenerId: string, bookId: string): QueuedWrite | undefined {
    return this.load().find((e) => same(e, listenerId, bookId));
  }

  has(listenerId: string, bookId: string): boolean {
    return !!this.get(listenerId, bookId);
  }

  /** Queue a write, replacing any earlier one for the same book (it keeps its place in the order). */
  put(listenerId: string, bookId: string, input: PlaceInput, now: number, after?: QueuedWrite['after']): QueuedWrite {
    const items = this.load();
    const old = items.find((e) => same(e, listenerId, bookId));
    if (old) {
      old.input = input;
      old.after = after;
      old.seq++;
      this.save();
      return old;
    }
    const e: QueuedWrite = { listenerId, bookId, input, queuedAt: now, seq: 1, ...(after ? { after } : {}) };
    items.push(e);
    this.save();
    return e;
  }

  /** Drop a write once the server holds it. With `seq`, only if it has not been replaced since. */
  remove(listenerId: string, bookId: string, seq?: number): boolean {
    const items = this.load();
    const i = items.findIndex((e) => same(e, listenerId, bookId) && (seq === undefined || e.seq === seq));
    if (i < 0) return false;
    items.splice(i, 1);
    this.save();
    return true;
  }

  /** The server's revision moved on (from our own write): later writes build on it. */
  rebase(listenerId: string, bookId: string, revision: number): void {
    const e = this.get(listenerId, bookId);
    if (e && e.input.base_revision !== revision) {
      e.input = { ...e.input, base_revision: revision };
      this.save();
    }
  }
}
