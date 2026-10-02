import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '../lib/clock';
import { DeletionStore, ServerStore, STORAGE_KEY, manageActions, parseEntries, toSpaceRow, type Deletion, type ManageGateway, type Server } from './manage';
import type { R } from './book';

const ok = <T>(value: T): R<T> => ({ ok: true, value });
const bad = (status: number, code: string, detail = 'No.'): R<never> => ({ ok: false, status, code, detail });

const T0 = Date.parse('2026-01-15T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const sched = (state: Deletion['state'] = 'pending', at = T0): Deletion => ({ book_id: 'b1', scheduled_at: iso(at), executes_at: iso(at + 60_000), state });
const server = (over: Partial<Server> = {}): Server => ({ id: 's', name: 'Nick’s Mac mini', version: '0.4.0', api_version: '0.4.0', max_upload_bytes: 1, free_bytes: 312e9, time: iso(T0), ...over });

/** A server that keeps the schedule the way the real one does: in a row that outlives any client. */
function fakeServer() {
  const st = { deletion: null as Deletion | null, jobRunning: false, calls: [] as string[], name: 'Nick’s Mac mini', freeBytes: { a: 160e6, b: 310e6 } as Record<string, number> };
  const gw: ManageGateway = {
    setFinished: async () => bad(500, 'x'),
    space: async () => bad(500, 'x'),
    free: async (id) => {
      st.calls.push(`free ${id}`);
      if (st.jobRunning) return bad(409, 'job_running', 'Audio is being made.');
      const n = st.freeBytes[id] ?? 0;
      st.freeBytes[id] = 0;
      return ok({ freed_bytes: n });
    },
    schedule: async () => {
      st.calls.push('schedule');
      if (st.jobRunning) return bad(409, 'job_running', 'Audio is being made for this book.');
      if (st.deletion?.state === 'pending') return bad(409, 'deletion_pending', 'Already.');
      st.deletion = sched();
      return ok(st.deletion);
    },
    deletion: async () => (st.deletion ? ok(st.deletion) : bad(404, 'deletion_not_found')),
    cancel: async () => {
      st.calls.push('cancel');
      if (!st.deletion) return bad(404, 'deletion_not_found');
      if (st.deletion.state === 'done') return bad(409, 'deletion_done', 'Too late.');
      st.deletion = null;
      return ok(undefined);
    },
    server: async () => ok(server({ name: st.name })),
    rename: async (name) => {
      st.name = name;
      return ok(server({ name }));
    },
  };
  return { st, gw };
}

describe('delete permanently with undo', () => {
  it('schedules, remembers, and the countdown follows the server time', async () => {
    const { st, gw } = fakeServer();
    const storage = memoryStorage();
    const store = new DeletionStore(gw, storage, () => T0 + 5_000);
    const r = await store.schedule('l', { id: 'b1', title: 'The Ash Ledger' });
    expect(r.ok).toBe(true);
    expect(get(store).items).toEqual([{ bookId: 'b1', title: 'The Ash Ledger', executesAt: iso(T0 + 60_000), totalSeconds: 60 }]);
    // this device runs 5 s ahead of the server: skew is -5 s
    expect(get(store).skewMs).toBe(-5_000);
    expect(parseEntries(storage.getItem(STORAGE_KEY))).toEqual([{ bookId: 'b1', title: 'The Ash Ledger', executesAt: iso(T0 + 60_000), totalSeconds: 60, skewMs: -5_000 }]);
    expect(st.deletion?.state).toBe('pending');
  });

  it('survives closing the client: a new store reads the schedule back from the server', async () => {
    const { st, gw } = fakeServer();
    const storage = memoryStorage();
    await new DeletionStore(gw, storage, () => T0).schedule('l', { id: 'b1', title: 'The Ash Ledger' });
    const reopened = new DeletionStore(gw, storage, () => T0 + 20_000);
    expect(get(reopened).items[0]).toMatchObject({ bookId: 'b1', executesAt: iso(T0 + 60_000) });
    await reopened.load('l');
    expect(get(reopened).items.map((i) => [i.bookId, i.title, i.executesAt])).toEqual([['b1', 'The Ash Ledger', iso(T0 + 60_000)]]);
    expect(st.calls.filter((c) => c === 'schedule')).toHaveLength(1);
  });

  it('survives a server restart: the schedule is the server’s, so the same read answers', async () => {
    const { gw } = fakeServer();
    const storage = memoryStorage();
    await new DeletionStore(gw, storage, () => T0).schedule('l', { id: 'b1', title: 'x' });
    const afterRestart = new DeletionStore(gw, storage, () => T0 + 30_000);
    await afterRestart.load('l');
    expect(afterRestart.has('b1')).toBe(true);
  });

  it('undo cancels on the server, forgets it, and asks for the lists to be read again', async () => {
    const { st, gw } = fakeServer();
    const store = new DeletionStore(gw, memoryStorage(), () => T0);
    let changes = 0;
    store.onchange = () => changes++;
    await store.schedule('l', { id: 'b1', title: 'x' });
    const u = await store.undo('l', 'b1');
    expect(u.ok).toBe(true);
    expect(st.deletion).toBeNull();
    expect(store.has('b1')).toBe(false);
    expect(changes).toBe(2);
  });

  it('a deletion that finished is dropped on load, and Undo that comes too late says so and drops it', async () => {
    const { st, gw } = fakeServer();
    const storage = memoryStorage();
    const store = new DeletionStore(gw, storage, () => T0);
    await store.schedule('l', { id: 'b1', title: 'x' });
    st.deletion = sched('done');
    const u = await store.undo('l', 'b1');
    expect(u).toMatchObject({ ok: false, code: 'deletion_done' });
    expect(store.has('b1')).toBe(false);
    const again = new DeletionStore(gw, storage, () => T0);
    await again.load('l');
    expect(again.has('b1')).toBe(false);
    expect(parseEntries(storage.getItem(STORAGE_KEY))).toEqual([]);
  });

  it('a done deletion read by refresh is dropped and the lists are told', async () => {
    const { st, gw } = fakeServer();
    const store = new DeletionStore(gw, memoryStorage(), () => T0);
    await store.schedule('l', { id: 'b1', title: 'x' });
    let changes = 0;
    store.onchange = () => changes++;
    st.deletion = sched('done');
    await store.refresh('l', 'b1');
    expect(store.has('b1')).toBe(false);
    expect(changes).toBe(1);
  });

  it('is refused while audio is being made: nothing is remembered and the code is passed on', async () => {
    const { st, gw } = fakeServer();
    st.jobRunning = true;
    const store = new DeletionStore(gw, memoryStorage(), () => T0);
    const r = await store.schedule('l', { id: 'b1', title: 'x' });
    expect(r).toMatchObject({ ok: false, code: 'job_running' });
    expect(store.has('b1')).toBe(false);
    expect(st.deletion).toBeNull();
  });

  it('keeps an entry when the server cannot be reached (it is read again later)', async () => {
    const { gw } = fakeServer();
    const down: ManageGateway = { ...gw, deletion: async () => ({ ok: false, status: 0, detail: 'down' }) };
    const store = new DeletionStore(gw, memoryStorage(), () => T0);
    await store.schedule('l', { id: 'b1', title: 'x' });
    const flaky = new DeletionStore(down, memoryStorage({ [STORAGE_KEY]: JSON.stringify([{ bookId: 'b1', title: 'x' }]) }), () => T0);
    await flaky.load('l');
    // never confirmed by the server: not shown as pending
    expect(flaky.has('b1')).toBe(false);
    Object.assign(store, { gw: down });
    await store.refresh('l', 'b1');
    expect(store.has('b1')).toBe(true);
  });

  it('retains every remembered id when one refresh fails and another succeeds', async () => {
    const { gw } = fakeServer();
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify([{ bookId: 'a', title: 'A' }, { bookId: 'b', title: 'B' }]) });
    let failing = true;
    const requested: string[] = [];
    const flaky: ManageGateway = {
      ...gw,
      deletion: async (_l, bookId) => {
        requested.push(bookId);
        return bookId === 'a' && failing ? bad(500, 'temporary') : ok({ ...sched(), book_id: bookId });
      },
    };
    const store = new DeletionStore(flaky, storage, () => T0);
    await store.load('l');
    expect(parseEntries(storage.getItem(STORAGE_KEY)).map((e) => e.bookId).sort()).toEqual(['a', 'b']);
    expect(store.has('b')).toBe(true);
    failing = false;
    requested.length = 0;
    await new DeletionStore(flaky, storage, () => T0).load('l');
    expect(requested.sort()).toEqual(['a', 'b']);
  });

  it('shows a previously confirmed countdown after reopening while the server is unreachable', async () => {
    const { gw } = fakeServer();
    const storage = memoryStorage();
    await new DeletionStore(gw, storage, () => T0 + 5_000).schedule('l', { id: 'b1', title: 'The Ash Ledger' });
    const reopened = new DeletionStore({ ...gw, server: async () => bad(500, 'offline'), deletion: async () => bad(500, 'offline') }, storage, () => T0 + 25_000);
    expect(reopened.has('b1')).toBe(true);
    expect(get(reopened).skewMs).toBe(-5_000);
    await reopened.load('l');
    expect(reopened.has('b1')).toBe(true);
    expect(parseEntries(storage.getItem(STORAGE_KEY))).toHaveLength(1);
  });

  it('does not notify the countdown again for an unchanged pending reply', async () => {
    const { gw } = fakeServer();
    const store = new DeletionStore(gw, memoryStorage(), () => T0);
    await store.schedule('l', { id: 'b1', title: 'A' });
    let changes = 0;
    const stop = store.subscribe(() => changes++);
    await store.refresh('l', 'b1');
    stop();
    expect(changes).toBe(1);
  });

  it('adopt: a device that did not schedule it learns of a pending one, and not of others', async () => {
    const { st, gw } = fakeServer();
    const store = new DeletionStore(gw, memoryStorage(), () => T0 + 10_000);
    expect(await store.adopt('l', 'b1')).toBe(false);
    st.deletion = sched();
    expect(await store.adopt('l', 'b1')).toBe(true);
    expect(get(store).items[0]).toMatchObject({ bookId: 'b1', title: '' });
    expect(get(store).skewMs).toBe(-10_000);
  });

  it('survives corrupt storage', () => {
    expect(parseEntries('nope')).toEqual([]);
    expect(parseEntries('{"a":1}')).toEqual([]);
    expect(parseEntries('[{"bookId":3},{"bookId":"x"}]')).toEqual([{ bookId: 'x', title: '' }]);
    expect(parseEntries(null)).toEqual([]);
  });
});

