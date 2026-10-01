// Diff the client against the design.
//   npm run design:check                 every board that has a route
//   npm run design:check -- Components   one board
//   npm run design:check -- --milestone W0
// A board is "built" when design/manifest.json gives it a `route` (a client hash route that
// renders it from fixtures). Exit code is 1 when a built board differs by more than its
// tolerance, or when a board is missing from the manifest. Deviations must be written in
// design/deviations.json with a reason; that is the only way to raise a tolerance.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { root, manifest, deviations, DEFAULT_TOLERANCE, shoot, diff } from './design-lib.mjs';

const args = process.argv.slice(2);
const mi = args.indexOf('--milestone');
const milestone = mi >= 0 ? args[mi + 1] : null;
const only = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--milestone');

// Every board in the canvas must be in the manifest (coverage).
const canvas = JSON.parse(fs.readFileSync(path.join(root, 'design/canvas/canvas.json'), 'utf8')).boards;
const uncovered = Object.keys(canvas).map((f) => f.replace('.dc.html', '')).filter((n) => !manifest[n]);

const PORT = 5199;
const dev = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
const stop = () => dev.kill();
process.on('exit', stop);
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

fs.mkdirSync(path.join(root, 'design/refs'), { recursive: true });
const out = path.join(root, 'design/report');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const rows = [];
let failed = 0;
for (const [name, b] of Object.entries(manifest)) {
  if (only && name !== only) continue;
  if (milestone && b.milestone !== milestone) continue;
  if (!b.route) { rows.push({ name, b, status: 'not built' }); continue; }
  const ref = path.join(root, `design/refs/${name}.png`);
  if (!fs.existsSync(ref)) await shoot(browser, `file://${root}/design/canvas/${name}.dc.html`, b.w, b.h, ref);
  const ours = path.join(out, `${name}.ours.png`);
  await shoot(browser, `http://localhost:${PORT}/${b.route}`, b.w, b.h, ours);
  fs.copyFileSync(ref, path.join(out, `${name}.ref.png`));
  fs.copyFileSync(path.join(root, `design/boards/${name}.png`), path.join(out, `${name}.export.png`));
  const d = diff(ours, ref, path.join(out, `${name}.diff.png`));
  const dev = deviations[name];
  const tolerance = dev?.reason ? (dev.tolerance ?? DEFAULT_TOLERANCE) : DEFAULT_TOLERANCE;
  const ok = d.percent <= tolerance;
  if (!ok) failed++;
  rows.push({ name, b, status: ok ? 'ok' : 'FAIL', percent: d.percent, tolerance, note: d.note, deviation: dev?.reason });
}
await browser.close();
stop();

const built = rows.filter((r) => r.status !== 'not built');
const html = `<!doctype html><meta charset=utf-8><title>Design check</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:24px}table{border-collapse:collapse}td,th{padding:4px 10px;text-align:left}
.FAIL{color:#ff7b7b}.ok{color:#8fe388}.row{display:flex;gap:12px;margin:12px 0 28px;align-items:flex-start}img{max-width:30vw;border:1px solid #444}figure{margin:0}</style>
<h1>Design check</h1><p>${built.length} built, ${rows.length - built.length} not built, ${failed} over tolerance.</p>
<table><tr><th>Board</th><th>Milestone</th><th>Status</th><th>Diff %</th><th>Tolerance %</th><th>Note</th></tr>
${rows.map((r) => `<tr><td>${r.name}</td><td>${r.b.milestone}</td><td class="${r.status}">${r.status}</td><td>${r.percent?.toFixed(2) ?? ''}</td><td>${r.tolerance ?? ''}</td><td>${r.note ?? r.deviation ?? ''}</td></tr>`).join('')}</table>
${built.map((r) => `<h3>${r.name} <span class="${r.status}">${r.status} ${r.percent?.toFixed(2)}%</span></h3><div class=row>
<figure><figcaption>client</figcaption><img src="${r.name}.ours.png"></figure>
<figure><figcaption>reference render</figcaption><img src="${r.name}.ref.png"></figure>
<figure><figcaption>difference</figcaption><img src="${r.name}.diff.png"></figure>
<figure><figcaption>exported board (the authority)</figcaption><img src="${r.name}.export.png"></figure></div>`).join('')}`;
fs.writeFileSync(path.join(out, 'index.html'), html);

for (const r of rows) {
  if (r.status === 'not built') continue;
  console.log(`${r.status.padEnd(5)} ${r.name.padEnd(24)} ${r.percent.toFixed(2)}% (tolerance ${r.tolerance}%)${r.note ? ' ' + r.note : ''}`);
}
const byMs = {};
for (const r of rows) if (r.status === 'not built') (byMs[r.b.milestone] ??= []).push(r.name);
for (const [m, names] of Object.entries(byMs)) console.log(`not built ${m}: ${names.length}`);
if (uncovered.length) { console.log('NOT IN MANIFEST:', uncovered.join(', ')); failed++; }
console.log(`report: design/report/index.html`);
process.exit(failed ? 1 : 0);
