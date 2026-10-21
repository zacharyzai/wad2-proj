// Feature 1: Scan → Confirm → Explain. Samples only; the photo upload is answered in the browser.
import { test, expect } from '@playwright/test'
import { mockImageScan } from './helpers/mockImageScan.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function openSample(page, name) {
  await page.goto('/scan')
  await page.getByRole('button', { name }).click()
}

test('medication sample: confirm, explain and quick check', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')

  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take 1 tablet, 2 times a day.')
  await expect(page.getByText('Eat your meal first')).toBeVisible()

  await page.getByRole('button', { name: '1 tablet', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Yes, that’s right.')
  await expect(page.getByRole('link', { name: 'Add to schedule' })).toBeVisible()
})

test('edits on Confirm change the explanation', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await page.getByLabel('Amount each time').fill('2')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take 2 tablets, 2 times a day.')
})

test('when-needed medicine is flagged for the pharmacist, not scheduled', async ({ page }) => {
  await openSample(page, 'Cough syrup label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask your pharmacist how to take this medicine.')
  await expect(page.getByText('Only when needed')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add to schedule' })).toHaveCount(0)
})

test('bill sample shows what you pay', async ({ page }) => {
  await openSample(page, 'Medical bill')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You pay $14.00.')
})

test('unclear fields block Confirm until filled', async ({ page }) => {
  // Simulates an AI scan that couldn't read the food instruction.
  await page.route('**/api/scan', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    body.data.unclear = ['medication.withFood']
    body.data.medication.withFood = null
    await route.fulfill({ response: res, json: body })
  })
  await openSample(page, 'Metformin label')
  await expect(page.getByText('1 field needs checking')).toBeVisible()
  const ok = page.getByRole('button', { name: 'Looks correct' })
  await expect(ok).toBeDisabled()
  await expect(page.getByTestId('all-filled')).toBeHidden()
  await page.getByRole('button', { name: 'After food' }).click()
  await expect(ok).toBeEnabled()
  await expect(page.getByTestId('all-filled')).toHaveText(/Everything is filled in.*press Looks correct/)
})

test('uploaded photo is compressed, sent and shown on Confirm', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  // Compressed to JPEG on the client before upload.
  await expect(page.locator('img[src^="data:image/jpeg"]').first()).toBeAttached()
})

test('scan service errors offer retry and samples', async ({ page }) => {
  await page.route('**/api/scan', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: { code: 'AI_UNAVAILABLE', message: 'down' } } }),
  )
  await openSample(page, 'Metformin label')
  await expect(page.getByRole('alert')).toContainText('Scanning is not available right now.')
  await page.getByRole('button', { name: 'Use a sample instead' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Nothing to scan? Try a sample' })).toBeVisible()
})

test('explanation follows the language switch', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每次 1 粒，每天 2 次。')
})

test('explain without a confirmed scan goes back to Scan', async ({ page }) => {
  await page.goto('/scan/explain')
  await expect(page).toHaveURL(/\/scan$/)
})

test('an SVG label can be uploaded; it is converted to JPEG first', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles('public/samples/med-1.svg')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
})

test('a file the browser cannot open says so, without asking the server', async ({ page }) => {
  let apiCalls = 0
  await page.route('**/api/scan', (route) => (apiCalls++, route.continue()))
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await expect(page.getByRole('alert')).toContainText('This file can’t be used.')
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible()
  expect(apiCalls).toBe(0)
})
