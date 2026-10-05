import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { deviceId } from '../lib/device';

let listener: string | null = null;
export function setListener(id: string | null): void {
  listener = id;
}

/** The typed API client. Every request carries the device; listener-scoped ones the listener. */
export const api = createClient<paths>({
  baseUrl: '',
  fetch: (req: Request) => {
    req.headers.set('X-Bardic-Device', deviceId());
    if (listener) req.headers.set('X-Bardic-Listener', listener);
    return fetch(req);
  },
});
