import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { Plan, PlanEstimate, Scope } from '../lib/planRules';
import type { Money } from '../lib/money';
import { PlanStore, approvalKey, type PlanGateway } from './plans';
import type { AudiobookChapter, BookGateway, Chapter, R } from './book';

const ok = <T>(value: T): R<T> => ({ ok: true, value });
const bad = (status: number, code: string | undefined, detail = 'It failed.', body?: unknown): R<never> => ({ ok: false, status, code, detail, body });
const usd = (cents: number): Money => ({ micros: cents * 10_000, currency: 'USD' });

let NOW = Date.parse('2026-10-01T10:00:00Z');
const later = (ms: number) => new Date(NOW + ms).toISOString();

const chapters: Chapter[] = Array.from({ length: 10 }, (_, i) => ({ id: `c${i + 1}`, index: i, title: `Chapter ${i + 1}`, kind: 'story' as const, word_count: 1000, text_sha256: 'x' }));

const estimate = (id: string, over: Partial<PlanEstimate> = {}): PlanEstimate => ({
  estimate_id: id,
  expires_at: later(15 * 60_000),
  audiobook_id: 'ab',
  scope: { kind: 'whole_book', include_matter: false },
  text_characters: 100_000,
  chapters_to_make: 10,
  chapters_reused: 0,
  seconds_estimate: 7000,
  cost: { low: usd(180), likely: usd(210), high: usd(260), prices_as_of: '2026-09-12T08:00:00Z', basis: 'provider' },
  suggested_limit: usd(260),
  allowance: { monthly_limit: null, remaining: null },
  blocked: null,
  ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  audiobook_id: 'ab',
  book_id: 'b1',
  scope: { kind: 'whole_book', include_matter: false },
  state: 'running',
  estimate: estimate('e').cost,
  limit: usd(260),
  spent: { known: usd(0), unknown_items: 0 },
  job_id: 'j1',
  chapters_total: 10,
  chapters_done: 0,
  waiting: null,
  needs_you: null,
  approved_by: { listener_id: 'l', listener_name: 'Nick', device_id: 'd', device_name: 'This device' },
  created_at: later(0),
  updated_at: later(0),
  ...over,
});

/** A gateway that records every call. `create` and `resume` are the ones that may charge. */
function fakes(bookChapters: Chapter[] = chapters) {
  const calls: string[] = [];
  const created: { input: { estimate_id: string; limit: Money }; key: string }[] = [];
  const resumed: { id: string; newLimit?: Money }[] = [];
  const previews: Scope[] = [];
  let n = 0;
  const state = {
    previewResults: [] as R<PlanEstimate>[],
    createResult: (): R<Plan> => ok(plan()),
    plans: [] as Plan[],
    get: (id: string): R<Plan> => ok(plan({ id })),
    pauseResult: (): R<Plan> => ok(plan({ state: 'paused' })),
    stopResult: (): R<Plan> => ok(plan({ state: 'stopped' })),
    resumeResult: (): R<Plan> => ok(plan({ state: 'running' })),
    delay: undefined as Promise<void> | undefined,
  };
  const gw: PlanGateway = {
    async preview(_l, _ab, scope) {
      calls.push('preview');
      previews.push(scope);
      return state.previewResults.shift() ?? ok(estimate(`e${++n}`, { scope }));
    },
    async create(_l, input, key) {
      calls.push('create');
      created.push({ input, key });
      if (state.delay) await state.delay;
      return state.createResult();
    },
    async list() {
      calls.push('list');
      return ok(state.plans);
    },
    async get(id) {
      calls.push('get');
      return state.get(id);
    },
    async pause() {
      calls.push('pause');
      return state.pauseResult();
    },
    async stop() {
      calls.push('stop');
      return state.stopResult();
    },
    async resume(_l, id, newLimit) {
      calls.push('resume');
      resumed.push({ id, newLimit });
      return state.resumeResult();
    },
  };
  const audio: AudiobookChapter[] = [];
  const books: Pick<BookGateway, 'chapters' | 'audioChapters' | 'place'> = {
    chapters: async () => ok(bookChapters),
    audioChapters: async () => ok(audio),
    place: async () => ok({ chapter_id: 'c4' } as never),
  };
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const clock = {
    set(fn: () => void, ms: number) {
      const t = { fn, ms, live: true };
      timers.push(t);
      return t;
    },
    clear(h: unknown) {
      (h as { live: boolean }).live = false;
    },
  };
  const store = new PlanStore(gw, books, () => NOW, clock);
  const fire = (ms?: number) => {
    for (const t of [...timers]) {
      if (t.live && (ms === undefined || t.ms === ms)) {
        t.live = false;
        t.fn();
      }
    }
  };
  const live = () => timers.filter((t) => t.live);
  const count = (name: string) => calls.filter((c) => c === name).length;
  return { gw, state, store, calls, created, resumed, previews, count, fire, live, audio };
}

