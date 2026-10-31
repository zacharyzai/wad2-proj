// Feature 1: Scan → Confirm → Explain. Samples only; the photo upload is answered in the browser.
import { test, expect } from './fixtures.js'
import { mockImageScan } from './helpers/mockImageScan.js'
import { switchLanguage } from './helpers/auth.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function openSample(page, name, path = '/scan?type=medication') {
  await page.goto(path)
  await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
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

test('Scan first asks label or bill with two picture cards; picking one opens its camera, upload and tips', async ({ page, isMobile }) => {
  await page.goto('/scan')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would you like to scan today?')
  await expect(page.getByTestId('scan-take')).toHaveCount(0) // nothing else until they pick
  await expect(page.getByTestId('upload-input')).toHaveCount(0)
  const [label, bill] = [page.getByTestId('choose-medication'), page.getByTestId('choose-bill')]
  await expect(label).toContainText('Medicine label')
  await expect(label).toContainText('Scan a label')
  await expect(bill).toContainText('Medical bill')
  await expect(bill).toContainText('Scan a bill')
  // Side by side, both fully on screen, even on a phone.
  await expect(label).toBeInViewport({ ratio: 1 })
  await expect(bill).toBeInViewport({ ratio: 1 })
  const [l, b] = await Promise.all([label.boundingBox(), bill.boundingBox()])
  expect(Math.abs(l.y - b.y)).toBeLessThan(2)

  await bill.click()
  await expect(page).toHaveURL(/\/scan\?type=bill$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan a medical bill')
  await expect(page.getByRole('button', { name: 'Take a photo of the bill' })).toBeVisible()
  await expect(page.getByTestId('upload-input')).toHaveCount(1)
  await expect(page.getByTestId('scan-tips')).toContainText('Include the total')
  if (isMobile) await expect(page.getByTestId('scan-take')).toBeInViewport()

  // Back (the round button, or the browser's) returns to the question.
  await page.getByTestId('scan-back').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would you like to scan today?')
  await label.click()
  await expect(page.getByRole('button', { name: 'Take a photo of the label' })).toBeVisible()
  await expect(page.getByTestId('scan-tips')).toContainText('Label facing you')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would you like to scan today?')
})

test('the privacy line sits right under the photo buttons', async ({ page }) => {
  await page.goto('/scan?type=medication')
  const [upload, privacy] = await Promise.all([page.locator('.dz-card').boundingBox(), page.getByText('blacked out on this device').boundingBox()])
  expect(privacy.y).toBeGreaterThan(upload.y + upload.height - 1)
  expect(privacy.y - (upload.y + upload.height)).toBeLessThan(40)
})

test('"Try an example" opens a short list of samples for that kind', async ({ page }) => {
  await page.goto('/scan?type=medication')
  const toggle = page.getByTestId('scan-examples')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Metformin label' })).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  for (const name of ['Metformin label', 'Amlodipine label', 'Cough syrup label']) await expect(page.getByRole('button', { name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Medical bill' })).toHaveCount(0)
  await page.goto('/scan?type=bill')
  await page.getByTestId('scan-examples').click()
  await expect(page.getByRole('button', { name: 'Medical bill' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Metformin label' })).toHaveCount(0)
})

test('a photo picked on Home waits on the question; picking a card reads it as that kind', async ({ page }) => {
  await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
  const sent = []
  await page.route('**/api/scan', async (route) => {
    sent.push(route.request().postDataJSON().type)
    const bill = await (await route.fetch({ postData: JSON.stringify({ sampleId: 'bill-1' }) })).json()
    return route.fulfill({ json: { ok: true, data: { ...bill.data, source: 'ai' } } })
  })
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: TINY_PNG })
  await expect(page).toHaveURL(/\/scan$/)
  await expect(page.getByTestId('scan-pending')).toContainText('Your photo is ready. What is it?')
  await expect(page.getByTestId('choose-bill')).toContainText('Scan this photo as a bill')
  expect(sent).toEqual([]) // nothing is read until they say what it is
  await page.getByTestId('choose-bill').click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  expect(sent).toEqual(['bill'])
})

test('a sample link skips straight to Confirm', async ({ page }) => {
  await page.goto('/scan?sample=med-1')
  await expect(page).toHaveURL(/\/scan\/confirm$/)
})

