// Personal details are covered on the phone before a photo is sent (src/utils/redact.js). The reader itself is faked here
// (see mockImageScan); its rules are unit-tested in src/utils/sensitive.test.js and checked by hand at /dev/redact.
import { test, expect } from './fixtures.js'
import { mockImageScan } from './helpers/mockImageScan.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const upload = async (page) => {
  await page.getByTestId('upload-input').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
}

test('only the covered photo is sent, and Confirm shows that same covered photo', async ({ page }) => {
  await mockImageScan(page)
  const COVERED = 'data:image/jpeg;base64,/9j/covered'
  // Overrides the helper's fake (init scripts run in order) so the covered photo is recognisable.
  await page.addInitScript((covered) => (window.__redactForTests = async () => ({ dataUrl: covered, keep: [{ text: 'TAKE 1 TABLET' }], hits: [] })), COVERED)
  const sent = page.waitForRequest('**/api/scan')
  await page.goto('/scan?type=medication')
  await upload(page)
  expect((await sent).postDataJSON().image).toBe(COVERED)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  await expect(page.locator(`img[src="${COVERED}"]`).first()).toBeAttached()
})

test('if covering fails, nothing is sent and Try again covers again', async ({ page }) => {
  await mockImageScan(page, { cover: 'fail' })
  let apiCalls = 0
  page.on('request', (r) => r.url().includes('/api/scan') && apiCalls++)
  await page.goto('/scan?type=medication')
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
  await page.goto('/scan?type=medication')
  await upload(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible() // the photo tips, as for any unclear photo
  expect(apiCalls).toBe(0)
})

test('covering that never finishes stops at 12 s with "taking too long", and Try again covers again', async ({ page }) => {
  await mockImageScan(page, { cover: 'hang' })
  let apiCalls = 0
  page.on('request', (r) => r.url().includes('/api/scan') && apiCalls++)
  await page.clock.install()
  await page.goto('/scan?type=medication')
  await upload(page)
  const steps = page.getByTestId('scan-steps')
  await expect(steps.locator('li').first()).toHaveAttribute('aria-current', 'step') // step 1 of 2: covering
  await page.clock.runFor(12_500)
  await expect(page.getByRole('alert')).toContainText('This is taking too long, so we stopped.')
  expect(apiCalls).toBe(0)
  await page.evaluate(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TAKE 1 TABLET' }], hits: [] })))
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.clock.runFor(2_000) // the cover reveal
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  expect(apiCalls).toBe(1)
})

test('while reading, step 2 is shown, and a slow read says so and when it will stop', async ({ page }) => {
  await mockImageScan(page)
  await page.route('**/api/scan', () => {}) // the server never answers
  await page.clock.install()
  await page.goto('/scan?type=medication')
  await upload(page)
  await page.clock.runFor(2_000) // covered, then the reveal
  const steps = page.getByTestId('scan-steps').locator('li')
  await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step')
  await expect(steps.nth(0)).toHaveClass(/done/)
  await expect(page.getByTestId('scan-wait')).toHaveText('This usually takes about 10 seconds.')
  await page.clock.runFor(14_000)
  await expect(page.getByTestId('scan-wait')).toHaveText('This is taking longer than usual. We will stop after 30 seconds so you can try again.')
})
