import { describe, expect, it } from 'vitest';
import * as fx from '../../fixtures/plans';
import { blockedModel, explainedModel, sheetModel, whyNot } from './model';

const base = { voiceName: 'Kore', options: fx.optionsWhole, selected: 'whole', estimate: fx.estimateWhole, limitText: '$2.60', nowMs: fx.AT };

describe('the plan sheet model', () => {
  it('shows every figure of [PlanPremium] and a button that names the cost', () => {
    const m = sheetModel(base);
    expect(m.eyebrow).toBe('Kore · premium');
    expect(m.rows).toEqual({
      characters: '412,000 characters',
      toMake: '22 chapters',
      length: 'About 8 h 10 min of audio',
      cost: '$1.80 to $2.60',
      likely: '$2.10',
    });
    expect(m.limitShown).toBe('$2.60');
    expect(m.monthly).toBe('None set');
    expect(m.approveLabel).toBe('Approve plan · up to $2.60');
    expect(m.limitProblem).toBeUndefined();
  });

  it('offers no Approve while the estimate is being made, and no figures', () => {
    const m = sheetModel({ ...base, estimate: null, previewing: true });
    expect(m.rows).toBeUndefined();
    expect(m.loading).toBe(true);
    expect(m.approveLabel).toBeUndefined();
  });

  it('offers no Approve with a limit below the most likely cost, and says why', () => {
    const m = sheetModel({ ...base, limitText: '1.50' });
    expect(m.approveLabel).toBeUndefined();
    expect(m.limitProblem).toContain('at least $2.10');
    expect(m.limitShown).toBe('1.50');
  });

  it('shows the limit as an amount once it is one', () => {
    expect(sheetModel({ ...base, limitText: '3' }).limitShown).toBe('$3.00');
    expect(sheetModel({ ...base, limitText: '3' }).approveLabel).toBe('Approve plan · up to $3.00');
  });

  it('offers no Approve for an old estimate, a used one, an unpriced one or one with nothing to make', () => {
    expect(sheetModel({ ...base, nowMs: fx.AT + 16 * 60_000 }).approveLabel).toBeUndefined();
    expect(sheetModel({ ...base, nowMs: fx.AT + 16 * 60_000 }).whyNot).toContain('15 minutes');
    expect(sheetModel({ ...base, used: new Set(['fx-est-whole']) }).approveLabel).toBeUndefined();
    const unpriced = { ...fx.estimateWhole, cost: { ...fx.estimateWhole.cost, basis: 'unknown' as const } };
    const u = sheetModel({ ...base, estimate: unpriced });
    expect(u.approveLabel).toBeUndefined();
    expect(u.rows?.cost).toBe('Not known');
    expect(u.rows?.likely).toBe('Not known');
    expect(u.whyNot).toContain('No price is known');
    const nothing = sheetModel({ ...base, estimate: { ...fx.estimateWhole, chapters_to_make: 0 } });
    expect(nothing.approveLabel).toBeUndefined();
    expect(nothing.whyNot).toContain('already made and kept');
  });

  it('shows a length it does not know as not known', () => {
    expect(sheetModel({ ...base, estimate: { ...fx.estimateWhole, seconds_estimate: null } }).rows?.length).toBe('Not known');
  });

  it('keeps the button while an approval is in flight, saying it is busy', () => {
    const m = sheetModel({ ...base, busy: true, used: new Set(['fx-est-whole']) });
    expect(m.busy).toBe(true);
    expect(m.approveLabel).toBe('Approve plan · up to $2.60');
  });

  it('shows what is left of a monthly limit and warns when the Allowance would stop the plan first', () => {
    const e = { ...fx.estimateWhole, allowance: { monthly_limit: { micros: 20_000_000, currency: 'USD' }, remaining: { micros: 1_900_000, currency: 'USD' } } };
    const m = sheetModel({ ...base, estimate: e });
    expect(m.monthly).toBe('$1.90 left of $20.00');
    expect(m.limitNote).toBe('Your Allowance has $1.90 left, so it would stop the plan first.');
    expect(m.approveLabel).toBe('Approve plan · up to $2.60');
  });

  it('has a reason for each missing Approve', () => {
    expect(whyNot('expired')).toContain('Estimate again');
    expect(whyNot(null)).toBeUndefined();
    expect(whyNot('bad_limit')).toBeUndefined();
  });
});

describe('the blocked sheet model', () => {
  const options = [fx.optionsWhole[0]!, { id: 'smaller', title: 'First 12 chapters', detail: 'About $1.15' }];
  const input = { voiceName: 'Kore', options, selected: 'smaller', estimate: fx.estimateSmaller, blockedFrom: fx.estimateBlocked, whole: true, limitText: '$1.20', nowMs: fx.AT };

  it('says first what would pass the Allowance, as [PlanBlocked] does', () => {
    const m = blockedModel(input);
    expect(m.headline.title).toBe('The whole book would pass your Allowance');
    expect(m.headline.text).toBe('It needs about $2.10 and $1.20 is left this month. Choose a smaller plan, or raise the Allowance in Settings.');
    expect(m.left).toBe('$1.20 of $20.00');
    expect(m.cost).toBe('$0.86 to $1.42');
  });

  it('offers Approve for the smaller plan that fits', () => {
    expect(blockedModel(input).approveLabel).toBe('Approve plan · up to $1.20');
  });

  it('offers no Approve for the plan that would pass the Allowance', () => {
    const m = blockedModel({ ...input, selected: 'whole', estimate: fx.estimateBlocked, limitText: '$2.60' });
    expect(m.approveLabel).toBeUndefined();
    expect(m.cost).toBe('$1.80 to $2.60');
  });

  it('offers no Approve while the smaller plan is being priced', () => {
    const m = blockedModel({ ...input, estimate: null, previewing: true });
    expect(m.approveLabel).toBeUndefined();
    expect(m.loading).toBe(true);
  });

  it('refuses a limit above what is left', () => {
    const m = blockedModel({ ...input, limitText: '$1.45' });
    expect(m.approveLabel).toBeUndefined();
    expect(m.limitProblem).toContain('$1.20 left of your Allowance');
  });
});

describe('the explained model', () => {
  it('gives the range, the most likely value and the four points', () => {
    const m = explainedModel(fx.estimateWhole);
    expect(m.cost).toBe('$1.80 to $2.60');
    expect(m.likely).toBe('Most likely about $2.10');
    expect(m.points).toHaveLength(4);
  });

  it('does not make up a range when no price is known', () => {
    const m = explainedModel({ ...fx.estimateWhole, cost: { ...fx.estimateWhole.cost, basis: 'unknown' } });
    expect(m.cost).toBe('Not known');
    expect(m.likely).toBe('No price is known for this voice');
  });
});
