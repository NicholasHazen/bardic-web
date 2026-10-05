// View models of the plan flow: what the presentational sheets and cards take. The connected flow builds them
// from API data (src/views/plans/model.ts, src/state/plans.ts); the boards build them from src/fixtures/plans.ts.

export interface ScopeOptionModel {
  id: string;
  title: string;
  detail: string;
}

/** A problem to tell first: what is kept, then what happened. */
export interface ProblemModel {
  title: string;
  text: string;
  /** The one thing that can be done about it, when there is one (a button under the text). */
  actionLabel?: string;
}

/** The figures of an estimate, already in words. */
export interface EstimateRowsModel {
  /** "412,000 characters" */
  characters: string;
  /** "22 chapters" */
  toMake: string;
  /** "About 8 h 10 min of audio" */
  length: string;
  /** "$1.80 to $2.60", or "Not known" */
  cost: string;
  /** "$2.10", or "Not known" */
  likely: string;
}

/** The plan sheet for a premium audiobook ([PlanPremium]). */
export interface PlanSheetModel {
  /** "Kore · premium" */
  eyebrow: string;
  options: ScopeOptionModel[];
  selected: string;
  /** Optional so reference boards retain their layout; connected flows offer the matter choice. */
  includeMatter?: boolean;
  /** The estimate is being made; its figures are not known yet. */
  loading?: boolean;
  rows?: EstimateRowsModel;
  /** What the limit field holds, as typed. */
  limitText: string;
  /** The limit as it is shown when not being edited ("$2.60"; as typed while it is not an amount). */
  limitShown: string;
  /** Why the typed limit cannot be used. */
  limitProblem?: string;
  /** A line about the limit that is not an error (the Allowance would stop the plan first). */
  limitNote?: string;
  /** "None set" or "$1.20 left of $20.00" */
  monthly: string;
  /** Present only when the plan may be approved right now; names the cost. */
  approveLabel?: string;
  /** Why Approve is not offered (shown under the figures). */
  whyNot?: string;
  busy?: boolean;
  /** A change the listener should know about ("The numbers changed"). */
  notice?: ProblemModel;
  error?: ProblemModel;
}

/** The sheet shown when a plan would pass the Allowance ([PlanBlocked]). */
export interface PlanBlockedModel {
  eyebrow: string;
  /** Warn callout */
  headline: ProblemModel;
  options: ScopeOptionModel[];
  selected: string;
  includeMatter?: boolean;
  loading?: boolean;
  /** "$1.15 to $1.61" */
  cost: string;
  limitText: string;
  limitShown: string;
  limitProblem?: string;
  /** "$1.20 of $20.00" */
  left: string;
  /** Present only when the selected plan fits and may be approved. */
  approveLabel?: string;
  busy?: boolean;
  notice?: ProblemModel;
  error?: ProblemModel;
}

export interface ExplainedModel {
  /** "$1.80 to $2.60", or "Not known" */
  cost: string;
  /** "Most likely about $2.10" */
  likely: string;
  points: { id: string; title: string; text: string }[];
}
