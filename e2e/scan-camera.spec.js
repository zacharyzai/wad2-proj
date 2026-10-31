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

test('blocked camera points to Upload photo', async ({ page, context }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
  })
  await page.goto('/scan?type=medication')
  await page.getByTestId('scan-take').click()
  await expect(page.getByRole('alert')).toContainText('Allow camera access')
})
