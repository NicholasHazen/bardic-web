// Turns scan records into findings, applies the allow-list and writes design/a11y-report.json.
import fs from 'node:fs';
import path from 'node:path';
import type { AxeResult, DialogResult, KeyboardResult, MotionResult, SmallTarget, TextScaleResult, ViewportName } from './audit';

export interface Rec {
  screen: string;
  vp: ViewportName;
  error?: string;
  axe?: AxeResult;
  targets?: { total: number; small: SmallTarget[] };
  motion?: MotionResult;
  text?: TextScaleResult;
  keyboard?: KeyboardResult;
  dialog?: DialogResult | null;
  /** the pixel check of contrast that axe could not decide */
  pixels?: { checked: number; failing: { selector: string; text: string; ratio: number; need: number }[]; measured: { selector: string; ratio: number; need: number }[] };
}

export type Kind = 'axe' | 'target' | 'keyboard' | 'dialog' | 'motion' | 'textscale' | 'contrast-pixels' | 'scan';
export interface Finding {
  kind: Kind;
  rule: string;
  selector: string;
  impact?: string;
  help?: string;
  detail?: string;
  count: number;
  screens: string[];
  viewports: string[];
}
export interface AllowEntry {
  kind: Kind;
  rule: string;
  selector?: string;
  screen?: string;
  reason: string;
}

const add = (map: Map<string, Finding>, r: Rec, f: Omit<Finding, 'count' | 'screens' | 'viewports'>, n = 1) => {
  const key = `${f.kind}|${f.rule}|${f.selector}`;
  const e = map.get(key) ?? { ...f, count: 0, screens: [], viewports: [] };
  e.count += n;
  if (!e.screens.includes(r.screen)) e.screens.push(r.screen);
  if (!e.viewports.includes(r.vp)) e.viewports.push(r.vp);
  map.set(key, e);
};

export function findings(recs: Rec[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const r of recs) {
    if (r.error) add(map, r, { kind: 'scan', rule: 'could-not-scan', selector: r.screen, detail: r.error });
    const painted = new Map((r.pixels?.measured ?? []).map((m) => [m.selector, m]));
    for (const v of r.axe?.violations ?? [])
      for (const n of v.nodes) {
        const p = v.rule === 'color-contrast' ? painted.get(n.target.slice(0, 160)) : undefined;
        // axe cannot composite Bardic's backdrop-filter/gradient backgrounds. A measured
        // pass resolves that specific node; unmeasured and measured-failing nodes stay.
        if (p && p.ratio >= p.need) continue;
        add(map, r, { kind: 'axe', rule: v.rule, selector: n.target, impact: v.impact, help: v.help, detail: p !== undefined ? `painted contrast ${p.ratio}:1 | ${n.html}` : n.html });
      }
    for (const t of r.targets?.small ?? []) add(map, r, { kind: 'target', rule: 'target-size-44', selector: t.selector, detail: `"${t.name}" ${t.w}x${t.h}` });
    const flagged = new Set((r.axe?.violations ?? []).filter((v) => v.rule === 'color-contrast').flatMap((v) => v.nodes.map((n) => n.target.slice(0, 160))));
    for (const p of (r.pixels?.failing ?? []).filter((x) => !flagged.has(x.selector))) add(map, r, { kind: 'contrast-pixels', rule: 'rendered-contrast', selector: p.selector, detail: `"${p.text}" ${p.ratio}:1, needs ${p.need}:1` });
    const k = r.keyboard;
    if (k) {
      for (const u of k.unreachable) add(map, r, { kind: 'keyboard', rule: 'unreachable-by-tab', selector: u });
      if (k.trap) add(map, r, { kind: 'keyboard', rule: 'keyboard-trap', selector: r.screen, detail: k.trap });
      for (const o of k.obscuredFocus) add(map, r, { kind: 'keyboard', rule: 'focus-reaches-covered-element', selector: o, detail: 'Tab lands on a control that something else covers' });
      for (const o of k.noFocusIndicator) add(map, r, { kind: 'keyboard', rule: 'no-visible-focus-indicator', selector: o, detail: 'looks the same with and without keyboard focus' });
      if (k.inversions.length) add(map, r, { kind: 'keyboard', rule: 'tab-order', selector: r.screen, detail: k.inversions.slice(0, 3).join('; ') }, k.inversions.length);
    }
    const d = r.dialog;
    if (d) {
      if (d.count === 0) add(map, r, { kind: 'dialog', rule: 'no-dialog-role', selector: r.screen, detail: 'no visible role=dialog / aria-modal after opening' });
      if (d.unnamed) add(map, r, { kind: 'dialog', rule: 'dialog-name', selector: r.screen }, d.unnamed);
      if (d.count && !d.focusMovedIn) add(map, r, { kind: 'dialog', rule: 'focus-not-moved-in', selector: r.screen });
      if (d.escapeCloses === false) add(map, r, { kind: 'dialog', rule: 'escape-does-not-close', selector: r.screen });
      if (d.escapeLeftScreen) add(map, r, { kind: 'dialog', rule: 'escape-also-leaves-the-screen', selector: r.screen, detail: 'Escape closed the sheet and also changed the route' });
      if (d.focusReturned === false) add(map, r, { kind: 'dialog', rule: 'focus-not-returned', selector: r.screen });
    }
    for (const m of r.motion?.offenders ?? []) add(map, r, { kind: 'motion', rule: `reduced-motion-${m.kind}`, selector: m.selector, detail: `${m.name} ${m.seconds}s` });
    const t = r.text;
    if (t) {
      if (t.hscroll) add(map, r, { kind: 'textscale', rule: 'sideways-scroll-at-zoom-200', selector: r.screen, detail: `${t.hscrollBy ?? 0}px of horizontal overflow at a ${t.zoomedWidthPx}px CSS viewport` });
      for (const o of t.offscreen ?? []) add(map, r, { kind: 'textscale', rule: 'past-the-right-edge-at-zoom-200', selector: o.selector, detail: `"${o.text}" ${o.by}px beyond a ${t.zoomedWidthPx}px-wide layout` });
      for (const c of t.clipped) add(map, r, { kind: 'textscale', rule: `clipped-at-zoom-200-${c.how}`, selector: c.selector, detail: `"${c.text}"` });
      for (const o of t.overlaps) add(map, r, { kind: 'textscale', rule: 'overlap-at-zoom-200', selector: `${o.a} / ${o.b}` });
    }
  }
  return [...map.values()];
}

