// W6 accessibility audit. One real bardic-server (fake Breeze and Gemini), one browser page, and a long walk through every
// reachable screen in the order the data allows (empty first, then books, plans, playing, downloads, and the server cut off).
// Each screen is scanned at 390x844 (phone) and at 1194x834 and 834x1194 (tablet) with:
//   - axe-core: wcag2a, wcag2aa, wcag21a, wcag21aa and best-practice, including color-contrast;
//   - every interactive element's box against 44x44 (a hit area enlarged by a pseudo-element is detected with elementFromPoint);
//   - on the phone: prefers-reduced-motion offenders, text at 200% (clipping, overlap, sideways scroll), the Tab path;
//   - for sheets: name, focus moved in, focus stays in, Escape closes, focus returns to the opener.
// The scan test never fails on a finding: it records. The last test applies e2e/a11y-allow.json and fails on anything left.
// Run:  VITE_E2E=1 BARDIC_DIST=dist-audit npx vite build --outDir dist-audit --emptyOutDir
//       BARDIC_DIST=dist-audit npx playwright test --config=playwright.audit.config.ts e2e/a11y.spec.ts --output=/tmp/pw-audit
// Filter while working: AUDIT_ONLY=<regex on screen names>  AUDIT_VP=phone,tablet-portrait
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { startStack, apiCall, type Running } from './harness';
import { startBreeze, startGemini, type Fake, type GeminiFake } from './fakes';
import { AXE_VERSION, VIEWPORTS, axeScan, dialogScan, inject, keyboardScan, motionScan, settle, targetScan, textScaleScan, type ViewportName } from './helpers/audit';
import { allowed, describe, findings, loadAllow, writeReport, type Rec } from './helpers/findings';
import { contrastByPixels } from './helpers/contrast';
import { DEV, configureBreeze, freeVoiceId, importFile, mkListener, readyAudiobook, tideEpub } from './helpers/world';
import { epub } from './zip';

/* eslint-disable @typescript-eslint/no-explicit-any */
const REPORT = path.resolve(import.meta.dirname, '..', 'design', 'a11y-report.json');
const ONLY = process.env.AUDIT_ONLY ? new RegExp(process.env.AUDIT_ONLY, 'i') : null;
const VPS = (process.env.AUDIT_VP ? process.env.AUDIT_VP.split(',') : Object.keys(VIEWPORTS)) as ViewportName[];

interface Ctx {
  page: Page;
  context: BrowserContext;
  stack: Running;
  breeze: Fake;
  gemini: GeminiFake;
  w: World;
  releaseDownload?: () => void;
}
interface World {
  nick: string;
  sam: string;
  sample?: string;
  tide?: string;
  harbour?: string;
  plain?: string;
  sampleAb?: string;
  harbourAb?: string;
  tideAb?: string;
  tideChapters?: string[];
  auditDelete?: string;
  auditRemoved?: string;
}
interface Screen {
  name: string;
  /** Put the app in this state. Sheets: open them and pass the opener to `mark`. */
  setup: (c: Ctx, mark: (l: Locator) => Promise<void>) => Promise<void>;
  /** The screen is a sheet or dialog: test the keyboard contract of dialogs. */
  sheet?: boolean;
  /** Skip the Tab walk (a very long list). */
  noTab?: boolean;
  /** Route-backed dialogs intentionally return to this route when dismissed. */
  closeRoute?: string | ((c: Ctx) => string);
  /** Called after the screen was scanned at each viewport. */
  afterEach?: (c: Ctx) => Promise<void>;
  /** Called once after the screen was scanned at every viewport. */
  after?: (c: Ctx) => Promise<void>;
}
interface Phase {
  name: string;
  seed?: (c: Ctx) => Promise<void>;
  screens: Screen[];
}

const go = async (page: Page, hash: string) => {
  const target = `/?e2e=offline#${hash}`;
  const here = new URL(page.url(), 'http://x');
  if (page.url() !== 'about:blank' && here.search === '?e2e=offline') await page.evaluate((h) => (location.hash = h), `#${hash}`);
  else await page.goto(target);
  await page.waitForTimeout(150);
};
const mk = (page: Page) => async (l: Locator) => {
  await l.waitFor({ state: 'visible', timeout: 8000 });
  await l.evaluate((el) => {
    document.querySelectorAll('[data-audit-opener]').forEach((e) => e.removeAttribute('data-audit-opener'));
    el.setAttribute('data-audit-opener', '1');
  });
  await l.click();
};
const btn = (page: Page, name: string | RegExp, exact = false) => page.getByRole('button', { name, exact }).first();
const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first();
const api = (c: Ctx, m: string, p: string, body?: unknown, listener = c.w.nick) => apiCall(c.stack.api, m, p, body, DEV, listener);

/** Read mode: the Listen/Read switch on phones and portrait tablets; landscape tablets show the text beside the player. */
async function readMode(page: Page) {
  const size = page.viewportSize()!;
  if (size.width >= 768 && size.width > size.height) return;
  const r = page.getByRole('radio', { name: 'Read' });
  await r.waitFor({ state: 'visible' });
  await r.click();
  await expect(r).toBeChecked();
}

