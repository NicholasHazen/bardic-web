#!/usr/bin/env node
// Production images must already be built. All containers, books, keys and data below are disposable.
// Run from either checkout: node /path/to/bardic-web/scripts/deployment-smoke.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium, firefox, webkit, expect } from '@playwright/test';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const fixture = path.join(root, 'scripts/fixtures/deployment-breeze.mjs');
const device = 'deployment-smoke-device';
const marker = `synthetic-deployment-${randomUUID()}`;
const project = `bardic-smoke-${randomUUID().slice(0, 8)}`;
const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bardic-deployment-')));
const data = path.join(temporary, 'data');
const restored = path.join(temporary, 'restored');
const envFile = path.join(temporary, 'compose.env');
const override = path.join(temporary, 'compose.override.json');
let listener;
let base;
let attemptedStart = false;
let initializedData = false;
let failed = false;

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function command(program, args, options = {}) {
  const result = await exec(program, args, { cwd: root, timeout: 360_000, maxBuffer: 12 * 1024 * 1024, ...options });
  return result.stdout.trim();
}
const compose = (args) => command('docker', ['compose', '--project-name', project, '--project-directory', root, '--env-file', envFile, '-f', path.join(root, 'compose.yaml'), '-f', override, ...args]);
const fakeRequests = async () => JSON.parse(await compose(['exec', '-T', 'deployment-breeze', 'node', '-e', 'fetch("http://127.0.0.1:9000/__stats").then(r=>r.text()).then(console.log)'])).speechRequests;
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function writeEnvironment(directory, port) {
  // An explicit env file and explicit process values prevent a user's .env or exported deployment settings from
  // redirecting this smoke test into a real data folder or onto a public interface.
  const values = {
    BARDIC_DATA_DIR: directory, BARDIC_HTTP_PORT: String(port), BARDIC_BIND_ADDRESS: '127.0.0.1',
    BARDIC_IMAGE_TAG: 'local', BARDIC_SERVER_CONTEXT: path.resolve(root, '../bardic-server'),
    BARDIC_ALLOW_HOSTS: '', BARDIC_ALLOW_ORIGINS: '',
  };
  Object.assign(process.env, values);
  await fs.writeFile(envFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
}
async function ownDirectory(directory) {
  // Only this mkdtemp child is mounted into the root init container. No user data directory is accepted.
  assert.equal(path.dirname(directory), temporary);
  await command('docker', ['run', '--rm', '--network', 'none', '--user', '0:0', '--mount', `type=bind,source=${directory},target=/owned`, 'node:24-alpine', 'node', '-e',
    'const fs=require("node:fs"); const walk=p=>{const s=fs.lstatSync(p); if(s.isSymbolicLink())throw Error("unexpected symlink"); if(s.isDirectory())for(const n of fs.readdirSync(p))walk(p+"/"+n); fs.chownSync(p,10001,10001); fs.chmodSync(p,s.isDirectory()?0o700:0o600)}; walk("/owned");']);
}
async function poll(label, read, ready, timeout = 60_000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    last = await read();
    if (ready(last)) return last;
    await sleep(100);
  }
  throw new Error(`${label} did not become ready: ${JSON.stringify(last)}`);
}
async function request(route, options = {}) {
  const { method = 'GET', body, expected = 200, headers = {} } = options;
  const response = await fetch(`${base}${route}`, {
    method, signal: AbortSignal.timeout(20_000),
    headers: { 'X-Bardic-Device': device, ...(listener ? { 'X-Bardic-Listener': listener } : {}), Origin: base, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, expected, `${method} ${route}: ${response.status} ${response.status === expected ? '' : await response.text()}`);
  return response;
}
const json = async (route, options) => (await request(route, options)).json();
const bytes = async (route, options) => Buffer.from(await (await request(route, options)).arrayBuffer());
async function waitHealthy() {
  await poll('production gateway', async () => {
    try { const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }); return response.status === 200 && (await response.json()).ok; }
    catch { return false; }
  }, Boolean, 120_000);
}
async function webChecks() {
  const response = await fetch(`${base}/?e2e=player`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(response.headers.get('cache-control') ?? '', /no-cache|no-store|max-age=0/i, 'app shell must refresh');
  const html = await response.text();
  assert.match(html, /<!doctype html/i);
  const queue = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map((match) => match[1]);
  assert.ok(queue.some((item) => item.endsWith('.js')), 'built app script missing');
  const seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const asset = queue[i];
    if (seen.has(asset)) continue;
    seen.add(asset);
    assert.ok(seen.size < 300, 'unexpected asset graph');
    const result = await fetch(`${base}${asset}`, { signal: AbortSignal.timeout(20_000) });
    assert.equal(result.status, 200, asset);
    assert.match(result.headers.get('cache-control') ?? '', /immutable/i, `${asset} must use immutable caching`);
    const text = await result.text();
    assert.doesNotMatch(text, /\b__(?:player|audio|offline|offlineKit)\b|testhost-[\w-]+\.js/, 'production image includes E2E hooks');
    for (const match of text.matchAll(/["'`](\/?assets\/[\w.-]+\.(?:js|css)|\.\/[\w.-]+\.(?:js|css))["'`]/g)) queue.push(new URL(match[1], `${base}${asset}`).pathname);
  }
  for (const route of ['/sw.js', '/manifest.webmanifest']) {
    const result = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(20_000) });
    assert.equal(result.status, 200, route);
    assert.match(result.headers.get('cache-control') ?? '', /no-cache|no-store|max-age=0/i, `${route} must refresh`);
  }
  const health = await request('/api/health');
  assert.doesNotMatch(health.headers.get('cache-control') ?? '', /immutable/i);
  await health.arrayBuffer();
  const missing = await fetch(`${base}/api/deployment-smoke-missing`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(missing.status, 404, 'API misses must not become the SPA shell');
  assert.doesNotMatch(await missing.text(), /<!doctype html/i);
  console.log('✓ production app, cache policy and API routing');
  return [...seen];
}
async function browserRelay(target) {
  // Forward the actual container gateway byte for byte, including Host, Origin and Fetch Metadata.
  // Cutting real sockets preserves native service-worker behavior. Firefox/WebKit driver offline flags
  // can bypass workers, and context routes can miss worker fetches; neither proves a cached reload.
  const destination = new URL(target);
  assert.equal(destination.protocol, 'http:');
  assert.equal(destination.hostname, '127.0.0.1');
  const sockets = new Set();
  let reachable = true;
  const server = net.createServer((client) => {
    sockets.add(client);
    client.on('close', () => sockets.delete(client));
    if (!reachable) { client.destroy(); return; }
    const upstream = net.connect(Number(destination.port || 80), destination.hostname);
    sockets.add(upstream);
    upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
    client.on('close', () => upstream.destroy());
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream); upstream.pipe(client);
  });
  server.maxConnections = 64;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const setReachable = (value) => {
    reachable = value;
    if (!value) for (const socket of sockets) socket.destroy();
  };
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    setReachable,
    close: async () => {
      setReachable(false);
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
async function browserChecks(assets) {
  const engines = [
    ['Chromium', chromium, { args: ['--mute-audio'] }],
    ['Firefox', firefox, { firefoxUserPrefs: { 'media.volume_scale': '0.0' } }],
    ['WebKit', webkit, {}],
  ];
  for (const [name, engine, launchOptions] of engines) {
    const relay = await browserRelay(base);
    let browser;
    try {
      browser = await engine.launch({ headless: true, timeout: 30_000, ...launchOptions });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
      context.setDefaultTimeout(15_000);
      context.setDefaultNavigationTimeout(20_000);
      await context.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          this.muted = true; this.volume = 0;
          return play.call(this);
        };
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      let disconnected = false;
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        const location = message.location().url;
        // External font availability is outside this local image smoke. Network errors during the
        // intentional disconnect are expected; application exceptions remain failures throughout.
        if (message.type() === 'error' && !disconnected && (!location || location.startsWith(relay.url))) {
          consoleErrors.push(message.text());
        }
      });
      await page.goto(`${relay.url}/?e2e=player`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveTitle('Bardic');
      const browserListener = `Synthetic ${name} Browser`;
      if (name === 'Chromium') {
        await expect(page.getByRole('heading', { name: 'Welcome to Bardic', exact: true })).toBeVisible();
        await page.getByLabel('Your name', { exact: true }).fill(browserListener);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
      } else {
        // Later engines use fresh browser profiles against the same disposable household.
        await expect(page.getByRole('heading', { name: 'Who’s listening?', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Add a listener', exact: true }).click();
        await page.getByLabel('Name', { exact: true }).fill(browserListener);
        await page.getByRole('button', { name: 'Add listener', exact: true }).click();
      }
      const selected = page.getByRole('button', { name: `Listening as ${browserListener}. Change listener`, exact: true });
      await expect(selected).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open the sample', exact: true })).toBeVisible();
      assert.ok((await json('/api/listeners')).items.some((item) => item.name === browserListener), `${name}: UI listener creation was not saved`);
      const noHooks = () => page.evaluate(() => ['__player', '__audio', '__offline', '__offlineKit'].filter((key) => key in window));
      assert.deepEqual(await noHooks(), [], `${name}: production query enabled E2E hooks`);
      // A controller is acquired only after install/activation; additionally require every compiled
      // asset checked above in its app cache before cutting the origin. No cached audio is claimed.
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 25_000 });
      await expect.poll(async () => await page.evaluate(async (compiledAssets) => {
        const cacheName = (await caches.keys()).find((key) => key.startsWith('bardic-app-'));
        if (!cacheName) return false;
        const cache = await caches.open(cacheName);
        if (!await cache.match('/index.html')) return false;
        return (await Promise.all(compiledAssets.map(async (asset) => !!await cache.match(asset)))).every(Boolean);
      }, assets), { timeout: 25_000, message: `${name}: complete app shell and compiled assets must be cached` }).toBe(true);
      assert.deepEqual(pageErrors, [], `${name}: application exceptions online`);
      assert.deepEqual(consoleErrors, [], `${name}: same-origin console errors online`);
      const documentMarker = `before-cached-reload-${randomUUID()}`;
      await page.evaluate((value) => { document.documentElement.dataset.deploymentReload = value; }, documentMarker);
      disconnected = true;
      relay.setReachable(false);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      assert.notEqual(await page.evaluate(() => document.documentElement.dataset.deploymentReload), documentMarker, `${name}: reload retained the old document`);
      await expect(page).toHaveTitle('Bardic');
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(selected).toBeVisible();
      assert.deepEqual(await noHooks(), [], `${name}: cached production shell exposes E2E hooks`);
      assert.deepEqual(pageErrors, [], `${name}: application exceptions after cached reload`);
      console.log(`✓ ${name} ${browser.version()}: production UI/listener, absent hooks and a fresh cached document with its origin disconnected`);
    } finally {
      relay.setReachable(true);
      try { if (browser) await browser.close(); }
      finally { await relay.close(); }
    }
  }
  assert.equal(await fakeRequests(), 0, 'browser shell/listener checks must not request provider speech');
}
async function originChecks(voice) {
  for (const headers of [
    { Origin: 'http://foreign.invalid' },
    { Origin: '', 'Sec-Fetch-Site': 'cross-site', Referer: 'http://foreign.invalid/' },
  ]) {
    // The second request deliberately omits Origin rather than forwarding an invalid empty value.
    const actual = { 'Content-Type': 'application/json', 'X-Bardic-Device': device, ...headers };
    if (!actual.Origin) delete actual.Origin;
    const response = await fetch(`${base}/api/listeners`, { method: 'POST', headers: actual, body: JSON.stringify({ name: 'Foreign smoke listener' }), signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'origin_not_allowed');
  }
  assert.ok(!(await json('/api/listeners')).items.some((item) => item.name === 'Foreign smoke listener'));
  const denied = await fetch(`${base}/api/voices/${voice}/sample`, { headers: { Origin: 'http://foreign.invalid' }, signal: AbortSignal.timeout(20_000) });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'origin_not_allowed');
  const ambiguous = await fetch(`${base}/api/voices/${voice}/sample`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(ambiguous.status, 403);
  assert.equal((await ambiguous.json()).code, 'origin_not_allowed');
  console.log('✓ own-origin writes and foreign/ambiguous provenance refusal');
}
async function sseCheck() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const response = await fetch(`${base}/api/events`, { headers: { 'X-Bardic-Device': device, 'X-Bardic-Listener': listener }, signal: abort.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body.getReader();
    const started = Date.now();
    const observed = (async () => {
      let text = '';
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new Error('SSE ended before its notice');
        text += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = text.indexOf('\n\n')) !== -1) {
          const frame = text.slice(0, boundary); text = text.slice(boundary + 2);
          const value = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
          if (value) {
            const notice = JSON.parse(value);
            if (notice.type === 'listener.updated' && notice.id === listener) return;
          }
        }
      }
    })();
    // Attach failure handling before starting the mutation, so timeout cannot cause an unhandled rejection.
    observed.catch(() => {});
    await json(`/api/listeners/${listener}`, { method: 'PATCH', body: { name: 'Synthetic container listener' } });
    await observed;
    assert.ok(Date.now() - started < 3000, 'reverse proxy buffered the notice');
    console.log('✓ SSE notice arrives promptly through gateway');
  } finally { clearTimeout(timer); abort.abort(); }
}
async function rangeCheck(route, full) {
  const response = await request(route, { headers: { Range: 'bytes=0-43' }, expected: 206 });
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-range'), `bytes 0-43/${full.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), full.subarray(0, 44));
}

