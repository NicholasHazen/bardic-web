// The place writer (docs/ARCHITECTURE.md section 4, docs/PRODUCT-SPEC.md C1 to C5).
//
// - A local copy of the place (exact audio time, chapter, offset, mode, the revision last known) is written
//   continuously. The server is written on events (the player calls `flush`) and at most every 30 seconds while
//   playing. Writes that cannot reach the server wait in a persisted queue, one entry per book, latest wins.
// - Every write carries `base_revision`. A write from this device that the server already holds is not a conflict.
// - On `place_conflict` the listener's setting decides: ask (hold the write and surface both places), newest
//   (the later `updated_at`) or this device. The place not chosen is never thrown away silently: the server keeps
//   it in history, and a choice for "theirs" adopts the server's place whole.
// - Another device's place seen in a notice is only offered while the listener is paused; playing is never
//   interrupted by it.
//
// Nothing here knows about audio or the DOM. Timers, storage, the network and page lifecycle are arguments.
import { get, writable, type Readable } from 'svelte/store';
import { api } from '../api/client';
import type { components } from '../api/schema';
import { browserStorage, systemClock, type Clock, type KeyValueStorage } from '../lib/clock';
import { deviceId as thisDeviceId } from '../lib/device';
import { PlaceQueue, type PlaceInput } from './queue';

export type Place = components['schemas']['Place'];
export type PlaceMode = Place['mode'];
export type SyncPolicy = 'ask' | 'newest' | 'this_device';
export type PlaceStatus = 'saved' | 'saving' | 'queued_offline';

/** Where the listener is. `time` is exact audio time in seconds, null when only the text offset is known. */
export interface Position {
  chapterId: string;
  /** code point offset into the chapter text */
  offset: number;
  time: number | null;
  mode: PlaceMode;
  audiobookId: string | null;
}

/** The copy this device keeps of its own place in a book. */
export interface LocalPlace extends Position {
  /** the server revision this copy is based on (0 if the server never had one) */
  rev: number;
  /** epoch ms of the last change of place */
  updatedAt: number;
}

export interface HeldConflict {
  /** what this device was about to write */
  mine: LocalPlace;
  /** what the server has from another device */
  theirs: Place;
}

// --------------------------------------------------------------------------- the network port

export type PutResult = { kind: 'ok'; place: Place } | { kind: 'conflict'; server: Place } | { kind: 'offline' } | { kind: 'rejected'; status: number; code?: string };
export type GetResult = { kind: 'ok'; place: Place | null } | { kind: 'offline' };

export interface PlaceApi {
  get(listenerId: string, bookId: string): Promise<GetResult>;
  put(listenerId: string, bookId: string, input: PlaceInput, opts?: { keepalive?: boolean }): Promise<PutResult>;
}

/** The listener is named per request (not taken from the app-wide header) so a write can still go out under the previous listener. */
const withDevice = (req: Request) => {
  req.headers.set('X-Bardic-Device', thisDeviceId());
  return fetch(req);
};

export const apiPlaceApi: PlaceApi = {
  async get(l, b) {
    try {
      const r = await api.GET('/api/books/{book_id}/place', { params: { path: { book_id: b }, header: { 'X-Bardic-Listener': l } }, fetch: withDevice });
      if (r.response.ok && r.data) return { kind: 'ok', place: r.data };
      const code = (r.error as { code?: string } | undefined)?.code;
      if (r.response.status === 404 && code === 'place_not_found') return { kind: 'ok', place: null };
      return { kind: 'offline' };
    } catch {
      return { kind: 'offline' };
    }
  },
  async put(l, b, input, opts) {
    try {
      const r = await api.PUT('/api/books/{book_id}/place', {
        params: { path: { book_id: b }, header: { 'X-Bardic-Listener': l, 'X-Bardic-Device': thisDeviceId() } },
        body: input,
        fetch: withDevice,
        ...(opts?.keepalive ? { keepalive: true } : {}),
      });
      if (r.response.ok && r.data) return { kind: 'ok', place: r.data };
      const status = r.response.status;
      const body = r.error as { code?: string; server_place?: Place } | undefined;
      if (status === 409 && body?.code === 'place_conflict' && body.server_place) return { kind: 'conflict', server: body.server_place };
      if (status >= 500 || status === 429 || status === 408) return { kind: 'offline' };
      return { kind: 'rejected', status, code: body?.code };
    } catch {
      return { kind: 'offline' };
    }
  },
};

