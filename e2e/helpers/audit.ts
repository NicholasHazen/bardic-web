// Accessibility checks driven from Playwright. axe-core (MIT, a devDependency) is injected from node_modules with
// page.addScriptTag, not through @axe-core/playwright, so there is one dependency and no wrapper. The checks that axe does
// not do (touch targets, keyboard path, dialogs, reduced motion, text scaling) live in inpage.js.
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const INPAGE = path.resolve(import.meta.dirname, 'inpage.js');
export const AXE_VERSION: string = require('axe-core/package.json').version;

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  'tablet-landscape': { width: 1194, height: 834 },
  'tablet-portrait': { width: 834, height: 1194 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function inject(page: Page) {
  if (!(await page.evaluate(() => typeof (window as any).axe !== 'undefined'))) await page.addScriptTag({ path: AXE });
  if (!(await page.evaluate(() => typeof (window as any).__audit !== 'undefined'))) await page.addScriptTag({ path: INPAGE });
}

export interface AxeNode {
  target: string;
  html: string;
}
export interface AxeFinding {
  rule: string;
  impact: string;
  help: string;
  nodes: AxeNode[];
}
export interface AxeResult {
  violations: AxeFinding[];
  incomplete: AxeFinding[];
  passes: number;
}

export async function axeScan(page: Page): Promise<AxeResult> {
  await inject(page);
  return page.evaluate(async (tags) => {
    const r = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
    const shape = (list: any[]) =>
      list.map((v) => ({
        rule: v.id,
        impact: v.impact ?? 'minor',
        help: v.help,
        nodes: v.nodes.map((n: any) => ({ target: Array.isArray(n.target[0]) ? n.target[0].join(' ') : n.target.join(' '), html: String(n.html).slice(0, 140) })),
      }));
    return { violations: shape(r.violations), incomplete: shape(r.incomplete), passes: r.passes.length };
  }, TAGS);
}

export interface SmallTarget {
  selector: string;
  name: string;
  w: number;
  h: number;
  role: string;
}
export const targetScan = async (page: Page): Promise<{ total: number; small: SmallTarget[] }> => {
  await inject(page);
  return page.evaluate(() => (window as any).__audit.targets(44));
};

export interface KeyboardResult {
  focusable: number;
  visited: number;
  unreachable: string[];
  inversions: string[];
  trap: string | null;
  offScreenFocus: string[];
  /** focus landed on an element that something else covers (a screen behind a sheet or another screen) */
  obscuredFocus: string[];
  /** focused elements that look the same with and without focus */
  noFocusIndicator: string[];
  indicatorsChecked: number;
  truncated: boolean;
}

/** Press Tab through the page and compare with what could be focused. `scope` limits "unreachable" to the dialog on top. */
export async function keyboardScan(page: Page, cap = 90): Promise<KeyboardResult> {
  await inject(page);
  await page.evaluate(() => (window as any).__audit.rememberFocus());
  const list: any[] = await page.evaluate(() => (window as any).__audit.focusables());
  const dialogOpen = (await page.evaluate(() => (window as any).__audit.dialogs())).some((d: { modal: boolean }) => d.modal);
  const expected = dialogOpen ? list.filter((f) => f.inDialog) : list;
  if (!dialogOpen) await page.evaluate(() => (window as any).__audit.resetFocus());
  const seen: any[] = [];
  const seenSel = new Set<string>();
  let trap: string | null = null;
  let last: string | null = null;
  let same = 0;
  const limit = Math.min(expected.length + 4, cap);
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    const a: any = await page.evaluate(() => (window as any).__audit.active());
    if (!a) {
      if (!dialogOpen && seen.length) break; // focus left the page (browser UI), the cycle is complete
      continue;
    }
    same = a.selector === last ? same + 1 : 0;
    last = a.selector;
    if (same >= 2 && expected.length > 1) {
      trap = `focus stays on ${a.selector} ("${a.name}") when Tab is pressed`;
      break;
    }
    if (seenSel.has(a.selector + a.cx + a.cy)) break; // the cycle wrapped
    seenSel.add(a.selector + a.cx + a.cy);
    seen.push(a);
  }
  await page.evaluate(() => (window as any).__audit.endFocus());
  const indicators: { checked: number; missing: any[] } = await page.evaluate(() => (window as any).__audit.focusIndicators());
  const noFocusIndicator = indicators.missing;
  // elements that were there when the walk started and are gone now (a field that turns back into a button when it loses focus) are not "unreachable"
  const stillThere = new Set<string>((await page.evaluate(() => (window as any).__audit.focusables())).map((f: any) => f.selector));
  const visitedSel = new Set(seen.map((s) => s.selector));
  const groupsHit = new Set<string>();
  for (const f of expected) if (visitedSel.has(f.selector) && f.group) groupsHit.add(f.group);
  const unreachable = expected
    .filter((f) => !visitedSel.has(f.selector))
    .filter((f) => stillThere.has(f.selector))
    .filter((f) => !(f.radio && f.group && groupsHit.has(f.group))) // a radio group is one tab stop; arrows move inside it
    .filter((f) => !(f.group && groupsHit.has(f.group))) // roving tabindex groups (menus, tabs)
    .map((f) => `${f.selector} ("${f.name}")${f.tabindex < 0 ? ' [tabindex=-1]' : ''}`);
  const inversions: string[] = [];
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1], b = seen[i];
    if (a.fixed || b.fixed || a.popup || b.popup || dialogOpen) continue;
    if (a.column && b.column && a.column !== b.column) continue;
    const tol = Math.min(a.h, b.h) / 2;
    const above = a.cy - b.cy > tol;
    const sameRow = Math.abs(a.cy - b.cy) <= tol;
    if (above || (sameRow && b.cx + 2 < a.cx)) inversions.push(`"${a.name}" -> "${b.name}"`);
  }
  const offScreenFocus = seen.filter((s) => !s.onScreen).map((s) => `${s.selector} ("${s.name}")`);
  const escaped = dialogOpen ? seen.filter((s) => !s.inDialog).map((s) => `${s.selector} ("${s.name}")`) : [];
  if (escaped.length && !trap) trap = `focus left the open dialog: ${escaped.slice(0, 3).join(', ')}`;
  const obscuredFocus = seen.filter((s) => s.covered).map((s) => `${s.selector} ("${s.name}")`);
  await page.evaluate(() => (window as any).__audit.restoreFocus());
  return {
    focusable: expected.length,
    visited: seen.length,
    unreachable,
    inversions,
    trap,
    offScreenFocus: offScreenFocus.slice(0, 5),
    obscuredFocus,
    noFocusIndicator: noFocusIndicator.map((f) => `${f.selector} ("${f.name}")`),
    indicatorsChecked: indicators.checked,
    truncated: expected.length + 4 > cap,
  };
}

