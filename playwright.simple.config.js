// The simple E2E tests (e2e-simple/): written by the team the Week 10 way, 5 per feature.
// Real app, real server, real database: a throwaway in-memory MongoDB with mock AI (load/server.js), deleted after the run.
// Run: pnpm test:e2e:simple      Report: pnpm exec playwright show-report
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-simple',
  workers: 2,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Every test starts as someone who has seen the welcome page and the Beginner's guide (the Welcome page tests clear this).
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'seenWelcome', value: '1' }, { name: 'amag.tour', value: 'seen' }] }] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone6', use: { ...devices['iPhone 6'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    // Never reuse a running `pnpm server`: that one uses the real database.
    { command: 'node load/server.js', url: 'http://localhost:3000/api/health', env: { PORT: '3000' }, reuseExistingServer: false },
    { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
})