// --------------------------------------------------------------------------- page lifecycle

export interface Lifecycle {
  /** the page is hidden or going away */
  onBackground(cb: () => void): () => void;
  /** the network came back */
  onOnline(cb: () => void): () => void;
}

export function browserLifecycle(): Lifecycle {
  return {
    onBackground(cb) {
      const hidden = () => {
        if (document.visibilityState === 'hidden') cb();
      };
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', cb);
      return () => {
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('pagehide', cb);
      };
    },
    onOnline(cb) {
      window.addEventListener('online', cb);
      return () => window.removeEventListener('online', cb);
    },
  };
}

// --------------------------------------------------------------------------- helpers

export const WRITE_INTERVAL_MS = 30_000;
export const RETRY_MS = 15_000;

export const keyOfPosition = (p: Pick<Position, 'chapterId' | 'offset' | 'mode' | 'audiobookId'>) => `${p.chapterId}|${p.offset}|${p.mode}|${p.audiobookId ?? ''}`;
const keyOfPlace = (p: Place) => `${p.chapter_id}|${p.offset}|${p.mode}|${p.audiobook_id ?? ''}`;
/** Same chapter, offset and mode: the same place, whatever the audiobook. */
const sameSpot = (p: Position, pl: Place) => p.chapterId === pl.chapter_id && p.offset === pl.offset && p.mode === pl.mode;

export const inputOf = (p: Position, baseRevision: number): PlaceInput => ({
  chapter_id: p.chapterId,
  offset: p.offset,
  mode: p.mode,
  audiobook_id: p.audiobookId,
  base_revision: baseRevision,
});

const positionOfInput = (i: PlaceInput): Position => ({ chapterId: i.chapter_id, offset: i.offset, time: null, mode: i.mode, audiobookId: i.audiobook_id ?? null });

const positionOfPlace = (p: Place): Position => ({ chapterId: p.chapter_id, offset: p.offset, time: null, mode: p.mode, audiobookId: p.audiobook_id });

export type OpenDecision =
  /** the listener has no place anywhere */
  | { kind: 'fresh' }
  /** the server's place is the one to use; `local` is this device's own copy, if any (its exact time is good when it is the same spot) */
  | { kind: 'server'; place: Place; local: LocalPlace | null }
  /** this device's own copy is the one to use */
  | { kind: 'local'; local: LocalPlace }
  /** two places and the setting says ask: nothing is written until `resolve` */
  | { kind: 'ask'; local: LocalPlace; server: Place };

interface Session {
  listenerId: string;
  bookId: string;
  /** the server revision our next write builds on: from our own acknowledged writes, or adopted */
  rev: number;
  pos: Position | null;
  key: string | null;
  updatedAt: number;
  lastWriteAt: number;
  lastSavedTime: number;
  inflight: Promise<void> | null;
  conflict: HeldConflict | null;
  remote: Place | null;
}

// --------------------------------------------------------------------------- the writer

export interface PlaceSyncDeps {
  api: PlaceApi;
  storage?: KeyValueStorage;
  clock?: Clock;
  deviceId?: () => string;
  /** the listener's `place_conflict` setting */
  policy?: () => SyncPolicy;
  lifecycle?: Lifecycle | null;
  queue?: PlaceQueue;
  intervalMs?: number;
  retryMs?: number;
}

export class PlaceSync {
  private readonly api: PlaceApi;
  private readonly storage: KeyValueStorage;
  private readonly clock: Clock;
  private readonly device: () => string;
  private readonly policy: () => SyncPolicy;
  private readonly lifecycle: Lifecycle | null;
  readonly queue: PlaceQueue;
  private readonly interval: number;
  private readonly retryMs: number;
  private s: Session | null = null;
  private offline = false;
  private retryTimer: number | undefined;
  private replaying = false;
  private stops: (() => void)[] = [];

