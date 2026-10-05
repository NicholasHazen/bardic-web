// The clock and timers every rule that depends on time takes as an argument, so tests run on a fake one.

export interface Clock {
  /** epoch milliseconds */
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};

/** The small part of Storage the app uses; localStorage fits. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory storage: tests, and the fallback when the browser blocks localStorage. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** localStorage when it works (it can throw when blocked), else memory for this page. */
export function browserStorage(): KeyValueStorage {
  const memory = memoryStorage();
  return {
    getItem(k) {
      try {
        return localStorage.getItem(k) ?? memory.getItem(k);
      } catch {
        return memory.getItem(k);
      }
    },
    setItem(k, v) {
      memory.setItem(k, v);
      try {
        localStorage.setItem(k, v);
      } catch {
        /* the in-memory copy still serves this page */
      }
    },
    removeItem(k) {
      memory.removeItem(k);
      try {
        localStorage.removeItem(k);
      } catch {
        /* nothing to remove */
      }
    },
  };
}
