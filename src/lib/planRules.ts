// The rules of the plan flow that need no server: validating a limit, whether a plan may be approved, the figures
// the plan sheet shows, what each refusal means in words, and how a running plan is described. Plain functions with
// plain inputs so they can be tested; src/state/plans.ts joins them to the API.
//
// Money is integer micros and is formatted with src/lib/money.ts only. A cost that is unknown is shown as unknown,
// never as $0.00 (AGENTS.md "Unknown is unknown").
import type { components } from '../api/schema';
import { durationText } from './bookAudio';
import { moneyText, parseMicros, rangeText, type Money, type Spend } from './money';

export type PlanEstimate = components['schemas']['PlanEstimate'];
export type Plan = components['schemas']['Plan'];
export type PlanState = components['schemas']['PlanState'];
export type CostEstimate = components['schemas']['CostEstimate'];
export type Scope = components['schemas']['Scope'];
export type Detail = components['schemas']['Detail'];

const CENT = 10_000;
const TEN_CENTS = 100_000;

const roundUp = (micros: number, step: number) => Math.ceil(micros / step) * step;
const usd = (micros: number, like: Money): Money => ({ micros, currency: like.currency });
export const countText = (n: number) => `${n} ${n === 1 ? 'chapter' : 'chapters'}`;

// --------------------------------------------------------------------------- the limit

/** The least limit the listener may approve: the most likely cost, rounded up to the cent (the server needs limit >= likely). */
export function minLimit(e: Pick<PlanEstimate, 'cost'>): Money {
  return usd(roundUp(e.cost.likely.micros, CENT), e.cost.likely);
}

/** What is left of the Allowance in micros (to the cent, rounded down), or null when no monthly limit is set. */
export const allowanceLeft = (e: Pick<PlanEstimate, 'allowance'>): number | null => (e.allowance.remaining ? leftMoney(e.allowance.remaining).micros : null);

/**
 * What is left of the Allowance for display and for choosing a limit: never below zero (spending may already be past
 * the limit), and rounded down to the cent, so that it never says more is left than there is.
 */
const leftMoney = (m: Money): Money => ({ micros: Math.floor(Math.max(0, m.micros) / CENT) * CENT, currency: m.currency });

/**
 * The limit offered by default (PL2): the server's suggestion (the top of the range, rounded up to ten cents), brought
 * down to what is left of the Allowance when that still covers the most likely cost.
 */
export function defaultLimit(e: Pick<PlanEstimate, 'cost' | 'suggested_limit' | 'allowance'>): Money {
  const floor = minLimit(e).micros;
  let micros = Math.max(e.suggested_limit.micros, floor);
  const left = allowanceLeft(e);
  if (left !== null && micros > left && left >= floor) micros = left;
  return usd(micros, e.suggested_limit);
}

export type LimitProblem = 'empty' | 'invalid' | 'zero' | 'below_likely' | 'over_allowance';
export type LimitCheck = { ok: true; limit: Money } | { ok: false; problem: LimitProblem; text: string };

/**
 * Check what the listener typed as the plan's limit (PL2). It must be a plain amount, at least the most likely cost,
 * and not more than what is left of the Allowance when the Allowance can cover the most likely cost at all.
 */
export function checkLimit(input: string, e: Pick<PlanEstimate, 'cost' | 'allowance'>): LimitCheck {
  if (input.trim() === '') return { ok: false, problem: 'empty', text: 'Enter a limit in dollars, for example 2.60.' };
  const micros = parseMicros(input);
  if (micros === null) return { ok: false, problem: 'invalid', text: 'Type the limit as an amount in dollars, for example 2.60.' };
  if (micros < 1) return { ok: false, problem: 'zero', text: 'The limit must be more than $0.00.' };
  const min = minLimit(e);
  if (micros < min.micros) {
    return { ok: false, problem: 'below_likely', text: `The limit must be at least ${moneyText(min)}, the most likely cost. A lower limit could stop the plan before it finishes.` };
  }
  const left = allowanceLeft(e);
  if (left !== null && left >= min.micros && micros > left) {
    return { ok: false, problem: 'over_allowance', text: `That is more than the ${moneyText(usd(left, min))} left of your Allowance. Choose ${moneyText(usd(left, min))} or less.` };
  }
  return { ok: true, limit: usd(micros, e.cost.likely) };
}

