// Original synthetic voice provider for the disposable deployment smoke test.
// It is reachable only on the test Compose network; it never contacts another service.
import http from 'node:http';

const key = process.env.DEPLOYMENT_BREEZE_KEY;
const voice = { id: 'deployment-ferry', kind: 'cloned', name: 'Synthetic Ferry', labels: { language: 'en' }, created_at: '2026-01-01T00:00:00Z', settings: { seed: 1 }, reference: { text: 'Original synthetic reference.' } };
let speechRequests = 0;
const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
};
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === '/health') return json(response, 200, { status: 'ok' });
    if (request.url === '/__stats') return json(response, 200, { speechRequests });
    if (!key || request.headers.authorization !== `Bearer ${key}`) return json(response, 401, {});
    if (request.url === '/v1/voices') return json(response, 200, { data: [voice] });
    if (request.url === `/v1/voices/${voice.id}`) return json(response, 200, voice);
    if (request.url === `/v1/voices/${voice.id}/reference`) {
      response.writeHead(200, { 'content-type': 'audio/wav' });
      return response.end(Buffer.from('Original synthetic reference bytes.'));
    }
    if (request.method === 'POST' && request.url === '/v1/speech/stream') {
      const parts = [];
      for await (const part of request) parts.push(part);
      const { input = '' } = JSON.parse(Buffer.concat(parts).toString('utf8'));
      const text = String(input);
      const chars = [...text].length;
      const duration = Math.max(100, chars * 10);
      // A low-amplitude constant waveform. The smoke test downloads bytes; it never plays audio.
      const pcm = Buffer.alloc(duration * 48);
      for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(64, i);
      speechRequests++;
      const events = [
        { type: 'speech.segment', segment: { text, char_start: 0, char_end: chars, start_ms: 0, end_ms: duration } },
        { type: 'speech.audio.delta', audio: pcm.toString('base64') },
        { type: 'speech.audio.done', duration_ms: duration, output_format: 'pcm_24000' },
      ];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      return response.end(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
    }
    json(response, 404, {});
  } catch {
    json(response, 400, { error: 'Invalid synthetic request.' });
  }
});
server.listen(9000, '0.0.0.0');
const stop = () => { server.closeAllConnections(); server.close(() => process.exit(0)); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
