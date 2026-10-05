// The device id: a UUID kept in localStorage, sent as X-Bardic-Device on every request.
const KEY = 'bardic.device';

export function deviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // storage blocked: a per-page id still lets the server work, but places will not follow this device
    return (memory ??= crypto.randomUUID());
  }
}
let memory: string | undefined;
