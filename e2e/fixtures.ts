import { test as base, expect } from '@playwright/test';
import { startStack, type Running } from './harness';

export const test = base.extend<{ stack: Running }>({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => {
    const s = await startStack();
    await use(s);
    await s.stop();
  },
  baseURL: async ({ stack }, use) => use(stack.url),
});
export { expect };
