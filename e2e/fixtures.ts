import { test as base, expect } from '@playwright/test';
import { startStack, type Running } from './harness';
import { startBreeze, startGemini, type Fake } from './fakes';
import { silenceAudio } from './helpers/silentAudio';

export const test = base.extend<{ stack: Running; breeze: Fake; gemini: Fake & { setKey: (k: string) => void } }>({
  context: async ({ context }, use) => {
    await silenceAudio(context);
    await use(context);
  },
  // Fake providers. A test asks for `breeze` / `gemini` and passes their URLs when it configures the source;
  // the Gemini fake is wired in through BARDIC_GEMINI_URL, so ask for it before `stack`.
  breeze: async ({}, use) => {
    const b = await startBreeze();
    await use(b);
    await b.stop();
  },
  gemini: async ({}, use) => {
    const g = await startGemini();
    await use(g);
    await g.stop();
  },
  // eslint-disable-next-line no-empty-pattern
  stack: async ({ gemini }, use) => {
    const s = await startStack({ env: { BARDIC_GEMINI_URL: gemini.url } });
    await use(s);
    await s.stop();
  },
  baseURL: async ({ stack }, use) => use(stack.url),
});
export { expect };
