// W4: the plan flow, the only way paid audio starts (P2, PL1 to PL11), against a real bardic-server with the fake
// Gemini (e2e/fakes.ts: it speaks, reports usage like the real API, and can be told to answer 429, refuse, report no
// usage or reject the key). Original synthetic text only.
import { test, expect } from './fixtures';
import { apiCall } from './harness';
import { zip } from './zip';
import type { Fake, GeminiFake } from './fakes';
import type { Page } from '@playwright/test';

const DEV = 'e2e-plans-device';
type Stack = { api: string };

/** Story chapters of different lengths, so that a limit can stop a plan part of the way. */
const SIZES = [120, 100, 140, 90];
const para = (n: number, who: string) => Array.from({ length: n }, (_, i) => `<p>${who} ${i}: the tide came in at noon, and the lanterns burned low over the harbour wall.</p>`).join('');
function epub(): Buffer {
  const chapters: [string, string][] = SIZES.map((n, i) => [`Chapter ${i + 1} of the Tide`, para(n, `Tide${i}`)]);
  const files: Record<string, string> = {
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'OEBPS/content.opf': `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tide Tables</dc:title><dc:creator>A. Writer</dc:creator></metadata><manifest>${chapters.map((_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`,
  };
  chapters.forEach(([t, body], i) => (files[`OEBPS/c${i}.xhtml`] = `<html><body><h1>${t}</h1>${body}</body></html>`));
  return zip(files);
}

interface World {
  listener: string;
  bookId: string;
  chapters: { id: string; title: string }[];
  premium: { id: string; voice_name: string };
  free?: { id: string };
}

/** What the fake's tokens cost per million characters, so that an estimate is close to what is really spent. */
const PRICE = 18_200_000;

async function world(stack: Stack, opts: { place?: number; breeze?: Fake } = {}): Promise<World> {
  const api = stack.api;
  const l = (await apiCall(api, 'POST', '/api/listeners', { name: 'Nick' })).json.id as string;
  expect((await apiCall(api, 'PUT', '/api/voice-sources/gemini', { api_key: 'test-key' }, DEV)).status).toBe(200);
  if (opts.breeze) expect((await apiCall(api, 'PUT', '/api/voice-sources/breeze', { base_url: opts.breeze.url }, DEV)).status).toBe(200);
  expect((await apiCall(api, 'PUT', '/api/prices/gemini', { unit: 'million_characters', per_unit: { micros: PRICE, currency: 'USD' } }, DEV, l)).status).toBe(200);
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(epub())], { type: 'application/epub+zip' }), 'Tide Tables.epub');
  expect((await fetch(`${api}/api/imports`, { method: 'POST', headers: { 'x-bardic-device': DEV }, body: fd })).status).toBe(202);
  let bookId = '';
  await expect
    .poll(async () => {
      const items = (await apiCall(api, 'GET', '/api/books?limit=50', undefined, DEV, l)).json.items as { id: string; state: string }[];
      bookId = items[0]?.id ?? '';
      return items[0]?.state;
    })
    .toBe('readable');
  const chapters = (await apiCall(api, 'GET', `/api/books/${bookId}/chapters`)).json.items as World['chapters'];
  const voices = (await apiCall(api, 'GET', '/api/voices')).json.items as { id: string; tier: string; name: string }[];
  const kore = voices.find((v) => v.name === 'Kore')!;
  const premium = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: kore.id }, DEV)).json;
  const w: World = { listener: l, bookId, chapters, premium };
  if (opts.breeze) {
    const mara = voices.find((v) => v.name === 'Mara')!;
    w.free = (await apiCall(api, 'POST', `/api/books/${bookId}/audiobooks`, { voice_id: mara.id }, DEV)).json;
  }
  if (opts.place !== undefined) {
    const on = w.free ?? premium;
    const p = await apiCall(api, 'PUT', `/api/books/${bookId}/place`, { chapter_id: chapters[opts.place]!.id, offset: 40, mode: 'listening', audiobook_id: on.id, base_revision: 0 }, DEV, l);
    expect(p.status).toBe(200);
  }
  return w;
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Nick/ }).click();
  await expect(page.getByRole('button', { name: /Listening as Nick/ })).toBeVisible();
}