describe('free up space', () => {
  it('frees each chosen audiobook and totals the bytes; a refusal stops the rest and keeps what was freed', async () => {
    const { st, gw } = fakeServer();
    expect(await manageActions.free(['a', 'b'], gw)).toEqual({ freedBytes: 470e6 });
    st.freeBytes = { a: 1, b: 2 };
    st.jobRunning = true;
    const r = await manageActions.free(['a', 'b'], gw);
    expect(r.refused?.code).toBe('job_running');
    expect(r.freedBytes).toBe(0);
    expect(st.calls.filter((c) => c.startsWith('free')).length).toBe(3);
  });
  it('rows: a premium audiobook carries its estimate, a free one never does, an unreadable size stays unknown', () => {
    const a = { id: 'a', voice_name: 'Kore', tier: 'premium' as const, chapters_ready: 13, chapters_total: 22, bytes: 5 };
    const money = (micros: number) => ({ micros, currency: 'USD' });
    const space = { audiobook_id: 'a', bytes: 310e6, chapters: 13, remake_estimate: { low: money(1_800_000), likely: money(2_200_000), high: money(2_600_000), prices_as_of: iso(T0), basis: 'provider' as const } };
    expect(toSpaceRow(a, space)).toMatchObject({ name: 'Kore', premium: true, bytes: 310e6, remake: { basis: 'provider' } });
    expect(toSpaceRow({ ...a, tier: 'free' }, { ...space, remake_estimate: null }).remake).toBeNull();
    expect(toSpaceRow(a, null).bytes).toBeNull();
  });
});

