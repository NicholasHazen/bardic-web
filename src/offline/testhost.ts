// Test hook for the end-to-end tests: with a build made with VITE_E2E=1 and `?e2e=offline` in the URL, the page exposes
// the offline engine as `window.__offline`, plus a kit for building engines with a store that simulates a full device.
// Without both it does nothing. The lead calls `installOfflineE2E()` once from src/main.ts (inside the VITE_E2E guard).
import { browserDeps } from './browser';
import { createOffline, offline, type OfflineEngine } from './offline';
import { indexedDbStore, memoryStore, withQuota, type OfflineStore } from './store';

export interface OfflineE2EKit {
  /** a second engine with its own store that refuses writes beyond `limitBytes` (a full device) */
  fullDevice(limitBytes: number): { engine: OfflineEngine; store: OfflineStore & { limit: number } };
  /** the real IndexedDB store, for peeking at what is held */
  realStore: OfflineStore;
}

declare global {
  interface Window {
    __offline?: OfflineEngine;
    __offlineKit?: OfflineE2EKit;
  }
}

export function installOfflineE2E(): void {
  if (typeof window === 'undefined') return;
  if (!import.meta.env.VITE_E2E) return;
  if (new URLSearchParams(window.location.search).get('e2e') !== 'offline') return;
  window.__offline = offline;
  window.__offlineKit = {
    fullDevice(limitBytes) {
      const store = withQuota(memoryStore(), limitBytes);
      const engine = createOffline({ ...browserDeps(), store, autoStart: true });
      return { engine, store };
    },
    realStore: indexedDbStore(),
  };
}
