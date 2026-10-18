import { defineConfig, devices } from '@playwright/test';

// Keep E2E on its own production server, separate from the user's dev session/HMR.
const testPort = Number(process.env.PLAYWRIGHT_PORT || 3002);
if (!Number.isSafeInteger(testPort) || testPort < 1 || testPort > 65535) {
  throw new Error('PLAYWRIGHT_PORT must be an integer between 1 and 65535');
}
const baseURL = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${testPort}`,
    url: baseURL,
    reuseExistingServer: false,
    env: { KADR_MEDIA_ENABLED: '0', HOSTNAME: '127.0.0.1' },
    timeout: 120_000,
  },
});
