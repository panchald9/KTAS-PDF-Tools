import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Replit already supplies Chromium. Elsewhere use Playwright's installed browser,
// or an explicitly configured executable. No credentials or live API are needed.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: './test-results',
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5190',
    browserName: 'chromium',
    launchOptions: { executablePath },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @workspace/ktas-pdf exec vite --config tests/browser/vite.config.ts',
    cwd: new URL('../../../../', import.meta.url).pathname,
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: false,
  },
});