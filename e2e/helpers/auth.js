// Shared test helpers (Isaac). Auth is mocked, so tests need no database and no Sheen Hern endpoints.
import { expect } from '@playwright/test'

export const DEMO_USER = { email: 'demo@example.com' }
export const DEMO_PASSWORD = 'password123'

// Pretend the server accepts logins and signups and knows who the saved token belongs to.
export async function mockAuth(page, user = DEMO_USER) {
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: { ok: true, data: { token: 'test-token', user } } }))
  await page.route('**/api/auth/signup', (route) => route.fulfill({ json: { ok: true, data: { token: 'test-token', user } } }))
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ok: true, data: { user } } }))
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
// TODO: switch to getByTestId('use-sample-label') once Asher adds it to ScanView.
export async function useSampleLabel(page, name = 'Metformin label') {
  await page.goto('/scan')
  await page.getByRole('button', { name }).click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
}