const params = { listenerId: 'l', bookId: 'b1', audiobookId: 'ab', voiceName: 'Kore' };
const flow = (s: PlanStore) => get(s).flow;
const track = (s: PlanStore) => get(s).track;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('opening the sheet spends nothing (PL1)', () => {
  it('prices the scope with the free preview and calls nothing that charges', async () => {
    const f = fakes();
    await f.store.open(params);
    expect(f.count('preview')).toBe(1);
    expect(f.count('create')).toBe(0);
    expect(f.count('resume')).toBe(0);
    const s = flow(f.store);
    expect(s.phase).toBe('ready');
    expect(s.choices.map((c) => c.id)).toEqual(['whole', 'from']);
    expect(s.choices[1]!.title).toBe('From chapter 4');
    expect(s.estimate?.estimate_id).toBe('e1');
    expect(s.limitText).toBe('$2.60');
    expect(f.previews[0]).toEqual({ kind: 'whole_book', include_matter: false });
  });

  it('opens on "from chapter" when asked, and falls back to the whole book when there is no such option', async () => {
    const f = fakes();
    await f.store.open({ ...params, initial: 'from' });
    expect(flow(f.store).selected).toBe('from');
    expect(f.previews[0]).toEqual({ kind: 'from_chapter', from_chapter_id: 'c4', include_matter: false });
    const g = fakes();
    const noPlace = new PlanStore(g.gw, { chapters: async () => ok(chapters), audioChapters: async () => ok([]), place: async () => ok(null) }, () => NOW);
    await noPlace.open({ ...params, initial: 'from' });
    expect(get(noPlace).flow.selected).toBe('whole');
    expect(get(noPlace).flow.choices.map((c) => c.id)).toEqual(['whole']);
    noPlace.dispose();
  });

  it('choosing a scope, editing the limit, asking why and cancelling never charge', async () => {
    const f = fakes();
    await f.store.open(params);
    await f.store.select('from');
    f.store.setLimit('3.00');
    f.store.explain(true);
    f.store.explain(false);
    f.store.close();
    expect(f.count('create')).toBe(0);
    expect(f.count('resume')).toBe(0);
    expect(flow(f.store).phase).toBe('closed');
    expect(f.count('preview')).toBe(2);
  });

  it('prices again for each scope and starts the limit over at that scope’s suggestion', async () => {
    const f = fakes();
    await f.store.open(params);
    f.store.setLimit('9.99');
    f.state.previewResults.push(ok(estimate('e-from', { suggested_limit: usd(300), scope: { kind: 'from_chapter', from_chapter_id: 'c4', include_matter: false } })));
    await f.store.select('from');
    expect(flow(f.store).estimate?.estimate_id).toBe('e-from');
    expect(flow(f.store).limitText).toBe('$3.00');
  });

  it('keeps the limit the listener typed when the estimate is replaced and the limit is still allowed', async () => {
    const f = fakes();
    await f.store.open(params);
    f.store.setLimit('3.00');
    await f.store.refresh();
    expect(flow(f.store).limitText).toBe('3.00');
    f.state.previewResults.push(ok(estimate('big', { cost: { ...estimate('x').cost, likely: usd(400), low: usd(300), high: usd(500) }, suggested_limit: usd(500) })));
    await f.store.refresh();
    expect(flow(f.store).limitText).toBe('$5.00');
  });

  it('says so when the price of the voice cannot be fetched, and offers nothing to approve', async () => {
    const f = fakes();
    f.state.previewResults.push(bad(409, 'key_rejected'));
    await f.store.open(params);
    const s = flow(f.store);
    expect(s.estimate).toBeNull();
    expect(s.error?.action).toBe('fix_key');
    expect(s.error?.text).toMatch(/^Nothing was started and nothing was spent\. Audio already made is kept\./);
    expect((await f.store.approve()).ok).toBe(false);
    expect(f.count('create')).toBe(0);
  });

  it('says so when the server cannot be reached', async () => {
    const f = fakes();
    f.state.previewResults.push({ ok: false, status: 0, detail: 'down' });
    await f.store.open(params);
    expect(flow(f.store).error?.text).toContain('Nothing was started');
    expect(flow(f.store).error?.text).toContain('could not be reached');
  });
});

