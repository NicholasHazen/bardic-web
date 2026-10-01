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
