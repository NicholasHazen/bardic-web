import { describe, expect, it } from 'vitest';
import { moneyText, parseMicros, rangeText, spendText } from './money';

const usd = (micros: number) => ({ micros, currency: 'USD' });

describe('money', () => {
  it('shows whole cents from integer micros, rounding half up, and says "under" for a real sub-cent amount', () => {
    expect(moneyText(usd(2_600_000))).toBe('$2.60');
    expect(moneyText(usd(1_995_000))).toBe('$2.00');
    expect(moneyText(usd(1_994_999))).toBe('$1.99');
    expect(moneyText(usd(0))).toBe('$0.00');
    expect(moneyText(usd(2_694))).toBe('under $0.01');
    expect(moneyText(usd(1_234_560_000))).toBe('$1,234.56');
  });
  it('shows a range, collapsing it when both ends read the same', () => {
    expect(rangeText(usd(1_800_000), usd(2_600_000))).toBe('$1.80 to $2.60');
    expect(rangeText(usd(1_000), usd(2_000))).toBe('under $0.01');
  });
  it('parses typed dollars to integer micros without floats', () => {
    expect(parseMicros('2')).toBe(2_000_000);
    expect(parseMicros('$2.50')).toBe(2_500_000);
    expect(parseMicros('1,000')).toBe(1_000_000_000);
    expect(parseMicros('0.05')).toBe(50_000);
    expect(parseMicros('0.1')).toBe(100_000);
    expect(parseMicros('1.0000001')).toBeNull();
    for (const bad of ['', 'abc', '-1', '1e3', '1.2.3', '$', ' ']) expect(parseMicros(bad)).toBeNull();
    expect(parseMicros('99999999999999999999')).toBeNull();
  });
  it('never turns unknown into zero', () => {
    expect(spendText({ known: usd(1_200_000), unknown_items: 0 })).toBe('$1.20');
    expect(spendText({ known: usd(1_200_000), unknown_items: 2 })).toBe('$1.20 and 2 items not priced');
    expect(spendText({ known: usd(0), unknown_items: 1 })).toBe('1 item not priced');
  });
});
