import { get, writable, type Readable } from 'svelte/store';
import { browserStorage, type KeyValueStorage } from '../lib/clock';
import { serverStore, type ServerState } from './manage';

export const SERVER_NAME_KEY = 'bardic.server.name';

/** Remember only the name, so the unreachable screen still identifies this Bardic after a reload. */
export function createServerNameStore(source: Readable<ServerState>, storage: KeyValueStorage): Readable<string | undefined> {
  const cached = storage.getItem(SERVER_NAME_KEY)?.trim() || undefined;
  const name = writable<string | undefined>(cached);
  return {
    subscribe(run) {
      const stopSource = source.subscribe((s) => {
        const next = s.server?.name;
        if (next && next !== get(name)) {
          storage.setItem(SERVER_NAME_KEY, next);
          name.set(next);
        }
      });
      const stopName = name.subscribe(run);
      return () => { stopSource(); stopName(); };
    },
  };
}

export const serverName = createServerNameStore(serverStore, browserStorage());
