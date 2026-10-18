// Accounts: protected-route redirect, login success and failure, signup check. The auth API is mocked.
import { test, expect } from '@playwright/test'
import { mockAuth, mockWrongLogin, fillLogin, login } from './helpers/auth.js'

test('logged-out visitor is sent to log in, then back to the page they wanted', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/history')
  await expect(page).toHaveURL(/\/login\?next=\/history$/)

  await fillLogin(page) // already on the login page, so do not navigate again
  await expect(page).toHaveURL(/\/history$/)
})

test('wrong password shows an error and stays on the login page', async ({ page }) => {
  await mockWrongLogin(page)
  await login(page, 'demo@example.com', 'not-the-password')
  await expect(page.getByTestId('login-error')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('logged-in user keeps their session after a reload', async ({ page }) => {
  await mockAuth(page)
  await login(page)
  await expect(page).toHaveURL(/\/history$/)
  await page.reload()
  await expect(page).toHaveURL(/\/history$/) // /api/auth/me recognised the saved token
})

test('signup stops a short password before calling the server', async ({ page }) => {
  await mockAuth(page)
  let called = false
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/signup')) called = true
  })
  await page.goto('/signup')
  await page.getByTestId('signup-email').fill('new@example.com')
  await page.getByTestId('signup-password').fill('short')
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-password')).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL(/\/signup$/)
  expect(called).toBe(false)
})

test('login page has no missing translations in any language', async ({ page }) => {
  await page.goto('/login')
  for (const language of ['中文', 'BM', 'தமிழ்', 'EN']) {
    await page.getByRole('button', { name: language, exact: true }).click()
    await expect(page.locator('main')).not.toContainText(/\b(auth|common|errors|pages)\.[A-Za-z]+/)
  }
})