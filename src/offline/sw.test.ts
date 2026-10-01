import { describe, expect, it, vi } from 'vitest';
import { buildVersion, registerServiceWorker } from './sw';

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