describe('choosing what matter to voice', () => {
  const withMatter: Chapter[] = chapters.map((c, i) => ({ ...c, kind: i === 0 ? 'front_matter' : i === 9 ? 'back_matter' : 'story' }));

  it('defaults to story chapters and recalculates eligible scope counts independently of chapter visibility', async () => {
    const f = fakes(withMatter);
    await f.store.open(params);
    const s = flow(f.store);
    expect(s.includeMatter).toBe(false);
    expect(s.matterAvailable).toBe(true);
    expect(s.choices[0]!.chapters.map((c) => c.id)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']);
    expect(s.choices[0]!.detail).toBe('8 chapters · none ready yet');
    expect(s.choices[1]!.detail).toBe('6 chapters · none ready yet');
    await f.store.setIncludeMatter(true);
    expect(flow(f.store).choices[0]!.detail).toBe('10 chapters · none ready yet');
    expect(f.previews[1]).toEqual({ kind: 'whole_book', include_matter: true });
    await f.store.select('from');
    expect(f.previews[2]).toEqual({ kind: 'from_chapter', from_chapter_id: 'c4', include_matter: true });
    await f.store.setIncludeMatter(false);
    expect(flow(f.store).selected).toBe('from');
    expect(f.previews[3]).toEqual({ kind: 'from_chapter', from_chapter_id: 'c4', include_matter: false });
    expect(f.count('create')).toBe(0);
    expect(f.count('resume')).toBe(0);
  });

  it('invalidates the displayed quote immediately and ignores a late preview after another toggle', async () => {
    const f = fakes(withMatter);
    await f.store.open(params);
    f.store.setLimit('9.99');
    let release!: (value: R<PlanEstimate>) => void;
    const delayed = new Promise<R<PlanEstimate>>((resolve) => (release = resolve));
    const preview = f.gw.preview;
    f.gw.preview = async (l, ab, scope) => scope.include_matter ? delayed : preview(l, ab, scope);
    const including = f.store.setIncludeMatter(true);
    expect(flow(f.store).estimate).toBeNull();
    expect(flow(f.store).phase).toBe('previewing');
    expect(flow(f.store).limitText).toBe('');
    expect((await f.store.approve()).ok).toBe(false);
    await f.store.setIncludeMatter(false);
    const currentId = flow(f.store).estimate?.estimate_id;
    release(ok(estimate('late-including', { scope: { kind: 'whole_book', include_matter: true } })));
    await including;
    expect(flow(f.store).includeMatter).toBe(false);
    expect(flow(f.store).estimate?.estimate_id).toBe(currentId);
    expect(flow(f.store).estimate?.scope.include_matter).toBe(false);
    expect(flow(f.store).limitText).toBe('$2.60');
    expect(f.count('create')).toBe(0);
  });

  it('discards smaller-plan quotes and the old blocked headline when matter changes', async () => {
    const f = fakes(withMatter);
    const blocked = estimate('blocked', { allowance: { monthly_limit: usd(2000), remaining: usd(120) }, blocked: { code: 'allowance_exceeded', text: 'No room.' } });
    const smaller = estimate('smaller', { chapters_to_make: 2, cost: { ...blocked.cost, low: usd(45), likely: usd(55), high: usd(70) }, suggested_limit: usd(70), allowance: blocked.allowance });
    f.state.previewResults.push(ok(blocked), ok(smaller));
    await f.store.open(params);
    expect(f.previews[1]?.include_matter).toBe(false);
    expect(f.previews[1]?.chapter_ids).not.toContain('c1');
    expect(f.previews[1]?.chapter_ids).not.toContain('c10');
    await f.store.select('smaller');
    expect(flow(f.store).estimate?.estimate_id).toBe('smaller');
    await f.store.setIncludeMatter(true);
    const s = flow(f.store);
    expect(s.selected).toBe('whole');
    expect(s.smaller).toBeNull();
    expect(s.blockedFrom).toBeNull();
    expect(s.choices.map((c) => c.id)).toEqual(['whole', 'from']);
    expect(s.estimate?.scope.include_matter).toBe(true);
    expect(f.previews.at(-1)).toEqual({ kind: 'whole_book', include_matter: true });
    expect(f.count('create')).toBe(0);
  });

  it('keeps the approved selection fixed while approval is in flight', async () => {
    const f = fakes(withMatter);
    let release!: () => void;
    f.state.delay = new Promise((resolve) => (release = resolve));
    await f.store.open(params);
    const approval = f.store.approve();
    await f.store.setIncludeMatter(true);
    expect(flow(f.store).includeMatter).toBe(false);
    expect(f.count('preview')).toBe(1);
    release();
    expect((await approval).ok).toBe(true);
    expect(f.count('create')).toBe(1);
  });
});

describe('approving (the only place that charges)', () => {
  it('sends the estimate on screen with the limit on screen and an idempotency key, once', async () => {
    const f = fakes();
    await f.store.open(params);
    f.store.setLimit('2.75');
    const r = await f.store.approve();
    expect(r.ok).toBe(true);
    expect(f.created).toEqual([{ input: { estimate_id: 'e1', limit: usd(275) }, key: approvalKey('e1') }]);
    expect(flow(f.store).phase).toBe('closed');
    expect(flow(f.store).approved?.id).toBe('p1');
    expect(track(f.store).active.map((p) => p.id)).toEqual(['p1']);
  });

  it('cannot approve twice: a double click sends exactly one request', async () => {
    const f = fakes();
    let release!: () => void;
    f.state.delay = new Promise((r) => (release = r));
    await f.store.open(params);
    const a = f.store.approve();
    const b = f.store.approve();
    const c = f.store.approve();
    expect(flow(f.store).phase).toBe('approving');
    release();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(false);
    expect(rc.ok).toBe(false);
    expect(f.count('create')).toBe(1);
  });

  it('forgets the approved plan once the page has shown it', async () => {
    const f = fakes();
    await f.store.open(params);
    await f.store.approve();
    expect(flow(f.store).approved?.id).toBe('p1');
    f.store.ackApproved();
    expect(flow(f.store).approved).toBeNull();
  });

  it('cannot approve again after it succeeded, or approve what was never priced', async () => {
    const f = fakes();
    expect((await f.store.approve()).ok).toBe(false);
    await f.store.open(params);
    await f.store.approve();
    expect((await f.store.approve()).ok).toBe(false);
    expect(f.count('create')).toBe(1);
  });

  it('cannot approve while the estimate is being made', async () => {
    const f = fakes();
    const opening = f.store.open(params);
    expect((await f.store.approve()).ok).toBe(false);
    await opening;
    expect(f.count('create')).toBe(0);
  });

  it('cannot approve without a fresh estimate: an old one is replaced and nothing is sent', async () => {
    const f = fakes();
    await f.store.open(params);
    NOW += 16 * 60_000;
    const r = await f.store.approve();
    expect(r).toEqual({ ok: false, reason: 'expired' });
    expect(f.count('create')).toBe(0);
    await settle();
    expect(f.count('preview')).toBe(2);
    expect(flow(f.store).estimate?.estimate_id).toBe('e2');
    expect(flow(f.store).notice?.text).toContain('nothing was sent');
    NOW -= 16 * 60_000;
  });

  it('refreshes an estimate by itself when its 15 minutes pass', async () => {
    const f = fakes();
    await f.store.open(params);
    NOW += 16 * 60_000;
    f.fire(15 * 60_000);
    await settle();
    expect(f.count('preview')).toBe(2);
    expect(flow(f.store).notice?.title).toBe('The estimate was refreshed');
    expect(f.count('create')).toBe(0);
    NOW -= 16 * 60_000;
  });

  it('cannot approve a plan that would pass the Allowance', async () => {
    const f = fakes();
    f.state.previewResults.push(ok(estimate('blocked', { allowance: { monthly_limit: usd(2000), remaining: usd(10) }, blocked: { code: 'allowance_exceeded', text: 'no' } })));
    await f.store.open(params);
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'blocked' });
    expect(f.count('create')).toBe(0);
  });

  it('cannot approve with a limit below the most likely cost, or one that is not an amount', async () => {
    const f = fakes();
    await f.store.open(params);
    f.store.setLimit('2.00');
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'bad_limit' });
    f.store.setLimit('two dollars');
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'bad_limit' });
    expect(f.count('create')).toBe(0);
  });

  it('cannot approve when there is nothing to make, or the price is unknown', async () => {
    const f = fakes();
    f.state.previewResults.push(ok(estimate('none', { chapters_to_make: 0 })));
    await f.store.open(params);
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'nothing_to_make' });
    f.state.previewResults.push(ok(estimate('unpriced', { cost: { ...estimate('x').cost, basis: 'unknown' } })));
    await f.store.refresh();
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'unpriced' });
    expect(f.count('create')).toBe(0);
  });

  it('does nothing after the sheet is closed', async () => {
    const f = fakes();
    await f.store.open(params);
    f.store.close();
    expect((await f.store.approve()).ok).toBe(false);
    expect(f.count('create')).toBe(0);
  });
});

