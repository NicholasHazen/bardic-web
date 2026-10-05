import { describe, expect, it } from 'vitest';
import {
  actionProblem,
  allowanceLeftText,
  approvalBlock,
  approvalProblem,
  approveLabel,
  blockedText,
  checkLimit,
  checkRaise,
  costText,
  defaultLimit,
  endedText,
  explainerPoints,
  keptText,
  lengthText,
  limitNote,
  minLimit,
  monthlyText,
  needsYouText,
  planCardModel,
  smallerScope,
  spendLine,
  suggestRaise,
  untilText,
  waitingWhen,
  type Plan,
  type PlanEstimate,
} from './planRules';
import { spendText } from './money';

const usd = (cents: number) => ({ micros: cents * 10_000, currency: 'USD' });
const NOW = Date.parse('2026-10-01T10:00:00Z');

const est = (over: Partial<PlanEstimate> = {}): PlanEstimate => ({
  estimate_id: 'e1',
  expires_at: new Date(NOW + 15 * 60_000).toISOString(),
  audiobook_id: 'ab',
  scope: { kind: 'whole_book' },
  text_characters: 412_000,
  chapters_to_make: 22,
  chapters_reused: 0,
  seconds_estimate: 29_428,
  cost: { low: usd(180), likely: usd(210), high: usd(260), prices_as_of: '2026-09-12T08:00:00Z', basis: 'provider' },
  suggested_limit: usd(260),
  allowance: { monthly_limit: null, remaining: null },
  blocked: null,
  ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  audiobook_id: 'ab',
  book_id: 'b',
  scope: { kind: 'whole_book' },
  state: 'running',
  estimate: est().cost,
  limit: usd(260),
  spent: { known: usd(128), unknown_items: 0 },
  job_id: 'j1',
  chapters_total: 22,
  chapters_done: 13,
  waiting: null,
  needs_you: null,
  approved_by: { listener_id: 'l', listener_name: 'Nick', device_id: 'd', device_name: 'This device' },
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T09:00:00Z',
  ...over,
});

describe('the limit (PL2)', () => {
  it('offers the top of the range rounded up to ten cents, as the server suggests', () => {
    expect(defaultLimit(est())).toEqual(usd(260));
  });

  it('brings the default down to what is left of the Allowance when that still covers the likely cost', () => {
    const e = est({ allowance: { monthly_limit: usd(2000), remaining: usd(240) } });
    expect(defaultLimit(e)).toEqual(usd(240));
  });

  it('keeps the least valid limit when the Allowance cannot cover even the likely cost', () => {
    const e = est({ allowance: { monthly_limit: usd(2000), remaining: usd(190) } });
    expect(defaultLimit(e)).toEqual(usd(260));
  });

  it('accepts an amount from the likely cost up', () => {
    const e = est();
    expect(checkLimit('2.10', e)).toEqual({ ok: true, limit: usd(210) });
    expect(checkLimit('$3', e)).toEqual({ ok: true, limit: usd(300) });
    expect(checkLimit(' 2.60 ', e)).toEqual({ ok: true, limit: usd(260) });
  });

  it('refuses a limit below the most likely cost and says why', () => {
    const r = checkLimit('2.00', est());
    expect(r).toMatchObject({ ok: false, problem: 'below_likely' });
    expect(r.ok ? '' : r.text).toContain('at least $2.10');
  });

  it('rounds the least limit up to the cent so that what is typed is never below the likely cost', () => {
    const e = est({ cost: { ...est().cost, likely: { micros: 2_104_900, currency: 'USD' } } });
    expect(minLimit(e)).toEqual(usd(211));
    expect(checkLimit('2.10', e)).toMatchObject({ ok: false, problem: 'below_likely' });
    expect(checkLimit('2.11', e).ok).toBe(true);
  });

  it('refuses nothing typed, text, zero and amounts with more than six decimals, without a float anywhere', () => {
    expect(checkLimit('', est())).toMatchObject({ ok: false, problem: 'empty' });
    expect(checkLimit('lots', est())).toMatchObject({ ok: false, problem: 'invalid' });
    expect(checkLimit('0', est())).toMatchObject({ ok: false, problem: 'zero' });
    expect(checkLimit('-1', est())).toMatchObject({ ok: false, problem: 'invalid' });
    expect(checkLimit('2.1234567', est())).toMatchObject({ ok: false, problem: 'invalid' });
  });

  it('refuses a limit above what is left of the Allowance when the Allowance can cover the plan', () => {
    const e = est({ allowance: { monthly_limit: usd(2000), remaining: usd(240) } });
    expect(checkLimit('2.40', e).ok).toBe(true);
    const over = checkLimit('2.50', e);
    expect(over).toMatchObject({ ok: false, problem: 'over_allowance' });
    expect(over.ok ? '' : over.text).toContain('$2.40 left of your Allowance');
  });

  it('rounds what is left down to the cent, so a limit offered by default is never over what is left', () => {
    const e = est({ allowance: { monthly_limit: usd(2000), remaining: { micros: 2_399_999, currency: 'USD' } } });
    expect(defaultLimit(e)).toEqual(usd(239));
    expect(checkLimit('2.40', e)).toMatchObject({ ok: false, problem: 'over_allowance' });
    expect(checkLimit('2.39', e).ok).toBe(true);
    expect(allowanceLeftText(e.allowance)).toBe('$2.39 of $20.00');
  });

  it('does not use the Allowance as an upper bound when it cannot cover the likely cost, but says so', () => {
    const e = est({ allowance: { monthly_limit: usd(2000), remaining: usd(190) } });
    expect(checkLimit('2.60', e).ok).toBe(true);
    expect(limitNote(usd(260), e)).toBe('Your Allowance has $1.90 left, so it would stop the plan first.');
    expect(limitNote(usd(190), e)).toBeNull();
    expect(limitNote(usd(260), est())).toBeNull();
  });

  it('names the cost on the button', () => {
    expect(approveLabel(usd(260))).toBe('Approve plan · up to $2.60');
  });
});

