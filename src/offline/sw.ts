// Registers the offline app shell worker (public/sw.js). Production builds only: in development a worker would cache
// files the dev server changes under it. It reports an update and applies it only when asked; it never reloads the page.

export interface ServiceWorkerHandle {
  /** a newer build is installed and waiting; null until then */
  readonly updateAvailable: boolean;
  /** tell the waiting worker to take over; resolves when it has (the caller decides whether to reload) */
  applyUpdate(): Promise<void>;
  unregister(): Promise<void>;
}

export interface RegisterOptions {
  /** called once when a newer build is waiting */
  onUpdate?: () => void;
  /** override for tests */
  container?: ServiceWorkerContainer | undefined;
  production?: boolean;
  /** the name of the built entry script (e.g. index-Ab12.js); read from the page by default */
  version?: string;
  base?: string;
}

/** The hashed name of the entry script: a new build has a new name, which makes a new worker URL. */
export function buildVersion(doc: Pick<Document, 'querySelectorAll'> = document): string {
  const scripts = [...doc.querySelectorAll('script[type="module"][src]')] as HTMLScriptElement[];
  for (const s of scripts) {
    const m = /\/assets\/([A-Za-z0-9_.\-]+\.js)(?:\?|$)/.exec(s.getAttribute('src') ?? '');
    if (m) return m[1]!;
  }
  return 'dev';
}

export async function registerServiceWorker(o: RegisterOptions = {}): Promise<ServiceWorkerHandle | null> {
  const production = o.production ?? import.meta.env.PROD;
  const container = 'container' in o ? o.container : typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!production || !container) return null; // no worker in development, and none where the browser (or an http page) has none
  const base = o.base ?? import.meta.env.BASE_URL ?? '/';
  let handle: ServiceWorkerHandle;
  let waiting = false;
  let reg: ServiceWorkerRegistration | undefined;
  const flag = () => {
    if (!waiting) {
      waiting = true;
      o.onUpdate?.();
    }
  };
  try {
    reg = await container.register(`${base}sw.js?v=${encodeURIComponent(o.version ?? buildVersion())}`, { scope: base });
  } catch {
    return null;
  }
  const watch = (w: ServiceWorker) => {
    w.addEventListener('statechange', () => {
      // "installed" with a worker already in charge means this one is a newer build waiting its turn
      if (w.state === 'installed' && container.controller) flag();
    });
  };
  if (reg.waiting && container.controller) flag();
  if (reg.installing) watch(reg.installing);
  reg.addEventListener('updatefound', () => reg!.installing && watch(reg!.installing));
  handle = {
    get updateAvailable() {
      return waiting;
    },
    applyUpdate() {
      return new Promise<void>((resolve) => {
        container.addEventListener('controllerchange', () => resolve(), { once: true });
        (reg!.waiting ?? reg!.installing)?.postMessage({ type: 'SKIP_WAITING' });
        if (!reg!.waiting && !reg!.installing) resolve();
      });
    },
    async unregister() {
      await reg!.unregister();
    },
  };
  return handle;
}
