// Owner: Sheen Hern. Accounts (log in, sign up, log out): 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, logIn, logOut } from './helpers.js'

test('logged-out visitors are sent to Log in', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page).toHaveURL(/\/login/)
})

test('logging in with the right password opens Home', async ({ page }) => {
  const email = await signUp(page)
  await logOut(page)
  await logIn(page, email)
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible()
})

test('a wrong password shows an error and stays on Log in', async ({ page }) => {
  const email = await signUp(page)
  await logOut(page)
  await logIn(page, email, 'not-the-password-1!')
  await expect(page.getByTestId('login-error')).toContainText(
    'That email or password is not right.',
  )
  await expect(page).toHaveURL(/\/login$/)
})

test('sign-up with empty fields says what is missing', async ({ page }) => {
  await page.goto('/signup')
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-missing')).toBeVisible()
  await expect(page).toHaveURL(/\/signup$/)
})

test('log out asks first, then goes to Start', async ({ page }) => {
  await signUp(page)
  await page.goto('/account')
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-logout-ask')).toContainText('Log out of this device?')
  await page.getByTestId('account-logout-yes').click()
  await expect(page).toHaveURL(/\/start$/)
})