async function readerTheme(page: Page, name: 'Night' | 'Aura') {
  await page.getByRole('button', { name: 'Text settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Text and colour' });
  await dialog.getByRole('radio', { name, exact: true }).click();
  const done = dialog.getByRole('button', { name: 'Done', exact: true });
  if (await done.isVisible()) await done.click();
  else await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

async function clearAuditDownload(c: Ctx) {
  c.releaseDownload?.();
  c.releaseDownload = undefined;
  await c.context.unroute('**/api/audio/*');
  await c.page.evaluate(async (ab) => {
    const o = (window as any).__offline;
    if (o) { o.cancel(ab); await o.remove(ab); }
  }, c.w.harbourAb!);
}

async function downloadingHarbour(c: Ctx) {
  await go(c.page, `/book/${c.w.harbour}`);
  await c.page.reload();
  await c.page.waitForFunction(() => !!(window as any).__offline);
  await clearAuditDownload(c);
  const held = new Promise<void>((resolve) => { c.releaseDownload = resolve; });
  await c.context.route('**/api/audio/*', async (route) => {
    if (!route.request().headers()['range']) await held;
    await route.continue().catch(() => {});
  });
  await c.page.getByRole('button', { name: 'Download', exact: true }).click();
  await c.page.getByRole('dialog').getByRole('button', { name: /^Download\b/ }).click();
  await expect.poll(() => c.page.evaluate((ab) => new Promise<string | null>((resolve) => {
    (window as any).__offline.subscribe((s: any) => resolve(s.books.find((b: any) => b.audiobookId === ab)?.status ?? null))();
  }), c.w.harbourAb!)).toBe('running');
  await c.page.getByText('Downloading · Mara', { exact: true }).waitFor();
}

async function chooseNick(page: Page) {
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
}

// ---------------------------------------------------------------------------------------------------------- the walk
const phases: Phase[] = [
  {
    name: 'first run',
    screens: [{ name: 'First listener', setup: async ({ page }) => { await page.goto('/?e2e=offline'); await page.getByText('Welcome to Bardic').waitFor(); } }],
  },
  {
    name: 'chooser',
    seed: async (c) => {
      c.w.nick = await mkListener(c.stack.api, 'Nick');
      c.w.sam = await mkListener(c.stack.api, 'Sam');
    },
    screens: [
      { name: 'Who is listening (chooser)', setup: async ({ page }) => { await page.goto('/?e2e=offline'); await page.getByText('Who’s listening?').waitFor(); } },
    ],
    // the next phase starts signed in
  },
  {
    name: 'empty library',
    seed: async ({ page }) => {
      await page.goto('/?e2e=offline');
      await chooseNick(page);
    },
    screens: [
      { name: 'Home (empty)', setup: async ({ page }) => { await go(page, '/'); await page.getByText('Add your first book').waitFor(); } },
      { name: 'Library (empty)', setup: async ({ page }) => { await go(page, '/library'); await page.getByText('Your library is empty.').waitFor(); } },
      { name: 'Add a book sheet', sheet: true, setup: async ({ page }) => { await go(page, '/library'); await mk(page)(page.getByRole('button', { name: 'Add a book' }).first()); await page.getByRole('dialog').waitFor(); } },
      { name: 'Manage (empty)', setup: async ({ page }) => { await go(page, '/library/manage'); await page.waitForTimeout(300); } },
      { name: 'Settings', setup: async ({ page }) => { await go(page, '/settings'); await page.getByRole('heading', { name: 'Settings' }).waitFor(); } },
      { name: 'Settings > Listening behaviour', setup: async ({ page }) => { await go(page, '/settings/listening'); await page.getByRole('heading', { name: 'Listening behaviour' }).waitFor(); } },
      { name: 'Settings > Reader appearance', sheet: true, closeRoute: '#/settings', setup: async ({ page }, mark) => { await go(page, '/settings'); await mark(page.getByRole('link', { name: /Reader appearance/ })); await page.getByRole('dialog').waitFor(); } },
      { name: 'Settings > About this Bardic', setup: async ({ page }) => { await go(page, '/settings/about'); await page.getByRole('heading', { name: 'About this Bardic' }).waitFor(); } },
      { name: 'Settings > Voices (nothing set up)', setup: async ({ page }) => { await go(page, '/settings/voices'); await page.waitForTimeout(500); } },
      { name: 'Settings > Breeze server (not set up)', setup: async ({ page }) => { await go(page, '/settings/voices/breeze'); await page.waitForTimeout(500); } },
      { name: 'Settings > Default voice (none)', setup: async ({ page }) => { await go(page, '/settings/voices/default'); await page.waitForTimeout(500); } },
      { name: 'Settings > Premium voices (no key)', setup: async ({ page }) => { await go(page, '/settings/premium'); await page.getByText('Not set up', { exact: true }).waitFor(); } },
      { name: 'Settings > Allowance (empty)', setup: async ({ page }) => { await go(page, '/settings/allowance'); await page.waitForTimeout(500); } },
      { name: 'Settings > Downloads (none)', setup: async ({ page }) => { await go(page, '/settings/downloads'); await page.waitForTimeout(500); } },
      { name: 'Settings > Listeners', setup: async ({ page }) => { await go(page, '/settings/listeners'); await page.getByRole('button', { name: 'Add a listener' }).waitFor(); } },
      { name: 'Listeners > Add a listener sheet', sheet: true, setup: async ({ page }) => { await go(page, '/settings/listeners'); await mk(page)(page.getByRole('button', { name: 'Add a listener' })); await page.getByRole('dialog').waitFor(); } },
      { name: 'Listeners > Edit a listener sheet', sheet: true, setup: async ({ page }) => { await go(page, '/settings/listeners'); await mk(page)(page.getByRole('button', { name: 'Edit Sam' })); await page.getByRole('dialog').waitFor(); } },
      { name: 'Switch listener sheet', sheet: true, setup: async ({ page }) => { await go(page, '/'); await mk(page)(page.getByRole('button', { name: /Listening as Nick/ })); await page.getByRole('dialog').waitFor(); } },
    ],
  },
  {
    name: 'library with books',
    seed: async (c) => {
      const { stack, breeze, gemini } = c;
      await configureBreeze(stack.api, breeze);
      expect((await apiCall(stack.api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
      await apiCall(stack.api, 'PUT', '/api/prices/gemini', { unit: 'million_characters', per_unit: { micros: 18_200_000, currency: 'USD' } }, DEV, c.w.nick);
      const voice = await freeVoiceId(stack.api, c.w.nick);
      c.w.sample = (await api(c, 'POST', '/api/books/sample', {})).json.id;
      c.w.sampleAb = await readyAudiobook(stack.api, c.w.nick, c.w.sample!, voice);
      c.w.harbour = await importFile(stack.api, c.w.nick, 'harbour.epub', epub({ title: 'Harbour Lights', titles: ['The Crossing', 'The Far Shore', 'The Long Wait'] }), 'application/epub+zip');
      c.w.harbourAb = await readyAudiobook(stack.api, c.w.nick, c.w.harbour, voice);
      c.w.tide = await importFile(stack.api, c.w.nick, 'tide.epub', tideEpub(), 'application/epub+zip');
      c.w.plain = await importFile(stack.api, c.w.nick, 'plain.epub', epub({ title: 'Unmade Pages', titles: ['One', 'Two'] }), 'application/epub+zip');
      const chapters = (await api(c, 'GET', `/api/books/${c.w.tide}/chapters`)).json.items as { id: string }[];
      c.w.tideChapters = chapters.map((x) => x.id);
      const kore = ((await api(c, 'GET', '/api/voices')).json.items as { id: string; name: string }[]).find((v) => v.name === 'Kore')!;
      c.w.tideAb = (await api(c, 'POST', `/api/books/${c.w.tide}/audiobooks`, { voice_id: kore.id })).json.id;
      // a place in the sample, so Home has a Continue card
      const chs = (await api(c, 'GET', `/api/books/${c.w.sample}/chapters`)).json.items as { id: string }[];
      await api(c, 'PUT', `/api/books/${c.w.sample}/place`, { chapter_id: chs[1]!.id, offset: 40, mode: 'listening', audiobook_id: c.w.sampleAb, base_revision: 0 });
      void gemini;
    },
    screens: [
      { name: 'Home (with books)', setup: async ({ page }) => { await go(page, '/'); await page.getByText('The Lantern Keeper').first().waitFor(); await page.waitForTimeout(400); } },
      { name: 'Library (with books)', setup: async ({ page }) => { await go(page, '/library'); await page.getByText('4 books').waitFor(); } },
      {
        name: 'Library > sort menu',
        setup: async ({ page }, mark) => { await go(page, '/library'); await page.getByText('4 books').waitFor(); await mark(page.getByRole('button', { name: /Recently read/ })); await page.getByRole('menu').waitFor(); },
      },
      { name: 'Library > search open', setup: async ({ page }) => { await go(page, '/library'); await page.getByText('4 books').waitFor(); const f = page.getByRole('searchbox', { name: 'Find a book' }); if (!(await f.isVisible())) await btn(page, 'Search', true).click(); await f.fill('lantern'); await page.waitForTimeout(500); }, afterEach: async ({ page }) => { const f = page.getByRole('searchbox', { name: 'Find a book' }); if (await f.isVisible()) await f.fill(''); await page.waitForTimeout(400); } },
      { name: 'Library > no match', setup: async ({ page }) => { await go(page, '/library'); const f = page.getByRole('searchbox', { name: 'Find a book' }); if (!(await f.isVisible())) await btn(page, 'Search', true).click(); await f.fill('zzzzqq'); await page.getByText(/No book matches/).waitFor(); }, afterEach: async ({ page }) => { const f = page.getByRole('searchbox', { name: 'Find a book' }); if (await f.isVisible()) await f.fill(''); await page.waitForTimeout(400); } },
      { name: 'Manage (with books)', setup: async ({ page }) => { await go(page, '/library/manage'); await page.getByText('The Lantern Keeper').first().waitFor(); } },
      { name: 'Book (free audiobook, all ready)', setup: async (c) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await c.page.getByRole('heading', { name: 'The Lantern Keeper' }).waitFor(); await c.page.getByText(/3 of 3 chapters ready/).waitFor(); } },
      { name: 'Book (premium audiobook, nothing made)', setup: async (c) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await c.page.getByRole('heading', { name: 'Tide Tables' }).waitFor(); await c.page.locator('[data-section="audiobook"]').waitFor(); } },
      { name: 'Book (no audiobook yet)', setup: async (c) => { await go(c.page, `/book/${c.w.plain}`); await c.page.reload(); await c.page.getByRole('heading', { name: 'Unmade Pages' }).waitFor(); await c.page.waitForTimeout(400); } },
      {
        name: 'Voice chooser sheet',
        sheet: true,
        setup: async (c, mark) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await mark(c.page.locator('[data-section="audiobook"]').getByRole('button', { name: /^Change/ })); await c.page.getByRole('dialog', { name: 'Choose a voice' }).waitFor(); },
      },
      {
        name: 'Voice chooser sheet (premium tab)',
        sheet: true,
        setup: async (c, mark) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await mark(c.page.locator('[data-section="audiobook"]').getByRole('button', { name: /^Change/ })); const d = c.page.getByRole('dialog', { name: 'Choose a voice' }); await d.getByRole('radio', { name: 'Premium' }).click(); await d.getByRole('radio', { name: /Kore/ }).click(); await c.page.waitForTimeout(300); },
      },
      { name: 'Settings (voices set up)', setup: async ({ page }) => { await go(page, '/settings'); await page.getByRole('heading', { name: 'Settings' }).waitFor(); await page.waitForTimeout(400); } },
      { name: 'Settings > Voices (Breeze and Gemini)', setup: async ({ page }) => { await go(page, '/settings/voices'); await page.waitForTimeout(600); } },
      { name: 'Settings > Breeze server (connected)', setup: async ({ page }) => { await go(page, '/settings/voices/breeze'); await page.waitForTimeout(600); } },
      { name: 'Settings > Default voice', setup: async ({ page }) => { await go(page, '/settings/voices/default'); await page.waitForTimeout(600); } },
      { name: 'Settings > Premium voices (connected)', setup: async ({ page }) => { await go(page, '/settings/premium'); await page.getByText('Connected', { exact: true }).waitFor(); } },
      { name: 'Settings > Allowance (monthly limit)', setup: async ({ page }) => { await go(page, '/settings/allowance'); await page.waitForTimeout(600); } },
    ],
  },
  {
    name: 'plans',
    screens: [
      {
        name: 'Plan sheet (preview)',
        sheet: true,
        setup: async (c, mark) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await mark(c.page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Plan the whole book' })); await c.page.getByRole('dialog', { name: 'Make ready' }).getByRole('button', { name: /^Approve plan/ }).waitFor(); },
      },
      {
        name: 'Plan sheet > how the estimate works',
        sheet: true,
        setup: async (c, mark) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await c.page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Plan the whole book' }).click(); const d = c.page.getByRole('dialog', { name: 'Make ready' }); await d.getByRole('button', { name: /^Approve plan/ }).waitFor(); await mark(d.getByRole('button', { name: 'Why a range?' })); await c.page.getByRole('dialog', { name: 'How this estimate works' }).waitFor(); },
      },
      {
        name: 'Plan sheet > limit field',
        sheet: true,
        setup: async (c) => { await go(c.page, `/book/${c.w.tide}`); await c.page.reload(); await c.page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Plan the whole book' }).click(); const d = c.page.getByRole('dialog', { name: 'Make ready' }); await d.getByRole('button', { name: /^Limit for this plan:/ }).click(); await d.getByRole('textbox', { name: /^Limit for this plan/ }).fill('0.01'); await c.page.waitForTimeout(300); },
      },
      {
        name: 'Plan sheet (blocked by the monthly limit)',
        sheet: true,
        setup: async (c, mark) => {
          // a monthly limit below what a plan needs: the sheet says so and offers no Approve
          const cur = (await api(c, 'GET', '/api/allowance')).json;
          await api(c, 'PUT', '/api/allowance', { monthly_limit: { micros: 1000, currency: 'USD' }, default_plan_limit: cur.default_plan_limit });
          await go(c.page, `/book/${c.w.tide}`);
          await c.page.reload();
          await mark(c.page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Plan the whole book' }));
          await c.page.getByRole('dialog', { name: 'Make ready' }).waitFor();
          await c.page.waitForTimeout(600);
        },
        after: async (c) => {
          const cur = (await api(c, 'GET', '/api/allowance')).json;
          await api(c, 'PUT', '/api/allowance', { monthly_limit: null, default_plan_limit: cur.default_plan_limit });
        },
      },
      {
        name: 'Book (plan running)',
        setup: async (c) => {
          c.gemini.setDelay(60_000); // the chapter stays "being made" for the whole scan
          await go(c.page, `/book/${c.w.tide}`);
          await c.page.reload();
          const running = c.page.locator('[data-plan-state="making"]');
          if (!(await running.isVisible())) {
            await c.page.locator('[data-section="audiobook"]').getByRole('button', { name: 'Plan the whole book' }).click();
            await c.page.getByRole('dialog', { name: 'Make ready' }).getByRole('button', { name: /^Approve plan/ }).click();
          }
          await running.waitFor({ timeout: 15000 });
          await c.page.waitForTimeout(400);
        },
      },
      {
        name: 'Book (plan paused)',
        setup: async (c) => {
          await go(c.page, `/book/${c.w.tide}`);
          await c.page.reload();
          const card = c.page.locator('[data-section="audiobook"]');
          if (await card.locator('[data-plan-state="making"]').isVisible()) await card.getByRole('button', { name: 'Pause' }).click();
          await c.page.locator('[data-plan-state="paused"]').waitFor({ timeout: 20000 });
          await c.page.waitForTimeout(300);
        },
      },
      {
        name: 'Book (plan stopped, audio kept)',
        setup: async (c) => {
          const plans = (await api(c, 'GET', '/api/plans')).json.items as { id: string; state: string }[];
          for (const p of plans) if (['running', 'paused'].includes(p.state)) await api(c, 'POST', `/api/plans/${p.id}/stop`, {});
          expect((await api(c, 'DELETE', `/api/audiobooks/${c.w.tideAb}/space`)).status).toBe(200);
          c.gemini.setDelay(2000); // allow one chapter to finish, then stop before the next does
          await go(c.page, `/book/${c.w.tide}`);
          await c.page.reload();
          const card = c.page.locator('[data-section="audiobook"]');
          await card.getByRole('button', { name: 'Plan the whole book' }).click();
          await c.page.getByRole('dialog', { name: 'Make ready' }).getByRole('button', { name: /^Approve plan/ }).click();
          await card.locator('[data-plan-state="making"]').waitFor();
          await expect.poll(async () => (await api(c, 'GET', `/api/audiobooks/${c.w.tideAb}`)).json.chapters_ready, { timeout: 30000 }).toBeGreaterThan(0);
          await card.getByRole('button', { name: 'Stop making it ready' }).click();
          await card.getByText('Plan stopped', { exact: true }).waitFor();
          expect((await api(c, 'GET', `/api/audiobooks/${c.w.tideAb}`)).json.chapters_ready).toBeGreaterThan(0);
          c.gemini.setDelay(0);
        },
      },
      {
        name: 'Book (plan finished)',
        setup: async (c) => {
          c.gemini.setDelay(0);
          // The ended card is transient. Make a new plan finish while this page
          // is open at each viewport, using only the synthetic fake-provider audio.
          expect((await api(c, 'DELETE', `/api/audiobooks/${c.w.tideAb}/space`)).status).toBe(200);
          await go(c.page, `/book/${c.w.tide}`);
          await c.page.reload();
          const card = c.page.locator('[data-section="audiobook"]');
          await card.getByRole('button', { name: /^(Plan|Make)/ }).first().click();
          const d = c.page.getByRole('dialog', { name: 'Make ready' });
          const approve = d.getByRole('button', { name: /^(Approve plan|Resume|Continue)/ });
          await approve.waitFor({ state: 'visible' });
          await approve.click();
          await card.getByText('Plan finished').waitFor({ timeout: 60000 });
          await c.page.waitForTimeout(400);
        },
      },
      {
        name: 'Premium voices (key rejected)',
        setup: async (c) => {
          c.gemini.setKey('rotated-key');
          await api(c, 'POST', '/api/voice-sources/gemini/test', {}).catch(() => {});
          await go(c.page, '/settings/premium');
          await c.page.reload();
          await c.page.waitForTimeout(1500);
        },
        after: async (c) => {
          c.gemini.setKey('test-key');
          await api(c, 'POST', '/api/voice-sources/gemini/test', {}).catch(() => {});
        },
      },
    ],
  },
  {
    name: 'player',
    seed: async (c) => {
      const p = c.page;
      await go(p, `/book/${c.w.sample}`);
      await p.reload();
      await p.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
      await expect(p).toHaveURL(new RegExp(`#/listen/${c.w.sample}`));
      await p.getByRole('button', { name: 'Pause' }).first().waitFor({ timeout: 20000 });
      await p.getByRole('button', { name: 'Pause' }).first().click(); // the sample is a few seconds long: scan it paused, or it plays to the end
    },
    screens: [
      { name: 'Now Playing (Listen)', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await c.page.getByRole('region', { name: 'Now playing' }).waitFor(); await c.page.waitForTimeout(500); } },
      {
        name: 'Now Playing (playing)',
        setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await c.page.evaluate(() => { const p = (window as any).__player; let st: any; p.subscribe((v: any) => (st = v))(); p.gotoChapter(st.chapters[0].id); p.pause(); }); await c.page.getByRole('button', { name: 'Play' }).first().click(); await c.page.getByRole('button', { name: 'Pause' }).first().waitFor(); },
        afterEach: async (c) => { await c.page.evaluate(() => (window as any).__player.pause()); },
      },
      { name: 'Now Playing > speed sheet', sheet: true, setup: async (c, mark) => { await go(c.page, `/listen/${c.w.sample}`); await mark(c.page.getByRole('button', { name: /^Speed/ }).first()); await c.page.getByRole('dialog').waitFor(); } },
      { name: 'Now Playing > sleep sheet', sheet: true, setup: async (c, mark) => { await go(c.page, `/listen/${c.w.sample}`); await mark(c.page.getByRole('button', { name: /^Sleep/ }).first()); await c.page.getByRole('dialog').waitFor(); } },
      { name: 'Now Playing > chapters sheet', sheet: true, setup: async (c, mark) => { await go(c.page, `/listen/${c.w.sample}`); await mark(c.page.getByRole('button', { name: 'Chapters' }).first()); await c.page.getByRole('dialog').waitFor(); } },
      { name: 'Now Playing (Read)', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await readMode(c.page); await c.page.getByText(/chapter \d of 3/i).first().waitFor(); await c.page.waitForTimeout(500); } },
      { name: 'Now Playing (Read, Night)', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await readMode(c.page); await readerTheme(c.page, 'Night'); await c.page.waitForTimeout(300); }, afterEach: async (c) => { await readerTheme(c.page, 'Aura'); } },
      { name: 'Read > appearance sheet', sheet: true, setup: async (c, mark) => { await go(c.page, `/listen/${c.w.sample}`); await readMode(c.page); await mark(c.page.getByRole('button', { name: 'Text settings' })); await c.page.getByRole('dialog').waitFor(); } },
      { name: 'Read > find in book (screen)', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await readMode(c.page); await c.page.keyboard.press('Control+f'); await c.page.getByRole('searchbox').or(c.page.getByRole('textbox')).first().fill('lamp'); await c.page.getByText(/passage/i).first().waitFor({ timeout: 10000 }); } },
      { name: 'Read > find in book, no match', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await readMode(c.page); await c.page.keyboard.press('Control+f'); await c.page.getByRole('searchbox').or(c.page.getByRole('textbox')).first().fill('zzzzqqqq'); await c.page.getByText(/no passage|No results|nothing/i).first().waitFor({ timeout: 10000 }); } },
      { name: 'Mini-player on Library', setup: async (c) => { await go(c.page, `/listen/${c.w.sample}`); await btn(c.page, 'Minimise').click(); await go(c.page, '/library'); await c.page.getByRole('button', { name: /^Open Now Playing/ }).waitFor(); } },
      {
        name: 'Now Playing > place conflict sheet',
        sheet: true,
        closeRoute: (c) => `#/book/${c.w.sample}`,
        setup: async (c) => {
          const p = c.page;
          await go(p, `/listen/${c.w.sample}`);
          const pause = p.getByRole('button', { name: 'Pause' }).first();
          if (await pause.isVisible()) await pause.click();
          await p.waitForTimeout(1500);
          const cur = (await api(c, 'GET', `/api/books/${c.w.sample}/place`)).json;
          const chs = (await api(c, 'GET', `/api/books/${c.w.sample}/chapters`)).json.items as { id: string }[];
          const r = await apiCall(c.stack.api, 'PUT', `/api/books/${c.w.sample}/place`, { chapter_id: chs[2]!.id, offset: 5, mode: 'listening', base_revision: cur.revision }, 'e2e-other-device-9', c.w.nick);
          expect(r.status).toBe(200);
          await p.getByRole('dialog', { name: 'Where to continue?' }).waitFor({ timeout: 20000 });
        },
      },
      {
        name: 'End of book',
        setup: async (c) => {
          const chs = (await api(c, 'GET', `/api/books/${c.w.sample}/chapters`)).json.items as { id: string }[];
          const last = chs[chs.length - 1]!;
          const text = (await api(c, 'GET', `/api/books/${c.w.sample}/chapters/${last.id}/text`)).json;
          const cur = (await api(c, 'GET', `/api/books/${c.w.sample}/place`)).json;
          const device = await c.page.evaluate(() => localStorage.getItem('bardic.device')!); // this device writes its own place: no conflict to answer
          const put = await apiCall(c.stack.api, 'PUT', `/api/books/${c.w.sample}/place`, { chapter_id: last.id, offset: Math.max(0, [...text.text].length - 40), mode: 'listening', base_revision: cur.revision ?? 0 }, device, c.w.nick);
          expect(put.status).toBe(200);
          await go(c.page, `/book/${c.w.sample}`);
          await c.page.reload();
          await c.page.getByRole('button', { name: /^(Listen|Continue listening)$/ }).click();
          await c.page.getByRole('button', { name: /Listen again|again/i }).waitFor({ timeout: 30000 });
        },
      },
    ],
  },
  {
    name: 'book management',
    seed: async (c) => {
      c.w.auditDelete = await importFile(c.stack.api, c.w.nick, 'audit-delete.epub', epub({ title: 'Audit Deletion Pages', titles: ['A synthetic chapter'] }), 'application/epub+zip');
      c.w.auditRemoved = await importFile(c.stack.api, c.w.nick, 'audit-removed.epub', epub({ title: 'Audit Removed Pages', titles: ['A synthetic chapter'] }), 'application/epub+zip');
      expect((await api(c, 'POST', `/api/books/${c.w.auditRemoved}/remove`, {})).status).toBe(200);
    },
    screens: [
      { name: 'Book > This book menu', sheet: true, setup: async (c, mark) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await mark(c.page.getByRole('button', { name: 'Edit this book' })); await c.page.getByRole('dialog', { name: 'This book' }).waitFor(); } },
      { name: 'Book > Recent places', sheet: true, setup: async (c, mark) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await c.page.getByRole('button', { name: 'Edit this book' }).click(); await mark(c.page.getByRole('dialog', { name: 'This book' }).getByRole('button', { name: /^Recent places/ })); await c.page.getByRole('dialog', { name: 'Recent places' }).waitFor(); await c.page.waitForTimeout(250); } },
      { name: 'Book > Free up space', sheet: true, setup: async (c, mark) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await c.page.getByRole('button', { name: 'Edit this book' }).click(); await mark(c.page.getByRole('dialog', { name: 'This book' }).getByRole('button', { name: /^Free up space/ })); await c.page.getByRole('dialog', { name: 'Free up space' }).waitFor(); await c.page.waitForTimeout(250); } },
      { name: 'Book > Delete permanently', sheet: true, setup: async (c, mark) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await c.page.getByRole('button', { name: 'Edit this book' }).click(); await mark(c.page.getByRole('dialog', { name: 'This book' }).getByRole('button', { name: /^Delete permanently/ })); await c.page.getByRole('dialog', { name: 'Delete permanently?' }).waitFor(); } },
      { name: 'Manage > Edit details', setup: async (c, mark) => { await go(c.page, `/book/${c.w.sample}`); await c.page.reload(); await c.page.getByRole('button', { name: 'Edit this book' }).click(); await mark(c.page.getByRole('dialog', { name: 'This book' }).getByRole('button', { name: /^Edit details/ })); await c.page.getByLabel('Title', { exact: true }).waitFor(); } },
      { name: 'Manage > Removed books', setup: async (c) => { await go(c.page, '/library/manage'); await c.page.getByRole('tab', { name: 'Removed', exact: true }).click(); await c.page.getByText('Audit Removed Pages', { exact: true }).waitFor(); } },
      { name: 'Library + Deletion undo banner', setup: async (c) => { await go(c.page, `/book/${c.w.auditDelete}`); await c.page.reload(); await c.page.getByRole('button', { name: 'Edit this book' }).click(); await c.page.getByRole('dialog', { name: 'This book' }).getByRole('button', { name: /^Delete permanently/ }).click(); const slide = c.page.getByRole('slider', { name: 'Slide to delete permanently' }); await slide.focus(); for (let i = 0; i < 4; i++) await c.page.keyboard.press('Enter'); await c.page.getByRole('button', { name: /^Undo deleting Audit Deletion Pages/ }).waitFor(); }, afterEach: async (c) => { await c.page.getByRole('button', { name: /^Undo deleting Audit Deletion Pages/ }).click(); await c.page.waitForTimeout(200); } },
    ],
  },
  {
    name: 'downloads',
    seed: async (c) => {
      await go(c.page, '/library');
      await c.page.keyboard.press('Escape');
    },
    screens: [
      { name: 'Download sheet', sheet: true, setup: async (c, mark) => { await go(c.page, `/book/${c.w.harbour}`); await c.page.reload(); await mark(c.page.getByRole('button', { name: 'Download', exact: true })); await c.page.getByRole('dialog').getByText('Download to this device').waitFor(); } },
      {
        name: 'Download sheet > choose chapters',
        sheet: true,
        setup: async (c, mark) => { await go(c.page, `/book/${c.w.harbour}`); await c.page.reload(); await mark(c.page.getByRole('button', { name: 'Download', exact: true })); const d = c.page.getByRole('dialog'); await d.getByText('Download to this device').waitFor(); await d.getByRole('radio', { name: /Choose chapters/ }).click(); await c.page.waitForTimeout(300); },
      },
      {
        name: 'Book + Downloads (in progress)',
        setup: downloadingHarbour,
        afterEach: clearAuditDownload,
      },
      { name: 'Settings > Downloads (in progress)', setup: async (c) => { await downloadingHarbour(c); await go(c.page, '/settings/downloads'); await c.page.waitForTimeout(300); }, afterEach: clearAuditDownload },
      {
        name: 'Settings > Downloads (on this device)',
        setup: async (c) => {
          await c.context.unroute('**/api/audio/*').catch(() => {});
          await go(c.page, `/book/${c.w.sample}`);
          await c.page.reload();
          const dl = c.page.getByRole('button', { name: 'Download', exact: true });
          if ((await c.page.locator('[data-chapter-rows]').getByText('On this device', { exact: true }).count()) === 0) {
            await dl.waitFor({ state: 'visible' });
            await dl.click();
            await c.page.getByRole('dialog').getByRole('button', { name: /^Download\b/ }).click();
          }
          await c.page.locator('[data-chapter-rows]').getByText('On this device', { exact: true }).first().waitFor({ timeout: 30000 });
          await go(c.page, '/settings/downloads');
          await c.page.waitForTimeout(800);
        },
      },
    ],
  },
  {
    name: 'offline',
    seed: async (c) => {
      await go(c.page, '/');
      await expect
        .poll(() => c.page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('bardic-app-')) && !!(await caches.match('/index.html')) && !!navigator.serviceWorker.controller), { timeout: 20000 })
        .toBe(true);
      await c.context.setOffline(true);
      await c.context.route('**/api/**', (r) => r.abort('connectionrefused'));
      await c.page.waitForTimeout(1500);
    },
    screens: [
      { name: 'Home (offline)', setup: async (c) => { await go(c.page, '/'); await c.page.waitForTimeout(1200); } },
      { name: 'Server offline (Library)', setup: async (c) => { await go(c.page, '/library'); await c.page.waitForTimeout(1200); } },
      { name: 'Book (offline, held)', setup: async (c) => { await go(c.page, `/book/${c.w.sample}`); await c.page.waitForTimeout(1200); } },
      { name: 'Book (offline, not held)', setup: async (c) => { await go(c.page, `/book/${c.w.tide}`); await c.page.waitForTimeout(1200); } },
      { name: 'Settings (offline)', setup: async (c) => { await go(c.page, '/settings'); await c.page.waitForTimeout(1000); } },
      { name: 'Settings > Downloads (offline)', setup: async (c) => { await go(c.page, '/settings/downloads'); await c.page.waitForTimeout(1000); } },
    ],
  },
];

