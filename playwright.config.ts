import { defineConfig } from '@playwright/test';

// Flows run against a real bardic-server (see e2e/harness.ts). Build first: `npm run build`.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/a11y.spec.ts', '**/perf.spec.ts'],
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [['list']],
  // Fault-injection routes must see the requests. Shell-offline tests opt into service workers explicitly.
  use: { viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--mute-audio'] } } },
    { name: 'firefox', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } } },
    { name: 'webkit', use: { browserName: 'webkit', isMobile: true, hasTouch: true } },
  ],
});
