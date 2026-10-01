import { describe, expect, it } from 'vitest';
import {
  allowanceErrorWords,
  belowSpending,
  BELOW_SPENDING_WORDS,
  checkLimits,
  cleanKey,
  keptByKeyProblem,
  keyErrorWords,
  keyProblemWords,
  leftText,
  limitFieldText,
  parseLimit,
  pricesLine,
  resetsText,
  spendNote,
  spentHeadline,
  spentOfLimit,
  unknownNote,
  usedPercent,
} from './accountText';

const usd = (micros: number) => ({ micros, currency: 'USD' });

describe('key errors', () => {
  it('every message begins with what is kept (audio made) or says nothing changed, and is chosen from the code', () => {
    for (const code of ['key_rejected', 'source_unreachable', 'network', 'invalid_request', 'key_still_rejected', 'weird']) {
      const w = keyErrorWords(code);
      expect(w.body.startsWith('Audio already made is kept and still plays.')).toBe(true);
    }
    expect(keyErrorWords('key_rejected').title).toBe('Key rejected');
    expect(keyErrorWords('key_rejected').body).toContain('nothing was changed');
    expect(keyErrorWords('source_unreachable').title).toBe('Couldn’t check the key');
    expect(keyErrorWords('network').title).toBe('Couldn’t reach your Bardic computer');
    expect(keyErrorWords(undefined).title).toBe('Something went wrong');
  });

  it('takes only a code, so no server text or key can reach the words', () => {
    expect(keyErrorWords.length).toBe(1);
    expect(JSON.stringify(keyErrorWords('key_rejected'))).not.toMatch(/AIza|api[_ ]key:/i);
  });

  it('trims pasted keys', () => {
    expect(cleanKey('  abc \n')).toBe('abc');
  });
});

describe('key problem (PL11)', () => {
  const plan = (state: string, code: string | null, done: number, total: number) =>
    ({ state, needs_you: code ? { code, text: '' } : null, chapters_done: done, chapters_total: total }) as never;

  it('finds the plans the key stopped and what they kept', () => {
    expect(keptByKeyProblem([plan('needs_you', 'key_rejected', 13, 22), plan('running', null, 3, 10), plan('needs_you', 'limit', 1, 9)])).toEqual({ plans: 1, done: 13, total: 22 });
    expect(keptByKeyProblem([plan('needs_you', 'key_rejected', 13, 22), plan('needs_you', 'key_rejected', 2, 5)])).toEqual({ plans: 2, done: 15, total: 27 });
    expect(keptByKeyProblem([])).toBeNull();
  });

  it('says what is kept first, then what stopped', () => {
    expect(keyProblemWords({ plans: 1, done: 13, total: 22 })).toEqual({
      title: 'Google rejected the key',
      body: 'Audio already made keeps playing, and a plan in progress stopped with 13 of 22 chapters kept. Premium voices are paused.',
    });
    expect(keyProblemWords(null).body).toBe('Audio already made keeps playing. Premium voices are paused.');
    expect(keyProblemWords({ plans: 2, done: 15, total: 27 }).body).toContain('2 plans in progress stopped with 15 of 27 chapters kept');
  });
});

describe('prices as of', () => {
  const p = (over = {}) => ({ provider: 'gemini', unit: 'million_characters', per_unit: usd(16_000_000), as_of: '2026-09-30T12:00:00Z', basis: 'manual', refresh_error: null, ...over }) as never;

  it('shows the date and says where the price comes from', () => {
    expect(pricesLine([p()], 'gemini', 'UTC')).toBe('Prices as of 30 September 2026, from a list entered by hand.');
    expect(pricesLine([p({ basis: 'provider' })], 'gemini', 'UTC')).toBe('Prices as of 30 September 2026, read from Google.');
  });

  it('reports the refresh error honestly instead of hiding it', () => {
    expect(pricesLine([p({ refresh_error: 'No provider price interface is connected.' })], 'gemini', 'UTC')).toBe(
      'Prices as of 30 September 2026, from a list entered by hand. No provider price interface is connected.',
    );
  });

  it('says nothing when there is no price for the provider', () => {
    expect(pricesLine([], 'gemini')).toBe('');
  });
});

