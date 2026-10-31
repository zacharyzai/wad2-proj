// Shared test helpers (Isaac). Every page needs an account, so tests start logged in (e2e/fixtures.js) unless they opt out.
// The e2e API server signs tokens with E2E_SECRET (playwright.config.js), so a test token is accepted by the real
// scan and chat routes. The /api/auth/* calls themselves are mocked: tests need no database.
import { expect } from '@playwright/test'

export const E2E_SECRET = 'e2e-only-secret-for-auth-checks-at-least-32-bytes'
process.env.JWT_SECRET = E2E_SECRET
const { signToken } = await import('../../server/services/auth.js')

// theme: already chosen, so the day/night question (asked once to new accounts) stays out of the way; e2e/theme.spec.js tests it.
export const DEMO_USER = { name: 'Tan Mei Ling', email: 'demo@example.com', dob: '1952-03-07', citizenship: 'birth', citizenSince: null, income: 'upTo1500', theme: 'light' }
export const DEMO_PASSWORD = 'password123'
export const testToken = (remember = true) => signToken('demo-user', remember)

// Pretend the server accepts logins and signups, knows who the saved token belongs to, and saves edits.
export async function mockAuth(page, user = DEMO_USER) {
  let current = { ...user }
  const ok = (route, extra = {}) => route.fulfill({ json: { ok: true, data: { user: current, ...extra } } })
  await page.route('**/api/auth/login', (route) => ok(route, { token: testToken(route.request().postDataJSON().remember) }))
  await page.route('**/api/auth/signup', (route) => {
    const { name, email, dob, citizenship, citizenSince, income, remember } = route.request().postDataJSON()
    current = { name, email, dob, citizenship, citizenSince, income }
    return ok(route, { token: testToken(remember) })
  })
  await page.route('**/api/auth/me', (route) => {
    if (route.request().method() === 'PATCH') current = { ...current, ...route.request().postDataJSON() }
    return ok(route)
  })
}

// Start a test already logged in: a remembered token, set once (so a test that logs out stays logged out).
export async function signIn(page, user = DEMO_USER) {
  await mockAuth(page, user)
  await page.addInitScript((token) => {
    if (sessionStorage.getItem('e2e-signed-in')) return
    sessionStorage.setItem('e2e-signed-in', '1')
    localStorage.setItem('token', token)
  }, testToken())
}

// Pretend the server rejects the login.
export async function mockWrongLogin(page) {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { ok: false, error: { code: 'WRONG_LOGIN', message: 'Wrong email or password' } } }),
  )
}

// Fill in and submit the login form that is already on screen.
export async function fillLogin(page, email = DEMO_USER.email, password = DEMO_PASSWORD) {
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
}

// Open the login page and log in. Call mockAuth(page) first.
export async function login(page, email, password) {
  await page.goto('/login')
  await fillLogin(page, email, password)
}

// Start from the Metformin sample and wait for the Confirm screen.
export async function useSampleLabel(page, name = 'Metformin label') {
  await page.goto('/scan?type=medication')
  await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
  await page.getByRole('button', { name }).click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
}

// Language is chosen on the Account page (the app bar has no switcher). Goes there, picks it and comes straight back,
// so a page in the middle of a flow keeps its state. `label` is the button's text: 'EN', '中文', 'BM' or 'தமிழ்'.
const LANG_CODE = { EN: 'en', 中文: 'zh', BM: 'ms', தமிழ்: 'ta' }
export async function switchLanguage(page, label) {
  await page.locator('a.acct').click()
  await page.getByTestId('account-language').locator(`[lang="${LANG_CODE[label]}"]`).click() // Account spells the names out (Bahasa Melayu)
  // The language downloads the first time it is used: go back only once the page is really in it.
  await expect(page.locator('html')).toHaveAttribute('lang', LANG_CODE[label])
  await page.goBack()
}
