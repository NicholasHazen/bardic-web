export interface ScreenLock {
  release(): Promise<void>;
}

export interface WakeLockPorts {
  request(): Promise<ScreenLock>;
  visible(): boolean;
  onVisibilityChange(fn: () => void): () => void;
}

/** Hold a screen lock only for this active reader, releasing even a request that resolves after it closes. */
export function keepReaderAwake(ports: WakeLockPorts): () => void {
  let closed = false;
  let requesting = false;
  let lock: ScreenLock | undefined;
  const release = () => {
    const previous = lock;
    lock = undefined;
    void previous?.release().catch(() => {});
  };
  const acquire = async () => {
    if (closed || requesting || !ports.visible() || lock) return;
    requesting = true;
    let retry = false;
    try {
      const next = await ports.request();
      if (closed || !ports.visible()) {
        await next.release().catch(() => {});
        // Visibility may return while the old lock's release is still pending.
        retry = !closed && ports.visible();
      }
      else lock = next;
    } catch {
      // A denied or unavailable screen lock never interrupts listening.
    } finally {
      requesting = false;
      if (retry) void acquire();
    }
  };
  const stop = ports.onVisibilityChange(() => {
    if (ports.visible()) void acquire();
    else release();
  });
  void acquire();
  return () => { closed = true; stop(); release(); };
}

export function holdReaderScreen(): (() => void) | undefined {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return undefined;
  return keepReaderAwake({
    request: () => navigator.wakeLock.request('screen'),
    visible: () => document.visibilityState === 'visible',
    onVisibilityChange(fn) {
      document.addEventListener('visibilitychange', fn);
      return () => document.removeEventListener('visibilitychange', fn);
    },
  });
}