const ALLOW = path.resolve(import.meta.dirname, '..', 'a11y-allow.json');
export function loadAllow(): { entries: AllowEntry[]; problems: string[] } {
  const raw = JSON.parse(fs.readFileSync(ALLOW, 'utf8')) as { entries?: AllowEntry[] };
  const entries = raw.entries ?? [];
  const problems = entries.filter((e) => !e.reason || e.reason.trim().length < 10 || !e.kind || !e.rule).map((e) => `allow-list entry needs kind, rule and a real reason: ${JSON.stringify(e)}`);
  return { entries, problems };
}
export const allowed = (f: Finding, entries: AllowEntry[]) =>
  entries.some((e) => e.kind === f.kind && e.rule === f.rule && (!e.selector || f.selector.includes(e.selector)) && (!e.screen || f.screens.includes(e.screen)));

export const describe = (f: Finding) => `[${f.kind}/${f.rule}] ${f.selector.slice(0, 160)} x${f.count} on ${f.screens.slice(0, 4).join(', ')}${f.screens.length > 4 ? ` +${f.screens.length - 4}` : ''} (${f.viewports.join(', ')})${f.detail ? ` : ${f.detail.slice(0, 120)}` : ''}`;

export function writeReport(file: string, recs: Rec[], extra: Record<string, unknown>) {
  const all = findings(recs);
  const byRule: Record<string, number> = {};
  for (const f of all) byRule[`${f.kind}/${f.rule}`] = (byRule[`${f.kind}/${f.rule}`] ?? 0) + 1;
  const incomplete = new Map<string, { rule: string; nodes: number; screens: Set<string> }>();
  for (const r of recs)
    for (const i of r.axe?.incomplete ?? []) {
      const e = incomplete.get(i.rule) ?? { rule: i.rule, nodes: 0, screens: new Set() };
      e.nodes += i.nodes.length;
      e.screens.add(r.screen);
      incomplete.set(i.rule, e);
    }
  const screens = [...new Set(recs.map((r) => r.screen))];
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    ...extra,
    scans: recs.length,
    screens,
    viewports: [...new Set(recs.map((r) => r.vp))],
    summary: { findingsByRule: byRule, targetsChecked: recs.reduce((n, r) => n + (r.targets?.total ?? 0), 0), screensThatCouldNotBeScanned: recs.filter((r) => r.error).map((r) => `${r.screen} @ ${r.vp}`) },
    axeIncomplete: [...incomplete.values()].map((i) => ({ rule: i.rule, nodes: i.nodes, screens: [...i.screens].length })),
    findings: all
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.rule.localeCompare(b.rule) || b.count - a.count)
      .map((f) => ({ ...f, selector: f.selector.slice(0, 200), detail: f.detail?.slice(0, 140), screens: f.screens.slice(0, 12), moreScreens: Math.max(0, f.screens.length - 12) || undefined })),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
}