// ---------------------------------------------------------------------------------------------------------- the scan
const records: Rec[] = [];

async function scan(c: Ctx, screen: Screen, vp: ViewportName) {
  const rec: Rec = { screen: screen.name, vp };
  records.push(rec);
  const { page } = c;
  try {
    await page.setViewportSize(VIEWPORTS[vp]);
    await page.waitForTimeout(150);
    await page.evaluate(() => (location.hash = '#/library')).catch(() => {}); // leave whatever the last screen left open
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); // on the Library this closes a menu left open
    await screen.setup(c, mk(page));
    await settle(page);
    await inject(page);
    if (process.env.AUDIT_SHOTS) await page.screenshot({ path: `/tmp/a11y-normal-${screen.name.replace(/\W+/g, '-')}-${vp}.png` });
    // Other checks intentionally move focus. Inspect initial dialog focus before them.
    const openedDialogs = screen.sheet ? await page.evaluate(() => (window as any).__audit.dialogs()) : [];
    rec.axe = await axeScan(page);
    rec.targets = await targetScan(page);
    const contrastNodes = [...rec.axe.incomplete, ...rec.axe.violations].filter((i) => i.rule === 'color-contrast').flatMap((i) => i.nodes.map((n) => n.target));
    if (contrastNodes.length) rec.pixels = await contrastByPixels(page, contrastNodes, 60);
    if (vp === 'phone') {
      rec.motion = await motionScan(page);
      rec.text = await textScaleScan(page, screen.name);
      if (!screen.noTab) rec.keyboard = await keyboardScan(page);
    } else if (screen.sheet) {
      rec.keyboard = await keyboardScan(page);
    }
    if (screen.sheet) {
      rec.dialog = await dialogScan(page, (await page.locator('[data-audit-opener]').count()) > 0);
      rec.dialog.focusMovedIn = openedDialogs.some((d: { hasFocus: boolean }) => d.hasFocus);
      const closeRoute = typeof screen.closeRoute === 'function' ? screen.closeRoute(c) : screen.closeRoute;
      if (closeRoute && await page.evaluate(() => location.hash) === closeRoute) rec.dialog.escapeLeftScreen = false;
    }
  } catch (e) {
    rec.error = String((e as Error).message).split('\n')[0]!.slice(0, 160) + ` [at ${await page.evaluate(() => location.hash).catch(() => '?')}]`;
    if (process.env.AUDIT_SHOTS) await page.screenshot({ path: `/tmp/a11y-fail-${screen.name.replace(/\W+/g, '-')}-${vp}.png` }).catch(() => {});
  }
  try {
    await screen.afterEach?.(c);
  } catch {}
  console.log(`${rec.error ? 'FAIL' : 'ok  '} ${vp.padEnd(16)} ${screen.name}${rec.error ? '  <- ' + rec.error : ''}`);
}

