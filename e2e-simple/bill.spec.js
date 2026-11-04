// Owner: Lokesh. Bill and subsidies: 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

const BEDOK = 'Bedok: doctor visit and medicine'
const TAMPINES = 'Tampines: blood tests and MediSave'

// Opens one of the sample bills on the Bill page.
async function openBill(page, name) {
  await page.goto('/bill')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('heading', { name: 'What this means for you' })).toBeVisible()
}

test('the Bill page offers sample bills', async ({ page }) => {
  await signUp(page)
  await page.goto('/bill')
  await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: BEDOK })).toBeVisible()
})

test('a sample bill shows what you pay', async ({ page }) => {
  await signUp(page)
  await openBill(page, BEDOK)
  await expect(page.getByText('$14.00').first()).toBeVisible()
})

test('a bill line explains itself', async ({ page }) => {
  await signUp(page)
  await openBill(page, TAMPINES)
  await page.getByTestId('bill-items-toggle').click() // the charges are behind a dropdown
  await page.getByRole('button', { name: /HbA1c blood test/ }).click()
  await expect(page.getByText('These are tests that help the doctor check your health')).toBeVisible()
})

test('subsidies open with their sources', async ({ page }) => {
  await signUp(page)
  await openBill(page, BEDOK)
  await page.getByText('Press here to see more').click()
  await expect(page.getByTestId('estimate-notice')).toContainText('Estimate only')
  await expect(page.getByTestId('estimate-notice').getByRole('link')).toHaveCount(4)
})

test('you can get back to the list of bills', async ({ page }) => {
  await signUp(page)
  await openBill(page, BEDOK)
  await page.getByTestId('bill-done').click() // "Close this bill"
  await expect(page.getByRole('heading', { name: 'No bill to show yet' })).toBeVisible()
})
