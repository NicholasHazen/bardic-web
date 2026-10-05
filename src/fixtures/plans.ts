// Synthetic data for the plan boards (PlanPremium, EstimateExplained, PlanBlocked, PlanPaused). Original text only;
// the figures are the boards' own. The sheets go through the same functions the connected flow uses.
import type { Plan, PlanEstimate } from '../lib/planRules';

const usd = (cents: number) => ({ micros: cents * 10_000, currency: 'USD' });

export const AT = Date.parse('2026-10-01T10:00:00Z');
const later = (minutes: number) => new Date(AT + minutes * 60_000).toISOString();

export const kore = { name: 'Kore', audiobookId: 'fx-ab-kore' };

/** [PlanPremium]: the whole book, 22 chapters, no monthly limit. */
export const estimateWhole: PlanEstimate = {
  estimate_id: 'fx-est-whole',
  expires_at: later(15),
  audiobook_id: kore.audiobookId,
  scope: { kind: 'whole_book' },
  text_characters: 412_000,
  chapters_to_make: 22,
  chapters_reused: 0,
  seconds_estimate: 29_428,
  cost: { low: usd(180), likely: usd(210), high: usd(260), prices_as_of: '2026-09-12T08:00:00Z', basis: 'provider' },
  suggested_limit: usd(260),
  allowance: { monthly_limit: null, remaining: null },
  blocked: null,
};

/** The same book with a monthly limit of $20.00 of which $1.20 is left: the whole book would pass it. */
export const estimateBlocked: PlanEstimate = {
  ...estimateWhole,
  estimate_id: 'fx-est-blocked',
  cost: { low: usd(180), likely: usd(210), high: usd(260), prices_as_of: '2026-09-12T08:00:00Z', basis: 'provider' },
  allowance: { monthly_limit: usd(2000), remaining: usd(120) },
  blocked: { code: 'allowance_exceeded', text: 'Even the low end of this estimate is more than is left of this month’s Allowance.' },
};

/** The smaller plan the blocked sheet offers: the first 12 chapters, which fit what is left. */
export const estimateSmaller: PlanEstimate = {
  ...estimateWhole,
  estimate_id: 'fx-est-smaller',
  scope: { kind: 'chapters', chapter_ids: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12'] },
  text_characters: 224_000,
  chapters_to_make: 12,
  seconds_estimate: 16_000,
  cost: { low: usd(86), likely: usd(115), high: usd(142), prices_as_of: '2026-09-12T08:00:00Z', basis: 'provider' },
  suggested_limit: usd(150),
  allowance: { monthly_limit: usd(2000), remaining: usd(120) },
  blocked: null,
};

export const optionsWhole = [
  { id: 'whole', title: 'Whole book', detail: '22 chapters · none ready yet' },
  { id: 'from', title: 'From chapter 4', detail: '19 chapters · none ready yet' },
];

/** [PlanPaused]: 13 of 22 chapters made, $1.28 spent of $2.60, Google's daily quota reached; it resets at 2:00 a.m. tomorrow (device time). */
export const NOW_LOCAL = new Date(2026, 9, 1, 22, 30).getTime();
export const planWaiting: Plan = {
  id: 'fx-plan-1',
  audiobook_id: kore.audiobookId,
  book_id: 'fx-book',
  scope: { kind: 'whole_book' },
  state: 'waiting',
  estimate: estimateWhole.cost,
  limit: usd(260),
  spent: { known: usd(128), unknown_items: 0 },
  job_id: 'fx-job-1',
  chapters_total: 22,
  chapters_done: 13,
  waiting: { code: 'waiting_quota', text: 'The daily request quota is used up.', until: new Date(2026, 9, 2, 2, 0).toISOString() },
  needs_you: null,
  approved_by: { listener_id: 'fx-l', listener_name: 'Nick', device_id: 'fx-d', device_name: 'This device' },
  created_at: later(-120),
  updated_at: later(-1),
};