try {
  await fs.access(path.join(root, 'compose.yaml'));
  await fs.mkdir(data, { mode: 0o700 });
  await fs.mkdir(restored, { mode: 0o700 });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  await writeEnvironment(data, port);
  await fs.writeFile(override, JSON.stringify({ services: {
    'bardic-server': { environment: { BARDIC_GEMINI_URL: 'http://deployment-breeze:9000' }, depends_on: { 'deployment-breeze': { condition: 'service_healthy' } } },
    'deployment-breeze': {
      image: 'node:24-alpine', user: '10001:10001', read_only: true, command: ['node', '/fixture/deployment-breeze.mjs'],
      volumes: [{ type: 'bind', source: fixture, target: '/fixture/deployment-breeze.mjs', read_only: true }],
      environment: { DEPLOYMENT_BREEZE_KEY: marker },
      healthcheck: { test: ['CMD', 'node', '-e', 'fetch("http://127.0.0.1:9000/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'], interval: '1s', timeout: '2s', retries: 30 },
    },
  } }, null, 2), { mode: 0o600 });
  await ownDirectory(data);
  initializedData = true;
  attemptedStart = true;
  await compose(['up', '--detach', '--no-build']);
  await waitHealthy();
  const assets = await webChecks();
  await browserChecks(assets);
  const serverBefore = await json('/api/server');
  await json('/api/server', { method: 'PATCH', body: { name: 'Synthetic container Bardic' } });
  listener = (await json('/api/listeners', { method: 'POST', body: { name: 'Initial smoke listener' }, expected: 201 })).id;
  await sseCheck();
  const source = await json('/api/voice-sources/breeze', { method: 'PUT', body: { base_url: 'http://deployment-breeze:9000', api_key: marker } });
  assert.equal(source.has_key, true);
  const voice = (await json('/api/voices?source_id=breeze')).items.find((item) => item.name === 'Synthetic Ferry').id;
  await originChecks(voice);
  assert.equal(await fakeRequests(), 0, 'refused provenance must not reach the speech provider');
  await json(`/api/listeners/${listener}/settings`, { method: 'PUT', body: { default_voice_id: voice, place_conflict: 'ask', continue_into_next_chapter: false } });
  const original = 'The synthetic ferry carried a 🦉 past cafe\u0301 island.\n\nIts paper captain counted seven lanterns and returned before dawn.\n';
  const form = new FormData(); form.append('file', new Blob([original], { type: 'text/plain' }), 'Synthetic Container Ferry.txt');
  const imported = await fetch(`${base}/api/imports`, { method: 'POST', headers: { Origin: base, 'X-Bardic-Device': device, 'Idempotency-Key': `deployment-${project}` }, body: form, signal: AbortSignal.timeout(20_000) });
  assert.equal(imported.status, 202);
  const importId = (await imported.json()).id;
  const result = await poll('synthetic import', () => json(`/api/imports/${importId}`), (item) => { if (item.state === 'failed') throw new Error('synthetic import failed'); return item.state === 'done'; });
  const book = result.book_id;
  await json(`/api/books/${book}`, { method: 'PATCH', body: { title: 'The Container Ferry', author: 'Synthetic Writer', series: { name: 'Synthetic Container Cycle', order: 2.5 } } });
  const chapters = (await json(`/api/books/${book}/chapters`)).items;
  const chapter = chapters.find((item) => item.kind === 'story');
  assert.ok(chapter);
  const text = await json(`/api/books/${book}/chapters/${chapter.id}/text`);
  assert.match(text.text, /🦉/); assert.match(text.text, /cafe\u0301/);
  const created = await json(`/api/books/${book}/audiobooks`, { method: 'POST', body: { voice_id: voice }, expected: 201 });
  const audiobook = created.id;
  await json(`/api/audiobooks/${audiobook}/make-ready`, { method: 'POST', body: { scope: { kind: 'whole_book' } }, expected: 202 });
  await poll('free synthetic audio', () => json(`/api/audiobooks/${audiobook}`), (item) => item.chapters_ready === item.chapters_total && item.chapters_total > 0);
  const audio = (await json(`/api/audiobooks/${audiobook}/chapters`)).items.find((item) => item.chapter_id === chapter.id).audio;
  const audioBytes = await bytes(`/api/audio/${audio.id}`);
  assert.equal(digest(audioBytes), audio.sha256);
  await rangeCheck(`/api/audio/${audio.id}`, audioBytes);
  const timings = await json(`/api/audio/${audio.id}/timings`);
  const offset = [...text.text.slice(0, text.text.indexOf('past'))].length;
  await json(`/api/books/${book}/place`, { method: 'PUT', body: { chapter_id: chapter.id, offset, mode: 'reading', audiobook_id: audiobook, base_revision: 0 } });
  const exported = await json(`/api/audiobooks/${audiobook}/exports`, { method: 'POST', body: { format: 'm4b' }, expected: 202 });
  await poll('ffmpeg M4B', () => json(`/api/exports/${exported.id}`), (item) => { if (item.state === 'failed') throw new Error('ffmpeg export failed'); return item.state === 'ready'; });
  const m4b = await bytes(`/api/exports/${exported.id}/file`);
  assert.ok(m4b.length > 100); assert.equal(m4b.toString('ascii', 4, 8), 'ftyp');
  await rangeCheck(`/api/exports/${exported.id}/file`, m4b);
  // generated_at is the read time, not stored identity; compare every durable manifest field below.
  const { generated_at: generatedAt, ...manifest } = await json(`/api/audiobooks/${audiobook}/manifest`);
  assert.ok(Number.isFinite(Date.parse(generatedAt)));
  const sample = await bytes(`/api/voices/${voice}/sample`);
  assert.ok(sample.length > 44); await rangeCheck(`/api/voices/${voice}/sample`, sample);
  const snapshot = {
    server: await json('/api/server'), listener: await json(`/api/listeners/${listener}`), settings: await json(`/api/listeners/${listener}/settings`),
    book: await json(`/api/books/${book}`), place: await json(`/api/books/${book}/place`),
  };
  assert.equal(snapshot.server.id, serverBefore.id);
  const cover = await bytes(`/api/books/${book}/cover`);
  const beforeRequests = await fakeRequests();
  async function verifySnapshot(hasKey) {
    const server = await json('/api/server'); assert.equal(server.id, snapshot.server.id); assert.equal(server.name, snapshot.server.name);
    assert.deepEqual(await json(`/api/listeners/${listener}`), snapshot.listener);
    assert.deepEqual(await json(`/api/listeners/${listener}/settings`), snapshot.settings);
    assert.deepEqual(await json(`/api/books/${book}`), snapshot.book);
    assert.deepEqual(await json(`/api/books/${book}/place`), snapshot.place);
    assert.deepEqual(await json(`/api/books/${book}/chapters/${chapter.id}/text`), text);
    assert.deepEqual(await bytes(`/api/books/${book}/cover`), cover);
    assert.deepEqual(await json(`/api/audio/${audio.id}/timings`), timings);
    const { generated_at: readAt, ...currentManifest } = await json(`/api/audiobooks/${audiobook}/manifest`);
    assert.ok(Number.isFinite(Date.parse(readAt)));
    assert.deepEqual(currentManifest, manifest);
    assert.equal(digest(await bytes(`/api/audio/${audio.id}`)), audio.sha256);
    await rangeCheck(`/api/audio/${audio.id}`, audioBytes);
    assert.deepEqual(await bytes(`/api/voices/${voice}/sample`), sample);
    assert.equal((await json('/api/voice-sources/breeze')).has_key, hasKey);
    const count = await fakeRequests();
    assert.equal(count, beforeRequests, 'reading durable audio must not make it again');
  }
  console.log('✓ synthetic import, code points, metadata, free audio, Range and real M4B export');
  const oldContainer = await compose(['ps', '--quiet', 'bardic-server']);
  await compose(['stop', 'bardic-server']);
  assert.equal(await command('docker', ['inspect', '--format', '{{.State.ExitCode}}', oldContainer]), '0', 'default SIGTERM must shut down gracefully');
  await compose(['up', '--detach', '--no-build', '--force-recreate', '--no-deps', 'bardic-server']);
  assert.notEqual(await compose(['ps', '--quiet', 'bardic-server']), oldContainer);
  await waitHealthy(); // The existing gateway must resolve the recreated server, without itself being recreated.
  await verifySnapshot(true);
  console.log('✓ default SIGTERM and server recreation preserve data behind the existing gateway');
  const backup = await json('/api/backups', { method: 'POST', expected: 202 });
  const done = await poll('consistent backup', async () => (await json('/api/backups')).items.find((item) => item.id === backup.id), (item) => { if (item?.state === 'failed') throw new Error('backup failed'); return item?.state === 'done'; });
  assert.match(done.path, /^backups\/[A-Za-z0-9_-]+$/);
  const container = await compose(['ps', '--quiet', 'bardic-server']);
  const mounts = JSON.parse(await command('docker', ['inspect', '--format', '{{json .Mounts}}', container]));
  const mount = mounts.find((item) => item.Type === 'bind' && item.Source === data);
  assert.ok(mount, 'test data bind mount not found');
  const copied = path.join(temporary, 'backup');
  await compose(['cp', `bardic-server:${mount.Destination}/${done.path}`, copied]);
  assert.equal((await fs.readFile(path.join(copied, 'bardic.db'))).includes(Buffer.from(marker)), false, 'backup retains the synthetic key');
  assert.deepEqual(await fs.readFile(path.join(copied, 'media/originals', book, 'source.txt')), Buffer.from(original));
  await fs.copyFile(path.join(copied, 'bardic.db'), path.join(restored, 'bardic.db'));
  for (const sub of ['originals', 'audio', 'samples']) await fs.cp(path.join(copied, 'media', sub), path.join(restored, sub), { recursive: true });
  // A post-backup change proves the restore reads the snapshot rather than the old live database.
  await json(`/api/books/${book}`, { method: 'PATCH', body: { title: 'Post-backup synthetic title' } });
  await compose(['stop', 'bardic-server', 'bardic-web']);
  await ownDirectory(restored);
  await writeEnvironment(restored, port);
  await compose(['up', '--detach', '--no-build', '--force-recreate', 'bardic-server', 'bardic-web']);
  await waitHealthy();
  await verifySnapshot(false);
  console.log('✓ offline backup restore preserves exact text/audio/place/settings and strips the synthetic key');
  console.log('Deployment smoke passed. Only original synthetic data and the private fake Breeze were used.');
} catch (error) {
  failed = true;
  console.error(error.stack ?? error);
  if (attemptedStart) {
    try { console.error(await compose(['logs', '--no-color', '--tail', '60', 'bardic-server', 'bardic-web'])); } catch {}
  }
} finally {
  let stopped = !attemptedStart;
  if (attemptedStart) {
    try { await compose(['down', '--volumes', '--remove-orphans']); stopped = true; }
    catch (error) { failed = true; console.error(`Owned project ${project} could not be stopped: ${error.message}`); }
  }
  if (stopped) {
    try {
      // Linux bind files belong to UID10001; remove only our two data directories from a root helper.
      if (initializedData) await command('docker', ['run', '--rm', '--network', 'none', '--user', '0:0', '--mount', `type=bind,source=${temporary},target=/owned`, 'node:24-alpine', 'node', '-e', 'const fs=require("node:fs"); for(const p of ["/owned/data","/owned/restored"])fs.rmSync(p,{recursive:true,force:true});']);
      await fs.rm(temporary, { recursive: true, force: true });
    } catch (error) { failed = true; console.error(`Disposable test files remain at ${temporary}: ${error.message}`); }
  } else console.error(`Disposable test files remain at ${temporary}; they may still be mounted by the owned project.`);
}
if (failed) process.exitCode = 1;