/** A line under the limit when the Allowance will stop the plan before its own limit would. */
export function limitNote(limit: Money, e: Pick<PlanEstimate, 'allowance'>): string | null {
  const left = allowanceLeft(e);
  if (left === null || limit.micros <= left) return null;
  return `Your Allowance has ${moneyText(usd(left, limit))} left, so it would stop the plan first.`;
}

// --------------------------------------------------------------------------- may it be approved

export type ApprovalBlock = 'no_estimate' | 'expired' | 'used' | 'blocked' | 'nothing_to_make' | 'unpriced' | 'bad_limit' | 'busy';

export interface ApprovalInput {
  estimate: PlanEstimate | null;
  limit: LimitCheck | null;
  nowMs: number;
  /** Estimates already sent for approval; an estimate is approved at most once. */
  used: ReadonlySet<string>;
  /** An approval is in flight. */
  busy: boolean;
}

/** Why the plan may not be approved right now, or null when it may. The Approve button is shown only for null. */
export function approvalBlock(i: ApprovalInput): ApprovalBlock | null {
  const e = i.estimate;
  if (!e) return 'no_estimate';
  if (i.busy) return 'busy';
  if (i.used.has(e.estimate_id)) return 'used';
  if (Date.parse(e.expires_at) <= i.nowMs) return 'expired';
  if (e.blocked) return 'blocked';
  if (e.cost.basis === 'unknown') return 'unpriced';
  if (e.chapters_to_make <= 0) return 'nothing_to_make';
  if (!i.limit || !i.limit.ok) return 'bad_limit';
  return null;
}

/** The Approve button's words: it names the cost ("Approve plan · up to $2.60"). */
export const approveLabel = (limit: Money) => `Approve plan · up to ${moneyText(limit)}`;

// --------------------------------------------------------------------------- the figures of the sheet

