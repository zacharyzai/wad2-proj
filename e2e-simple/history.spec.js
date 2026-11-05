// History: 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

// Checks a sample: "Looks correct" saves it to History.
async function checkSample(page, name) {
  await openSample(page, name)
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page).toHaveURL(/\/scan\/explain$/)
}

test('a new account has an empty History', async ({ page }) => {
  await signUp(page)
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
})

test('a checked label is saved to History', async ({ page }) => {
  await signUp(page)
  await checkSample(page, 'Metformin label')
  await page.goto('/history')
  await expect(page.getByTestId('history-row').first()).toContainText('Metformin')
})

test('a checked bill is saved under Bills', async ({ page }) => {
  await signUp(page)
  await checkSample(page, 'Medical bill')
  await page.goto('/history')
  await page.getByTestId('history-tab-bill').click()
  await expect(page.getByTestId('history-row').first()).toContainText('Bedok')
})

test('Listen again opens the explanation', async ({ page }) => {
  await signUp(page)
  await checkSample(page, 'Metformin label')
  await page.goto('/history')
  await page.getByTestId('history-row').first().click()
  await page.getByTestId('history-replay').first().click()
  await expect(page).toHaveURL(/\/scan\/explain$/)
})

test('delete asks first', async ({ page }) => {
  await signUp(page)
  await checkSample(page, 'Metformin label')
  await page.goto('/history')
  await page.getByTestId('history-row').first().click()
  // "Keep it" keeps the scan.
  await page.getByTestId('history-delete').first().click()
  await expect(page.getByText('Delete this scan?')).toBeVisible()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByTestId('history-item')).toHaveCount(1)
  // "Yes, delete" removes it: it was the only scan, so History is empty again.
  await page.getByTestId('history-delete').first().click()
  await page.getByTestId('history-delete-confirm').click()
  await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
})