  private readonly statusStore = writable<PlaceStatus>('saved');
  private readonly conflictStore = writable<HeldConflict | null>(null);
  readonly status: Readable<PlaceStatus> = { subscribe: this.statusStore.subscribe };
  readonly conflict: Readable<HeldConflict | null> = { subscribe: this.conflictStore.subscribe };
  /** the server's place was adopted (the listener chose it, or the setting did): the player moves there */
  onAdopt: ((place: Place) => void) | null = null;

  constructor(deps: PlaceSyncDeps) {
    this.api = deps.api;
    this.storage = deps.storage ?? browserStorage();
    this.clock = deps.clock ?? systemClock;
    this.device = deps.deviceId ?? thisDeviceId;
    this.policy = deps.policy ?? (() => 'ask');
    this.lifecycle = deps.lifecycle === undefined ? browserLifecycle() : deps.lifecycle;
    this.queue = deps.queue ?? new PlaceQueue(this.storage);
    this.interval = deps.intervalMs ?? WRITE_INTERVAL_MS;
    this.retryMs = deps.retryMs ?? RETRY_MS;
  }

  /** Listen for the page going to the background (write now, with keepalive) and for the network returning. */
  start(): void {
    if (this.stops.length || !this.lifecycle) return;
    this.stops.push(
      this.lifecycle.onBackground(() => void this.flush({ keepalive: true })),
      this.lifecycle.onOnline(() => {
        this.offline = false;
        void this.replayQueue();
      }),
    );
  }

  dispose(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
    this.clock.clearTimeout(this.retryTimer ?? 0);
    this.s = null;
  }

  // ----------------------------------------------------------------------------- local copy

  private localKey = (l: string, b: string) => `bardic.place.${l}.${b}`;

  readLocal(listenerId: string, bookId: string): LocalPlace | null {
    try {
      const raw = this.storage.getItem(this.localKey(listenerId, bookId));
      const p = raw ? (JSON.parse(raw) as Partial<LocalPlace>) : null;
      if (!p || typeof p.chapterId !== 'string' || typeof p.offset !== 'number' || (p.mode !== 'listening' && p.mode !== 'reading')) return null;
      return {
        chapterId: p.chapterId,
        offset: p.offset,
        time: typeof p.time === 'number' ? p.time : null,
        mode: p.mode,
        audiobookId: typeof p.audiobookId === 'string' ? p.audiobookId : null,
        rev: typeof p.rev === 'number' ? p.rev : 0,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
      };
    } catch {
      return null;
    }
  }

  private saveLocal(s: Session): void {
    if (!s.pos) return;
    const rec: LocalPlace = { ...s.pos, rev: s.rev, updatedAt: s.updatedAt };
    s.lastSavedTime = s.pos.time ?? 0;
    try {
      this.storage.setItem(this.localKey(s.listenerId, s.bookId), JSON.stringify(rec));
    } catch {
      /* storage full or blocked: the queue and the server still have it */
    }
  }

  // ----------------------------------------------------------------------------- opening a book

