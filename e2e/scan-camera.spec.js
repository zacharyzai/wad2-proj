// Feature 1: live camera on Scan. Own file because the fake webcam needs different browser launch flags.
import { test, expect } from './fixtures.js'
import { mockImageScan } from './helpers/mockImageScan.js'

// Chromium's fake webcam, with the permission prompt auto-accepted.
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }, permissions: ['camera'] })

test('Take photo opens the camera and Capture sends the frame', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan?type=medication')
  await page.getByTestId('scan-take').click()
  await expect(page.getByLabel('Camera preview')).toBeVisible()
  await page.getByRole('button', { name: 'Capture' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check what we read')
  await expect(page.locator('img[src^="data:image/jpeg"]').first()).toBeAttached()
})

test('a bill is photographed page by page: Add next page, Retake keeps its place, then every page is read as one bill', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan?type=bill')
  await page.getByTestId('scan-take').click()
  await expect(page.getByTestId('scan-page-n')).toHaveText('Taking page 1')
  await page.getByRole('button', { name: 'Capture' }).click()
  // Not sent yet: the pages so far, and one question.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bill pages')
  await expect(page.getByRole('heading', { name: 'Does this bill have another page?' })).toBeVisible()
  await page.getByTestId('scan-add-page').click()
  await expect(page.getByTestId('scan-page-n')).toHaveText('Taking page 2')
  await page.getByRole('button', { name: 'Capture' }).click()
  await expect(page.getByTestId('scan-page')).toHaveCount(2)
  await page.getByRole('button', { name: 'Retake page 1' }).click()
  await expect(page.getByTestId('scan-page-n')).toHaveText('Retaking page 1')
  await page.getByRole('button', { name: 'Capture' }).click()
  await expect(page.getByTestId('scan-page')).toHaveCount(2)
  const sent = page.waitForRequest('**/api/scan')
  await page.getByTestId('scan-pages-done').click()
  expect((await sent).postDataJSON().images).toHaveLength(2)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
})

test('a blurry bill page is flagged as soon as it is taken: retake it, or use it anyway', async ({ page }) => {
  await mockImageScan(page)
  await page.addInitScript(() => (window.__photoCheckForTests = async () => 'blurry'))
  await page.goto('/scan?type=bill')
  await page.getByTestId('scan-take').click()
  await page.getByRole('button', { name: 'Capture' }).click()
  await expect(page.getByTestId('scan-page-state')).toHaveText('Too blurry to read')
  await expect(page.getByTestId('scan-pages-done')).toBeDisabled()
  await expect(page.getByText('Retake page 1 first, or choose “Use it anyway”.')).toBeVisible()
  await page.getByRole('button', { name: 'Use page 1 anyway' }).click()
  // Checked once, here: reading doesn't stop at the same check again.
  await page.getByTestId('scan-pages-done').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
})

test('Cancel with two or more bill pages asks before throwing them away', async ({ page }) => {
  await page.goto('/scan?type=bill')
  await page.getByTestId('scan-take').click()
  await page.getByRole('button', { name: 'Capture' }).click()
  await page.getByTestId('scan-add-page').click()
  await page.getByRole('button', { name: 'Capture' }).click()
  await page.getByTestId('scan-pages-cancel').click()
  await expect(page.getByRole('alertdialog')).toContainText('Throw away these 2 pages?')
  await page.getByTestId('scan-pages-keep').click()
  await expect(page.getByTestId('scan-page')).toHaveCount(2)
  await page.getByTestId('scan-pages-cancel').click()
  await page.getByTestId('scan-pages-throw-yes').click()
  await expect(page.getByTestId('scan-take')).toBeVisible()
})

test('blocked camera points to Upload photo', async ({ page, context }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
  })
  await page.goto('/scan?type=medication')
  await page.getByTestId('scan-take').click()
  await expect(page.getByRole('alert')).toContainText('Allow camera access')
})
