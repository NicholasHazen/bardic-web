// The Gemini account and the Allowance: the words and rules the screens show. Pure functions; no DOM, no network.
// Rules (AGENTS.md, spec 5.4 V2/V5, 5.8 PL8 to PL11, 8): money is integer micros; an unknown cost is counted as an
// item and never as zero; every problem begins with what is kept; the provider key is write-only, so nothing here
// takes a key, and a message is chosen from the server's error code, never copied from its text.
import { moneyText, parseMicros, type Money, type Spend } from './money';
import type { components } from '../api/schema';

export type Allowance = components['schemas']['Allowance'];
export type Price = components['schemas']['Price'];
export type Plan = components['schemas']['Plan'];

// ---------------------------------------------------------------- the key

export interface Words {
  title: string;
  body: string;
}

const KEPT = 'Audio already made is kept and still plays.';

/**
 * What to say when the server refused a key or could not check it. Chosen from the code alone: the server's own text
 * is not shown, so nothing a provider says can reach the screen. What is kept comes first.
 */
export function keyErrorWords(code: string | undefined): Words {
  switch (code) {
    case 'key_rejected':
      return { title: 'Key rejected', body: `${KEPT} Google rejected that key, so nothing was changed. Check that it is a Gemini API key and paste it again.` };
    case 'key_still_rejected':
      return { title: 'Still rejected', body: `${KEPT} Google still rejects the stored key. Paste a new key and press Replace key.` };
    case 'source_unreachable':
      return { title: 'Couldn’t check the key', body: `${KEPT} Your Bardic computer could not reach Google to check the key, so nothing was changed. Try again in a moment.` };
    case 'network':
      return { title: 'Couldn’t reach your Bardic computer', body: `${KEPT} Nothing was changed. Check that your Bardic computer is on, then try again.` };
    case 'invalid_request':
      return { title: 'That key can’t be used', body: `${KEPT} Nothing was changed. Paste the key again without spaces or line breaks.` };
    default:
      return { title: 'Something went wrong', body: `${KEPT} Nothing was changed. Try again.` };
  }
}

/** The key as the server wants it: the text the listener pasted, without the spaces and line breaks around it. */
export function cleanKey(input: string): string {
  return input.trim();
}

export const KEY_CONNECTED: Words = {
  title: 'Connected',
  body: 'The key works. Bardic can’t see your Google balance, so it counts spending from published rates. That count is an estimate.',
};
export const KEY_NOT_SET_UP: Words = {
  title: 'Not set up',
  body: 'Paste a Google API key for Gemini, then press Check key. Checking is free and starts nothing. Premium audio is only made from a plan you approve.',
};

/** What a plan stopped by the key kept: how many chapters were already made and out of how many. */
export interface Kept {
  plans: number;
  done: number;
  total: number;
}

/** The plans the key stopped (`needs_you` with the code `key_rejected`), and what they kept. null when there are none. */
export function keptByKeyProblem(plans: readonly Pick<Plan, 'state' | 'needs_you' | 'chapters_done' | 'chapters_total'>[]): Kept | null {
  const hit = plans.filter((p) => p.state === 'needs_you' && p.needs_you?.code === 'key_rejected');
  if (!hit.length) return null;
  return { plans: hit.length, done: hit.reduce((n, p) => n + p.chapters_done, 0), total: hit.reduce((n, p) => n + p.chapters_total, 0) };
}

/** The key-problem text (PL11): what is kept first, then what stopped. */
export function keyProblemWords(kept: Kept | null): Words {
  const stopped = !kept
    ? ''
    : kept.plans === 1
      ? `a plan in progress stopped with ${kept.done} of ${kept.total} chapters kept`
      : `${kept.plans} plans in progress stopped with ${kept.done} of ${kept.total} chapters kept`;
  const first = stopped ? `Audio already made keeps playing, and ${stopped}.` : 'Audio already made keeps playing.';
  return { title: 'Google rejected the key', body: `${first} Premium voices are paused.` };
}

export const KEY_PROBLEM_FREE = 'Free voices are not affected.';

// ---------------------------------------------------------------- prices