  /**
   * Decide which place to start from (C3). `server` is what the server said (null: none, or unreachable).
   * `policy` overrides the setting for this decision (an explicit jump is the listener's own choice).
   */
  begin(listenerId: string, bookId: string, server: Place | null, policy: SyncPolicy = this.policy(), opts: { unreachable?: boolean } = {}): OpenDecision {
    const local = this.readLocal(listenerId, bookId);
    const dirty = this.queue.has(listenerId, bookId);
    const s: Session = {
      listenerId,
      bookId,
      rev: server?.revision ?? local?.rev ?? 0,
      pos: null,
      key: null,
      updatedAt: local?.updatedAt ?? 0,
      lastWriteAt: this.clock.now(),
      lastSavedTime: 0,
      inflight: null,
      conflict: null,
      remote: null,
    };
    this.s = s;
    this.setConflict(null);
    const decide = (): OpenDecision => {
      if (!server && !local) return { kind: 'fresh' };
      if (!server && local) {
        // the server has none (or could not be asked): ours is the place, and it is written when it can be
        s.rev = local.rev;
        s.pos = local;
        s.key = keyOfPosition(local);
        // when the server could not be asked, ours is not news to it: only what was already waiting is sent
        if (!opts.unreachable) this.queue.put(listenerId, bookId, inputOf(local, s.rev), this.clock.now());
        return { kind: 'local', local };
      }
      const srv = server!;
      if (!local) return { kind: 'server', place: srv, local: null };
      const theirsChanged = srv.revision > local.rev && srv.device_id !== this.device();
      if (!theirsChanged) {
        if (srv.revision === local.rev || dirty) {
          s.rev = Math.max(srv.revision, local.rev);
          if (dirty) this.queue.rebase(listenerId, bookId, s.rev);
          return { kind: 'local', local: { ...local, rev: s.rev } };
        }
        return { kind: 'server', place: srv, local };
      }
      if (sameSpot(local, srv)) return { kind: 'server', place: srv, local };
      const keepMine = (): OpenDecision => {
        s.rev = srv.revision;
        this.queue.put(listenerId, bookId, inputOf(local, s.rev), this.clock.now());
        return { kind: 'local', local: { ...local, rev: s.rev } };
      };
      if (policy === 'this_device') return keepMine();
      if (policy === 'newest') return local.updatedAt >= Date.parse(srv.updated_at) ? keepMine() : { kind: 'server', place: srv, local };
      this.hold(s, local, srv);
      return { kind: 'ask', local, server: srv };
    };
    const decision = decide();
    if (decision.kind === 'server') {
      s.rev = decision.place.revision;
      s.key = keyOfPlace(decision.place);
      s.updatedAt = Date.parse(decision.place.updated_at) || s.updatedAt;
      if (this.keepLoser(s, decision.place)) void this.write(false);
    } else if (decision.kind === 'local' || decision.kind === 'ask') {
      s.pos = decision.local;
      s.key = keyOfPosition(decision.local);
    }
    this.refreshStatus();
    return decision;
  }

  private hold(s: Session, mine: LocalPlace, theirs: Place): void {
    s.conflict = { mine, theirs };
    this.setConflict(s.conflict);
    this.refreshStatus();
  }

  private setConflict(c: HeldConflict | null): void {
    this.conflictStore.set(c);
  }

  // ----------------------------------------------------------------------------- recording

  /** The place as it is now. Called as often as the player likes; the server is only written when the rules say so. */
  record(pos: Position, playing: boolean): void {
    const s = this.s;
    if (!s) return;
    const k = keyOfPosition(pos);
    const changed = k !== s.key;
    s.pos = pos;
    if (changed) {
      s.key = k;
      s.updatedAt = this.clock.now();
      this.queue.put(s.listenerId, s.bookId, inputOf(pos, s.rev), this.clock.now());
    }
    if (changed || Math.abs((pos.time ?? 0) - s.lastSavedTime) >= 1) this.saveLocal(s);
    if (changed) this.refreshStatus();
    if (playing && !s.conflict && !this.offline && this.queue.has(s.listenerId, s.bookId) && this.clock.now() - s.lastWriteAt >= this.interval) void this.write(false);
  }

  /** Write now, if there is anything to write (pause, chapter change, seek, close, backgrounding). */
  async flush(o: { keepalive?: boolean } = {}): Promise<void> {
    const s = this.s;
    if (!s || s.conflict) return;
    // an explicit event is a reason to try even if a retry was waiting
    if (this.offline && !o.keepalive) this.offline = false;
    await this.write(!!o.keepalive);
  }

  /** Flush, then let go of the book. The write goes out under the listener the book was opened with. */
  async end(): Promise<void> {
    const s = this.s;
    if (!s) return;
    await this.flush();
    if (this.s === s) {
      this.s = null;
      this.setConflict(null);
      this.refreshStatus();
    }
  }

  get revision(): number {
    return this.s?.rev ?? 0;
  }

  private async write(keepalive: boolean): Promise<void> {
    const s = this.s;
    if (!s || s.conflict) return;
    if (s.inflight) {
      await s.inflight;
      if (this.s !== s || s.conflict) return;
    }
    if (!this.queue.has(s.listenerId, s.bookId)) {
      this.refreshStatus();
      return;
    }
    const p = this.send(s, keepalive);
    s.inflight = p;
    try {
      await p;
    } finally {
      if (s.inflight === p) s.inflight = null;
      this.refreshStatus();
    }
  }

