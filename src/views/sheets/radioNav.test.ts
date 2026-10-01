import { describe, expect, it } from 'vitest';
import { tabStop } from './radioNav';

describe('tabStop', () => {
  it('gives the tab stop to the chosen radio', () => {
    expect([0, 1, 2].map((i) => tabStop(i, 1))).toEqual([-1, 0, -1]);
  });
  it('gives it to the first when nothing is chosen', () => {
    expect([0, 1, 2].map((i) => tabStop(i, -1))).toEqual([0, -1, -1]);
  });
});