export interface DialogResult {
  count: number;
  names: string[];
  unnamed: number;
  focusMovedIn: boolean;
  escapeCloses: boolean | null;
  focusReturned: boolean | null;
  /** pressing Escape also changed the route (it closed the sheet and left the screen) */
  escapeLeftScreen: boolean;
}

/** What a sheet does for the keyboard. Call with the sheet open; it presses Escape. */
export async function dialogScan(page: Page, hasOpener: boolean): Promise<DialogResult> {
  await inject(page);
  const ds: any[] = await page.evaluate(() => (window as any).__audit.dialogs());
  const res: DialogResult = { count: ds.length, names: ds.map((d) => d.name), unnamed: ds.filter((d) => !d.name).length, focusMovedIn: ds.some((d) => d.hasFocus), escapeCloses: null, focusReturned: null, escapeLeftScreen: false };
  if (!ds.length) return res;
  const hashBefore = await page.evaluate(() => location.hash);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  res.escapeLeftScreen = (await page.evaluate(() => location.hash)) !== hashBefore;
  const after: any[] = await page.evaluate(() => (window as any).__audit.dialogs());
  const top = ds.at(-1);
  res.escapeCloses = !after.some((d) => d.name === top.name && d.selector === top.selector);
  // A replacement sheet can remove the original opener (e.g. the estimate explainer).
  // Focus return is testable only while that opener remains in the document.
  if (res.escapeCloses && hasOpener && await page.locator('[data-audit-opener]').count()) res.focusReturned = await page.evaluate(() => (window as any).__audit.focusIsOnOpener());
  return res;
}

export interface MotionResult {
  count: number;
  running: number;
  offenders: { selector: string; kind: string; name: string; seconds: number }[];
}
export async function motionScan(page: Page): Promise<MotionResult> {
  await inject(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  try {
    return await page.evaluate(() => (window as any).__audit.motion(0.3));
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
}

export interface TextScaleResult {
  scaledRatio: number;
  hscroll: boolean;
  hscrollBy?: number;
  clipped: { selector: string; text: string; how: string; by?: string }[];
  overlaps: { a: string; b: string }[];
  offscreen: { selector: string; text: string; by: number }[];
  zoomedWidthPx?: number;
  textElements: number;
}
export async function textScaleScan(page: Page, screen?: string): Promise<TextScaleResult> {
  await inject(page);
  const viewport = page.viewportSize()!;
  const baseline = await page.evaluate(() => (window as any).__audit.layoutSnapshot());
  // Browser zoom halves the CSS layout viewport at 200% and leaves CSS font sizes alone.
  // Resizing gives the same reflow/media-query behavior; CSS `zoom` and changing html's
  // font-size do not. Record this as a browser-zoom reflow check, not an OS font-size test.
  try {
    await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) });
    await settle(page, 100);
    if (process.env.AUDIT_SHOTS && screen) await page.screenshot({ path: `/tmp/a11y-zoom-${screen.replace(/\W+/g, '-')}.png` });
    return await page.evaluate((base) => (window as any).__audit.zoomProblems(base), baseline);
  } finally {
    await page.setViewportSize(viewport);
    await settle(page, 100);
  }
}

export async function settle(page: Page, ms = 450) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
