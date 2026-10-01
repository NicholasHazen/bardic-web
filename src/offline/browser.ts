// The browser's real ports for the offline engine.
import { get } from 'svelte/store';
import { systemClock } from '../lib/clock';
import { sseEvents } from '../player/gateway';
import { listenerStore } from '../state/listener';
import { apiOffline } from './api';
import type { ConnectionKind, ConnectionPort, StoragePort, UrlPort } from './ports';
import { indexedDbStore, memoryStore } from './store';
import type { OfflineDeps } from './offline';

interface NetworkInformationLike extends EventTarget {
  type?: string;
}

export function browserConnection(): ConnectionPort {
  const info = (): NetworkInformationLike | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as unknown as { connection?: NetworkInformationLike }).connection);
  return {
    kind(): ConnectionKind {
      // `type` exists on Android Chrome only; everywhere else the browser cannot say and we do not guess
      const t = info()?.type;
      if (t === 'wifi') return 'wifi';
      if (t === 'ethernet') return 'ethernet';
      if (t === 'cellular') return 'cellular';
      return 'unknown';
    },
    onLine: () => (typeof navigator === 'undefined' ? null : navigator.onLine),
    subscribe(fn) {
      if (typeof window === 'undefined') return () => {};
      const c = info();
      window.addEventListener('online', fn);
      window.addEventListener('offline', fn);
      c?.addEventListener('change', fn);
      return () => {
        window.removeEventListener('online', fn);
        window.removeEventListener('offline', fn);
        c?.removeEventListener('change', fn);
      };
    },
  };
}

export function browserStoragePort(): StoragePort {
  const sm = (): StorageManager | undefined => (typeof navigator === 'undefined' ? undefined : navigator.storage);
  return {
    async estimate() {
      try {
        const e = await sm()?.estimate?.();
        return { usage: typeof e?.usage === 'number' ? e.usage : null, quota: typeof e?.quota === 'number' ? e.quota : null };
      } catch {
        return { usage: null, quota: null };
      }
    },
    async persisted() {
      try {
        return (await sm()?.persisted?.()) ?? false;
      } catch {
        return false;
      }
    },
    async persist() {
      try {
        return (await sm()?.persist?.()) ?? false;
      } catch {
        return false;
      }
    },
  };
}

export const browserUrls: UrlPort = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

export function browserDeps(): OfflineDeps {
  return {
    api: apiOffline,
    store: typeof indexedDB !== 'undefined' ? indexedDbStore() : memoryStore(),
    clock: systemClock,
    connection: browserConnection(),
    events: sseEvents,
    storage: browserStoragePort(),
    urls: browserUrls,
    listener: () => get(listenerStore).currentId,
  };
}

/** Tell the engine when the listener selected on this device changes (its notices and book checks are the listener's). */
export function watchListener(engine: { listenerChanged(): void }): () => void {
  let last: string | null | undefined;
  return listenerStore.subscribe((s) => {
    if (last !== undefined && last !== s.currentId) engine.listenerChanged();
    else if (last === undefined && s.currentId) engine.listenerChanged();
    last = s.currentId;
  });
}
