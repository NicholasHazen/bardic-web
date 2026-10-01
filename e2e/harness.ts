// A real bardic-server per test (temporary data folder, loopback, free ports) and the built
// client served in front of it: static files from dist/, /api proxied to the server with the
// page's Origin removed (as the Vite dev proxy does).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const SERVER_BIN = process.env.BARDIC_SERVER_BIN ?? path.resolve(import.meta.dirname, '../../bardic-server/target/release/bardic-server');
const DIST = path.resolve(import.meta.dirname, '..', process.env.BARDIC_DIST ?? 'dist');

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });

export interface Running {
  url: string; // the client
  api: string; // the server directly
  dataDir: string;
  stop: () => Promise<void>;
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export interface StackOptions {
  /** Extra environment for the server, e.g. { BARDIC_GEMINI_URL: fake.url }. */
  env?: Record<string, string>;
  /** Extra server arguments. */
  args?: string[];
}

export async function startStack(opts: StackOptions = {}): Promise<Running> {
  if (!fs.existsSync(SERVER_BIN)) throw new Error(`server binary not found: ${SERVER_BIN} (cargo build --release in bardic-server, or set BARDIC_SERVER_BIN)`);
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('dist/ is missing: run `npm run build` first');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardic-e2e-'));
  const serverPort = await freePort();
  const child: ChildProcess = spawn(SERVER_BIN, ['--data-dir', dataDir, '--bind', `127.0.0.1:${serverPort}`, ...(opts.args ?? [])], { stdio: 'ignore', env: { ...process.env, ...opts.env } });
  const api = `http://127.0.0.1:${serverPort}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${api}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  const proxy = http.createServer((req, res) => {
    if (req.url?.startsWith('/api')) {
      const headers = { ...req.headers, host: `127.0.0.1:${serverPort}` };
      delete headers.origin;
      const up = http.request({ host: '127.0.0.1', port: serverPort, path: req.url, method: req.method, headers }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on('error', () => res.writeHead(502).end());
      res.on('close', () => up.destroy());
      req.pipe(up);
      return;
    }
    const file = path.join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0]!));
    const target = file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  const proxyPort = await freePort();
  await new Promise<void>((r) => proxy.listen(proxyPort, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${proxyPort}`,
    api,
    dataDir,
    stop: async () => {
      proxy.closeAllConnections?.();
      proxy.close();
      child.kill();
      await new Promise((r) => setTimeout(r, 100));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Call the server directly, as another device would. */
export async function apiCall(api: string, method: string, path_: string, body?: unknown, device = 'e2e-other-device-1', listener?: string) {
  const r = await fetch(`${api}${path_}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-bardic-device': device, ...(listener ? { 'x-bardic-listener': listener } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
}
