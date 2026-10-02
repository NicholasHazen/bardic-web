import { describe, expect, it, vi } from 'vitest';
import { keepReaderAwake, type ScreenLock } from './wakeLock';

describe('reader screen lock', () => {
  it('releases a request that finishes after the reader closes', async () => {
    let resolve!: (lock: ScreenLock) => void;
    const release = vi.fn(async () => {});
    const stop = keepReaderAwake({ request: () => new Promise((r) => (resolve = r)), visible: () => true, onVisibilityChange: () => () => {} });
    stop();
    resolve({ release });
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
  });
  it('releases when hidden and reacquires when visible', async () => {
    let visible = true;
    let change!: () => void;
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    const stop = keepReaderAwake({ request, visible: () => visible, onVisibilityChange: (fn) => { change = fn; return () => {}; } });
    await Promise.resolve();
    visible = false; change();
    expect(release).toHaveBeenCalledOnce();
    visible = true; change();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('reacquires when visibility returns while a late lock is releasing', async () => {
    let visible = true;
    let change!: () => void;
    let resolveRequest!: (lock: ScreenLock) => void;
    let finishRelease!: () => void;
    const release = vi.fn(() => new Promise<void>((r) => { finishRelease = r; }));
    const request = vi.fn(() => new Promise<ScreenLock>((r) => { resolveRequest = r; }));
    const stop = keepReaderAwake({ request, visible: () => visible, onVisibilityChange: (fn) => { change = fn; return () => {}; } });
    visible = false; change();
    resolveRequest({ release });
    await Promise.resolve();
    visible = true; change();
    expect(request).toHaveBeenCalledOnce();
    finishRelease();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });
});
