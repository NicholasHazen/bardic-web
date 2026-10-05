// Real browser provenance and sample flights against the real server and fake Gemini.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import type { GeminiFake } from './fakes';

async function premiumVoice(api: string): Promise<string> {
  expect((await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' })).status).toBe(200);
  const voices = (await apiCall(api, 'GET', '/api/voices?tier=premium')).json.items as { id: string; name: string }[];
  return voices.find((v) => v.name === 'Kore')!.id;
}

async function foreignPage() {
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'referrer-policy': 'no-referrer' });
    res.end('<!doctype html><title>Synthetic foreign page</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // localhost and 127.0.0.1 are distinct sites, using only loopback test traffic.
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { url, stop: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}

// Some engines hide blocked CORS/opaque media responses from Playwright. Record the
// actual browser headers and upstream status at a transparent loopback relay instead.
async function sampleProbe(api: string, voice: string) {
  let observed: { headers: http.IncomingHttpHeaders; status: number } | undefined;
  const server = http.createServer((req, res) => {
    const upstream = http.request(`${api}/api/voices/${voice}/sample`, {
      method: req.method,
      headers: { ...req.headers, host: new URL(api).host },
    }, (answer) => {
      observed = { headers: { ...req.headers }, status: answer.statusCode! };
      res.writeHead(answer.statusCode!, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/sample`,
    observed: () => observed,
    stop: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

test('a foreign browser fetch cannot generate or spend on a premium sample', async ({ page, stack, gemini }) => {
  const voice = await premiumVoice(stack.api);
  const foreign = await foreignPage();
  const probe = await sampleProbe(stack.api, voice);
  try {
    await page.goto(foreign.url);
    await page.evaluate((target) => { void fetch(target).catch(() => {}); }, probe.url);
    await expect.poll(() => probe.observed()?.status).toBe(403);
    expect(probe.observed()!.headers.origin).toBe(foreign.url);
    expect(gemini.received()).toBe(0);
    const spent = (await apiCall(stack.api, 'GET', '/api/allowance')).json.spent;
    expect(spent.known.micros).toBe(0);
    expect(spent.unknown_items).toBe(0);
  } finally {
    await probe.stop();
    await foreign.stop();
  }
});

test('foreign audio preload without Origin or Referer is refused before spending', async ({ page, stack, gemini }) => {
  const voice = await premiumVoice(stack.api);
  const foreign = await foreignPage();
  const probe = await sampleProbe(stack.api, voice);
  try {
    await page.goto(foreign.url);
    await page.evaluate((target) => {
      const media = document.createElement('audio');
      media.muted = true;
      media.preload = 'auto';
      media.src = target;
      document.body.append(media);
      media.load();
    }, probe.url);
    await expect.poll(() => probe.observed()?.status).toBe(403);
    const headers = probe.observed()!.headers;
    expect(headers.origin).toBeUndefined();
    expect(headers.referer ?? '').toBe('');
    expect(headers['sec-fetch-site']).toBe('cross-site');
    expect(gemini.received()).toBe(0);
    expect((await apiCall(stack.api, 'GET', '/api/allowance')).json.spent.unknown_items).toBe(0);
  } finally {
    await probe.stop();
    await foreign.stop();
  }
});

test('same-origin concurrent samples share one paid request and cached Range reads', async ({ page, stack, gemini }) => {
  const voice = await premiumVoice(stack.api);
  (gemini as GeminiFake).setDelay(250);
  await page.goto('/');
  const url = `/api/voices/${voice}/sample`;
  const replies = await page.evaluate(async (target) => Promise.all(Array.from({ length: 5 }, async () => {
    const response = await fetch(target, { cache: 'no-store', headers: { 'X-Bardic-Device': 'e2e-sample-device' } });
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  })), url);
  expect(replies.every((r) => r.status === 200 && r.bytes > 44)).toBe(true);
  expect(new Set(replies.map((r) => r.bytes)).size).toBe(1);
  expect(gemini.received()).toBe(1);
  const before = (await apiCall(stack.api, 'GET', '/api/allowance')).json.spent;
  expect(before.known.micros).toBeGreaterThan(0);
  const partial = await page.evaluate(async (target) => {
    const response = await fetch(target, { headers: { Range: 'bytes=0-43', 'X-Bardic-Device': 'e2e-sample-device' }, cache: 'no-store' });
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  }, url);
  expect(partial).toEqual({ status: 206, bytes: 44 });
  expect(gemini.received()).toBe(1);
  expect((await apiCall(stack.api, 'GET', '/api/allowance')).json.spent).toEqual(before);
});

test('foreign no-cors fetch cannot attach the device header to bypass sample protection', async ({ page, stack, gemini }) => {
  const voice = await premiumVoice(stack.api);
  const foreign = await foreignPage();
  const probe = await sampleProbe(stack.api, voice);
  try {
    await page.goto(foreign.url);
    await page.evaluate((target) => {
      void fetch(target, { mode: 'no-cors', headers: { 'X-Bardic-Device': 'foreign-device-0001' } }).catch(() => {});
    }, probe.url);
    await expect.poll(() => probe.observed()?.status).toBe(403);
    const headers = probe.observed()!.headers;
    expect(headers['x-bardic-device']).toBeUndefined();
    expect(headers.origin).toBeUndefined();
    expect(headers.referer ?? '').toBe('');
    expect(gemini.received()).toBe(0);
  } finally {
    await probe.stop();
    await foreign.stop();
  }
});
