// Personal details are covered on the phone before a photo is sent (src/utils/redact.js). The reader itself is faked here
// (see mockImageScan); its rules are unit-tested in src/utils/sensitive.test.js and checked by hand at /dev/redact.
import { test, expect } from '@playwright/test'
import { mockImageScan } from './helpers/mockImageScan.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const upload = (page) => page.getByTestId('upload-input').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG })

test('only the covered photo is sent, and Confirm shows that same covered photo', async ({ page }) => {
  await mockImageScan(page)
  const COVERED = 'data:image/jpeg;base64,/9j/covered'
  // Overrides the helper's fake (init scripts run in order) so the covered photo is recognisable.
  await page.addInitScript((covered) => (window.__redactForTests = async () => ({ dataUrl: covered, keep: [{ text: 'TAKE 1 TABLET' }], hits: [] })), COVERED)
  const sent = page.waitForRequest('**/api/scan')
  await page.goto('/scan')
  await upload(page)
  expect((await sent).postDataJSON().image).toBe(COVERED)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  await expect(page.locator(`img[src="${COVERED}"]`).first()).toBeAttached()
})

test('if covering fails, nothing is sent and Try again covers again', async ({ page }) => {
  await mockImageScan(page, { cover: 'fail' })
  let apiCalls = 0
  page.on('request', (r) => r.url().includes('/api/scan') && apiCalls++)
  await page.goto('/scan')
  await upload(page)
  await expect(page.getByRole('alert')).toContainText("We couldn't cover your personal details on this phone, so nothing was sent.")
  // The reader works now: Try again covers and sends.
  await page.evaluate(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TAKE 1 TABLET' }], hits: [] })))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  expect(apiCalls).toBe(1)
})

test('a photo with nothing that looks like a label is not sent (it would be all black)', async ({ page }) => {
  await mockImageScan(page, { cover: 'none' })
  let apiCalls = 0
  page.on('request', (r) => r.url().includes('/api/scan') && apiCalls++)
  await page.goto('/scan')
  await upload(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible() // the photo tips, as for any unclear photo
  expect(apiCalls).toBe(0)
})
