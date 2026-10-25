// Feature 1: Scan → Confirm → Explain. Samples only; the photo upload is answered in the browser.
import { test, expect } from './fixtures.js'
import { mockImageScan } from './helpers/mockImageScan.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function openSample(page, name, path = '/scan') {
  await page.goto(path)
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
  await openSample(page, 'Medical bill', '/bill/scan')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You pay $14.00.')
})

test('Scan is for medication labels; bills are scanned from the Bill page', async ({ page, isMobile }) => {
  await page.goto('/scan')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan a medication label')
  await expect(page.getByRole('button', { name: 'Medical bill' })).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)

  // Old links (/scan?type=bill) land on the bill scan page.
  await page.goto('/scan?type=bill')
  await expect(page).toHaveURL(/\/bill\/scan$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan a medical bill')
  await expect(page.getByRole('button', { name: 'Metformin label' })).toHaveCount(0)
  if (!isMobile) await expect(page.getByRole('link', { name: 'Bill', exact: true })).toHaveAttribute('aria-current', 'page')
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
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
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

test('a clear photo that is not a medical bill says so, not "retake in good light"', async ({ page }) => {
  await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
  await page.route('**/api/scan', (route) =>
    route.fulfill({ status: 422, json: { ok: false, error: { code: 'WRONG_DOCUMENT', message: 'This is not a medical bill' } } }),
  )
  await page.goto('/bill/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'holiday-photo.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This doesn’t look like a medical bill')
  await expect(page.getByRole('alert')).toContainText('it doesn’t look like a bill from a clinic, hospital or pharmacy')
  await expect(page.getByText('good light')).toHaveCount(0) // no lighting advice for a clear photo
  await expect(page.locator('.tips')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Use a sample instead' }).click()
  await expect(page.getByRole('heading', { level: 2, name: /Try a sample/ })).toBeVisible()
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

test('the photo is shown before scanning; Change photo picks another', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page.getByRole('img', { name: 'The photo you chose' })).toBeVisible()
  await expect(page.getByText('label.png')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()
  await page.getByTestId('upload-input').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page.getByText('other.png')).toBeVisible()
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
})

test('wrong file types and photos over 10MB are refused before anything is sent', async ({ page }) => {
  let apiCalls = 0
  await page.route('**/api/scan', (route) => (apiCalls++, route.continue()))
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles('public/samples/med-1.svg')
  await expect(page.getByRole('alert')).toHaveText('Please choose a PNG, JPG or HEIC photo.')
  await page.getByTestId('upload-input').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })
  await expect(page.getByRole('alert')).toHaveText('Please choose a photo under 10MB.')
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toHaveCount(0)
  expect(apiCalls).toBe(0)
})

test('a photo can be dropped on the upload box, which also opens with the keyboard', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan')
  const zone = page.getByRole('button', { name: 'Tap to upload or drop a photo' })
  const chooser = page.waitForEvent('filechooser')
  await zone.focus()
  await page.keyboard.press('Enter')
  await chooser
  const drop = await page.evaluateHandle((b64) => {
    const dt = new DataTransfer()
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'dropped.png', { type: 'image/png' }))
    return dt
  }, TINY_PNG.toString('base64'))
  await zone.dispatchEvent('drop', { dataTransfer: drop })
  await expect(page.getByText('dropped.png')).toBeVisible()
})

test('a file the browser cannot open says so, without asking the server', async ({ page }) => {
  let apiCalls = 0
  await page.route('**/api/scan', (route) => (apiCalls++, route.continue()))
  await page.goto('/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This file can’t be used.')
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible()
  expect(apiCalls).toBe(0)
})
