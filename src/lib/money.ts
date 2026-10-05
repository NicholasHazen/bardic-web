// Money is integer micros of a currency (1 USD = 1,000,000 micros). Never a float, never added when
// unknown: a cost that could not be stated is counted as an item, not as zero (AGENTS.md).

export interface Money {
  micros: number;
  currency: string;
}

export const MICROS_PER_UNIT = 1_000_000;

/** "$2.60" from integer micros. A real amount under one cent says so instead of rounding to zero. */
export function moneyText(m: Money): string {
  if (m.micros > 0 && m.micros < 10_000) return `under ${moneyText({ micros: 10_000, currency: m.currency })}`;
  return render(m.micros, m.currency);
}

function render(micros: number, currency: string): string {
  // whole cents, rounding half up, in integer arithmetic
  const cents = Math.floor((Math.abs(micros) + 5_000) / 10_000);
  const sign = micros < 0 ? '-' : '';
  const units = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  const symbol = currency === 'USD' ? '$' : '';
  const suffix = currency === 'USD' ? '' : ` ${currency}`;
  return `${sign}${symbol}${units.toLocaleString('en-US')}.${rest}${suffix}`;
}

/** "$1.80 to $2.60" for a low to high range; one amount when they round to the same text. */
export function rangeText(low: Money, high: Money): string {
  const a = moneyText(low);
  const b = moneyText(high);
  return a === b ? a : `${a} to ${b}`;
}

/**
 * Dollars typed by a person ("2", "2.5", "$2.50", "1,000") to integer micros, or null if it is not a plain
 * amount. Parsed from the text, never through a float, with at most six decimals.
 */
export function parseMicros(input: string): number | null {
  const t = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,6})?$/.test(t)) return null;
  const [whole = '0', frac = ''] = t.split('.');
  const micros = Number(whole) * MICROS_PER_UNIT + Number(frac.padEnd(6, '0'));
  return Number.isSafeInteger(micros) ? micros : null;
}

/** What was spent: the known total, and how many items could not be priced (never counted as zero). */
export interface Spend {
  known: Money;
  unknown_items: number;
}

/** "$1.20" or "$1.20 and 2 items not priced"; with nothing known and some unknown: "2 items not priced". */
export function spendText(s: Spend): string {
  const n = s.unknown_items;
  const unknown = n > 0 ? `${n} ${n === 1 ? 'item' : 'items'} not priced` : '';
  if (n === 0) return moneyText(s.known);
  return s.known.micros === 0 ? unknown : `${moneyText(s.known)} and ${unknown}`;
}
