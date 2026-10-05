// The plan sheets as the views take them, from an estimate and what the listener typed. Plain functions (tested in
// model.test.ts); the connected flow and the boards both go through them, so what is on a board is what is on screen.
import { moneyText } from '../../lib/money';
import {
  allowanceLeftText,
  approvalBlock,
  approveLabel,
  blockedText,
  charactersText,
  checkLimit,
  costText,
  countText,
  explainerPoints,
  lengthText,
  likelyText,
  limitNote,
  monthlyText,
  premiumEyebrow,
  type ApprovalBlock,
  type LimitCheck,
  type PlanEstimate,
} from '../../lib/planRules';
import type { ExplainedModel, PlanBlockedModel, PlanSheetModel, ProblemModel, ScopeOptionModel } from './types';

export interface SheetInput {
  voiceName: string;
  options: ScopeOptionModel[];
  selected: string;
  /** null while the estimate is being made. */
  estimate: PlanEstimate | null;
  previewing?: boolean;
  /** What the limit field holds. */
  limitText: string;
  nowMs: number;
  /** Estimates already sent for approval. */
  used?: ReadonlySet<string>;
  /** An approval is in flight. */
  busy?: boolean;
  notice?: ProblemModel;
  error?: ProblemModel;
}

/** Why Approve is not offered, in words (a plan that passes the Allowance has its own sheet). */
export function whyNot(block: ApprovalBlock | null): string | undefined {
  switch (block) {
    case 'expired':
      return 'This estimate is more than 15 minutes old. Estimate again before approving.';
    case 'used':
      return 'This estimate was already sent for approval. Estimate again to approve another plan.';
    case 'unpriced':
      return 'No price is known for this voice, so no range can be given and nothing can be approved.';
    case 'nothing_to_make':
      return 'Every chapter in this plan is already made and kept. There is nothing to approve.';
    default:
      return undefined;
  }
}

export function limitOf(i: Pick<SheetInput, 'estimate' | 'limitText'>): LimitCheck | null {
  return i.estimate ? checkLimit(i.limitText, i.estimate) : null;
}

/** The plan sheet ([PlanPremium]). `approveLabel` is set only when approval is allowed right now. */
export function sheetModel(i: SheetInput): PlanSheetModel {
  const e = i.estimate;
  const limit = limitOf(i);
  // While an approval is in flight the button stays, saying so; the estimate counts as used already.
  const block = i.busy ? null : approvalBlock({ estimate: e, limit, nowMs: i.nowMs, used: i.used ?? new Set(), busy: false });
  const m: PlanSheetModel = {
    eyebrow: premiumEyebrow(i.voiceName),
    options: i.options,
    selected: i.selected,
    limitText: i.limitText,
    limitShown: limit?.ok ? moneyText(limit.limit) : i.limitText,
    monthly: e ? monthlyText(e.allowance) : 'None set',
  };
  if (i.previewing) m.loading = true;
  if (i.busy) m.busy = true;
  if (i.notice) m.notice = i.notice;
  if (i.error) m.error = i.error;
  if (!e) return m;
  m.rows = {
    characters: charactersText(e.text_characters),
    toMake: countText(e.chapters_to_make),
    length: lengthText(e.seconds_estimate),
    cost: costText(e.cost),
    likely: likelyText(e.cost),
  };
  if (limit && !limit.ok) m.limitProblem = limit.text;
  else if (limit?.ok) {
    const note = limitNote(limit.limit, e);
    if (note) m.limitNote = note;
  }
  if (block === null && limit?.ok) m.approveLabel = approveLabel(limit.limit);
  else {
    const why = whyNot(block);
    if (why) m.whyNot = why;
  }
  return m;
}

export interface BlockedInput extends Omit<SheetInput, 'monthly'> {
  /** The estimate that would pass the Allowance (it names the first headline). */
  blockedFrom: PlanEstimate;
  /** Whether the plan that was blocked is the whole book. */
  whole: boolean;
}

/** The blocked sheet ([PlanBlocked]). Approve is offered only when the chosen plan fits what is left. */
export function blockedModel(i: BlockedInput): PlanBlockedModel {
  const e = i.estimate;
  const limit = limitOf(i);
  const block = i.busy ? null : approvalBlock({ estimate: e, limit, nowMs: i.nowMs, used: i.used ?? new Set(), busy: false });
  const t = blockedText(i.blockedFrom, i.whole);
  const m: PlanBlockedModel = {
    eyebrow: premiumEyebrow(i.voiceName),
    headline: { title: t.title, text: t.text },
    options: i.options,
    selected: i.selected,
    cost: e ? costText(e.cost) : 'Not known',
    limitText: i.limitText,
    limitShown: limit?.ok ? moneyText(limit.limit) : i.limitText,
    left: allowanceLeftText((e ?? i.blockedFrom).allowance) ?? '$0.00',
  };
  if (i.previewing) m.loading = true;
  if (i.busy) m.busy = true;
  if (i.notice) m.notice = i.notice;
  if (i.error) m.error = i.error;
  if (limit && !limit.ok) m.limitProblem = limit.text;
  if (block === null && limit?.ok) m.approveLabel = approveLabel(limit.limit);
  return m;
}

export function explainedModel(e: PlanEstimate): ExplainedModel {
  return {
    cost: costText(e.cost),
    likely: e.cost.basis === 'unknown' ? 'No price is known for this voice' : `Most likely about ${moneyText(e.cost.likely)}`,
    points: explainerPoints({ text_characters: e.text_characters, cost: e.cost, chapters: e.chapters_to_make }),
  };
}
