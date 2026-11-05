// A scan carries on when the person taps elsewhere mid-way: it finishes on its own, a notice on any page says how it is
// going, and it never pulls them to Confirm from another page. Coming back to Scan shows it still going.
// The photo is "covered" by a fake (no reader download) and /api/scan answers only when the test lets it.
import { test, expect } from './fixtures.js'
import { nextFrames } from './helpers/checks.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

// Starts a medicine label scan and holds its answer back. answer(): the Metformin sample; answer(false): AI unavailable.
async function startScan(page) {
  await page.addInitScript(
    () =>
      (window.__redactForTests = async (dataUrl) => ({
        dataUrl,
        keep: [{ text: 'TAKE 1 TABLET' }],
        hits: [],
      })),
  )
  let release
  const held = new Promise((resolve) => (release = resolve))
  await page.route('**/api/scan', async (route) => {
    const ok = await held
    if (!ok)
      return route.fulfill({
        status: 503,
        json: { ok: false, error: { code: 'AI_UNAVAILABLE', message: 'AI is not available' } },
      })
    const sample = await (
      await route.fetch({ postData: JSON.stringify({ sampleId: 'med-1' }) })
    ).json()
    return route.fulfill({ json: { ok: true, data: { ...sample.data, source: 'mock' } } })
  })
  await page.goto('/scan?type=medication')
  const sent = page.waitForRequest('**/api/scan')
  await page
    .getByTestId('upload-input')
    .setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await sent // covered and on its way
  return { answer: (ok = true) => release(ok) }
}
const tab = (page, name) => page.locator('.nav').getByRole('link', { name, exact: true })

test('leaving mid-scan: it finishes anyway, says so on the page they are on, and waits there to be checked', async ({
  page,
}) => {
  const scan = await startScan(page)
  await tab(page, 'Schedule').click()
  const notice = page.getByTestId('scan-away')
  await expect(notice).toContainText('Still reading your medicine label…')

  scan.answer()
  await expect(notice).toContainText('Your medicine label is ready to check.')
  await expect(page).toHaveURL(/\/schedule$/) // never pulled away from what they are doing
  await page.getByTestId('scan-away-go').click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
  await expect(notice).toHaveCount(0)
})

test('coming back to Scan mid-scan shows it still reading, and it carries on to Confirm', async ({
  page,
}) => {
  const scan = await startScan(page)
  await tab(page, 'Ask').click()
  await expect(page.getByTestId('scan-away')).toBeVisible()
  await tab(page, 'Scan').click()
  await expect(page.getByTestId('scan-wait')).toBeVisible()
  await expect(page.getByTestId('scan-away')).toHaveCount(0) // they can see it here
  scan.answer()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
})

test('a scan that fails while they are away says so, and Scan shows why; seen once, Scan starts fresh', async ({
  page,
}) => {
  const scan = await startScan(page)
  await tab(page, 'Schedule').click()
  scan.answer(false)
  const notice = page.getByTestId('scan-away')
  await expect(notice).toContainText('We could not finish reading your medicine label.')
  await page.getByTestId('scan-away-go').click()
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

  await tab(page, 'Schedule').click()
  await expect(notice).toHaveCount(0)
  await tab(page, 'Scan').click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Cancel still stops a scan: nothing carries on, nothing is announced', async ({ page }) => {
  const scan = await startScan(page)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await tab(page, 'Schedule').click()
  scan.answer()
  await nextFrames(page, 30)
  await expect(page.getByTestId('scan-away')).toHaveCount(0)
  await expect(page).toHaveURL(/\/schedule$/)
})