test.describe.configure({ mode: 'serial', timeout: 25 * 60_000 });

let stack: Running, breeze: Fake, gemini: GeminiFake, context: BrowserContext;
test.beforeAll(async ({ browser }: { browser: Browser }) => {
  breeze = await startBreeze();
  gemini = (await startGemini()) as GeminiFake;
  stack = await startStack({ env: { BARDIC_GEMINI_URL: gemini.url } });
  context = await browser.newContext({ baseURL: stack.url, viewport: VIEWPORTS.phone, serviceWorkers: 'allow' });
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.muted = true;
      this.volume = 0;
      return play.call(this);
    };
  });
  context.setDefaultTimeout(10_000); // a missing or covered control is a finding, not a 25 minute wait
});
test.afterAll(async () => {
  await context?.close();
  await stack?.stop();
  await breeze?.stop();
  await gemini?.stop();
});

test('scan every screen at phone and tablet widths', async () => {
  const page = await context.newPage();
  const c: Ctx = { page, context, stack, breeze, gemini, w: {} as World };
  for (const ph of phases) {
    const wanted = ph.screens.filter((s) => !ONLY || ONLY.test(s.name));
    // a phase is always seeded (later phases need its data); only the scans are filtered
    try {
      await ph.seed?.(c);
    } catch (e) {
      records.push({ screen: `(seed: ${ph.name})`, vp: 'phone', error: String((e as Error).message).split('\n')[0]!.slice(0, 200) });
    }
    for (const s of wanted) {
      for (const vp of VPS) await scan(c, s, vp);
      try {
        await s.after?.(c);
      } catch {}
    }
  }
  const bad = records.filter((r) => r.error).map((r) => `${r.screen} @ ${r.vp}: ${r.error}`);
  if (!ONLY && VPS.length === Object.keys(VIEWPORTS).length) writeReport(REPORT, records, { tool: `axe-core ${AXE_VERSION} injected with page.addScriptTag (no @axe-core/playwright)`, tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'], browser: 'Chromium (Playwright, muted)', text200Method: '200% browser-zoom reflow equivalent: half-width and half-height CSS layout viewport, with responsive media queries; screenshots captured during inspection', viewportsPx: VIEWPORTS });
  fs.writeFileSync('/tmp/a11y-records.json', JSON.stringify(records));
  console.log(`scanned ${records.length} screen/viewport pairs; ${bad.length} could not be reached`);
  for (const b of bad) console.log('  could not scan: ' + b);
});

test('verdict: nothing outside the allow-list', async () => {
  test.skip(records.length === 0, 'the scan did not run');
  const { entries, problems } = loadAllow();
  expect.soft(problems, 'allow-list entries need a reason').toEqual([]);
  const all = findings(records).filter((f) => !allowed(f, entries));
  const by = (kind: string) => all.filter((f) => f.kind === kind).map(describe);
  expect.soft(by('scan'), 'screens that could not be reached (the scan is incomplete)').toEqual([]);
  expect.soft(by('axe'), 'axe-core violations').toEqual([]);
  expect.soft(by('contrast-pixels'), 'rendered contrast where axe could not decide').toEqual([]);
  expect.soft(by('target'), 'interactive elements under 44x44 CSS px').toEqual([]);
  expect.soft(by('keyboard'), 'keyboard path').toEqual([]);
  expect.soft(by('dialog'), 'sheets and dialogs').toEqual([]);
  expect.soft(by('motion'), 'prefers-reduced-motion: animations and transitions over 0.3 s that still run').toEqual([]);
  expect.soft(by('textscale'), 'text at 200%: clipped, overlapping, sideways scroll, or not scaling').toEqual([]);
});
