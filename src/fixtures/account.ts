// Synthetic data for the account boards ([PremiumAccount], [KeyProblem], [Allowance], [AllowanceLimit]). No real account.
import type { Money, Spend } from '../lib/money';

const usd = (micros: number): Money => ({ micros, currency: 'USD' });

/** $2.60 known, one item whose cost could not be determined (never counted as $0). */
export const spentSome: Spend = { known: usd(2_600_000), unknown_items: 1 };
export const monthlyLimit: Money = usd(20_000_000);
export const planLimit: Money = usd(5_000_000);

/** [KeyProblem]: one plan stopped with 13 of 22 chapters made. */
export const keptByPlan = { plans: 1, done: 13, total: 22 };
/**
 * The board's own words, which put "Premium voices are paused." before what is kept. The screen says what is kept first
 * (keyProblemWords, UI guide: every problem begins with what is kept), so the board is checked with its literal text.
 */
export const boardKeyProblem = {
  title: 'Google rejected the key',
  body: 'Premium voices are paused. Audio already made keeps playing, and a plan in progress stopped with 13 of 22 chapters kept.',
};
