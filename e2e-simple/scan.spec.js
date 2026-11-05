// Scan, Confirm, Explain: 6 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

test('Scan offers a medicine label or a bill', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'What would you like to scan today?',
  )
  await expect(page.getByTestId('choose-medication')).toContainText('Medicine label')
  await expect(page.getByTestId('choose-bill')).toContainText('Medical bill')
})

test('a sample label opens Confirm', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
  await expect(page.getByRole('button', { name: 'Looks correct' })).toBeVisible()
})

test('Looks correct opens the explanation', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page).toHaveURL(/\/scan\/explain$/)
  await expect(page.getByText('Take 1 tablet, 2 times a day.').first()).toBeVisible()
})

test('the quick check corrects a wrong answer', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { name: 'How many tablets each time?' })).toBeVisible()
  await page.getByRole('button', { name: '2 tablets', exact: true }).click()
  await expect(page.getByText('Not quite. It is 1 tablet each time.')).toBeVisible()
})

test('Explain with no scan goes back to Scan', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan/explain')
  await expect(page).toHaveURL(/\/scan$/)
})

test('a part we cannot read is marked, and nothing is guessed to fill it', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByLabel('Medicine name').fill('')
  await expect(page.getByText('Fill in the parts marked Please check to continue.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Looks correct' })).toBeDisabled()
})