describe('a refusal is put in words and never approved again by itself', () => {
  const numbersChanged = ['estimate_changed', 'estimate_expired', 'estimate_used', 'estimate_not_found'];
  for (const code of numbersChanged) {
    it(`${code}: prices again, tells the listener the numbers changed, and waits for them to press Approve`, async () => {
      const f = fakes();
      f.state.createResult = () => bad(409, code);
      await f.store.open(params);
      const r = await f.store.approve();
      expect(r.ok).toBe(false);
      expect(f.count('create')).toBe(1);
      expect(f.count('preview')).toBe(2);
      const s = flow(f.store);
      expect(s.phase).toBe('ready');
      expect(s.estimate?.estimate_id).toBe('e2');
      expect(s.notice?.text).toMatch(/^Nothing was started and nothing was spent\. Audio already made is kept\./);
      expect(s.notice?.text).toContain('Check the new numbers, then approve');
      // still one request: a stale estimate is replaced, never approved
      await settle();
      expect(f.count('create')).toBe(1);
    });
  }

  it('allowance_exceeded: prices again, which shows the plan as blocked', async () => {
    const f = fakes();
    f.state.createResult = () => bad(409, 'allowance_exceeded');
    await f.store.open(params);
    f.state.previewResults.push(ok(estimate('b', { allowance: { monthly_limit: usd(2000), remaining: usd(10) }, blocked: { code: 'allowance_exceeded', text: 'x' } })));
    await f.store.approve();
    expect(flow(f.store).blockedFrom?.estimate_id).toBe('b');
    expect(flow(f.store).notice?.title).toBe('This would pass your Allowance');
  });

  it('limit_below_estimate: the estimate was not used, so it can be approved with a better limit', async () => {
    const f = fakes();
    f.state.createResult = () => bad(409, 'limit_below_estimate');
    await f.store.open(params);
    await f.store.approve();
    expect(flow(f.store).error?.title).toBe('The limit is too low');
    expect(flow(f.store).phase).toBe('ready');
    f.state.createResult = () => ok(plan());
    expect((await f.store.approve()).ok).toBe(true);
    expect(f.count('create')).toBe(2);
    expect(f.created[0]!.key).toBe(f.created[1]!.key);
  });

  it('nothing_to_make, key_rejected and source_not_set_up: say so, begin with what is kept, and offer the fix', async () => {
    for (const [code, action] of [['nothing_to_make', 'none'], ['key_rejected', 'fix_key'], ['source_not_set_up', 'fix_key']] as const) {
      const f = fakes();
      f.state.createResult = () => bad(409, code);
      await f.store.open(params);
      await f.store.approve();
      const err = flow(f.store).error;
      expect(err?.action, code).toBe(action);
      expect(err?.text.length, code).toBeGreaterThan(20);
      expect(flow(f.store).phase, code).toBe('ready');
    }
    const f = fakes();
    f.state.createResult = () => bad(409, 'key_rejected');
    await f.store.open(params);
    await f.store.approve();
    expect(flow(f.store).error?.text).toMatch(/^Nothing was started and nothing was spent\. Audio already made is kept\./);
  });

  it('plan_active: starts nothing new and shows the plan that is running', async () => {
    const f = fakes();
    f.state.createResult = () => bad(409, 'plan_active', 'x', { context: { plan_id: 'p-old' } });
    f.state.get = (id) => ok(plan({ id, state: 'waiting' }));
    await f.store.open(params);
    await f.store.approve();
    expect(flow(f.store).phase).toBe('closed');
    expect(track(f.store).active.map((p) => p.id)).toEqual(['p-old']);
    expect(track(f.store).problem?.title).toBe('A plan is already running');
    expect(f.count('create')).toBe(1);
  });

  it('the server cannot be reached: nothing is assumed; a second press sends the same key, so it can only make one plan', async () => {
    const f = fakes();
    f.state.createResult = () => ({ ok: false, status: 0, detail: 'down' });
    await f.store.open(params);
    await f.store.approve();
    expect(flow(f.store).error?.text).toMatch(/^Nothing was started/);
    expect(flow(f.store).error?.text).toContain('only one plan can be made from this estimate');
    f.state.createResult = () => ok(plan());
    await f.store.approve();
    expect(f.created.map((c) => c.key)).toEqual([approvalKey('e1'), approvalKey('e1')]);
    expect(f.created.map((c) => c.input.estimate_id)).toEqual(['e1', 'e1']);
  });

  it('a refusal that arrives after the sheet was closed does not open it again', async () => {
    const f = fakes();
    let release!: () => void;
    f.state.delay = new Promise((r) => (release = r));
    f.state.createResult = () => bad(409, 'estimate_changed');
    await f.store.open(params);
    const a = f.store.approve();
    f.store.close();
    release();
    await a;
    expect(flow(f.store).phase).toBe('closed');
    expect(f.count('create')).toBe(1);
  });
});

