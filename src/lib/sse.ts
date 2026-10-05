// Server-Sent Events over fetch. `EventSource` cannot send the identity headers the API needs
// (`X-Bardic-Listener` is required on /api/events), so the stream is read by hand.

export interface SseMessage {
  id?: string;
  event?: string;
  data: string;
}

/** Incremental parser for the text/event-stream format. Feed it chunks as they arrive. */
export class SseParser {
  private buffer = '';
  private data: string[] = [];
  private id: string | undefined;
  private event: string | undefined;

  feed(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let nl: number;
    // Lines end with \n, \r\n or \r. A lone trailing \r may be half of \r\n, so wait for more.
    while ((nl = this.buffer.search(/\r\n|\n|\r(?!$)/)) >= 0) {
      const m = /^(\r\n|\n|\r)/.exec(this.buffer.slice(nl));
      const len = m ? m[0].length : 1;
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + len);
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  private line(line: string): SseMessage | null {
    if (line === '') {
      if (!this.data.length) {
        this.event = undefined;
        return null;
      }
      const msg: SseMessage = { data: this.data.join('\n') };
      if (this.id !== undefined) msg.id = this.id;
      if (this.event !== undefined) msg.event = this.event;
      this.data = [];
      this.event = undefined;
      return msg;
    }
    if (line.startsWith(':')) return null; // comment / keep-alive
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'id') this.id = value;
    else if (field === 'event') this.event = value;
    return null;
  }
}

export interface EventStreamOptions {
  url: string;
  headers: () => Record<string, string>;
  onmessage: (msg: SseMessage) => void;
  /** Called after each (re)connect; a good moment to refetch what is on screen. */
  onopen?: () => void;
  signal: AbortSignal;
  fetchFn?: typeof fetch;
  /** Wait before reconnecting; grows to a cap. */
  sleep?: (ms: number) => Promise<void>;
}

/** Keep a stream open until aborted, resuming with Last-Event-ID. Never throws. */
export async function followEventStream(o: EventStreamOptions): Promise<void> {
  const doFetch = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastId: string | undefined;
  let delay = 500;
  while (!o.signal.aborted) {
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream', ...o.headers() };
      if (lastId) headers['Last-Event-ID'] = lastId;
      const res = await doFetch(o.url, { headers, signal: o.signal });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      o.onopen?.();
      delay = 500;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const parser = new SseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const msg of parser.feed(dec.decode(value, { stream: true }))) {
          if (msg.id) lastId = msg.id;
          o.onmessage(msg);
        }
      }
    } catch {
      if (o.signal.aborted) return;
    }
    if (o.signal.aborted) return;
    await sleep(delay);
    delay = Math.min(delay * 2, 15000);
  }
}

// ---------------------------------------------------------------------------------------------
// One stream per listener, shared by everything on the page.
//
// A browser allows about six HTTP/1.1 connections to one server, and each open event stream holds one for as long
// as the page lives. The library, the book page, the player and the offline engine each following their own
// stream used the connections up, and ordinary requests then waited behind them: the page stopped updating.
// Everything that wants notices now subscribes here; the first subscriber opens the stream and the last one
// closes it.

export interface SharedSubscriber {
  onmessage: (msg: SseMessage) => void;
  /** After each (re)connect, and right away for a subscriber that joins a stream that is already open. */
  onopen?: () => void;
}

interface Hub {
  subs: Set<SharedSubscriber>;
  abort: AbortController;
  opened: boolean;
}

const hubs = new Map<string, Hub>();

/** One subscriber's failure must not stop the others from hearing the notice. */
function guard(run: () => void): void {
  try {
    run();
  } catch {
    /* the subscriber's own problem */
  }
}

export interface SharedStreamOptions {
  headers: () => Record<string, string>;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Follow the event stream of `listenerId` through the one shared connection. Returns the function that stops following. */
export function subscribeSharedEvents(listenerId: string, sub: SharedSubscriber, opts: SharedStreamOptions): () => void {
  let hub = hubs.get(listenerId);
  if (!hub) {
    const created: Hub = { subs: new Set(), abort: new AbortController(), opened: false };
    hub = created;
    hubs.set(listenerId, created);
    const stream: EventStreamOptions = {
      url: '/api/events',
      headers: opts.headers,
      signal: created.abort.signal,
      onopen: () => {
        created.opened = true;
        for (const s of [...created.subs]) guard(() => s.onopen?.());
      },
      onmessage: (msg) => {
        for (const s of [...created.subs]) guard(() => s.onmessage(msg));
      },
    };
    if (opts.fetchFn) stream.fetchFn = opts.fetchFn;
    if (opts.sleep) stream.sleep = opts.sleep;
    void followEventStream(stream);
  }
  const mine = hub;
  mine.subs.add(sub);
  if (mine.opened) sub.onopen?.();
  return () => {
    mine.subs.delete(sub);
    if (mine.subs.size === 0) {
      mine.abort.abort();
      if (hubs.get(listenerId) === mine) hubs.delete(listenerId);
    }
  };
}

/** For tests: how many listeners currently have an open shared stream. */
export const sharedStreamCount = (): number => hubs.size;
