import { get, writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../lib/clock';
import { createServerNameStore, SERVER_NAME_KEY } from './serverName';
import type { ServerState } from './manage';

describe('server name offline', () => {
  it('keeps a renamed server identifiable after an offline reload', () => {
    const storage = memoryStorage();
    const source = writable<ServerState>({ status: 'idle' });
    const name = createServerNameStore(source, storage);
    const stop = name.subscribe(() => {});
    source.set({ status: 'ready', server: { id: 'server', name: 'Reading room', version: '1', api_version: '0.4.0', max_upload_bytes: 30, free_bytes: null, time: '2026-10-02T00:00:00Z' } });
    expect(storage.getItem(SERVER_NAME_KEY)).toBe('Reading room');
    stop();
    const offline = createServerNameStore(writable<ServerState>({ status: 'error' }), storage);
    expect(get(offline)).toBe('Reading room');
  });
});
