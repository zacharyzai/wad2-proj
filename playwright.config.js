import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    // Every test starts as a returning visitor, so "/" opens Home; e2e/landing.spec.js clears this to test the welcome page.
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'seenWelcome', value: '1' }] }] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Graders check iPhone 6 up to Bootstrap XL; Isaac can add more viewports here.
    { name: 'iphone6', use: { ...devices['iPhone 6'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      // E2E never calls Gemini: mock AI keeps tests free and repeatable.
      command: 'node server/index.js',
      url: 'http://localhost:3000/api/health',
      // JWT_SECRET matches e2e/helpers/auth.js, so tests can sign a login token without a database.
      env: { USE_MOCK_AI: 'true', PORT: '3000', JWT_SECRET: 'e2e-only-secret' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
