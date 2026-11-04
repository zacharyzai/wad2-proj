// Shared steps for the simple E2E tests, written like the Week 10 login example (fill, click, wait for the next page).
// The database is empty at the start of every run, so each test makes its own account with signUp().
import { expect } from '@playwright/test'

export const PASSWORD = 'teh-tarik-1952'

// Signs up a brand-new account through the real Sign up page and lands on Home.
// role: 'senior' or 'caregiver'. Returns the email, so a test can log out and log in again.
export async function signUp(page, { name = 'Mei Ling', role = 'senior' } = {}) {
  const email = `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  await page.goto('/signup')
  if (role === 'caregiver') await page.getByTestId('signup-role-caregiver').check()
  await page.getByTestId('signup-name').fill(name)
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-password').fill(PASSWORD)
  await page.getByTestId('signup-dob').fill('1950-05-05')
  await page.getByTestId('signup-citizenship').selectOption('birth')
  await page.getByTestId('signup-income').selectOption('unsure') // citizens are asked this, for the subsidy check
  await page.getByTestId('signup-submit').click()
  // A new account is asked "Day or night mode" once: keep Day and press Next.
  // Wait until the choice is saved to the account, or the question comes back on the next page.
  await expect(page.getByRole('heading', { name: 'Day or night mode' })).toBeVisible()
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Next' }).click()
  await saved
  return email
}

// Opens one of the built-in samples (no photo needed): 'Metformin label', 'Cough syrup label' or 'Medical bill'.
export async function openSample(page, name) {
  await page.goto(name === 'Medical bill' ? '/scan?type=bill' : '/scan?type=medication')
  await page.getByTestId('scan-examples').click() // "Try an example"
  await page.getByRole('button', { name }).click()
}

// Logs out from the Account page (it asks first).
export async function logOut(page) {
  await page.goto('/account')
  await page.getByTestId('account-logout').click()
  await page.getByTestId('account-logout-yes').click()
}

// Logs in through the real Log in page.
export async function logIn(page, email, password = PASSWORD) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
}