test('old bill links open the bill scan; there is no Bill tab anywhere', async ({ page }) => {
  await page.goto('/bill/scan')
  await expect(page).toHaveURL(/\/scan#bill$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scan a medical bill')
  await expect(page.getByRole('link', { name: 'Bill', exact: true })).toHaveCount(0)
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
  await page.goto('/scan?type=medication')
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
  await expect(page.getByTestId('scan-examples')).toHaveAttribute('aria-expanded', 'true') // back with the examples open
  await expect(page.getByRole('button', { name: 'Metformin label' })).toBeVisible()
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
  await expect(page.getByTestId('scan-examples')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Medical bill' })).toBeVisible()
})

// Medicine scan given a bill photo: the server answers LOOKS_LIKE_BILL; read as a bill, it answers with a bill.
async function mockBillSentAsLabel(page) {
  await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
  const sent = []
  await page.route('**/api/scan', async (route) => {
    const body = route.request().postDataJSON()
    if (body.sampleId) return route.continue()
    sent.push(body.type)
    if (body.type === 'medication') return route.fulfill({ status: 422, json: { ok: false, error: { code: 'LOOKS_LIKE_BILL', message: 'looks like a bill' } } })
    const bill = await (await route.fetch({ postData: JSON.stringify({ sampleId: 'bill-1' }) })).json()
    return route.fulfill({ json: { ok: true, data: { ...bill.data, source: 'ai' } } })
  })
  await page.goto('/scan?type=medication')
  await page.getByTestId('upload-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This looks like a medical bill')
  await expect(page.getByTestId('scan-other-question')).toHaveText('You chose a medicine label. Was this meant for a medical bill?')
  return sent
}

test('a bill photo on the medicine Scan asks "Was this meant for a medical bill?"; Yes reads the same photo as a bill', async ({ page }) => {
  const sent = await mockBillSentAsLabel(page)
  await page.getByTestId('scan-other-yes').click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByText('SingHealth Polyclinics - Bedok')).toBeVisible() // the bill's Confirm, not a label's
  expect(sent).toEqual(['medication', 'bill']) // no new photo: the same one, sent again as a bill
})

test('… and No says the photo doesn\'t match a medicine label, with ways to fix it', async ({ page }) => {
  await mockBillSentAsLabel(page)
  await expect(page.getByTestId('scan-other-no')).toHaveText('No, it’s a medicine label') // says what "No" means (H2)
  await page.getByTestId('scan-other-no').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This photo doesn’t match a medicine label')
  await expect(page.getByRole('alert')).toContainText('Take a photo of the medicine label instead.')
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible()
  await expect(page.getByTestId('scan-other-yes')).toHaveCount(0)
})

test('Confirm: leaving with corrections asks first; Keep checking stays, Throw away leaves (H3, H5)', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await expect(page.locator('img[src="/samples/med-1.svg"]').first()).toBeAttached() // the sample's picture, to check against (H6)
  await page.getByLabel('Medicine name').fill('Metformin XR')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('confirm-discard')).toContainText('Throw away your changes?')
  await expect(page.getByTestId('confirm-keep')).toBeFocused()
  await page.getByTestId('confirm-keep').click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin XR') // nothing lost

  await page.getByRole('link', { name: 'Ask', exact: true }).first().click() // a tab counts as leaving too
  await expect(page.getByTestId('confirm-discard')).toBeVisible()
  await page.getByTestId('confirm-discard-yes').click()
  await expect(page).toHaveURL(/\/ask$/)
})

test('Confirm: no question when nothing changed, or after Looks correct', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/scan(\?|$)/)
  await openSample(page, 'Metformin label')
  await page.getByLabel('Medicine name').fill('Metformin XR')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page).toHaveURL(/\/scan\/explain$/)
})

test('Confirm: impossible doses are flagged with what to fix, and block Looks correct (H5)', async ({ page }) => {
  await openSample(page, 'Metformin label')
  const ok = page.getByRole('button', { name: 'Looks correct' })
  await page.locator('#f-amount').fill('0')
  await expect(page.getByText('This must be more than 0.')).toBeVisible()
  await expect(ok).toBeDisabled()
  await page.locator('#f-amount').fill('1')
  await page.locator('#f-times').fill('20')
  await expect(page.getByText('Times a day must be a whole number from 1 to 6.')).toBeVisible()
  await page.locator('#f-times').fill('2')
  await expect(ok).toBeEnabled()
  // 2 times a day, but only Morning ticked.
  await page.getByRole('button', { name: 'Evening' }).click()
  await expect(page.getByText('You ticked 1 time of day, but it says 2 times a day.')).toBeVisible()
  await expect(ok).toBeDisabled()
  await page.getByRole('button', { name: 'Evening' }).click()
  await expect(ok).toBeEnabled()
})

test('Scan errors can be read aloud (H10)', async ({ page }) => {
  await page.route('**/api/scan', (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: 'AI_UNAVAILABLE', message: 'down' } } }))
  await openSample(page, 'Metformin label')
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible()
})

test('explanation follows the language switch', async ({ page }) => {
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await switchLanguage(page, '中文')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('每次 1 粒，每天 2 次。')
})

test('explain without a confirmed scan goes back to Scan', async ({ page }) => {
  await page.goto('/scan/explain')
  await expect(page).toHaveURL(/\/scan$/)
})

test('the photo is shown before scanning; Change photo picks another', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan?type=medication')
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
  await page.goto('/scan?type=medication')
  await page.getByTestId('upload-input').setInputFiles('public/samples/med-1.svg')
  await expect(page.getByRole('alert')).toHaveText('Please choose a PNG, JPG or HEIC photo.')
  await page.getByTestId('upload-input').setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })
  await expect(page.getByRole('alert')).toHaveText('Please choose a photo under 10MB.')
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toHaveCount(0)
  expect(apiCalls).toBe(0)
})

test('a photo can be dropped on the upload box, which also opens with the keyboard', async ({ page }) => {
  await mockImageScan(page)
  await page.goto('/scan?type=medication')
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
  await page.goto('/scan?type=medication')
  await page.getByTestId('upload-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This file can’t be used.')
  await expect(page.getByRole('button', { name: 'Upload a different photo' })).toBeVisible()
  expect(apiCalls).toBe(0)
})
