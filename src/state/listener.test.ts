import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createListenerStore, type ActionError, type Gateway, type Impact, type Listener, type Result, type SelectionStorage } from './listener';
import { rowsOf, saveErrorText } from '../views/listeners/connect';

const L = (id: string, name: string, last: string | null = null): Listener => ({
  id,
  name,
  created_at: '2026-01-01T00:00:00Z',
  last_listened_at: last,
  books_started: 0,
});
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (code: ActionError['code'], detail = code): Result<never> => ({ ok: false, error: { code, detail } });

/** An in-memory server with the real rules: trimmed names, unique ignoring case, never zero listeners. */
function fakeServer(initial: Listener[] = []) {
  const db = [...initial];
  let n = 100;
  let down = false;
  const calls: string[] = [];
  const gw: Gateway = {
    async list() {
      calls.push('list');
      return down ? err('network') : ok(db.map((l) => ({ ...l })));
    },
    async create(name) {
      calls.push(`create:${name}`);
      if (db.some((l) => l.name.toLowerCase() === name.toLowerCase())) return err('name_taken');
      const l = L(`id${n++}`, name);
      db.push(l);
      return ok(l);
    },
    async rename(id, name) {
      calls.push(`rename:${id}:${name}`);
      const l = db.find((x) => x.id === id);
      if (!l) return err('listener_not_found');
      if (db.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return err('name_taken');
      l.name = name;
      return ok({ ...l });
    },
    async remove(id) {
      calls.push(`remove:${id}`);
      const i = db.findIndex((x) => x.id === id);
      if (i < 0) return err('listener_not_found');
      if (db.length === 1) return err('last_listener');
      db.splice(i, 1);
      return ok(null);
    },
    async impact() {
      return ok<Impact>({ books_started: 6, places: 6, history_entries: 14 });
    },
  };
  return { db, gw, calls, setDown: (v: boolean) => (down = v) };
}

function memoryStorage(initial: string | null = null) {
  let v = initial;
  const writes: (string | null)[] = [];
  const s: SelectionStorage = { read: () => v, write: (id) => ((v = id), writes.push(id)) };
  return { s, get value() { return v; }, writes };
}

function make(initialListeners: Listener[], remembered: string | null = null) {
  const server = fakeServer(initialListeners);
  const storage = memoryStorage(remembered);
  const applied: (string | null)[] = [];
  const store = createListenerStore(server.gw, storage.s, (id) => applied.push(id));
  return { server, storage, applied, store };
}

describe('phases', () => {
  it('starts loading', () => {
    const { store } = make([]);
    expect(get(store).phase).toBe('loading');
  });
  it('L1: no listeners on the server asks for a first name', async () => {
    const { store } = make([]);
    await store.load();
    expect(get(store).phase).toBe('first');
  });
  it('L2: listeners but no remembered choice shows the chooser', async () => {
    const { store } = make([L('a', 'Nick'), L('b', 'Sam')]);
    await store.load();
    expect(get(store).phase).toBe('choose');
    expect(get(store).currentId).toBeNull();
  });
  it('a remembered choice that still exists is ready and is applied to the client', async () => {
    const { store, applied } = make([L('a', 'Nick'), L('b', 'Sam')], 'b');
    await store.load();
    expect(get(store).phase).toBe('ready');
    expect(get(store).currentId).toBe('b');
    expect(applied).toContain('b');
  });
  it('L6: a remembered choice the server no longer has goes back to the chooser and is forgotten', async () => {
    const { store, storage, applied } = make([L('a', 'Nick'), L('b', 'Sam')], 'gone');
    await store.load();
    expect(get(store).phase).toBe('choose');
    expect(storage.value).toBeNull();
    expect(applied[applied.length - 1]).toBeNull();
  });
  it('keeps working on the remembered listener when the server cannot be reached', async () => {
    const { store, server } = make([L('a', 'Nick')], 'a');
    server.setDown(true);
    await store.load();
    expect(get(store).phase).toBe('ready');
    expect(get(store).reachable).toBe(false);
  });
  it('with no remembered choice and no server it says unreachable, not "first"', async () => {
    const { store, server } = make([]);
    server.setDown(true);
    await store.load();
    expect(get(store).phase).toBe('unreachable');
  });
  it('sorts by name ignoring case', async () => {
    const { store } = make([L('1', 'sam'), L('2', 'Ada'), L('3', 'Nick')]);
    await store.load();
    expect(get(store).listeners.map((l) => l.name)).toEqual(['Ada', 'Nick', 'sam']);
  });
});

describe('select', () => {
  it('persists the choice and tells the client', async () => {
    const { store, storage, applied } = make([L('a', 'Nick'), L('b', 'Sam')]);
    await store.load();
    expect(store.select('b')).toBe(true);
    expect(get(store).phase).toBe('ready');
    expect(storage.value).toBe('b');
    expect(applied[applied.length - 1]).toBe('b');
  });
  it('refuses a listener the server never listed', async () => {
    const { store, storage } = make([L('a', 'Nick')]);
    await store.load();
    expect(store.select('zzz')).toBe(false);
    expect(storage.value).toBeNull();
  });
});

describe('create', () => {
  it('L1: the first listener is created and selected', async () => {
    const { store, storage } = make([]);
    await store.load();
    const r = await store.create('  Ada  ');
    expect(r.ok).toBe(true);
    expect(get(store).phase).toBe('ready');
    expect(get(store).listeners.map((l) => l.name)).toEqual(['Ada']);
    expect(storage.value).toBe(get(store).currentId);
  });
  it('trims before sending', async () => {
    const { store, server } = make([]);
    await store.load();
    await store.create('  Ada ');
    expect(server.calls).toContain('create:Ada');
  });
  it('rejects bad names without asking the server', async () => {
    const { store, server } = make([]);
    await store.load();
    const r = await store.create('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('name_invalid');
    expect(server.calls.filter((c) => c.startsWith('create'))).toHaveLength(0);
  });
  it('a taken name (even in other case) comes back as name_taken and changes nothing', async () => {
    const { store } = make([L('a', 'Nick')]);
    await store.load();
    const r = await store.create('nICk');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('name_taken');
    expect(get(store).listeners).toHaveLength(1);
    expect(get(store).currentId).toBeNull();
  });
  it('adding while someone is selected does not switch listener unless asked', async () => {
    const { store } = make([L('a', 'Nick')], 'a');
    await store.load();
    await store.create('Sam');
    expect(get(store).currentId).toBe('a');
    await store.create('Ada', { select: true });
    expect(get(store).currentId).not.toBe('a');
  });
  it('from the chooser, a new listener is selected', async () => {
    const { store } = make([L('a', 'Nick')]);
    await store.load();
    expect(get(store).phase).toBe('choose');
    await store.create('Sam');
    expect(get(store).phase).toBe('ready');
  });
});

describe('rename', () => {
  it('updates in place and keeps the order', async () => {
    const { store } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    const r = await store.rename('b', 'Ada');
    expect(r.ok).toBe(true);
    expect(get(store).listeners.map((l) => l.name)).toEqual(['Ada', 'Nick']);
  });
  it('a listener may change only the case of their own name', async () => {
    const { store } = make([L('a', 'Nick')], 'a');
    await store.load();
    expect((await store.rename('a', 'NICK')).ok).toBe(true);
    expect(get(store).listeners[0]?.name).toBe('NICK');
  });
  it('name_taken leaves the list alone', async () => {
    const { store } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    const r = await store.rename('b', 'nick');
    expect(r.ok).toBe(false);
    expect(get(store).listeners.map((l) => l.name)).toEqual(['Nick', 'Sam']);
  });
  it('renaming a listener deleted elsewhere re-reads the list', async () => {
    const { store, server } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    server.db.splice(1, 1);
    const r = await store.rename('b', 'Ada');
    expect(r.ok).toBe(false);
    expect(get(store).listeners.map((l) => l.name)).toEqual(['Nick']);
  });
});

describe('remove', () => {
  it('removes another listener and keeps the selection', async () => {
    const { store } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    expect((await store.remove('b')).ok).toBe(true);
    expect(get(store).currentId).toBe('a');
    expect(get(store).phase).toBe('ready');
  });
  it('removing the selected listener sends this device to the chooser', async () => {
    const { store, storage } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    await store.remove('a');
    expect(get(store).phase).toBe('choose');
    expect(storage.value).toBeNull();
  });
  it('L5: the last listener cannot be deleted', async () => {
    const { store } = make([L('a', 'Nick')], 'a');
    await store.load();
    const r = await store.remove('a');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('last_listener');
    expect(get(store).listeners).toHaveLength(1);
    expect(get(store).phase).toBe('ready');
  });
  it('already deleted elsewhere counts as deleted', async () => {
    const { store, server } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    server.db.splice(1, 1);
    expect((await store.remove('b')).ok).toBe(true);
    expect(get(store).listeners.map((l) => l.id)).toEqual(['a']);
  });
  it('a network failure changes nothing', async () => {
    const { store, server } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    server.gw.remove = async () => err('network');
    const r = await store.remove('b');
    expect(r.ok).toBe(false);
    expect(get(store).listeners).toHaveLength(2);
  });
});

describe('listener_not_found anywhere', () => {
  it('L6: the selected listener was deleted on another device, so back to the chooser', async () => {
    const { store, server, storage } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    expect(get(store).phase).toBe('ready');
    server.db.splice(0, 1);
    await store.lostListener();
    expect(get(store).phase).toBe('choose');
    expect(storage.value).toBeNull();
  });
  it('a 404 about some other listener does not log this device out', async () => {
    const { store } = make([L('a', 'Nick'), L('b', 'Sam')], 'a');
    await store.load();
    await store.lostListener();
    expect(get(store).currentId).toBe('a');
  });
});

describe('screens data', () => {
  it('builds rows with a stable hue from the id and a recency label', () => {
    const now = new Date(2026, 9, 1, 12);
    const rows = rowsOf([L('a', 'Nick', new Date(2026, 9, 1, 8).toISOString()), L('b', 'Sam')], now);
    expect(rows[0]).toMatchObject({ id: 'a', name: 'Nick', detail: 'Listened today' });
    expect(rows[1]?.detail).toBe('Not started yet');
    expect(rowsOf([L('a', 'Nick')], now)[0]?.hue).toBe(rows[0]?.hue);
  });
  it('says what was kept when the server was not reached', () => {
    expect(saveErrorText({ code: 'network', detail: 'x' })).toMatch(/Nothing was saved/);
    expect(saveErrorText({ code: 'name_taken', detail: 'x' })).toMatch(/already has that name/);
    expect(saveErrorText({ code: 'name_invalid', detail: 'The listener name must be 1 to 40 characters.' })).toMatch(/1 to 40/);
  });
});