export const charactersText = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'character' : 'characters'}`;

/**
 * How long the speech is, from the server's estimate (characters spoken at a steady pace). This is the length of the
 * audio, not how long making it takes: the server does not estimate that for a premium voice, so it is not claimed.
 */
export function lengthText(seconds: number | null): string {
  return seconds === null ? 'Not known' : `${durationText(seconds)} of audio`;
}

/** The range, or "Not known" when the price of the voice is not known (no range can be given). */
export function costText(c: CostEstimate): string {
  return c.basis === 'unknown' ? 'Not known' : rangeText(c.low, c.high);
}
export function likelyText(c: CostEstimate): string {
  return c.basis === 'unknown' ? 'Not known' : moneyText(c.likely);
}

/** "12 September": the day of a price table, in UTC so every device says the same day. */
export function dayText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown date';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** "Left in Allowance": "$1.20 of $20.00", or null when no monthly limit is set. */
export function allowanceLeftText(a: PlanEstimate['allowance']): string | null {
  if (!a.monthly_limit || !a.remaining) return null;
  return `${moneyText(leftMoney(a.remaining))} of ${moneyText(a.monthly_limit)}`;
}

/** Row value for the monthly limit: "None set" or "$1.20 left of $20.00". */
export function monthlyText(a: PlanEstimate['allowance']): string {
  if (!a.monthly_limit) return 'None set';
  return a.remaining ? `${moneyText(leftMoney(a.remaining))} left of ${moneyText(a.monthly_limit)}` : moneyText(a.monthly_limit);
}

/** The four points of the explainer ([EstimateExplained]), from the real estimate. */
export function explainerPoints(e: Pick<PlanEstimate, 'text_characters' | 'cost'> & { chapters: number }): { id: string; title: string; text: string }[] {
  const c = e.cost;
  const known = `The exact text: ${e.text_characters.toLocaleString('en-US')} characters in ${countText(e.chapters)}.`;
  let assumes: string;
  if (c.basis === 'unknown') assumes = 'No price is known for this voice, so no range can be given and a plan cannot be approved.';
  else if (c.basis === 'manual') assumes = `A price entered on your Bardic computer, dated ${dayText(c.prices_as_of)}. A range covers retries and longer pauses.`;
  else assumes = `Google’s published price for this voice, checked on ${dayText(c.prices_as_of)}. A range covers retries and longer pauses.`;
  return [
    { id: 'knows', title: 'What Bardic knows', text: known },
    { id: 'assumes', title: 'What it assumes', text: assumes },
    { id: 'differ', title: 'What can differ', text: 'Re-made chapters, a price change, or Google counting usage differently. Your real bill is on Google’s side.' },
    { id: 'unknown', title: 'When it is unknown', text: 'If Google reports no usage, Bardic shows “unknown” and does not count it as $0.' },
  ];
}

// --------------------------------------------------------------------------- a smaller plan (PL3)

export interface MakeChapter {
  id: string;
  words: number;
}

/**
 * When a plan would pass the Allowance, the longest run from the start of the chapters still to be made whose cost fits
 * what is left: first by the top of the range (it will surely fit), otherwise by the low end. Cost is shared out by
 * words. Returns the chapter ids, or null when not even the first chapter fits.
 */
export function smallerScope(chapters: readonly MakeChapter[], cost: Pick<CostEstimate, 'low' | 'high'>, left: number): string[] | null {
  const total = chapters.reduce((n, c) => n + Math.max(0, c.words), 0);
  if (total <= 0 || chapters.length < 2) return null;
  for (const edge of [cost.high.micros, cost.low.micros]) {
    let words = 0;
    let best = 0;
    chapters.forEach((c, i) => {
      words += Math.max(0, c.words);
      if (Math.ceil((edge * words) / total) <= left && i < chapters.length - 1) best = i + 1;
    });
    if (best > 0) return chapters.slice(0, best).map((c) => c.id);
  }
  return null;
}

export const smallerTitle = (n: number, anyReady: boolean) => `${anyReady ? 'Next' : 'First'} ${n === 1 ? 'chapter' : `${n} chapters`}`;

export function blockedText(e: Pick<PlanEstimate, 'cost' | 'allowance'>, whole: boolean): { title: string; text: string } {
  const left = e.allowance.remaining ? moneyText(leftMoney(e.allowance.remaining)) : '$0.00';
  return {
    title: whole ? 'The whole book would pass your Allowance' : 'This plan would pass your Allowance',
    text: `It needs about ${moneyText(e.cost.likely)} and ${left} is left this month. Choose a smaller plan, or raise the Allowance in Settings.`,
  };
}

// --------------------------------------------------------------------------- what each refusal means

export type ProblemAction = 'preview_again' | 'fix_key' | 'allowance' | 'show_plan' | 'none';
export interface Problem {
  title: string;
  /** Begins with what is kept (or that nothing was started). */
  text: string;
  action: ProblemAction;
}

const NOTHING = 'Nothing was started and nothing was spent. Audio already made is kept.';

/**
 * A refusal of previewPlan or createPlan in words. Every one begins with what is kept (docs/UI-GUIDE.md), and none of
 * them is retried by itself: a stale estimate is replaced by a new one that the listener must approve again.
 */
export function approvalProblem(code: string | undefined, detail: string, minimum?: Money): Problem {
  switch (code) {
    case 'estimate_expired':
      return { title: 'The estimate was too old', text: `${NOTHING} Estimates last 15 minutes, so this one was replaced. Check the new numbers, then approve.`, action: 'preview_again' };
    case 'estimate_used':
      return { title: 'This estimate was already approved', text: `${NOTHING} An estimate can be approved once, so this one was replaced. Check the new numbers, then approve.`, action: 'preview_again' };
    case 'estimate_changed':
    case 'estimate_not_found':
      return { title: 'The numbers changed', text: `${NOTHING} The chapters or the prices moved since the estimate was made, so it was replaced. Check the new numbers, then approve.`, action: 'preview_again' };
    case 'allowance_exceeded':
      return { title: 'This would pass your Allowance', text: `${NOTHING} The plan needs more than is left of this month’s Allowance. Choose a smaller plan, or raise the Allowance.`, action: 'allowance' };
    case 'limit_below_estimate':
      return { title: 'The limit is too low', text: `${NOTHING} ${minimum ? `The limit must be at least ${moneyText(minimum)}, the most likely cost.` : 'The limit must be at least the most likely cost.'}`, action: 'none' };
    case 'nothing_to_make':
      return { title: 'Nothing to make', text: 'Every chapter in this plan is already made and kept, so there is nothing to approve.', action: 'none' };
    case 'plan_active':
      return { title: 'A plan is already running', text: 'Nothing new was started. The plan that is running keeps going, and finished chapters are kept.', action: 'show_plan' };
    case 'key_rejected':
      return { title: 'Google rejected your key', text: `${NOTHING} Add a working key, then plan again. Free voices are not affected.`, action: 'fix_key' };
    case 'source_not_set_up':
      return { title: 'Premium voices need a Google key', text: `${NOTHING} Add your Google key once, then plan again.`, action: 'fix_key' };
    case 'plan_not_needed':
      return { title: 'This voice is free', text: 'A free voice needs no plan. Nothing was started and nothing was spent.', action: 'none' };
    default:
      return { title: 'Nothing was started', text: `${NOTHING} ${detail}`.trim(), action: 'none' };
  }
}

/** The words for a failed pause, resume or stop. Each begins with what is kept. */
export function actionProblem(what: 'pause' | 'resume' | 'stop', code: string | undefined, detail: string, limit?: Money): Problem {
  const kept = 'Finished chapters are kept.';
  switch (code) {
    case 'limit_exceeded':
      return { title: 'The plan has reached its limit', text: `${kept} It cannot continue inside ${limit ? moneyText(limit) : 'its limit'}. Raise the limit to continue.`, action: 'none' };
    case 'allowance_exceeded':
      return { title: 'This would pass your Allowance', text: `${kept} This month’s Allowance is used up. Raise the Allowance to continue.`, action: 'allowance' };
    case 'key_rejected':
      return { title: 'Google rejected your key', text: `${kept} Add a working key, then continue.`, action: 'fix_key' };
    case 'job_not_pausable':
      return { title: 'It can’t be paused now', text: `${kept} A plan can only be paused while it is making chapters or waiting.`, action: 'none' };
    case 'job_running':
    case 'plan_not_resumable':
      return { title: 'Nothing to continue', text: `${kept} The plan is not paused, so there is nothing to resume.`, action: 'none' };
    default:
      return { title: `Couldn’t ${what}`, text: `${kept} ${detail}`.trim(), action: 'none' };
  }
}

// --------------------------------------------------------------------------- a plan that is going

export const ACTIVE_PLAN: ReadonlySet<PlanState> = new Set<PlanState>(['approved', 'running', 'waiting', 'paused', 'needs_you']);
export const isActivePlan = (p: Pick<Plan, 'state'>) => ACTIVE_PLAN.has(p.state);

/** "$1.28 of up to $2.60 spent", and the count of items without a price beside it, never added as zero. */
export function spendLine(spent: Spend, limit: Money): string {
  const n = spent.unknown_items;
  const items = `${n} ${n === 1 ? 'item' : 'items'} not priced`;
  if (n === 0) return `${moneyText(spent.known)} of up to ${moneyText(limit)} spent`;
  if (spent.known.micros > 0) return `${moneyText(spent.known)} of up to ${moneyText(limit)} spent, plus ${items}`;
  return `${items}, limit ${moneyText(limit)}`;
}

/** "a.m." / "p.m." time of day in a time zone (the device's by default). */
function clock(date: Date, tz?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase().replace(/^(a|p)m$/, '$1.m.')}`;
}
const dayKey = (d: Date, tz?: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(d);

/** "40 s", "5 min", "2 h": how long until a time, rounded the way a person says it. */
export function untilText(seconds: number): string {
  if (seconds < 90) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const min = Math.round(seconds / 60);
  if (min < 90) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

export interface Waiting {
  /** "Continues in about 40 s", or "Continue tomorrow automatically" for a daily quota. */
  continues: string;
  /** "Google’s quota resets about 2:00 a.m. tomorrow." */
  resets: string;
  /** The wait is long (a daily quota) rather than a pause for a moment. */
  daily: boolean;
}

/** How a waiting plan says when it goes on, from `waiting.until` (unknown stays unknown). */
export function waitingWhen(until: string | null | undefined, nowMs: number, tz?: string): Waiting {
  const at = until ? Date.parse(until) : NaN;
  if (Number.isNaN(at)) return { continues: 'Continues by itself', resets: 'Google has not said when its quota resets.', daily: false };
  const secs = Math.max(0, Math.round((at - nowMs) / 1000));
  if (secs < 3 * 3600) {
    const t = untilText(secs);
    return { continues: `Continues in about ${t}`, resets: `Google’s limit lifts in about ${t}.`, daily: secs > 30 * 60 };
  }
  const when = new Date(at);
  const today = dayKey(new Date(nowMs), tz);
  const day = dayKey(when, tz);
  const tomorrow = dayKey(new Date(nowMs + 24 * 3600 * 1000), tz);
  const dayWord = day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'later';
  return {
    continues: dayWord === 'tomorrow' ? 'Continue tomorrow automatically' : `Continues about ${clock(when, tz)} ${dayWord === 'later' ? 'on a later day' : dayWord}`,
    resets: `Google’s quota resets about ${clock(when, tz)} ${dayWord === 'later' ? 'on a later day' : dayWord}.`,
    daily: true,
  };
}

export type CardTone = 'making' | 'waiting' | 'paused' | 'needs';

export interface RaiseOffer {
  /** The limit offered, enough to finish the chapters still to make at the top of the range. */
  suggested: Money;
}

export interface CardAction {
  /** What the button does, naming the cost where money may be spent. */
  label: string;
}

export interface PlanCardModel {
  tone: CardTone;
  /** The state in the words of the listening states ("Making it ready", "Waiting…", "Paused", "Needs you"). */
  title: string;
  /** "Kore · 13 of 22 ready · $1.28 of up to $2.60 spent" */
  detail: string;
  /** Chapters done of total, 0 to 1. */
  progress: number;
  /** What is kept, then what is happening. */
  body: string;
  /** Waiting only: when it goes on by itself. */
  continues?: string;
  canPause: boolean;
  /** Paused or needs-you plans can be resumed inside their limit. */
  canResume: boolean;
  /** The limit was reached: offer a new, higher limit. */
  raise?: RaiseOffer;
  /** Needs you because of the key or the Allowance: where to go. */
  fix?: 'key' | 'allowance';
  /** Offer the rest of the book with a free voice (PL6, D2). */
  canMakeRestFree: boolean;
}

/** The limit that would let a plan finish its remaining chapters at the top of its range, rounded up to ten cents. */
export function suggestRaise(plan: Pick<Plan, 'estimate' | 'limit' | 'spent' | 'chapters_done' | 'chapters_total'>): Money {
  const total = Math.max(plan.chapters_total, 1);
  const left = Math.max(plan.chapters_total - plan.chapters_done, 0);
  const rest = Math.ceil((plan.estimate.high.micros * left) / total);
  const need = plan.spent.known.micros + rest;
  return usd(Math.max(roundUp(need, TEN_CENTS), plan.limit.micros + TEN_CENTS), plan.limit);
}

/** What is kept, said first: "13 of 22 chapters are ready and kept." */
export const keptText = (plan: Pick<Plan, 'chapters_done' | 'chapters_total'>) =>
  plan.chapters_done > 0 ? `${plan.chapters_done} of ${countText(plan.chapters_total)} ${plan.chapters_done === 1 ? 'is' : 'are'} ready and kept.` : 'Nothing has been made yet, and nothing is lost.';

/** Valid new limit for a resume: more than has been used so far (the server refuses less), and a plain amount. */
export function checkRaise(input: string, plan: Pick<Plan, 'limit' | 'spent'>): LimitCheck {
  if (input.trim() === '') return { ok: false, problem: 'empty', text: 'Enter a new limit in dollars.' };
  const micros = parseMicros(input);
  if (micros === null) return { ok: false, problem: 'invalid', text: 'Type the limit as an amount in dollars, for example 3.40.' };
  if (micros <= plan.limit.micros) return { ok: false, problem: 'below_likely', text: `A new limit must be more than the current limit of ${moneyText(plan.limit)}.` };
  return { ok: true, limit: usd(micros, plan.limit) };
}

/** The needs-you codes the server uses, in words that begin with what is kept. */
export function needsYouText(plan: Pick<Plan, 'chapters_done' | 'chapters_total' | 'limit' | 'needs_you'>): { text: string; fix?: 'key' | 'allowance'; raise?: boolean } {
  const kept = keptText(plan);
  const n = plan.needs_you;
  switch (n?.code) {
    case 'limit_exceeded':
      return { text: `${kept} The next chapter could pass this plan’s limit of ${moneyText(plan.limit)}, so nothing more is sent. Raise the limit to continue, or stop here.`, raise: true };
    case 'allowance_exceeded':
      return { text: `${kept} The next chapter could pass this month’s Allowance, so nothing more is sent. Raise the Allowance in Settings, then continue.`, fix: 'allowance' };
    case 'key_rejected':
      return { text: `${kept} Google rejected your key, so nothing more is sent. Add a working key, then continue.`, fix: 'key' };
    case 'source_not_set_up':
      return { text: `${kept} Premium voices need a Google key. Add one, then continue.`, fix: 'key' };
    case 'repeated_failure':
      return { text: `${kept} Three chapters failed in a row, so the plan stopped spending. Continue to try them again, or stop here.` };
    case 'provider_refused':
      return { text: `${kept} Google refused some chapters. Continue to try them again, or stop here.` };
    case 'voice_changed':
    case 'voice_not_found':
      return { text: `${kept} ${n.text} Stop here and make a new audiobook with a voice you can use.` };
    default:
      return { text: `${kept} ${n?.text ?? 'This plan needs a decision from you.'}`.trim() };
  }
}

/** The plan card for the book page ([PlanPaused] and the running states of [BookRunning]). */
export function planCardModel(plan: Plan, o: { voiceName: string; nowMs: number; chaptersReady?: number; tz?: string }): PlanCardModel {
  const done = Math.min(plan.chapters_done, plan.chapters_total);
  const ready = o.chaptersReady ?? done;
  const detail = `${o.voiceName} · ${ready} of ${plan.chapters_total} ready · ${spendLine(plan.spent, plan.limit)}`;
  const progress = plan.chapters_total ? done / plan.chapters_total : 0;
  const base = { detail, progress, canPause: false, canResume: false, canMakeRestFree: false };
  switch (plan.state) {
    case 'waiting': {
      const w = waitingWhen(plan.waiting?.until, o.nowMs, o.tz);
      return {
        ...base,
        tone: 'waiting',
        title: w.daily ? 'Waiting for Google’s daily quota' : 'Waiting for Google’s quota',
        body: `Finished chapters keep playing. ${w.resets} Continuing stays inside this plan’s original ${moneyText(plan.limit)} limit.`,
        continues: w.continues,
        canPause: true,
        canMakeRestFree: true,
      };
    }
    case 'paused':
      return {
        ...base,
        tone: 'paused',
        title: 'Paused',
        body: `${keptText(plan)} Resume continues inside the limit of ${moneyText(plan.limit)}.`,
        canResume: true,
        canMakeRestFree: true,
      };
    case 'needs_you': {
      const n = needsYouText(plan);
      const m: PlanCardModel = { ...base, tone: 'needs', title: 'Needs you', body: n.text, canResume: !n.raise && n.fix !== 'allowance', canMakeRestFree: true };
      if (n.raise) m.raise = { suggested: suggestRaise(plan) };
      if (n.fix) m.fix = n.fix;
      return m;
    }
    default:
      return {
        ...base,
        tone: 'making',
        title: 'Making it ready',
        body: `You can listen while it works. Bardic stops at the limit of ${moneyText(plan.limit)} and asks before going over. Finished chapters are kept.`,
        canPause: true,
      };
  }
}

/** One line for a plan that has ended, naming what is kept and what was spent. */
export function endedText(plan: Pick<Plan, 'state' | 'chapters_done' | 'chapters_total' | 'spent' | 'limit'>): { title: string; text: string } {
  const spent = spendLine(plan.spent, plan.limit);
  const kept = `${plan.chapters_done} of ${countText(plan.chapters_total)} ${plan.chapters_done === 1 ? 'is' : 'are'} ready and kept.`;
  switch (plan.state) {
    case 'completed':
      return { title: 'Plan finished', text: `${kept} ${spent[0]!.toUpperCase()}${spent.slice(1)}.` };
    case 'stopped':
      return { title: 'Plan stopped', text: `${kept} ${spent[0]!.toUpperCase()}${spent.slice(1)}.` };
    default:
      return { title: 'Plan ended', text: `${kept} ${spent[0]!.toUpperCase()}${spent.slice(1)}. Some chapters could not be made.` };
  }
}

/** "Kore · premium" for the sheet's eyebrow. */
export const premiumEyebrow = (voiceName: string) => `${voiceName} · premium`;

