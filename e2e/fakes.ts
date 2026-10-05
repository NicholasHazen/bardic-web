// Fake voice providers for end-to-end tests: just enough of Breeze and Gemini for the server to
// treat them as real. Original synthetic data only; audio is a constant tone.
import http from 'node:http';
import net from 'node:net';

export interface Fake {
  url: string;
  /** Every text sent for speech, in order. */
  spoken: string[];
  /** Requests received on the speech endpoint (answered or not). */
  received: () => number;
  setDown: (down: boolean) => void;
  stop: () => Promise<void>;
}

const listen = (server: http.Server) =>
  new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as net.AddressInfo).port}`)));

const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });

export const BREEZE_VOICES = [
  { id: 'mara', kind: 'cloned', name: 'Mara', description: 'Warm, unhurried', labels: { language: 'en' }, created_at: '2026-01-01T00:00:00Z', settings: { seed: 7 }, reference: { text: 'hello' } },
  { id: 'tobias', kind: 'cloned', name: 'Tobias', created_at: '2026-01-02T00:00:00Z' },
  { id: 'sketch', kind: 'designed', name: 'Sketch' },
];

/** 10 ms of audio per character, one segment per sentence (the shape the server reads). */
export async function startBreeze(opts: { key?: string; beforeSpeech?: () => Promise<void> } = {}): Promise<Fake> {
  const spoken: string[] = [];
  let received = 0;
  let down = false;
  const server = http.createServer(async (req, res) => {
    const auth = !opts.key || req.headers.authorization === `Bearer ${opts.key}`;
    if (req.url === '/health') return json(res, 200, { status: 'ok', model: 'breeze-tts-2' });
    if (down) return json(res, 503, {});
    if (!auth) return json(res, 401, {});
    if (req.url === '/v1/voices') return json(res, 200, { data: BREEZE_VOICES });
    const one = req.url?.match(/^\/v1\/voices\/([^/]+)$/);
    if (one) {
      const v = BREEZE_VOICES.find((x) => x.id === one[1]);
      return v ? json(res, 200, v) : json(res, 404, {});
    }
    if (req.url?.match(/^\/v1\/voices\/[^/]+\/reference$/)) {
      res.writeHead(200, { 'content-type': 'audio/wav' });
      return res.end(Buffer.from('clip-one'));
    }
    if (req.url === '/v1/speech/stream' && req.method === 'POST') {
      received++;
      const body = JSON.parse(await readBody(req));
      const text: string[] = [...String(body.input ?? '')];
      spoken.push(text.join(''));
      await opts.beforeSpeech?.();
      const totalMs = text.length * 10;
      const pcm = Buffer.alloc(totalMs * 48);
      for (let i = 0; i < pcm.length; i++) pcm[i] = i % 2 === 0 ? 0x00 : 0x40;
      let sse = '';
      let start = 0;
      text.forEach((c, i) => {
        if (c === '.' || i === text.length - 1) {
          const end = i + 1;
          sse += `data: ${JSON.stringify({ type: 'speech.segment', segment: { text: text.slice(start, end).join(''), char_start: start, char_end: end, start_ms: start * 10, end_ms: end * 10 } })}\n\n`;
          start = end;
        }
      });
      const half = pcm.length / 2;
      for (const part of [pcm.subarray(0, half), pcm.subarray(half)]) sse += `data: ${JSON.stringify({ type: 'speech.audio.delta', audio: part.toString('base64') })}\n\n`;
      sse += `data: ${JSON.stringify({ type: 'speech.audio.done', duration_ms: totalMs, output_format: 'pcm_24000' })}\n\n`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      return res.end(sse);
    }
    json(res, 404, {});
  });
  const url = await listen(server);
  return { url, spoken, received: () => received, setDown: (d) => (down = d), stop: () => new Promise((r) => (server.closeAllConnections(), server.close(() => r()))) };
}

/** How the fake answers one speech request instead of the usual way (see `queue`). */
export type GeminiBehaviour =
  /** 429 with Retry-After in seconds: a quota or rate limit (nothing made, nothing billed). `daily` says so in the body. */
  | { kind: 'quota'; retryAfter: number; daily?: boolean }
  /** 400: the content was refused (nothing billed). */
  | { kind: 'refuse' }
  /** 200 with audio but no usage report: the cost cannot be stated. */
  | { kind: 'no_usage' }
  /** 403: the key is rejected. */
  | { kind: 'forbidden' };

export type GeminiFake = Fake & {
  setKey: (k: string) => void;
  /** The next speech requests are answered like this, one each, in order; after them the fake behaves as usual again. */
  queue: (...b: GeminiBehaviour[]) => void;
  /** Wait this long before answering every speech request (ms). */
  setDelay: (ms: number) => void;
};

/** The Gemini key check (free model list) and speech with a usage report the server can price. */
export async function startGemini(opts: { key?: string } = { key: 'test-key' }): Promise<GeminiFake> {
  const spoken: string[] = [];
  let received = 0;
  let key = opts.key ?? 'test-key';
  let down = false;
  let delay = 0;
  const queued: GeminiBehaviour[] = [];
  const server = http.createServer(async (req, res) => {
    const ok = req.headers['x-goog-api-key'] === key;
    if (req.url?.startsWith('/v1beta/models')) {
      if (down) return json(res, 503, {});
      return ok ? json(res, 200, { models: [{ name: 'models/gemini-3.8-flash-tts' }] }) : json(res, 403, { error: { message: 'bad key' } });
    }
    if (req.url === '/v1beta/interactions' && req.method === 'POST') {
      received++;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      if (down) return json(res, 503, {});
      if (!ok) return json(res, 403, {});
      const body = JSON.parse(await readBody(req));
      const behaviour = queued.shift();
      if (behaviour?.kind === 'quota') {
        return json(res, 429, { error: { message: behaviour.daily ? 'Quota exceeded: requests per day' : 'Rate limit: requests per minute' } }, { 'retry-after': String(behaviour.retryAfter) });
      }
      if (behaviour?.kind === 'refuse') return json(res, 400, { error: { message: 'blocked' } });
      if (behaviour?.kind === 'forbidden') return json(res, 403, {});
      const text: string = body.input?.[0]?.content?.[0]?.text ?? '';
      spoken.push(text);
      const chars = [...text].length;
      const pcm = Buffer.alloc(chars * 10 * 48, 1);
      const out = Math.round(chars * 2);
      const inp = Math.ceil(chars / 4);
      const steps = [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') }] }];
      if (behaviour?.kind === 'no_usage') return json(res, 200, { steps });
      return json(res, 200, {
        steps,
        usage: {
          total_input_tokens: inp + 201,
          total_output_tokens: out,
          total_cached_tokens: 0,
          input_tokens_by_modality: [{ modality: 'audio', tokens: 201 }, { modality: 'text', tokens: inp }],
          output_tokens_by_modality: [{ modality: 'audio', tokens: out }],
        },
      });
    }
    json(res, 404, {});
  });
  const url = await listen(server);
  return {
    url,
    spoken,
    received: () => received,
    setDown: (d) => (down = d),
    setKey: (k) => (key = k),
    queue: (...b) => void queued.push(...b),
    setDelay: (ms) => (delay = ms),
    stop: () => new Promise((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}
