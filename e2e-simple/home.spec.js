// Home and app shell: 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('Home greets you by name', async ({ page }) => {
  await signUp(page, { name: 'Mei Ling' })
  await expect(
    page.getByText(/^Good (morning|afternoon|evening), Mei Ling!$/).first(),
  ).toBeVisible()
})

test('each Home choice opens its page', async ({ page }) => {
  await signUp(page)
  await page.getByRole('link', { name: /Scan a medicine label/ }).click()
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
  await page.goBack()
  await page.getByRole('link', { name: /Scan a medical bill/ }).click()
  await expect(page).toHaveURL(/\/scan\?type=bill$/)
  await page.goBack()
  await page.getByRole('link', { name: /Ask about my medicine/ }).click()
  await expect(page).toHaveURL(/\/ask$/)
})

test('no medicines yet explains reminders', async ({ page }) => {
  await signUp(page)
  await expect(
    page.getByText('Scan a medicine label and we will remind you when to take it.'),
  ).toBeVisible()
})

test('an unknown page is friendly', async ({ page }) => {
  await signUp(page)
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('We can’t find that page')
  await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible()
})

test('night mode switches on', async ({ page }) => {
  await signUp(page)
  await page.getByRole('switch', { name: 'Night mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
