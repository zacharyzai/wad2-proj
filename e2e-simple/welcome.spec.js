// Welcome page: 4 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'

// First-time visitors: no "seen the welcome page" flag (the config gives every other test one).
test.use({ storageState: { cookies: [], origins: [] } })

test('a first visit opens the welcome page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
})

test('Try me out leads to Start', async ({ page }) => {
  await page.goto('/welcome')
  await page
    .getByRole('link', { name: /Try me out/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/start$/)
})

test('a second visit opens Start', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByTestId('start-join')).toBeVisible()
  await expect(page.getByTestId('start-login')).toBeVisible()
})

test("Start's Log in opens Log in", async ({ page }) => {
  await page.goto('/start')
  await page.getByTestId('start-login').click()
  await expect(page).toHaveURL(/\/login$/)
})