  private async send(s: Session, keepalive: boolean): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = this.queue.get(s.listenerId, s.bookId);
      if (!entry) return;
      const input: PlaceInput = { ...entry.input, base_revision: s.rev };
      // the entry object is updated in place when a newer position replaces it: remember which write this one is
      const sentSeq = entry.seq;
      const after = entry.after;
      this.statusStore.set('saving');
      const r = await this.api.put(s.listenerId, s.bookId, input, { keepalive });
      switch (r.kind) {
        case 'ok': {
          this.offline = false;
          s.rev = r.place.revision;
          s.lastWriteAt = this.clock.now();
          const removed = this.queue.remove(s.listenerId, s.bookId, sentSeq);
          if (!removed) this.queue.rebase(s.listenerId, s.bookId, s.rev);
          if (this.s === s) this.saveLocal(s);
          if (removed && after) {
            // this device's position is now in the server's history: write the place that was chosen on top of it
            this.queue.put(s.listenerId, s.bookId, { ...after, base_revision: s.rev }, this.clock.now());
            continue;
          }
          return;
        }
        case 'offline':
          this.offline = true;
          this.scheduleRetry();
          return;
        case 'rejected':
          // the server will never take this one (chapter gone, offset out of range): do not retry it forever
          this.queue.remove(s.listenerId, s.bookId, sentSeq);
          return;
        case 'conflict':
          if (this.s !== s) return;
          if (this.onConflict(s, r.server, entry.input) === 'stop') return;
          break;
      }
    }
  }

  /** The server has a newer place from another device. Returns 'retry' when the write should go again on the server's revision. */
  private onConflict(s: Session, server: Place, input: PlaceInput): 'retry' | 'stop' {
    const mine: LocalPlace = { ...(s.pos ?? positionOfInput(input)), rev: s.rev, updatedAt: s.updatedAt };
    if (server.device_id === this.device()) {
      // catching up with ourselves (another tab, a lost response)
      s.rev = server.revision;
      return 'retry';
    }
    if (sameSpot(mine, server)) {
      s.rev = server.revision;
      this.queue.remove(s.listenerId, s.bookId);
      return 'stop';
    }
    const policy = this.policy();
    if (policy === 'this_device' || (policy === 'newest' && mine.updatedAt >= Date.parse(server.updated_at))) {
      s.rev = server.revision;
      return 'retry';
    }
    if (policy === 'newest') return this.adopt(s, server) ? 'retry' : 'stop';
    this.hold(s, mine, server);
    return 'stop';
  }

  /**
   * This device holds a position the server has not seen and the place being taken is elsewhere: the position is not
   * dropped. It is queued to be written first, on the server's revision, with the taken place written after it, so the
   * server's history keeps both. Returns true when such a write is waiting.
   */
  private keepLoser(s: Session, place: Place): boolean {
    const entry = this.queue.get(s.listenerId, s.bookId);
    if (!entry) return false;
    const i = entry.input;
    if (i.chapter_id === place.chapter_id && i.offset === place.offset && i.mode === place.mode) {
      this.queue.remove(s.listenerId, s.bookId);
      return false;
    }
    this.queue.put(s.listenerId, s.bookId, { ...i, base_revision: place.revision }, this.clock.now(), {
      chapter_id: place.chapter_id,
      offset: place.offset,
      mode: place.mode,
      audiobook_id: place.audiobook_id,
    });
    return true;
  }

  private adopt(s: Session, place: Place): boolean {
    s.rev = place.revision;
    s.conflict = null;
    s.remote = null;
    s.pos = positionOfPlace(place);
    s.key = keyOfPlace(place);
    s.updatedAt = Date.parse(place.updated_at) || this.clock.now();
    const pending = this.keepLoser(s, place);
    this.setConflict(null);
    this.saveLocal(s);
    this.refreshStatus();
    this.onAdopt?.(place);
    return pending;
  }

  // ----------------------------------------------------------------------------- the listener's answer

  /**
   * The listener chose. 'mine' writes this device's place on the server's revision (the other place stays in
   * the server's history); 'theirs' adopts the server's place. Returns the place adopted, or null.
   */
  async resolve(choice: 'mine' | 'theirs'): Promise<Place | null> {
    const s = this.s;
    const c = s?.conflict;
    if (!s || !c) return null;
    s.conflict = null;
    this.setConflict(null);
    if (choice === 'theirs') {
      if (this.adopt(s, c.theirs)) await this.write(false);
      return c.theirs;
    }
    s.rev = c.theirs.revision;
    s.remote = null;
    const mine = s.pos ?? c.mine;
    s.pos = mine;
    s.key = keyOfPosition(mine);
    s.updatedAt = this.clock.now();
    this.queue.put(s.listenerId, s.bookId, inputOf(mine, s.rev), this.clock.now());
    this.saveLocal(s);
    await this.write(false);
    return null;
  }

  // ----------------------------------------------------------------------------- another device

  /**
   * A notice said the place changed, and this is the server's place now. Returns true when it is another
   * device's, newer than what we hold. While playing it is only remembered (`settle` offers it at the pause).
   */
  remote(place: Place, playing: boolean): boolean {
    const s = this.s;
    if (!s || place.book_id !== s.bookId || place.device_id === this.device() || place.revision <= s.rev) return false;
    if (s.pos && sameSpot(s.pos, place)) {
      s.rev = place.revision;
      return false;
    }
    s.remote = place;
    if (!playing) this.applyRemote(s);
    return true;
  }

  /** Playback stopped: offer a place another device wrote meanwhile. */
  settle(): void {
    const s = this.s;
    if (s?.remote) this.applyRemote(s);
  }

  private applyRemote(s: Session): void {
    const place = s.remote;
    if (!place || place.revision <= s.rev || s.conflict) return;
    s.remote = null;
    const policy = this.policy();
    if (policy === 'ask') {
      const mine: LocalPlace = { ...(s.pos ?? { chapterId: place.chapter_id, offset: 0, time: null, mode: place.mode, audiobookId: place.audiobook_id }), rev: s.rev, updatedAt: s.updatedAt };
      this.hold(s, mine, place);
    } else if (policy === 'newest' && s.updatedAt < Date.parse(place.updated_at)) {
      if (this.adopt(s, place)) void this.write(false);
    }
    // this_device: nothing; the next write meets the conflict and keeps this device's place
  }

  // ----------------------------------------------------------------------------- the queue

  private scheduleRetry(): void {
    this.clock.clearTimeout(this.retryTimer ?? 0);
    this.retryTimer = this.clock.setTimeout(() => {
      this.offline = false;
      void this.replayQueue();
    }, this.retryMs);
  }

  /** Send everything waiting, oldest first, latest per book. Stops at the first write that cannot reach the server. */
  async replayQueue(): Promise<void> {
    if (this.replaying) return;
    this.replaying = true;
    try {
      for (const e of this.queue.all()) {
        const s = this.s;
        if (s && s.listenerId === e.listenerId && s.bookId === e.bookId) {
          await this.write(false);
        } else {
          let cur = e;
          for (;;) {
            const sentSeq = cur.seq;
            const after = cur.after;
            const r = await this.api.put(cur.listenerId, cur.bookId, cur.input);
            if (r.kind === 'ok' || r.kind === 'rejected') this.queue.remove(cur.listenerId, cur.bookId, sentSeq);
            // a conflict on a book that is not open waits for the listener to open it (begin applies the setting)
            if (r.kind === 'offline') this.offline = true;
            if (r.kind === 'ok' && after) {
              cur = this.queue.put(cur.listenerId, cur.bookId, { ...after, base_revision: r.place.revision }, this.clock.now());
              continue;
            }
            break;
          }
        }
        if (this.offline) {
          this.scheduleRetry();
          break;
        }
      }
    } finally {
      this.replaying = false;
      this.refreshStatus();
    }
  }

  private refreshStatus(): void {
    const s = this.s;
    let st: PlaceStatus = 'saved';
    if (s?.conflict || s?.inflight) st = 'saving';
    else if (this.offline && (s ? this.queue.has(s.listenerId, s.bookId) : this.queue.size > 0)) st = 'queued_offline';
    if (get(this.statusStore) !== st) this.statusStore.set(st);
  }
}