function dayText(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

/**
 * "Prices as of 30 September 2026, from a list entered by hand." Honest about where the price comes from. The provider
 * price interface is not connected yet (refreshPrices says so in `refresh_error`), so that is shown rather than hidden.
 */
export function pricesLine(prices: readonly Price[], provider = 'gemini', timeZone?: string): string {
  const p = prices.find((x) => x.provider === provider);
  if (!p) return '';
  const when = dayText(p.as_of, timeZone);
  const asOf = when ? `Prices as of ${when}` : 'Prices';
  const how = p.basis === 'manual' ? ', from a list entered by hand' : ', read from Google';
  const note = p.refresh_error ? ` ${p.refresh_error}` : '';
  return `${asOf}${how}.${note}`;
}

// ---------------------------------------------------------------- spending

/** "$2.60 spent". With nothing priced yet it says so instead of showing $0.00. */
export function spentHeadline(s: Spend): string {
  if (s.unknown_items > 0 && s.known.micros === 0) return 'Not priced yet';
  return `${moneyText(s.known)} spent`;
}

/** "1 item with unknown cost is not counted as $0." Empty when every item was priced. */
export function unknownNote(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '1 item with unknown cost is not counted as $0.' : `${n} items with unknown cost are not counted as $0.`;
}

/** "Estimated from published rates, not your provider's bill." plus the unknown count, in one line. */
export function spendNote(s: Spend): string {
  const base = 'Estimated from published rates, not your provider’s bill.';
  const un = unknownNote(s.unknown_items);
  return un ? `${base} ${un}` : base;
}

/** "$2.60 of $20.00". */
export function spentOfLimit(s: Spend, limit: Money): string {
  const known = s.known.micros === 0 && s.unknown_items > 0 ? 'Not priced yet' : moneyText(s.known);
  return `${known} of ${moneyText(limit)}`;
}

/** How much of the monthly limit the known spend has used, 0 to 1 (over the limit shows a full bar). */
export function usedFraction(s: Spend, limit: Money): number {
  if (limit.micros <= 0) return 1;
  return Math.min(1, Math.max(0, s.known.micros / limit.micros));
}

/** Whole-percent width for the bar, in integer arithmetic. */
export function usedPercent(s: Spend, limit: Money): number {
  if (limit.micros <= 0) return 100;
  return Math.min(100, Math.floor((s.known.micros * 100) / limit.micros));
}

/** What is left under the monthly limit, as known now ("$17.40 left"); "Nothing left" at or over it. Unknown items may lower it. */
export function leftText(s: Spend, limit: Money): string {
  const left = limit.micros - s.known.micros;
  const more = s.unknown_items > 0 ? ' Items not priced may lower it.' : '';
  return left > 0 ? `${moneyText({ micros: left, currency: limit.currency })} left this month.${more}` : `Nothing left this month.${more}`;
}

/** "Resets on the 1st." or "Resets on 1 November.", from the end of the period. */
export function resetsText(periodEnd: string): string {
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return '';
  if (d.getDate() === 1) return 'Resets on the 1st.';
  return `Resets on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`;
}

// ---------------------------------------------------------------- limits (PL8, PL9)

export type Parsed = { ok: true; micros: number } | { ok: false; message: string };

/** Dollars typed by a person to micros, or what is wrong in words. Zero is refused: a limit of nothing is "off" or a mistake. */
export function parseLimit(text: string, what: string): Parsed {
  if (!text.trim()) return { ok: false, message: `Enter ${what}, like 20 or 20.00.` };
  const micros = parseMicros(text);
  if (micros === null) return { ok: false, message: `${what[0]!.toUpperCase()}${what.slice(1)} must be an amount in dollars, like 20 or 20.00.` };
  if (micros <= 0) return { ok: false, message: `${what[0]!.toUpperCase()}${what.slice(1)} must be more than $0. To have no monthly limit, turn the limit off.` };
  return { ok: true, micros };
}

/** Micros to the text a field starts with: "20.00". Integer arithmetic, no float; keeps sub-cent digits if there are any. */
export function limitFieldText(m: Money | null | undefined): string {
  if (!m) return '';
  const whole = Math.floor(m.micros / 1_000_000);
  const frac = String(m.micros % 1_000_000).padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${frac}`;
}

/** The form's two amounts, checked. `monthly` is null when the limit is off. */
export interface LimitForm {
  on: boolean;
  monthly: string;
  plan: string;
}
export interface LimitCheck {
  ok: boolean;
  monthlyError: string;
  planError: string;
  /** The amounts to send when ok: monthly null when off. */
  monthly: number | null;
  plan: number | null;
}

export function checkLimits(f: LimitForm): LimitCheck {
  const m = f.on ? parseLimit(f.monthly, 'a monthly limit') : null;
  const p = parseLimit(f.plan, 'a default limit for one plan');
  const monthlyError = m && !m.ok ? m.message : '';
  const planError = !p.ok ? p.message : '';
  return {
    ok: !monthlyError && !planError,
    monthlyError,
    planError,
    monthly: m && m.ok ? m.micros : null,
    plan: p.ok ? p.micros : null,
  };
}

/** True when a monthly limit is below what has already been spent (PL9). Unknown items cannot be added, so only the known total is compared. */
export function belowSpending(limitMicros: number | null, spent: Spend): boolean {
  return limitMicros !== null && limitMicros < spent.known.micros;
}

/** The PL9 note: a limit below spending is allowed, and says what it does. What is kept comes first. */
export const BELOW_SPENDING_WORDS: Words = {
  title: 'This limit is below what has been spent',
  body: 'Everything already made is kept. New plans can’t start, and a plan that is running stops at its next chapter boundary. Raise or turn off the limit to continue.',
};

/** After the limit is turned off (PL9). */
export const LIMIT_OFF_NOTE = 'A plan that is running keeps its own limit.';

export const PLAN_LIMIT_NOTE = 'Shared by all listeners';

/** The server's refusal of an Allowance change, in words. Nothing was saved. */
export function allowanceErrorWords(code: string | undefined): string {
  switch (code) {
    case 'network':
      return 'Your Bardic computer could not be reached, so nothing was saved. Try again.';
    case 'listener_not_found':
      return 'Choose who is listening first, then save again. Nothing was saved.';
    case 'invalid_request':
      return 'Your Bardic computer did not accept those amounts, so nothing was saved. Check them and try again.';
    default:
      return 'The Allowance was not saved. Try again.';
  }
}