describe('a plan that would pass the Allowance (PL3)', () => {
  const left = usd(120);
  const blocked = estimate('whole-blocked', { allowance: { monthly_limit: usd(2000), remaining: left }, blocked: { code: 'allowance_exceeded', text: 'x' } });

  it('offers a smaller plan that fits, prices it, and can approve that but never the blocked one', async () => {
    const f = fakes();
    // 10 equal chapters, high $2.60, $1.20 left: the first 4 chapters fit by the top of the range
    const smaller = estimate('smaller', { chapters_to_make: 4, scope: { kind: 'chapters', include_matter: false }, cost: { ...blocked.cost, low: usd(72), likely: usd(84), high: usd(104) }, suggested_limit: usd(110), allowance: blocked.allowance });
    f.state.previewResults.push(ok(blocked), ok(smaller));
    await f.store.open(params);
    const s = flow(f.store);
    expect(s.blockedFrom?.estimate_id).toBe('whole-blocked');
    expect(s.blockedWhole).toBe(true);
    expect(f.previews[1]).toEqual({ kind: 'chapters', chapter_ids: ['c1', 'c2', 'c3', 'c4'], include_matter: false });
    expect(s.choices.map((c) => c.id)).toEqual(['whole', 'from', 'smaller']);
    expect(s.choices[2]).toMatchObject({ title: 'First 4 chapters', detail: 'About $0.84' });
    // the blocked plan cannot be approved
    expect((await f.store.approve())).toEqual({ ok: false, reason: 'blocked' });
    expect(f.count('create')).toBe(0);
    // the smaller one can, with its own estimate, from the saved price (no new request)
    await f.store.select('smaller');
    expect(f.count('preview')).toBe(2);
    expect(flow(f.store).estimate?.estimate_id).toBe('smaller');
    expect(flow(f.store).limitText).toBe('$1.10');
    expect((await f.store.approve()).ok).toBe(true);
    expect(f.created[0]!.input.estimate_id).toBe('smaller');
  });

  it('tries fewer chapters when the first guess still passes the Allowance', async () => {
    const f = fakes();
    const stillBlocked = estimate('s1', { chapters_to_make: 4, blocked: { code: 'allowance_exceeded', text: 'x' }, allowance: blocked.allowance });
    const fits = estimate('s2', { chapters_to_make: 2, allowance: blocked.allowance });
    f.state.previewResults.push(ok(blocked), ok(stillBlocked), ok(fits));
    await f.store.open(params);
    expect(f.previews[2]).toEqual({ kind: 'chapters', chapter_ids: ['c1', 'c2'], include_matter: false });
    expect(flow(f.store).choices.find((c) => c.id === 'smaller')?.title).toBe('First 2 chapters');
  });

  it('offers only to open the Allowance when nothing fits', async () => {
    const f = fakes();
    const none = estimate('none', { allowance: { monthly_limit: usd(2000), remaining: usd(0) }, blocked: { code: 'allowance_exceeded', text: 'x' } });
    f.state.previewResults.push(ok(none));
    await f.store.open(params);
    expect(flow(f.store).choices.map((c) => c.id)).toEqual(['whole', 'from']);
    expect(f.count('preview')).toBe(1);
    expect((await f.store.approve()).ok).toBe(false);
  });

  it('does not look for a smaller plan when no monthly limit is set', async () => {
    const f = fakes();
    await f.store.open(params);
    expect(f.count('preview')).toBe(1);
    expect(flow(f.store).blockedFrom).toBeNull();
  });
});

