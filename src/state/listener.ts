// The listeners of this Bardic and the one chosen on this device (docs/ARCHITECTURE.md section 3).
//
// - The server owns the list; this device owns which one is selected (localStorage, per device).
// - A selection the server no longer knows (deleted on another device: L6, or any 404 `listener_not_found`)
//   is dropped and the user goes back to the chooser.
// - No paid action, no secrets and no place data live here.
//
// `createListenerStore` takes its gateway, storage and clock as arguments so the transitions are unit tested
// without a server; `listenerStore` is the one the app uses.
import { get, writable, type Readable } from 'svelte/store';
import { api, setListener } from '../api/client';
import { deviceId } from '../lib/device';
import { cleanName, nameProblem, nameProblemText } from '../lib/listenerText';
import type { components } from '../api/schema';

export type Listener = components['schemas']['Listener'];
export type Impact = { books_started: number; places: number; history_entries: number };

/** loading: first read pending. unreachable: no stored choice and the server cannot be read.
 *  first: the server has no listeners (L1). choose: listeners exist, none selected here (L2). ready: one is selected. */
export type ListenerPhase = 'loading' | 'unreachable' | 'first' | 'choose' | 'ready';

export interface ListenerState {
  phase: ListenerPhase;
  listeners: Listener[];
  currentId: string | null;
  /** false when the last read failed; the list may then be out of date or empty. */
  reachable: boolean;
}