describe('when a plan may be approved', () => {
  const base = () => ({ estimate: est(), limit: checkLimit('2.60', est()), nowMs: NOW, used: new Set<string>(), busy: false });

  it('may, with a fresh estimate that fits, a valid limit and nothing in flight', () => {
    expect(approvalBlock(base())).toBeNull();
  });

  it('may not without an estimate', () => {
    expect(approvalBlock({ ...base(), estimate: null })).toBe('no_estimate');
  });

  it('may not with an estimate older than its 15 minutes', () => {
    expect(approvalBlock({ ...base(), nowMs: NOW + 15 * 60_000 })).toBe('expired');
    expect(approvalBlock({ ...base(), nowMs: NOW + 15 * 60_000 - 1 })).toBeNull();
  });

  it('may not twice for one estimate', () => {
    expect(approvalBlock({ ...base(), used: new Set(['e1']) })).toBe('used');
  });

  it('may not while an approval is in flight', () => {
    expect(approvalBlock({ ...base(), busy: true })).toBe('busy');
  });

  it('may not when the plan would pass the Allowance', () => {
    const e = est({ blocked: { code: 'allowance_exceeded', text: 'x' } });
    expect(approvalBlock({ ...base(), estimate: e })).toBe('blocked');
  });

  it('may not when there is nothing to make or no price is known', () => {
    expect(approvalBlock({ ...base(), estimate: est({ chapters_to_make: 0 }) })).toBe('nothing_to_make');
    const unpriced = est({ cost: { ...est().cost, basis: 'unknown' } });
    expect(approvalBlock({ ...base(), estimate: unpriced })).toBe('unpriced');
  });

  it('may not with a limit that is not valid', () => {
    expect(approvalBlock({ ...base(), limit: checkLimit('1', est()) })).toBe('bad_limit');
    expect(approvalBlock({ ...base(), limit: null })).toBe('bad_limit');
  });
});

