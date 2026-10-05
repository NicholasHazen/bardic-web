import { describe, expect, it } from 'vitest';
import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('reads like the Import board', () => {
    expect(formatBytes(2_400_000)).toBe('2.4 MB');
    expect(formatBytes(812_000)).toBe('812 KB');
    expect(formatBytes(31)).toBe('31 B');
    expect(formatBytes(120_000_000)).toBe('120 MB');
  });
  it('says nothing for nonsense', () => {
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(NaN)).toBe('');
  });
});