export type ErrorCode = 'name_taken' | 'name_invalid' | 'last_listener' | 'listener_not_found' | 'network' | 'other';
export interface ActionError {
  code: ErrorCode;
  /** Safe to show. */
  detail: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: ActionError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(code: ErrorCode, detail: string): Result<T> => ({ ok: false, error: { code, detail } });

export interface Gateway {
  list(): Promise<Result<Listener[]>>;
  create(name: string): Promise<Result<Listener>>;
  rename(id: string, name: string): Promise<Result<Listener>>;
  remove(id: string): Promise<Result<null>>;
  impact(id: string): Promise<Result<Impact>>;
}

export interface SelectionStorage {
  read(): string | null;
  write(id: string | null): void;
}

const KEY = 'bardic.listener';

/** localStorage with a per-page fallback when storage is blocked (the choice then lasts until reload). */
export function browserSelectionStorage(): SelectionStorage {
  let memory: string | null = null;
  return {
    read() {
      try {
        return localStorage.getItem(KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    write(id) {
      memory = id;
      try {
        if (id) localStorage.setItem(KEY, id);
        else localStorage.removeItem(KEY);
      } catch {
        /* the in-memory copy still serves this page */
      }
    },
  };
}

// ---- gateway over the typed client

const CODES: ReadonlySet<string> = new Set(['name_taken', 'name_invalid', 'last_listener', 'listener_not_found']);

async function call<T>(run: () => Promise<{ data?: unknown; error?: unknown; response: Response }>): Promise<Result<T>> {
  let r;
  try {
    r = await run();
  } catch {
    return fail('network', 'Could not reach your Bardic computer.');
  }
  if (r.response.ok) return ok(r.data as T);
  const body = r.error as { code?: string; detail?: string } | undefined;
  const code = body?.code && CODES.has(body.code) ? (body.code as ErrorCode) : 'other';
  return fail(code, body?.detail ?? 'Something went wrong.');
}

export const apiGateway: Gateway = {
  async list() {
    const r = await call<{ items: Listener[] }>(() => api.GET('/api/listeners'));
    return r.ok ? ok(r.value.items) : r;
  },
  create: (name) =>
    call<Listener>(() => api.POST('/api/listeners', { params: { header: { 'X-Bardic-Device': deviceId() } }, body: { name } })),
  rename: (id, name) =>
    call<Listener>(() =>
      api.PATCH('/api/listeners/{listener_id}', {
        params: { path: { listener_id: id }, header: { 'X-Bardic-Device': deviceId() } },
        body: { name },
      }),
    ),
  remove: (id) =>
    call<null>(() =>
      api.DELETE('/api/listeners/{listener_id}', { params: { path: { listener_id: id }, header: { 'X-Bardic-Device': deviceId() } } }),
    ).then((r) => (r.ok ? ok(null) : r)),
  impact: (id) => call<Impact>(() => api.GET('/api/listeners/{listener_id}/impact', { params: { path: { listener_id: id } } })),
};

// ---- the store

const byName = (a: Listener, b: Listener) => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
};

function phaseOf(s: Pick<ListenerState, 'listeners' | 'currentId' | 'reachable'>, loaded: boolean): ListenerPhase {
  if (!loaded) return 'loading';
  if (s.currentId) return 'ready'; // a remembered choice keeps working while the server is out of reach
  if (!s.reachable) return 'unreachable';
  return s.listeners.length === 0 ? 'first' : 'choose';
}

export interface ListenerStore extends Readable<ListenerState> {
  /** Read the list and check the remembered choice against it. Safe to call again. */
  load(): Promise<void>;
  /** Choose a listener on this device. */
  select(id: string): boolean;
  /** Add a listener. `select` defaults to true only when none is selected yet (L1). */
  create(name: string, opts?: { select?: boolean }): Promise<Result<Listener>>;
  rename(id: string, name: string): Promise<Result<Listener>>;
  /** Delete a listener. Deleting the selected one sends this device back to the chooser. */
  remove(id: string): Promise<Result<null>>;
  impact(id: string): Promise<Result<Impact>>;
  /** Forget the choice on this device (to the chooser), keeping the list. */
  clearSelection(): void;
  /** A request answered 404 `listener_not_found`: check which listeners still exist. */
  lostListener(): Promise<void>;
}

export function createListenerStore(
  gw: Gateway,
  storage: SelectionStorage,
  applyToClient: (id: string | null) => void = () => {},
): ListenerStore {
  let loaded = false;
  let version = 0;
  const initial: ListenerState = { phase: 'loading', listeners: [], currentId: null, reachable: true };
  const store = writable<ListenerState>(initial);

  const commit = (patch: Partial<ListenerState>) =>
    store.update((s) => {
      const next = { ...s, ...patch };
      return { ...next, phase: phaseOf(next, loaded) };
    });

  const setCurrent = (id: string | null) => {
    storage.write(id);
    applyToClient(id);
    commit({ currentId: id });
  };

  async function load() {
    const mine = ++version;
    // Requests made while the first read is in flight already carry the remembered listener.
    const remembered = get(store).currentId ?? storage.read();
    if (remembered && get(store).currentId === null) {
      applyToClient(remembered);
      store.update((s) => ({ ...s, currentId: remembered }));
    }
    const r = await gw.list();
    if (mine !== version) return; // a newer load is answering
    loaded = true;
    if (!r.ok) {
      commit({ reachable: false });
      return;
    }
    const listeners = [...r.value].sort(byName);
    const keep = remembered && listeners.some((l) => l.id === remembered) ? remembered : null;
    if (keep !== get(store).currentId) {
      storage.write(keep);
      applyToClient(keep);
    }
    commit({ listeners, currentId: keep, reachable: true });
  }

  return {
    subscribe: store.subscribe,
    load,
    select(id) {
      if (!get(store).listeners.some((l) => l.id === id)) return false;
      setCurrent(id);
      return true;
    },
    async create(name, opts) {
      const problem = nameProblem(name);
      if (problem) return fail('name_invalid', nameProblemText(problem));
      const r = await gw.create(cleanName(name));
      if (!r.ok) return r;
      const created = r.value;
      const wasNone = get(store).currentId === null;
      loaded = true;
      store.update((s) => ({ ...s, listeners: [...s.listeners.filter((l) => l.id !== created.id), created].sort(byName), reachable: true }));
      if (opts?.select ?? wasNone) setCurrent(created.id);
      else commit({});
      return r;
    },
    async rename(id, name) {
      const problem = nameProblem(name);
      if (problem) return fail('name_invalid', nameProblemText(problem));
      const r = await gw.rename(id, cleanName(name));
      if (r.ok) {
        const renamed = r.value;
        store.update((s) => ({ ...s, listeners: s.listeners.map((l) => (l.id === renamed.id ? renamed : l)).sort(byName) }));
      } else if (r.error.code === 'listener_not_found') {
        await load();
      }
      return r;
    },
    async remove(id) {
      const r = await gw.remove(id);
      // Gone is gone: a 404 means someone else already deleted it, which is the outcome asked for.
      if (r.ok || r.error.code === 'listener_not_found') {
        store.update((s) => ({ ...s, listeners: s.listeners.filter((l) => l.id !== id) }));
        if (get(store).currentId === id) setCurrent(null);
        else commit({});
        return ok(null);
      }
      if (r.error.code === 'last_listener') await load();
      return r;
    },
    impact: (id) => gw.impact(id),
    clearSelection() {
      setCurrent(null);
    },
    async lostListener() {
      await load();
    },
  };
}

/** The store the app uses. */
export const listenerStore = createListenerStore(apiGateway, browserSelectionStorage(), setListener);

let guarded = false;
/** Send the user back to the chooser when any request answers 404 `listener_not_found` for the selected listener (ARCHITECTURE s3). Idempotent. */
export function installListenerGuard(store: ListenerStore = listenerStore): void {
  if (guarded) return;
  guarded = true;
  api.use({
    onResponse({ request, response }) {
      if (response.status === 404 && request.headers.get('X-Bardic-Listener')) {
        response
          .clone()
          .json()
          .then((b: { code?: string }) => {
            if (b?.code === 'listener_not_found') void store.lostListener();
          })
          .catch(() => {});
      }
    },
  });
}

/** The listener selected on this device, or null. */
export function currentListener(s: ListenerState): Listener | null {
  return s.currentId ? (s.listeners.find((l) => l.id === s.currentId) ?? null) : null;
}