describe('the figures of the sheet', () => {
  it('shows the range and never a made-up one when the price is unknown', () => {
    expect(costText(est().cost)).toBe('$1.80 to $2.60');
    expect(costText({ ...est().cost, basis: 'unknown' })).toBe('Not known');
  });

  it('says a length is the length of the audio, and an unknown one is unknown', () => {
    expect(lengthText(2400)).toBe('About 40 min of audio');
    expect(lengthText(null)).toBe('Not known');
  });

  it('says what is left of the Allowance, or that none is set', () => {
    const a = { monthly_limit: usd(2000), remaining: usd(120) };
    expect(allowanceLeftText(a)).toBe('$1.20 of $20.00');
    expect(monthlyText(a)).toBe('$1.20 left of $20.00');
    expect(allowanceLeftText({ monthly_limit: null, remaining: null })).toBeNull();
    // spending already past the limit leaves nothing; it is never shown as a negative amount
    const past = { monthly_limit: usd(2000), remaining: { micros: -600, currency: 'USD' } };
    expect(allowanceLeftText(past)).toBe('$0.00 of $20.00');
    expect(monthlyText(past)).toBe('$0.00 left of $20.00');
    expect(blockedText(est({ allowance: past }), true).text).toContain('$0.00 is left this month');
    expect(monthlyText({ monthly_limit: null, remaining: null })).toBe('None set');
  });

  it('explains the estimate from the real numbers and the date of the prices', () => {
    const pts = explainerPoints({ text_characters: 412_000, cost: est().cost, chapters: 22 });
    expect(pts.map((p) => p.id)).toEqual(['knows', 'assumes', 'differ', 'unknown']);
    expect(pts[0]!.text).toBe('The exact text: 412,000 characters in 22 chapters.');
    expect(pts[1]!.text).toContain('checked on 12 September');
    expect(pts[3]!.text).toContain('does not count it as $0');
    const unknown = explainerPoints({ text_characters: 5, cost: { ...est().cost, basis: 'unknown' }, chapters: 1 });
    expect(unknown[1]!.text).toContain('No price is known');
    const manual = explainerPoints({ text_characters: 5, cost: { ...est().cost, basis: 'manual' }, chapters: 1 });
    expect(manual[1]!.text).toContain('A price entered on your Bardic computer');
  });
});