describe('following plans', () => {
  it('reads the plans of the book and keeps the ones that are going', async () => {
    const f = fakes();
    f.state.plans = [plan({ id: 'p2', state: 'running' }), plan({ id: 'p1', state: 'completed', created_at: later(-1000) })];
    f.store.track('l', 'b1');
    await settle();
    expect(track(f.store).active.map((p) => p.id)).toEqual(['p2']);
    expect(track(f.store).ended).toBeNull();
  });

  it('reads a plan that is going again on a timer, and on a notice, until it ends; then remembers what ended', async () => {
    const f = fakes();
    f.state.plans = [plan({ state: 'running', chapters_done: 3 })];
    f.store.track('l', 'b1');
    await settle();
    expect(f.live()).toHaveLength(1);
    f.state.plans = [plan({ state: 'running', chapters_done: 6 })];
    f.fire();
    await settle();
    expect(track(f.store).active[0]!.chapters_done).toBe(6);
    expect(f.live()).toHaveLength(1);
    f.state.plans = [plan({ state: 'completed', chapters_done: 10 })];
    f.store.refreshSoon(0);
    f.fire();
    await settle();
    expect(track(f.store).active).toEqual([]);
    expect(track(f.store).ended?.state).toBe('completed');
    expect(f.live()).toHaveLength(0);
  });

  it('shows a plan started on another device', async () => {
    const f = fakes();
    f.store.track('l', 'b1');
    await settle();
    expect(track(f.store).active).toEqual([]);
    f.state.plans = [plan({ id: 'elsewhere' })];
    f.store.refreshSoon(0);
    f.fire();
    await settle();
    expect(track(f.store).active.map((p) => p.id)).toEqual(['elsewhere']);
  });

  it('forgets everything when another book is shown', async () => {
    const f = fakes();
    f.state.plans = [plan()];
    f.store.track('l', 'b1');
    await settle();
    f.store.track('l', 'b2');
    expect(track(f.store).active).toEqual([]);
    expect(track(f.store).bookId).toBe('b2');
  });
});