describe('the server', () => {
  it('an older read cannot put the old name back after a successful rename', async () => {
    const { gw } = fakeServer();
    let finish!: (r: R<Server>) => void;
    const store = new ServerStore({ ...gw, server: () => new Promise((r) => { finish = r; }) });
    const pending = store.load();
    await store.rename('Reading room');
    finish(ok(server({ name: 'Old name' })));
    await pending;
    expect(get(store).server?.name).toBe('Reading room');
  });
  it('overlapping reads keep the newest response', async () => {
    const { gw } = fakeServer();
    const resolve: ((r: R<Server>) => void)[] = [];
    const store = new ServerStore({ ...gw, server: () => new Promise((r) => { resolve.push(r); }) });
    const first = store.load();
    const second = store.load();
    resolve[1]!(ok(server({ name: 'New name' })));
    await second;
    resolve[0]!(ok(server({ name: 'Old name' })));
    await first;
    expect(get(store).server?.name).toBe('New name');
  });
  it('rename updates the one store every screen reads', async () => {
    const { gw } = fakeServer();
    const store = new ServerStore(gw);
    await store.load();
    expect(get(store).server?.name).toBe('Nick’s Mac mini');
    const r = await store.rename('Den');
    expect(r.ok).toBe(true);
    expect(get(store).server?.name).toBe('Den');
  });
  it('a refused name leaves the shown name as it was', async () => {
    const { gw } = fakeServer();
    const store = new ServerStore({ ...gw, rename: async () => bad(400, 'name_invalid', 'The server name must be 1 to 60 characters.') });
    await store.load();
    const r = await store.rename('');
    expect(r).toMatchObject({ ok: false, code: 'name_invalid' });
    expect(get(store).server?.name).toBe('Nick’s Mac mini');
  });
});