describe('a smaller plan (PL3)', () => {
  const chapters = Array.from({ length: 10 }, (_, i) => ({ id: `c${i + 1}`, words: 1000 }));

  it('takes the longest start of the plan whose top-of-range cost fits what is left', () => {
    // high $2.60 over 10 equal chapters is $0.26 each: $1.20 holds 4
    expect(smallerScope(chapters, { low: usd(180), high: usd(260) }, 120 * 10_000)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('falls back to the low end when not even the first chapter fits at the high end', () => {
    // high $2.60: $0.26 a chapter; $0.20 left: no; low $1.80: $0.18 a chapter: one fits
    expect(smallerScope(chapters, { low: usd(180), high: usd(260) }, 20 * 10_000)).toEqual(['c1']);
  });

  it('offers nothing when not even the first chapter fits, or when there is one chapter or no words', () => {
    expect(smallerScope(chapters, { low: usd(180), high: usd(260) }, 5 * 10_000)).toBeNull();
    expect(smallerScope([{ id: 'c1', words: 10 }], { low: usd(1), high: usd(2) }, 1_000_000)).toBeNull();
    expect(smallerScope([{ id: 'c1', words: 0 }, { id: 'c2', words: 0 }], { low: usd(1), high: usd(2) }, 1_000_000)).toBeNull();
  });

  it('never offers the whole plan again', () => {
    expect(smallerScope(chapters, { low: usd(1), high: usd(2) }, 100_000_000)).toHaveLength(9);
  });

  it('says what the Allowance leaves', () => {
    const t = blockedText(est({ allowance: { monthly_limit: usd(2000), remaining: usd(120) } }), true);
    expect(t.title).toBe('The whole book would pass your Allowance');
    expect(t.text).toBe('It needs about $2.10 and $1.20 is left this month. Choose a smaller plan, or raise the Allowance in Settings.');
  });
});

describe('what each refusal of an approval says', () => {
  const codes = ['estimate_expired', 'estimate_used', 'estimate_changed', 'estimate_not_found', 'allowance_exceeded', 'limit_below_estimate', 'nothing_to_make', 'plan_active', 'key_rejected', 'source_not_set_up', 'plan_not_needed', 'something_new'];

  it('begins every one with what is kept or that nothing was started', () => {
    for (const c of codes) {
      const p = approvalProblem(c, 'It broke.');
      expect(p.text, c).toMatch(/^(Nothing was started|Every chapter|A free voice|Nothing new was started)/);
      expect(p.title.length, c).toBeGreaterThan(3);
    }
  });

  it('puts a stale estimate in a new one for the listener to approve, and nothing else', () => {
    for (const c of ['estimate_expired', 'estimate_used', 'estimate_changed', 'estimate_not_found']) {
      const p = approvalProblem(c, '');
      expect(p.action, c).toBe('preview_again');
      expect(p.text, c).toContain('Check the new numbers, then approve');
    }
  });

  it('maps each code to what can be done', () => {
    expect(approvalProblem('allowance_exceeded', '').action).toBe('allowance');
    expect(approvalProblem('key_rejected', '').action).toBe('fix_key');
    expect(approvalProblem('source_not_set_up', '').action).toBe('fix_key');
    expect(approvalProblem('plan_active', '').action).toBe('show_plan');
    expect(approvalProblem('limit_below_estimate', '', usd(211)).text).toContain('at least $2.11');
    expect(approvalProblem('nothing_to_make', '').text).toContain('already made and kept');
    expect(approvalProblem('plan_not_needed', '').title).toBe('This voice is free');
  });

  it('keeps the words of an unknown code, after what is kept', () => {
    const p = approvalProblem('brand_new', 'The server said so.');
    expect(p.text).toBe('Nothing was started and nothing was spent. Audio already made is kept. The server said so.');
  });

  it('begins the words of a failed pause, resume or stop with what is kept', () => {
    for (const code of ['limit_exceeded', 'allowance_exceeded', 'key_rejected', 'job_not_pausable', 'job_running', 'plan_not_resumable', 'other']) {
      expect(actionProblem('resume', code, 'x', usd(260)).text, code).toMatch(/^Finished chapters are kept\./);
    }
    expect(actionProblem('resume', 'limit_exceeded', '', usd(260)).text).toContain('$2.60');
  });
});

describe('a plan that is going', () => {
  it('shows the known spend against the limit, and unknown items beside it, never as zero', () => {
    expect(spendLine({ known: usd(128), unknown_items: 0 }, usd(260))).toBe('$1.28 of up to $2.60 spent');
    expect(spendLine({ known: usd(128), unknown_items: 2 }, usd(260))).toBe('$1.28 of up to $2.60 spent, plus 2 items not priced');
    expect(spendLine({ known: usd(128), unknown_items: 1 }, usd(260))).toBe('$1.28 of up to $2.60 spent, plus 1 item not priced');
    expect(spendLine({ known: usd(0), unknown_items: 3 }, usd(260))).toBe('3 items not priced, limit $2.60');
    expect(spendLine({ known: usd(0), unknown_items: 0 }, usd(260))).toBe('$0.00 of up to $2.60 spent');
  });

  it('uses the same words as the shared spend text for the same figures', () => {
    expect(spendText({ known: usd(128), unknown_items: 2 })).toBe('$1.28 and 2 items not priced');
    expect(spendText({ known: usd(0), unknown_items: 2 })).toBe('2 items not priced');
  });

  it('says how long until a time the way a person does', () => {
    expect(untilText(40)).toBe('40 s');
    expect(untilText(7)).toBe('5 s');
    expect(untilText(2)).toBe('5 s');
    expect(untilText(300)).toBe('5 min');
    expect(untilText(3 * 3600)).toBe('3 h');
  });

  it('says "Continues in about 40 s" for a short wait', () => {
    const w = waitingWhen(new Date(NOW + 40_000).toISOString(), NOW);
    expect(w.continues).toBe('Continues in about 40 s');
    expect(w.daily).toBe(false);
  });

  it('treats a wait of a few minutes as a quota wait', () => {
    const w = waitingWhen(new Date(NOW + 45 * 60_000).toISOString(), NOW);
    expect(w.continues).toBe('Continues in about 45 min');
    expect(w.daily).toBe(true);
  });

  it('says tomorrow with the time for a long wait, in the device time zone', () => {
    const now = Date.parse('2026-10-01T20:30:00Z');
    const until = '2026-10-02T00:00:00Z';
    const w = waitingWhen(until, now, 'UTC');
    expect(w.continues).toBe('Continue tomorrow automatically');
    expect(w.resets).toBe('Google’s quota resets about 12:00 a.m. tomorrow.');
    expect(w.daily).toBe(true);
    expect(waitingWhen('2026-10-01T23:00:00Z', now, 'UTC').continues).toBe('Continues in about 3 h');
  });

  it('does not invent a time that is not known', () => {
    const w = waitingWhen(null, NOW);
    expect(w.continues).toBe('Continues by itself');
    expect(w.resets).toBe('Google has not said when its quota resets.');
  });

  it('describes a plan waiting for the quota, as the board does', () => {
    const p = plan({ state: 'waiting', waiting: { code: 'waiting_quota', text: 'x', until: '2026-10-02T00:00:00Z' } });
    const m = planCardModel(p, { voiceName: 'Kore', nowMs: Date.parse('2026-10-01T20:30:00Z'), chaptersReady: 13, tz: 'UTC' });
    expect(m.tone).toBe('waiting');
    expect(m.title).toBe('Waiting for Google’s daily quota');
    expect(m.detail).toBe('Kore · 13 of 22 ready · $1.28 of up to $2.60 spent');
    expect(m.body).toBe('Finished chapters keep playing. Google’s quota resets about 12:00 a.m. tomorrow. Continuing stays inside this plan’s original $2.60 limit.');
    expect(m.progress).toBeCloseTo(13 / 22);
    expect(m.canMakeRestFree).toBe(true);
    expect(m.canResume).toBe(false);
  });

  it('describes a running plan with Pause, and a paused one with Resume, both saying what is kept', () => {
    const run = planCardModel(plan(), { voiceName: 'Kore', nowMs: NOW });
    expect(run).toMatchObject({ tone: 'making', title: 'Making it ready', canPause: true, canResume: false });
    expect(run.body).toContain('Finished chapters are kept');
    const paused = planCardModel(plan({ state: 'paused' }), { voiceName: 'Kore', nowMs: NOW });
    expect(paused).toMatchObject({ tone: 'paused', title: 'Paused', canResume: true, canPause: false });
    expect(paused.body).toBe('13 of 22 chapters are ready and kept. Resume continues inside the limit of $2.60.');
  });

  it('begins every needs-you text with what is kept', () => {
    for (const code of ['limit_exceeded', 'allowance_exceeded', 'key_rejected', 'source_not_set_up', 'repeated_failure', 'provider_refused', 'voice_changed', 'source_unreachable', 'whatever']) {
      const p = plan({ state: 'needs_you', needs_you: { code, text: 'Server words.' } });
      expect(needsYouText(p).text, code).toMatch(/^13 of 22 chapters are ready and kept\./);
    }
    expect(keptText(plan({ chapters_done: 0 }))).toBe('Nothing has been made yet, and nothing is lost.');
    expect(keptText(plan({ chapters_done: 1 }))).toBe('1 of 22 chapters is ready and kept.');
  });

  it('offers a higher limit when the limit was reached, the Allowance or the key when those were', () => {
    const limit = planCardModel(plan({ state: 'needs_you', needs_you: { code: 'limit_exceeded', text: '' } }), { voiceName: 'Kore', nowMs: NOW });
    expect(limit.raise).toBeDefined();
    expect(limit.canResume).toBe(false);
    const allowance = planCardModel(plan({ state: 'needs_you', needs_you: { code: 'allowance_exceeded', text: '' } }), { voiceName: 'Kore', nowMs: NOW });
    expect(allowance.fix).toBe('allowance');
    expect(allowance.canResume).toBe(false);
    const key = planCardModel(plan({ state: 'needs_you', needs_you: { code: 'key_rejected', text: '' } }), { voiceName: 'Kore', nowMs: NOW });
    expect(key.fix).toBe('key');
    expect(key.canResume).toBe(true);
    const failed = planCardModel(plan({ state: 'needs_you', needs_you: { code: 'repeated_failure', text: '' } }), { voiceName: 'Kore', nowMs: NOW });
    expect(failed).toMatchObject({ canResume: true });
    expect(failed.raise).toBeUndefined();
  });

  it('suggests a raised limit that finishes the rest at the top of the range, rounded up, and above the old limit', () => {
    const p = plan({ chapters_done: 13, chapters_total: 22, spent: { known: usd(260), unknown_items: 0 } });
    // rest: high $2.60 * 9/22 = $1.0636...; plus spent $2.60 = $3.66 -> $3.70
    expect(suggestRaise(p)).toEqual(usd(370));
    const tiny = plan({ chapters_done: 21, chapters_total: 22, spent: { known: usd(10), unknown_items: 0 } });
    expect(suggestRaise(tiny).micros).toBe(usd(260).micros + 100_000);
  });

  it('only accepts a raised limit that is more than the current one', () => {
    const p = plan();
    expect(checkRaise('3.40', p)).toEqual({ ok: true, limit: usd(340) });
    expect(checkRaise('2.60', p)).toMatchObject({ ok: false });
    expect(checkRaise('', p)).toMatchObject({ ok: false, problem: 'empty' });
    expect(checkRaise('abc', p)).toMatchObject({ ok: false, problem: 'invalid' });
  });

  it('says what an ended plan kept and spent', () => {
    expect(endedText(plan({ state: 'stopped' })).text).toBe('13 of 22 chapters are ready and kept. $1.28 of up to $2.60 spent.');
    expect(endedText(plan({ state: 'completed', chapters_done: 22 })).title).toBe('Plan finished');
    expect(endedText(plan({ state: 'failed', spent: { known: usd(0), unknown_items: 1 } })).text).toContain('1 item not priced');
  });
});