describe('pause, resume and stop', () => {
  async function going(f: ReturnType<typeof fakes>, over: Partial<Plan> = {}) {
    f.state.plans = [plan(over)];
    f.store.track('l', 'b1');
    await settle();
  }

  it('pauses, and the plan is paused', async () => {
    const f = fakes();
    await going(f);
    expect((await f.store.pause('p1')).ok).toBe(true);
    expect(track(f.store).active[0]!.state).toBe('paused');
    expect(f.count('create')).toBe(0);
  });

  it('stops, keeping what was made, and remembers that it ended', async () => {
    const f = fakes();
    await going(f, { chapters_done: 4 });
    f.state.stopResult = () => ok(plan({ state: 'stopped', chapters_done: 4 }));
    expect((await f.store.stop('p1')).ok).toBe(true);
    expect(track(f.store).active).toEqual([]);
    expect(track(f.store).ended).toMatchObject({ state: 'stopped', chapters_done: 4 });
    expect(f.live()).toHaveLength(0);
  });

  it('presses once: a double press of Pause sends one request', async () => {
    const f = fakes();
    await going(f);
    const [a, b] = await Promise.all([f.store.pause('p1'), f.store.pause('p1')]);
    expect([a.ok, b.ok]).toEqual([true, false]);
    expect(f.count('pause')).toBe(1);
  });

  it('says what is kept when a pause is refused', async () => {
    const f = fakes();
    await going(f);
    f.state.pauseResult = () => bad(409, 'job_not_pausable');
    const r = await f.store.pause('p1');
    expect(r.ok).toBe(false);
    expect(track(f.store).problem?.text).toMatch(/^Finished chapters are kept\./);
  });

  it('resumes only a paused or needs-you plan', async () => {
    const f = fakes();
    await going(f, { state: 'running' });
    expect((await f.store.resume('p1')).ok).toBe(false);
    expect(f.count('resume')).toBe(0);
    const g = fakes();
    await going(g, { state: 'paused' });
    expect((await g.store.resume('p1')).ok).toBe(true);
    expect(g.resumed).toEqual([{ id: 'p1', newLimit: undefined }]);
  });

  it('raises the limit on resume only with a typed amount above the current limit, as integer micros', async () => {
    const f = fakes();
    await going(f, { state: 'needs_you', needs_you: { code: 'limit_exceeded', text: '' } });
    expect((await f.store.resume('p1', '2.60')).ok).toBe(false);
    expect((await f.store.resume('p1', 'a lot')).ok).toBe(false);
    expect(f.count('resume')).toBe(0);
    expect((await f.store.resume('p1', '3.40')).ok).toBe(true);
    expect(f.resumed).toEqual([{ id: 'p1', newLimit: { micros: 3_400_000, currency: 'USD' } }]);
  });

  it('opens the raise field when a resume is refused for the limit', async () => {
    const f = fakes();
    await going(f, { state: 'paused' });
    f.state.resumeResult = () => bad(409, 'limit_exceeded');
    await f.store.resume('p1');
    expect(track(f.store).raisePlanId).toBe('p1');
    expect(track(f.store).problem?.text).toMatch(/^Finished chapters are kept\./);
    f.store.dismissProblem();
    expect(track(f.store).raisePlanId).toBeNull();
  });

  it('says so when the server cannot be reached and keeps what is kept first', async () => {
    const f = fakes();
    await going(f);
    f.state.pauseResult = () => ({ ok: false, status: 0, detail: 'down' });
    await f.store.pause('p1');
    expect(track(f.store).problem?.text).toMatch(/^Finished chapters are kept\./);
  });

  it('does nothing for a plan it is not following', async () => {
    const f = fakes();
    expect((await f.store.stop('nope')).ok).toBe(false);
    expect(f.count('stop')).toBe(0);
  });
});
