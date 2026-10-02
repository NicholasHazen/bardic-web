// Book management (W6): mark finished, free up space, remove, delete permanently with undo, and the server's name.
// The rules and words are in src/views/manage/logic.ts; this file joins them to the typed client.
//
// Nothing here can start paid work. Every call is one of: setFinished, remove and restore, space and free,
// deletion (schedule, read, cancel), server read and rename. All are `x-bardic-cost: none` except getAudiobookSpace
// (`network`: it reads a price, it spends nothing); src/state/moneyPath.test.ts guards the list of charging calls.
import { derived, get, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { browserStorage, type KeyValueStorage } from '../lib/clock';
import { subscribeSharedEvents } from '../lib/sse';
import type { PendingDeletion, RemakeEstimate, SpaceRow } from '../views/manage/types';
import { call, dev, hdr, type R } from './book';
import { homeList, libraryList, manageList } from './library';

export type Server = components['schemas']['Server'];
export type Deletion = components['schemas']['Deletion'];
export type AudiobookSpace = components['schemas']['AudiobookSpace'];
export type Place = components['schemas']['Place'];
export type Audiobook = components['schemas']['Audiobook'];

// --------------------------------------------------------------------------- the gateway

export interface ManageGateway {
  setFinished(listenerId: string, bookId: string, finished: boolean): Promise<R<Place>>;
  space(audiobookId: string): Promise<R<AudiobookSpace>>;
  free(audiobookId: string): Promise<R<{ freed_bytes: number }>>;
  schedule(listenerId: string, bookId: string): Promise<R<Deletion>>;
  deletion(listenerId: string, bookId: string): Promise<R<Deletion>>;
  cancel(listenerId: string, bookId: string): Promise<R<undefined>>;
  server(): Promise<R<Server>>;
  rename(name: string): Promise<R<Server>>;
}

export const apiGateway: ManageGateway = {
  setFinished: (l, id, finished) =>
    call(() => api.PUT('/api/books/{book_id}/place/finished', { params: { path: { book_id: id }, header: hdr(l) }, body: { finished } })),
  space: (id) => call(() => api.GET('/api/audiobooks/{audiobook_id}/space', { params: { path: { audiobook_id: id } } })),
  free: (id) => call(() => api.DELETE('/api/audiobooks/{audiobook_id}/space', { params: { path: { audiobook_id: id }, header: dev() } })),
  schedule: (l, id) => call(() => api.POST('/api/books/{book_id}/deletion', { params: { path: { book_id: id }, header: hdr(l) } })),
  deletion: (_l, id) => call(() => api.GET('/api/books/{book_id}/deletion', { params: { path: { book_id: id } } })),
  cancel: (l, id) => call(() => api.DELETE('/api/books/{book_id}/deletion', { params: { path: { book_id: id }, header: hdr(l) } })) as Promise<R<undefined>>,
  server: () => call(() => api.GET('/api/server')),
  rename: (name) => call(() => api.PATCH('/api/server', { params: { header: dev() }, body: { name } })),
};

// --------------------------------------------------------------------------- shaping

const estimateOf = (e: AudiobookSpace['remake_estimate']): RemakeEstimate | null => (e ? { low: e.low, likely: e.likely, high: e.high, basis: e.basis } : null);

/** One row of the Free up space sheet from the audiobook and what the server says about its space. */
export function toSpaceRow(
  a: Pick<Audiobook, 'id' | 'voice_name' | 'tier' | 'chapters_ready' | 'chapters_total' | 'bytes'>,
  space: AudiobookSpace | null,
): SpaceRow {
  const premium = a.tier === 'premium';
  return {
    id: a.id,
    name: a.voice_name,
    premium,
    chaptersReady: a.chapters_ready,
    chaptersTotal: a.chapters_total,
    bytes: space ? space.bytes : null,
    remake: premium ? estimateOf(space?.remake_estimate ?? null) : null,
  };
}

// --------------------------------------------------------------------------- what is being deleted

/**
 * Books scheduled for permanent deletion that this device knows about. The server hides such a book at once (reading
 * it is 404) and has no list of schedules, so this device keeps the ids it scheduled, reads each back from the server
 * on load (the schedule itself is the server's: it survives closing this page and a server restart) and drops it when
 * the server says it is cancelled or done.
 */
export const STORAGE_KEY = 'bardic.pendingDeletions';

interface RememberedDeletion {
  bookId: string;
  title: string;
  executesAt?: string;
  totalSeconds?: number;
  skewMs?: number;
}

export function parseEntries(raw: string | null): RememberedDeletion[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: RememberedDeletion[] = [];
    for (const e of v as Record<string, unknown>[]) {
      if (e && typeof e.bookId === 'string') {
        out.push({
          bookId: e.bookId,
          title: typeof e.title === 'string' ? e.title : '',
          ...(typeof e.executesAt === 'string' && Number.isFinite(Date.parse(e.executesAt)) ? { executesAt: e.executesAt } : {}),
          ...(typeof e.totalSeconds === 'number' && e.totalSeconds > 0 && Number.isFinite(e.totalSeconds) ? { totalSeconds: e.totalSeconds } : {}),
          ...(typeof e.skewMs === 'number' && Number.isFinite(e.skewMs) ? { skewMs: e.skewMs } : {}),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface DeletionState {
  items: PendingDeletion[];
  /** Server time minus this device's time, in ms, measured when the schedule was read: the countdown is a display only. */
  skewMs: number;
}

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; detail: string; code?: string };

export class DeletionStore {
  private readonly store = writable<DeletionState>({ items: [], skewMs: 0 });
  readonly subscribe: Readable<DeletionState>['subscribe'] = this.store.subscribe;
  private readonly inflight = new Set<string>();
  // Keep ids independently of confirmed schedules. A failed read must not erase an id when another read succeeds.
  private readonly remembered = new Map<string, RememberedDeletion>();
  /** Called when a deletion finished or was cancelled, so that lists can be read again. */
  onchange: () => void = () => {};

  constructor(
    private readonly gw: ManageGateway = apiGateway,
    private readonly storage: KeyValueStorage = browserStorage(),
    private readonly now: () => number = Date.now,
  ) {
    this.remember();
  }

  private remember(): void {
    const entries = parseEntries(this.storage.getItem(STORAGE_KEY));
    for (const e of entries) if (!this.remembered.has(e.bookId)) this.remembered.set(e.bookId, e);
    const items = entries.filter((e): e is RememberedDeletion & { executesAt: string } => !!e.executesAt);
    if (items.length) {
      this.store.update((s) => ({
        items: [...s.items, ...items.filter((e) => !s.items.some((i) => i.bookId === e.bookId)).map(({ bookId, title, executesAt, totalSeconds }) => ({ bookId, title, executesAt, ...(totalSeconds ? { totalSeconds } : {}) }))],
        skewMs: entries.find((e) => e.skewMs !== undefined)?.skewMs ?? s.skewMs,
      }));
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify([...this.remembered.values()]));
    } catch {
      /* the page still works without it; the schedule is on the server */
    }
  }

  private put(d: Deletion, title: string): void {
    const total = Math.round((Date.parse(d.executes_at) - Date.parse(d.scheduled_at)) / 1000);
    const current = get(this.store);
    const existing = current.items.find((i) => i.bookId === d.book_id);
    const item: PendingDeletion = { bookId: d.book_id, title: title || existing?.title || this.remembered.get(d.book_id)?.title || '', executesAt: d.executes_at, ...(Number.isFinite(total) && total > 0 ? { totalSeconds: total } : {}) };
    this.remembered.set(d.book_id, { ...item, skewMs: current.skewMs });
    // An unchanged pending reply must not retrigger the countdown effect and poll continuously at zero.
    if (existing?.title === item.title && existing.executesAt === item.executesAt && existing.totalSeconds === item.totalSeconds) {
      this.persist();
      return;
    }
    this.store.update((s) => ({
      ...s,
      items: [
        ...s.items.filter((i) => i.bookId !== d.book_id),
        item,
      ],
    }));
    this.persist();
  }

  private drop(bookId: string): void {
    this.remembered.delete(bookId);
    this.store.update((s) => ({ ...s, items: s.items.filter((i) => i.bookId !== bookId) }));
    this.persist();
  }

  has(bookId: string): boolean {
    return get(this.store).items.some((i) => i.bookId === bookId);
  }

  /** Measure how far this device's clock is from the server's. Never fails: without it the countdown uses this clock. */
  private async measureSkew(): Promise<void> {
    const before = this.now();
    const r = await this.gw.server();
    if (!r.ok) return;
    const after = this.now();
    const t = Date.parse(r.value.time);
    if (Number.isFinite(t)) this.store.update((s) => ({ ...s, skewMs: t - (before + after) / 2 }));
  }

  /** On load: read every remembered deletion back from the server. */
  async load(listenerId: string): Promise<void> {
    this.remember();
    const remembered = [...this.remembered.values()];
    if (!remembered.length) return;
    await this.measureSkew();
    await Promise.all(remembered.map((e) => this.refresh(listenerId, e.bookId, e.title)));
  }

  /** Read one schedule from the server and keep, or drop, the entry. Pending keeps it; cancelled, done or unknown drops it. */
  async refresh(listenerId: string, bookId: string, title = ''): Promise<void> {
    if (this.inflight.has(bookId)) return;
    this.inflight.add(bookId);
    try {
      const r = await this.gw.deletion(listenerId, bookId);
      if (r.ok && r.value.state === 'pending') {
        this.put(r.value, title);
      } else if (r.ok || r.status === 404) {
        const had = this.has(bookId);
        this.drop(bookId);
        if (had) this.onchange();
      }
      // Any other failure (the server is unreachable): the entry stays and is read again later.
    } finally {
      this.inflight.delete(bookId);
    }
  }

  /** The book page of a hidden book asks: is this one being deleted? A device that never scheduled it learns of it here. */
  async adopt(listenerId: string, bookId: string): Promise<boolean> {
    if (!this.has(bookId)) {
      const r = await this.gw.deletion(listenerId, bookId);
      if (!r.ok || r.value.state !== 'pending') return false;
      await this.measureSkew();
      this.put(r.value, '');
      return true;
    }
    await this.refresh(listenerId, bookId);
    return this.has(bookId);
  }

  /** Delete permanently, 60 seconds from now (the server's default and minimum). The server hides the book at once. */
  async schedule(listenerId: string, book: { id: string; title: string }): Promise<ActionResult<Deletion>> {
    const sent = this.now();
    const r = await this.gw.schedule(listenerId, book.id);
    if (!r.ok) return { ok: false, detail: r.detail, code: r.code };
    const at = Date.parse(r.value.scheduled_at);
    // scheduled_at is the server's "now" when it handled the request, about halfway through the round trip: a measure
    // of this device's clock against the server's without another request.
    if (Number.isFinite(at)) this.store.update((s) => ({ ...s, skewMs: at - (sent + this.now()) / 2 }));
    this.put(r.value, book.title);
    this.onchange();
    return { ok: true, value: r.value };
  }

  /** Undo: the server cancels the schedule and the book returns exactly as it was. */
  async undo(listenerId: string, bookId: string): Promise<ActionResult> {
    const r = await this.gw.cancel(listenerId, bookId);
    if (r.ok) {
      this.drop(bookId);
      this.onchange();
      return { ok: true, value: undefined };
    }
    if (r.code === 'deletion_done' || r.code === 'deletion_not_found') {
      this.drop(bookId);
      this.onchange();
    }
    return { ok: false, detail: r.detail, code: r.code };
  }
}

export const deletions = new DeletionStore();
deletions.onchange = () => {
  for (const l of [libraryList, homeList, manageList]) l.refreshSoon(0);
};

/** The id of every book being deleted that this device knows of. */
export const pendingBookIds: Readable<ReadonlySet<string>> = derived(deletions, (s) => new Set(s.items.map((i) => i.bookId)));

/** Read what is scheduled and keep it current from the shared event stream (`deletion.updated` carries the book id). */
export function followDeletions(listenerId: string): () => void {
  void deletions.load(listenerId);
  return subscribeSharedEvents(
    listenerId,
    {
      onopen: () => void deletions.load(listenerId),
      onmessage: (msg) => {
        try {
          const n = JSON.parse(msg.data) as { type?: string; id?: string | null };
          if (n.type === 'deletion.updated' && n.id) void deletions.refresh(listenerId, n.id);
        } catch {
          /* not a notice */
        }
      },
    },
    { headers: () => hdr(listenerId) },
  );
}

// --------------------------------------------------------------------------- the server

export interface ServerState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  server?: Server;
  error?: string;
}

export class ServerStore {
  private readonly store = writable<ServerState>({ status: 'idle' });
  private loadGeneration = 0;
  readonly subscribe: Readable<ServerState>['subscribe'] = this.store.subscribe;

  constructor(private readonly gw: ManageGateway = apiGateway) {}

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.store.update((s) => ({ ...s, status: s.server ? 'ready' : 'loading' }));
    const r = await this.gw.server();
    if (generation !== this.loadGeneration) return;
    if (r.ok) this.store.set({ status: 'ready', server: r.value });
    else this.store.update((s) => ({ ...s, status: s.server ? 'ready' : 'error', error: r.detail }));
  }

  /** Rename. The name shown everywhere comes from this store, so every screen updates at once. */
  async rename(name: string): Promise<ActionResult<Server>> {
    const r = await this.gw.rename(name);
    if (!r.ok) return { ok: false, detail: r.detail, code: r.code };
    // A response fetched before this successful mutation cannot put the old name back.
    this.loadGeneration++;
    this.store.set({ status: 'ready', server: r.value });
    return { ok: true, value: r.value };
  }
}

export const serverStore = new ServerStore();

const serverStreams = new Map<string, { refs: number; stop: () => void }>();

/** Load the server and read it again when `server.updated` arrives (another device renamed it). Reference counted. */
export function followServer(listenerId: string | null): () => void {
  void serverStore.load();
  if (!listenerId) return () => {};
  const existing = serverStreams.get(listenerId);
  if (existing) existing.refs++;
  else {
    const stop = subscribeSharedEvents(
      listenerId,
      {
        onopen: () => void serverStore.load(),
        onmessage: (msg) => {
          try {
            if ((JSON.parse(msg.data) as { type?: string }).type === 'server.updated') void serverStore.load();
          } catch {
            /* not a notice */
          }
        },
      },
      { headers: () => hdr(listenerId) },
    );
    serverStreams.set(listenerId, { refs: 1, stop });
  }
  return () => {
    const stream = serverStreams.get(listenerId);
    if (stream && --stream.refs === 0) {
      stream.stop();
      serverStreams.delete(listenerId);
    }
  };
}

/** The address this page was opened from: the one the server is reached at. */
export const serverAddress = (): string => (typeof location === 'undefined' ? '' : location.host);

// --------------------------------------------------------------------------- the single-book actions

export const manageActions = {
  /** Earlier places are server history, newest first. Restoring uses the player's revision-aware place writer. */
  async history(listenerId: string, bookId: string): Promise<R<Place[]>> {
    const r = await call<{ items: Place[] }>(() => api.GET('/api/books/{book_id}/place/history', { params: { path: { book_id: bookId }, header: hdr(listenerId) } }));
    return r.ok ? { ok: true, value: r.value.items } : r;
  },
  async useNewestPlace(listenerId: string): Promise<ActionResult> {
    const current = await call<components['schemas']['ListenerSettings']>(() => api.GET('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId } } }));
    if (!current.ok) return { ok: false, detail: current.detail, code: current.code };
    const r = await call(() => api.PUT('/api/listeners/{listener_id}/settings', { params: { path: { listener_id: listenerId }, header: dev() }, body: { ...current.value, place_conflict: 'newest' } }));
    return r.ok ? { ok: true, value: undefined } : { ok: false, detail: r.detail, code: r.code };
  },
  async setFinished(listenerId: string, bookId: string, finished: boolean, gw: ManageGateway = apiGateway): Promise<ActionResult<Place>> {
    const r = await gw.setFinished(listenerId, bookId, finished);
    return r.ok ? { ok: true, value: r.value } : { ok: false, detail: r.detail, code: r.code };
  },
  /** What each audiobook would free, one read per audiobook (free of charge; a premium one also carries the estimate). */
  async spaceFor(audiobooks: readonly Audiobook[], gw: ManageGateway = apiGateway): Promise<SpaceRow[]> {
    return Promise.all(
      audiobooks.map(async (a) => {
        const r = await gw.space(a.id);
        return toSpaceRow(a, r.ok ? r.value : null);
      }),
    );
  },
  /** Free the chosen audiobooks one after another; stops at the first refusal and says what was freed before it. */
  async free(ids: readonly string[], gw: ManageGateway = apiGateway): Promise<{ freedBytes: number; refused?: { detail: string; code?: string } }> {
    let freedBytes = 0;
    for (const id of ids) {
      const r = await gw.free(id);
      if (!r.ok) return { freedBytes, refused: { detail: r.detail, code: r.code } };
      freedBytes += r.value.freed_bytes;
    }
    return { freedBytes };
  },
};

// --------------------------------------------------------------------------- Edit details

/** The book menu's "Edit details" asks Manage to open the editor for this book; Manage reads it once and clears it. */
export const editRequest = writable<string | null>(null);