describe('spending with unknown items', () => {
  const some = { known: usd(2_600_000), unknown_items: 1 };

  it('shows the known total and counts the unknown item beside it, never as $0', () => {
    expect(spentHeadline(some)).toBe('$2.60 spent');
    expect(spendNote(some)).toBe('Estimated from published rates, not your provider’s bill. 1 item with unknown cost is not counted as $0.');
    expect(unknownNote(3)).toBe('3 items with unknown cost are not counted as $0.');
    expect(unknownNote(0)).toBe('');
  });

  it('does not show $0.00 when nothing is priced but something is unknown', () => {
    expect(spentHeadline({ known: usd(0), unknown_items: 2 })).toBe('Not priced yet');
    expect(spentOfLimit({ known: usd(0), unknown_items: 2 }, usd(20_000_000))).toBe('Not priced yet of $20.00');
  });

  it('a truly empty month is $0.00 with no note about unknowns', () => {
    expect(spentHeadline({ known: usd(0), unknown_items: 0 })).toBe('$0.00 spent');
    expect(spendNote({ known: usd(0), unknown_items: 0 })).not.toContain('unknown');
  });

  it('spent of limit, bar and what is left use integer micros', () => {
    expect(spentOfLimit(some, usd(20_000_000))).toBe('$2.60 of $20.00');
    expect(usedPercent(some, usd(20_000_000))).toBe(13);
    expect(usedPercent({ known: usd(30_000_000), unknown_items: 0 }, usd(20_000_000))).toBe(100);
    expect(leftText(some, usd(20_000_000))).toBe('$17.40 left this month. Items not priced may lower it.');
    expect(leftText({ known: usd(20_000_000), unknown_items: 0 }, usd(20_000_000))).toBe('Nothing left this month.');
  });

  it('reset line', () => {
    expect(resetsText(new Date(2026, 10, 1).toISOString())).toBe('Resets on the 1st.');
    expect(resetsText(new Date(2026, 10, 15).toISOString())).toBe('Resets on 15 November.');
  });
});

describe('limit validation', () => {
  it('parses dollars to integer micros without floats', () => {
    expect(parseLimit('20', 'a monthly limit')).toEqual({ ok: true, micros: 20_000_000 });
    expect(parseLimit('$1,000.10', 'a monthly limit')).toEqual({ ok: true, micros: 1_000_100_000 });
    expect(parseLimit('0.1', 'x')).toEqual({ ok: true, micros: 100_000 });
  });

  it('says what is wrong', () => {
    expect(parseLimit('', 'a monthly limit')).toEqual({ ok: false, message: 'Enter a monthly limit, like 20 or 20.00.' });
    expect(parseLimit('abc', 'a monthly limit')).toEqual({ ok: false, message: 'A monthly limit must be an amount in dollars, like 20 or 20.00.' });
    expect(parseLimit('-5', 'a monthly limit').ok).toBe(false);
    expect(parseLimit('1e3', 'a monthly limit').ok).toBe(false);
    expect(parseLimit('0', 'a monthly limit')).toEqual({ ok: false, message: 'A monthly limit must be more than $0. To have no monthly limit, turn the limit off.' });
  });

  it('formats micros for a field', () => {
    expect(limitFieldText(usd(20_000_000))).toBe('20.00');
    expect(limitFieldText(usd(5_000_000))).toBe('5.00');
    expect(limitFieldText(usd(1_250_000))).toBe('1.25');
    expect(limitFieldText(usd(1_234_567))).toBe('1.234567');
    expect(limitFieldText(null)).toBe('');
  });

  it('checks both amounts; the monthly amount is ignored while the limit is off', () => {
    expect(checkLimits({ on: false, monthly: 'junk', plan: '5' })).toMatchObject({ ok: true, monthly: null, plan: 5_000_000 });
    expect(checkLimits({ on: true, monthly: '20', plan: '5.00' })).toMatchObject({ ok: true, monthly: 20_000_000, plan: 5_000_000 });
    const bad = checkLimits({ on: true, monthly: '', plan: 'x' });
    expect(bad.ok).toBe(false);
    expect(bad.monthlyError).toContain('Enter a monthly limit');
    expect(bad.planError).toContain('default limit for one plan');
  });

  it('PL9: a limit below spending is allowed and says what it does', () => {
    const spent = { known: usd(2_600_000), unknown_items: 0 };
    expect(belowSpending(1_000_000, spent)).toBe(true);
    expect(belowSpending(2_600_000, spent)).toBe(false);
    expect(belowSpending(null, spent)).toBe(false);
    expect(BELOW_SPENDING_WORDS.body.startsWith('Everything already made is kept.')).toBe(true);
    expect(BELOW_SPENDING_WORDS.body).toContain('New plans can’t start');
    expect(BELOW_SPENDING_WORDS.body).toContain('next chapter boundary');
    // the check itself does not refuse it
    expect(checkLimits({ on: true, monthly: '1', plan: '5' }).ok).toBe(true);
  });

  it('maps a refused save to words and says nothing was saved', () => {
    for (const code of ['network', 'listener_not_found', 'invalid_request', 'x']) expect(allowanceErrorWords(code)).toMatch(/not (saved|accept)|nothing was saved|not saved/i);
  });
});
