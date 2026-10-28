// Day/night mode: Day, Night or Same as my phone, chosen on Sign up or the Account page and saved to the account.
// Day mode until they choose, even on a device set to dark. The auth API is mocked (see helpers/auth.js).
import { test, expect } from './fixtures.js'
import { DEMO_USER, mockAuth, login } from './helpers/auth.js'

const NIGHT_BG = 'rgb(18, 24, 23)' // --color-page in night mode

test('starts in day mode even when the device is set to dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.col-main')).not.toHaveCSS('background-color', NIGHT_BG)
})

test('Account: Night is saved to the account and kept after reload; Day switches back', async ({ page }) => {
  await page.goto('/account')
  const choices = page.getByTestId('account-theme')
  await expect(choices.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-pressed', 'true')

  const saved = page.waitForRequest((r) => r.url().endsWith('/api/auth/me') && r.method() === 'PATCH' && r.postDataJSON()?.theme === 'dark')
  await choices.getByRole('button', { name: 'Night' }).click()
  await saved
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.col-main')).toHaveCSS('background-color', NIGHT_BG) // the page really changes, not just the attribute
  await expect(page.getByTestId('account-toast')).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByTestId('account-theme').getByRole('button', { name: 'Day' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('Same as my phone follows the device, also when it changes while the app is open', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/account')
  await page.getByTestId('account-theme').getByRole('button', { name: 'Same as my phone' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload() // index.html picks the same before the app loads
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('logging in on a new device uses the account’s day/night choice', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await mockAuth(page, { ...DEMO_USER, theme: 'dark' })
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.close()
})

test('Sign up: the choice changes the page as they tap and is sent with the signup', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await mockAuth(page)
  await page.goto('/signup')
  await page.getByTestId('signup-theme').getByRole('button', { name: 'Night' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const sent = page.waitForRequest('**/api/auth/signup')
  await page.getByTestId('signup-name').fill('Lim Ah Huat')
  await page.getByTestId('signup-email').fill('ahhuat@example.com')
  await page.getByTestId('signup-password').fill('password123')
  await page.getByTestId('signup-dob').fill('1958-11-02')
  await page.getByTestId('signup-citizenship').selectOption('pr')
  await page.getByTestId('signup-submit').click()
  expect((await sent).postDataJSON().theme).toBe('dark')
  await page.close()
})
