import { describe, expect, it, vi } from 'vitest';
import workerSource from '../../public/sw.js?raw';
import { buildVersion, registerServiceWorker } from './sw';

const workerScope = () => ({ location: { href: 'https://bardic.test/sw.js?v=test', origin: 'https://bardic.test' }, addEventListener: vi.fn() });

describe('worker precache discovery', () => {
  const sameFiles = new Function('self', `${workerSource}\nreturn sameFiles;`)(workerScope()) as (source: string, from: string) => Set<string>;

  it('follows quoted and static template-literal imports, including the minified Vite form', () => {
    const source = 'import("./read-A.js");import(\'./offline-B.js\');import(`./testhost-C.js`);export{a}from`./shared-D.js`;';
    expect([...sameFiles(source, '/assets/index-E.js')]).toEqual(['/assets/read-A.js', '/assets/offline-B.js', '/assets/testhost-C.js', '/assets/shared-D.js']);
  });

  it('finds absolute build assets without following variable templates, API URLs or other origins', () => {
    const source = '<script src="/assets/index-A.js"></script>const chunks=[`assets/read-B.js`,"/assets/book-C.css"];import(`./${view}.js`);fetch("/api/audio/1");import("https://elsewhere.test/chunk.js");';
    expect([...sameFiles(source, '/index.html')]).toEqual(['/assets/index-A.js', '/assets/read-B.js', '/assets/book-C.css']);
  });

  it('leaves API requests, writes and unrelated origins on the network', () => {
    const listeners = new Map<string, (event: { request: Request; respondWith: () => void }) => void>();
    const scope = workerScope();
    scope.addEventListener.mockImplementation((name, handler) => listeners.set(name, handler));
    new Function('self', workerSource)(scope);
    const respondWith = vi.fn();
    for (const request of [new Request('https://bardic.test/api'), new Request('https://bardic.test/api/audio/1'), new Request('https://bardic.test/index.html', { method: 'POST' }), new Request('https://elsewhere.test/asset.js')]) {
      listeners.get('fetch')!({ request, respondWith });
    }
    expect(respondWith).not.toHaveBeenCalled();
  });
});

function fakeContainer(over: { controller?: boolean; waiting?: boolean } = {}) {
  const listeners = new Map<string, (() => void)[]>();
  const regListeners = new Map<string, (() => void)[]>();
  const worker = { state: 'installing', posted: [] as unknown[], addEventListener: (_: string, fn: () => void) => listeners.set('s', [...(listeners.get('s') ?? []), fn]), postMessage: (m: unknown) => worker.posted.push(m) };
  const reg = {
    installing: null as unknown,
    waiting: over.waiting ? worker : null,
    addEventListener: (t: string, fn: () => void) => regListeners.set(t, [...(regListeners.get(t) ?? []), fn]),
    unregister: vi.fn(async () => true),
  };
  const container = {
    controller: over.controller ? {} : null,
    register: vi.fn(async () => reg),
    addEventListener: (_: string, fn: () => void) => setTimeout(fn, 0),
  };
  return { container: container as unknown as ServiceWorkerContainer, reg, worker, listeners, regListeners };
}

describe('registerServiceWorker', () => {
  it('registers nothing outside a production build', async () => {
    const f = fakeContainer();
    expect(await registerServiceWorker({ container: f.container, production: false })).toBeNull();
    expect(f.container.register).not.toHaveBeenCalled();
  });
  it('registers nothing where the browser has no service workers', async () => {
    expect(await registerServiceWorker({ container: undefined, production: true })).toBeNull();
  });
  it('registers a worker URL named for the build, so a new build is a new worker', async () => {
    const f = fakeContainer();
    await registerServiceWorker({ container: f.container, production: true, version: 'index-AbC.js', base: '/' });
    expect(f.container.register).toHaveBeenCalledWith('/sw.js?v=index-AbC.js', { scope: '/' });
  });
  it('reports an update that is waiting and does not apply it by itself', async () => {
    const f = fakeContainer({ controller: true, waiting: true });
    const onUpdate = vi.fn();
    const h = await registerServiceWorker({ container: f.container, production: true, version: 'v', onUpdate });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(h!.updateAvailable).toBe(true);
    expect(f.worker.posted).toEqual([]);
    await h!.applyUpdate();
    expect(f.worker.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });
  it('does not call a first install an update', async () => {
    const f = fakeContainer({ controller: false, waiting: true });
    const onUpdate = vi.fn();
    await registerServiceWorker({ container: f.container, production: true, version: 'v', onUpdate });
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it('reads the build name from the entry script', () => {
    const doc = { querySelectorAll: () => [{ getAttribute: () => '/assets/index-Zz9.js' }] } as unknown as Document;
    expect(buildVersion(doc)).toBe('index-Zz9.js');
    expect(buildVersion({ querySelectorAll: () => [] } as unknown as Document)).toBe('dev');
  });
});
