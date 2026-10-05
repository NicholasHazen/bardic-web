import { defineConfig } from '@playwright/test';
import flows from './playwright.config';

// Audit reports must represent one quiet Chromium run, not a browser matrix.
export default defineConfig({
  ...flows,
  testIgnore: [],
  testMatch: ['**/a11y.spec.ts', '**/perf.spec.ts'],
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--mute-audio'] } } }],
});