async function openBook(page: Page, w: World) {
  await signIn(page);
  await page.goto(`/#/book/${w.bookId}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tide Tables' })).toBeVisible();
}

const card = (page: Page) => page.locator('[data-section="audiobook"]');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Make ready' });
const approveButton = (page: Page) => sheet(page).getByRole('button', { name: /^Approve plan · up to \$/ });
const get = (stack: Stack, w: World, path: string) => apiCall(stack.api, 'GET', path, undefined, DEV, w.listener).then((r) => r.json);
const plans = async (stack: Stack, w: World) => (await get(stack, w, '/api/plans')).items as Plan[];
const jobs = async (stack: Stack, w: World) => (await get(stack, w, '/api/jobs')).items as unknown[];
const spent = async (stack: Stack, w: World) => (await get(stack, w, '/api/allowance')).spent as { known: { micros: number }; unknown_items: number };
const chapterStates = async (stack: Stack, w: World) => ((await get(stack, w, `/api/audiobooks/${w.premium.id}/chapters`)).items as { state: string }[]).map((c) => c.state);
const readyCount = async (stack: Stack, w: World) => (await chapterStates(stack, w)).filter((s) => s === 'ready').length;

interface Plan {
  id: string;
  audiobook_id: string;
  state: string;
  limit: { micros: number };
  spent: { known: { micros: number }; unknown_items: number };
  chapters_total: number;
  chapters_done: number;
  needs_you: { code: string } | null;
  waiting: { code: string; until: string | null } | null;
}
const theOnlyPlan = async (stack: Stack, w: World) => {
  const all = await plans(stack, w);
  expect(all).toHaveLength(1);
  return all[0]!;
};

/** Every request the page makes that is not a read: what could possibly start something. */
function watchWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/') && !r.url().includes('/api/events')) writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return writes;
}
const approvals = (writes: string[]) => writes.filter((x) => x === 'POST /api/plans');

async function nothingStarted(stack: Stack, w: World, gemini: Fake) {
  expect(gemini.received()).toBe(0);
  expect(await plans(stack, w)).toEqual([]);
  expect(await jobs(stack, w)).toEqual([]);
  expect(await spent(stack, w)).toEqual({ known: expect.objectContaining({ micros: 0 }), unknown_items: 0 });
  expect(await chapterStates(stack, w)).not.toContain('ready');
}

async function setLimit(page: Page, text: string) {
  await sheet(page).getByRole('button', { name: /^Limit for this plan:/ }).click();
  const input = sheet(page).getByRole('textbox', { name: /^Limit for this plan/ });
  await input.fill(text);
  await input.press('Enter');
}

test('PL1: the plan sheet shows scope, size, chapters, the estimate as a range with the most likely value, the limit and the Allowance, and spends nothing', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  const d = sheet(page);
  await expect(d).toBeVisible();
  await expect(d.getByText('KORE · PREMIUM', { exact: false })).toBeVisible();
  await expect(d.getByRole('radio', { name: /^Whole book/ })).toHaveAttribute('aria-checked', 'true');
  await expect(d.getByRole('radio', { name: /^Whole book/ })).toContainText('4 chapters · none ready yet');
  await expect(d.getByText('Text to speak')).toBeVisible();
  await expect(d.getByText(/^[\d,]+ characters$/)).toBeVisible();
  await expect(d.getByText('4 chapters', { exact: true })).toBeVisible();
  await expect(d.getByText(/of audio$/)).toBeVisible();
  const range = d.getByText(/^\$\d+\.\d\d to \$\d+\.\d\d$/);
  await expect(range).toBeVisible();
  await expect(d.getByText('Most likely', { exact: true })).toBeVisible();
  await expect(d.getByRole('button', { name: /^Limit for this plan: \$\d+\.\d\d\. Change$/ })).toBeVisible();
  await expect(d.getByText('Monthly limit')).toBeVisible();
  await expect(d.getByText('None set')).toBeVisible();
  await expect(approveButton(page)).toBeVisible();
  // the label names the cost: the limit shown in the sheet, which starts at the top of the range rounded up
  const limit = (await d.getByRole('button', { name: /^Limit for this plan:/ }).innerText()).match(/\$\d+\.\d\d/)![0];
  await expect(approveButton(page)).toHaveText(`Approve plan · up to ${limit}`);
  const cents = (s: string) => Math.round(parseFloat(s.replace('$', '')) * 100);
  expect(cents(limit)).toBeGreaterThanOrEqual(cents((await range.innerText()).split(' to ')[1]!));

  // looking is free: the provider heard nothing, nothing was spent, no plan, no job, no audio
  await nothingStarted(stack, w, gemini);
  expect(approvals(writes)).toEqual([]);
  expect(writes.filter((x) => !/plan-preview$/.test(x))).toEqual([]);

  // asking why opens the explanation and "Got it" comes back
  await d.getByRole('button', { name: 'Why a range?' }).click();
  const why = page.getByRole('dialog', { name: 'How this estimate works' });
  await expect(why).toBeVisible();
  await expect(why.getByText('What Bardic knows')).toBeVisible();
  await expect(why.getByText('What it assumes')).toBeVisible();
  await expect(why.getByText('What can differ')).toBeVisible();
  await expect(why.getByText('When it is unknown')).toBeVisible();
  await expect(why.getByText('Estimate', { exact: true })).toBeVisible();
  await why.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet(page)).toBeVisible();

  // "Not now" and Escape start nothing
  await sheet(page).getByRole('button', { name: 'Not now' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(approveButton(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  await nothingStarted(stack, w, gemini);
  expect(approvals(writes)).toEqual([]);
});

test('PL1: choosing a premium voice, or pressing a plan button in the chooser, starts nothing; only the plan sheet can', async ({ page, stack, gemini, breeze }) => {
  const w = await world(stack, { breeze });
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: /^Change/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a voice' });
  await chooser.getByRole('radio', { name: 'Premium' }).click();
  await chooser.getByRole('radio', { name: /Kore/ }).click();
  expect(approvals(writes)).toEqual([]);
  expect(gemini.received()).toBe(0);
  await chooser.getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(chooser).toHaveCount(0);
  await expect(approveButton(page)).toBeVisible();
  expect(approvals(writes)).toEqual([]);
  expect(gemini.received()).toBe(0);
  expect(await plans(stack, w)).toEqual([]);
  expect(await spent(stack, w)).toEqual({ known: expect.objectContaining({ micros: 0 }), unknown_items: 0 });
  await sheet(page).getByRole('button', { name: 'Not now' }).click();
  expect(approvals(writes)).toEqual([]);
});

test('PL2: approving with a limit starts the plan; the audio is made, chapters turn Ready, spending is known and inside the limit', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const g = gemini as GeminiFake;
  g.setDelay(500);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(approveButton(page)).toBeVisible();
  await approveButton(page).click();
  await expect(sheet(page)).toHaveCount(0);
  expect(approvals(writes)).toHaveLength(1);

  // the page shows the plan that is going: progress, spend against the limit, Pause and Stop
  const running = card(page).locator('[data-plan-state="making"]');
  await expect(running).toBeVisible();
  await expect(running.getByText('Making it ready')).toBeVisible();
  await expect(running.getByText(/^Kore · \d of 4 ready · .* of up to \$\d+\.\d\d spent$/)).toBeVisible();
  await expect(running.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(running.getByRole('button', { name: 'Stop making it ready' })).toBeVisible();

  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('completed');
  const plan = await theOnlyPlan(stack, w);
  expect(plan.chapters_done).toBe(4);
  expect(await chapterStates(stack, w)).toEqual(['ready', 'ready', 'ready', 'ready']);
  expect(plan.spent.known.micros).toBeGreaterThan(0);
  expect(plan.spent.known.micros).toBeLessThanOrEqual(plan.limit.micros);
  expect(plan.spent.unknown_items).toBe(0);
  expect(g.received()).toBeGreaterThanOrEqual(4);
  // the Allowance counts the same money
  expect((await spent(stack, w)).known.micros).toBe(plan.spent.known.micros);

  // the page says what was kept and spent, and the chapters say Ready
  const done = card(page).getByText('Plan finished');
  await expect(done).toBeVisible();
  await expect(card(page).getByText(/^4 of 4 chapters are ready and kept\. \$\d+\.\d\d of up to \$\d+\.\d\d spent\.$/)).toBeVisible();
  await card(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(done).toHaveCount(0);
  await expect(card(page).getByText('4 of 4 chapters ready')).toBeVisible();
  expect(approvals(writes)).toHaveLength(1);
});

test('PL2: the limit is editable, must be at least the most likely cost, and is what is approved', async ({ page, stack }) => {
  const w = await world(stack);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(approveButton(page)).toBeVisible();
  // below the most likely value: explained, and no Approve at all
  await setLimit(page, '0.01');
  await expect(sheet(page).getByRole('alert')).toContainText('The limit must be at least');
  await expect(sheet(page).getByRole('alert')).toContainText('the most likely cost');
  await expect(approveButton(page)).toHaveCount(0);
  await setLimit(page, 'lots');
  await expect(sheet(page).getByRole('alert')).toContainText('Type the limit as an amount in dollars');
  await expect(approveButton(page)).toHaveCount(0);
  expect(approvals(writes)).toEqual([]);
  // a good limit: the button names it, and exactly that is approved
  await setLimit(page, '7.5');
  await expect(approveButton(page)).toHaveText('Approve plan · up to $7.50');
  await approveButton(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await plans(stack, w)).length).toBe(1);
  expect((await theOnlyPlan(stack, w)).limit).toEqual({ micros: 7_500_000, currency: 'USD' });
});

test('PL2: a premium plan from the chapter the listener is in', async ({ page, stack, gemini }) => {
  const w = await world(stack, { place: 2 });
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan from chapter 3' }).click();
  const d = sheet(page);
  await expect(d.getByRole('radio', { name: /^From chapter 3/ })).toHaveAttribute('aria-checked', 'true');
  await expect(d.getByRole('radio', { name: /^From chapter 3/ })).toContainText('2 chapters · none ready yet');
  await expect(d.getByText('2 chapters', { exact: true })).toBeVisible();
  await expect(approveButton(page)).toBeVisible();
  // back to the whole book: priced again, still nothing started
  await d.getByRole('radio', { name: /^Whole book/ }).click();
  await expect(d.getByText('4 chapters', { exact: true })).toBeVisible();
  await d.getByRole('button', { name: 'Not now' }).click();
  expect(approvals(writes)).toEqual([]);
  await nothingStarted(stack, w, gemini);
});

test('P6: a request without a usage report is shown as an item not priced, never as zero', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  (gemini as GeminiFake).queue({ kind: 'no_usage' });
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await approveButton(page).click();
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('completed');
  const plan = await theOnlyPlan(stack, w);
  expect(plan.spent.unknown_items).toBe(1);
  expect(plan.spent.known.micros).toBeGreaterThan(0);
  expect((await spent(stack, w)).unknown_items).toBe(1);
  await expect(card(page).getByText(/spent, plus 1 item not priced\.$/)).toBeVisible();
});

test('PL5: the plan stops before a request that could pass its limit, keeps what is made, and raising the limit continues it', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  const likely = (await sheet(page).getByText('Most likely', { exact: true }).locator('xpath=following-sibling::dd').innerText()).replace('$', '');
  // the least limit that can be approved: the most likely cost (a plan this tight cannot finish the last chapter)
  await setLimit(page, likely);
  await approveButton(page).click();

  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('needs_you');
  const stopped = await theOnlyPlan(stack, w);
  expect(stopped.needs_you?.code).toBe('limit_exceeded');
  expect(stopped.chapters_done).toBeGreaterThan(0);
  expect(stopped.chapters_done).toBeLessThan(4);
  expect(stopped.spent.known.micros).toBeLessThanOrEqual(stopped.limit.micros);
  const made = await readyCount(stack, w);
  expect(made).toBe(stopped.chapters_done);
  const requests = gemini.received();

  // Needs you, beginning with what is kept; the limit is offered as a new, higher one, named on the button
  const needs = card(page).locator('[data-plan-state="needs"]');
  await expect(needs).toBeVisible();
  await expect(needs.getByText('Needs you', { exact: true })).toBeVisible();
  await expect(needs.getByText(new RegExp(`^${made} of 4 chapters (is|are) ready and kept\\. The next chapter could pass this plan’s limit`))).toBeVisible();
  const field = needs.getByRole('textbox', { name: 'New limit for this plan' });
  await expect(field).toBeVisible();
  await expect(needs.getByRole('button', { name: /^Continue · up to \$\d+\.\d\d$/ })).toBeVisible();
  // nothing more is sent while it waits for the listener
  await page.waitForTimeout(1500);
  expect(gemini.received()).toBe(requests);

  // a limit that is not higher is refused on the spot; a higher one continues the same plan
  await field.fill(String(stopped.limit.micros / 1_000_000));
  await expect(needs.getByRole('alert')).toContainText('must be more than the current limit');
  await expect(needs.getByRole('button', { name: /^Continue/ })).toBeDisabled();
  await field.fill('2');
  await needs.getByRole('button', { name: 'Continue · up to $2.00' }).click();
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('completed');
  const done = await theOnlyPlan(stack, w);
  expect(done.limit.micros).toBe(2_000_000);
  expect(done.chapters_done).toBe(4);
  expect(done.spent.known.micros).toBeLessThanOrEqual(done.limit.micros);
  expect(await readyCount(stack, w)).toBe(4);
  expect(approvals(writes)).toHaveLength(1);
});

test('PL9: a monthly limit below what is spent blocks new plans: the sheet says so, and there is no Approve', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  // a premium example counts as spending; then the monthly limit is set below it (allowed)
  const kore = (await apiCall(stack.api, 'GET', '/api/voices')).json.items.find((v: { name: string }) => v.name === 'Kore');
  const sample = await fetch(`${stack.api}/api/voices/${kore.id}/sample`, { headers: { 'x-bardic-device': DEV, 'x-bardic-listener': w.listener } });
  expect(sample.status).toBe(200);
  await sample.arrayBuffer();
  const sampleSpend = (await spent(stack, w)).known.micros;
  expect(sampleSpend).toBeGreaterThan(1);
  const before = gemini.received();
  const a = await apiCall(stack.api, 'GET', '/api/allowance');
  const set = await apiCall(stack.api, 'PUT', '/api/allowance', { monthly_limit: { micros: Math.floor(sampleSpend / 2), currency: 'USD' }, default_plan_limit: a.json.default_plan_limit }, DEV, w.listener);
  expect(set.status).toBe(200);

  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  const d = sheet(page);
  await expect(d.getByText('The whole book would pass your Allowance')).toBeVisible();
  await expect(d.getByText(/^It needs about \$\d+\.\d\d and \$0\.00 is left this month\./)).toBeVisible();
  await expect(d.getByText('Left in Allowance')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Open Allowance' })).toBeVisible();
  // not even a smaller plan fits, so Approve is not available at all
  await expect(d.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
  await expect(d.getByRole('radio')).toHaveCount(1);
  await expect(d.getByRole('radio', { name: /^Whole book/ })).toHaveAttribute('aria-checked', 'true');
  expect(approvals(writes)).toEqual([]);
  expect(await plans(stack, w)).toEqual([]);
  expect(gemini.received()).toBe(before);

  // Open Allowance goes to the Allowance
  await d.getByRole('button', { name: 'Open Allowance' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/settings\/allowance/);
  expect(await plans(stack, w)).toEqual([]);
});

test('PL3: when only part of the book fits what is left of the Allowance, the smaller plan is offered and can be approved', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const preview = await apiCall(stack.api, 'POST', `/api/audiobooks/${w.premium.id}/plan-preview`, { scope: { kind: 'whole_book' } }, DEV, w.listener);
  expect(preview.status).toBe(200);
  const high = preview.json.cost.high.micros as number;
  // 30% of the top of the range: the first chapter (27% of the text) fits, the first two (49%) do not
  const left = Math.floor(high * 0.3);
  const a = await apiCall(stack.api, 'GET', '/api/allowance');
  expect((await apiCall(stack.api, 'PUT', '/api/allowance', { monthly_limit: { micros: left, currency: 'USD' }, default_plan_limit: a.json.default_plan_limit }, DEV, w.listener)).status).toBe(200);

  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  const d = sheet(page);
  await expect(d.getByText('The whole book would pass your Allowance')).toBeVisible();
  await expect(d.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
  const smaller = d.getByRole('radio', { name: /^First chapter/ });
  await expect(smaller).toBeVisible();
  await expect(smaller).toContainText(/About \$\d+\.\d\d|About under/);
  expect(approvals(writes)).toEqual([]);
  // choose it: it fits, so Approve is offered, for that plan only
  await smaller.click();
  await expect(smaller).toHaveAttribute('aria-checked', 'true');
  await expect(d.getByRole('button', { name: /^Approve plan · up to \$/ })).toBeVisible();
  // going back to the whole book takes the button away again
  await d.getByRole('radio', { name: /^Whole book/ }).click();
  await expect(d.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
  await smaller.click();
  await d.getByRole('button', { name: /^Approve plan · up to \$/ }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('completed');
  const plan = await theOnlyPlan(stack, w);
  expect(plan.chapters_total).toBe(1);
  expect((await spent(stack, w)).known.micros).toBeLessThanOrEqual(left);
  expect(await readyCount(stack, w)).toBe(1);
  expect(approvals(writes)).toHaveLength(1);
  expect(gemini.received()).toBeGreaterThan(0);
});

test('D9: a provider quota makes the plan Waiting, says when it continues, and it carries on by itself inside its limit', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  (gemini as GeminiFake).queue({ kind: 'quota', retryAfter: 7 });
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await approveButton(page).click();

  const waiting = card(page).locator('[data-plan-state="waiting"]');
  await expect(waiting).toBeVisible({ timeout: 20000 });
  await expect(waiting.getByText(/^Waiting for Google’s (daily )?quota$/)).toBeVisible();
  await expect(waiting.getByText(/^Continues in about \d+ s$/)).toBeVisible();
  await expect(waiting.getByText(/^Finished chapters keep playing\. Google’s limit lifts in about \d+ s\. Continuing stays inside this plan’s original \$\d+\.\d\d limit\.$/)).toBeVisible();
  await expect(waiting.getByRole('button', { name: /^Make the rest with/ })).toBeVisible();
  await expect(waiting.getByRole('button', { name: 'Stop here' })).toBeVisible();
  const during = await theOnlyPlan(stack, w);
  expect(during.state).toBe('waiting');
  expect(during.waiting?.code).toBe('waiting_quota');

  // no new approval: it resumes by itself and finishes
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 90000 }).toBe('completed');
  const plan = await theOnlyPlan(stack, w);
  expect(plan.limit).toEqual(during.limit);
  expect(plan.spent.known.micros).toBeLessThanOrEqual(plan.limit.micros);
  expect(approvals(writes)).toHaveLength(1);
  expect(writes.filter((x) => /resume/.test(x))).toEqual([]);
  expect(await readyCount(stack, w)).toBe(4);
});

test('PL7: a stale estimate is never approved: the numbers are replaced and the listener decides again', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(approveButton(page)).toBeVisible();
  const before = await approveButton(page).innerText();
  // the price table changes between the preview and the press (three times the price: outside the stated range)
  expect((await apiCall(stack.api, 'PUT', '/api/prices/gemini', { unit: 'million_characters', per_unit: { micros: PRICE * 3, currency: 'USD' } }, DEV, w.listener)).status).toBe(200);
  await approveButton(page).click();

  // the server refused it, so nothing was made; the sheet says so first and shows the new numbers
  const d = sheet(page);
  await expect(d.getByText('The numbers changed')).toBeVisible();
  await expect(d.getByText(/^Nothing was started and nothing was spent\. Audio already made is kept\./)).toBeVisible();
  await expect(d.getByText(/Check the new numbers, then approve/)).toBeVisible();
  await expect.poll(async () => await approveButton(page).innerText()).not.toBe(before);
  expect(approvals(writes)).toHaveLength(1);
  expect(await plans(stack, w)).toEqual([]);
  expect(gemini.received()).toBe(0);
  await page.waitForTimeout(1000);
  expect(approvals(writes)).toHaveLength(1);
  // deciding again with the new numbers works
  await approveButton(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await plans(stack, w)).length).toBe(1);
  expect(approvals(writes)).toHaveLength(2);
});

test('PL7: pressing Approve twice quickly makes exactly one plan', async ({ page, stack }) => {
  const w = await world(stack);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await expect(approveButton(page)).toBeVisible();
  await approveButton(page).dblclick();
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(async () => (await plans(stack, w)).length).toBe(1);
  await page.waitForTimeout(800);
  expect(approvals(writes)).toHaveLength(1);
  expect(await plans(stack, w)).toHaveLength(1);
  expect(await jobs(stack, w)).toHaveLength(1);
});

test('PL4 and M4: pause, resume and stop keep every finished chapter', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const g = gemini as GeminiFake;
  g.setDelay(800);
  const writes = watchWrites(page);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await approveButton(page).click();
  const running = card(page).locator('[data-plan-state="making"]');
  await expect(running).toBeVisible();
  await expect.poll(async () => await readyCount(stack, w), { timeout: 30000 }).toBeGreaterThanOrEqual(1);

  // Pause: the chapter being made is finished and kept, then it holds
  await running.getByRole('button', { name: 'Pause' }).click();
  const paused = card(page).locator('[data-plan-state="paused"]');
  await expect(paused).toBeVisible({ timeout: 30000 });
  await expect(paused.getByText('Paused', { exact: true })).toBeVisible();
  const atPause = await theOnlyPlan(stack, w);
  expect(atPause.state).toBe('paused');
  expect(atPause.chapters_done).toBeGreaterThanOrEqual(1);
  // the chapter being made when Pause was pressed is finished and kept; after that nothing more is sent
  let requests = -1;
  await expect
    .poll(async () => {
      const now = g.received();
      const same = now === requests;
      requests = now;
      await page.waitForTimeout(1600);
      return same;
    }, { timeout: 30000 })
    .toBe(true);
  const held = await theOnlyPlan(stack, w);
  expect(held.state).toBe('paused');
  await expect(paused.getByText(new RegExp(`^${held.chapters_done} of 4 chapters (is|are) ready and kept\\. Resume continues inside the limit of \\$\\d+\\.\\d\\d\\.$`))).toBeVisible();
  expect(await readyCount(stack, w)).toBe(held.chapters_done);
  await page.waitForTimeout(1500);
  expect(g.received()).toBe(requests);

  // Resume: inside the same limit, no new approval
  await paused.getByRole('button', { name: 'Resume' }).click();
  await expect(card(page).locator('[data-plan-state="making"]')).toBeVisible();
  expect((await theOnlyPlan(stack, w)).limit).toEqual(atPause.limit);
  await expect.poll(async () => (await theOnlyPlan(stack, w)).chapters_done, { timeout: 30000 }).toBeGreaterThan(held.chapters_done);

  // Stop: finished chapters stay Ready, nothing more is sent
  await card(page).locator('[data-plan-state="making"]').getByRole('button', { name: 'Stop making it ready' }).click();
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 30000 }).toBe('stopped');
  const stoppedPlan = await theOnlyPlan(stack, w);
  const kept = await readyCount(stack, w);
  expect(kept).toBeGreaterThanOrEqual(stoppedPlan.chapters_done);
  await expect(card(page).getByText('Plan stopped')).toBeVisible();
  await expect(card(page).getByText(new RegExp(`^${stoppedPlan.chapters_done} of 4 chapters (is|are) ready and kept\\.`))).toBeVisible();
  const sent = g.received();
  await page.waitForTimeout(2500);
  expect(g.received()).toBeLessThanOrEqual(sent + 1);
  expect(await readyCount(stack, w)).toBeGreaterThanOrEqual(kept);
  expect(approvals(writes)).toHaveLength(1);
});

test('PL11: a rejected key stops the plan, keeps what is made, and says so first', async ({ page, stack, gemini }) => {
  const w = await world(stack);
  const g = gemini as GeminiFake;
  g.setDelay(600);
  await openBook(page, w);
  await card(page).getByRole('button', { name: 'Plan the whole book' }).click();
  await approveButton(page).click();
  await expect.poll(async () => await readyCount(stack, w), { timeout: 30000 }).toBeGreaterThanOrEqual(1);
  g.setKey('a-different-key');
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('needs_you');
  const plan = await theOnlyPlan(stack, w);
  expect(plan.needs_you?.code).toBe('key_rejected');
  const made = await readyCount(stack, w);
  expect(made).toBe(plan.chapters_done);
  expect(made).toBeGreaterThanOrEqual(1);

  const needs = card(page).locator('[data-plan-state="needs"]');
  await expect(needs).toBeVisible();
  await expect(needs.getByText('Needs you', { exact: true })).toBeVisible();
  await expect(needs.getByText(new RegExp(`^${made} of 4 chapters (is|are) ready and kept\\. Google rejected your key, so nothing more is sent\\.`))).toBeVisible();
  await expect(needs.getByRole('button', { name: 'Fix Google key' })).toBeVisible();
  await expect(needs.getByRole('button', { name: 'Stop here' })).toBeVisible();
  const sent = g.received();
  await page.waitForTimeout(1500);
  expect(g.received()).toBe(sent);
  await needs.getByRole('button', { name: 'Fix Google key' }).click();
  await expect(page).toHaveURL(/#\/settings\/premium/);
});

test('PL1: from the chooser, a premium voice is planned and approved, and the page then shows that audiobook being made', async ({ page, stack, breeze, gemini }) => {
  const w = await world(stack, { breeze, place: 1 });
  (gemini as GeminiFake).setDelay(400);
  const writes = watchWrites(page);
  await openBook(page, w);
  // the free audiobook is current; the premium one is a different audiobook of the same book
  await expect(card(page).getByText('Mara')).toBeVisible();
  await card(page).getByRole('button', { name: /^Change/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a voice' });
  await chooser.getByRole('radio', { name: 'Premium' }).click();
  await chooser.getByRole('radio', { name: /Kore/ }).click();
  await chooser.getByRole('button', { name: 'Plan from chapter 2' }).click();
  await expect(sheet(page).getByRole('radio', { name: /^From chapter 2/ })).toHaveAttribute('aria-checked', 'true');
  expect(approvals(writes)).toEqual([]);
  await approveButton(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(card(page).locator('[data-plan-state]')).toBeVisible();
  await expect.poll(async () => (await theOnlyPlan(stack, w)).state, { timeout: 60000 }).toBe('completed');
  expect((await theOnlyPlan(stack, w)).audiobook_id).toBe(w.premium.id);
  expect(approvals(writes)).toHaveLength(1);
});
