// Long bills (more than 6 charges, often several pages): Confirm opens only the lines that need checking, the Bill page
// groups the charges by kind, and on phones a "You pay" bar stays in view. The scan is answered in the browser.
import { test, expect } from './fixtures.js'

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

// 8 charges; the Omeprazole amount couldn't be read (null, and listed in `unclear`, as the server sends it).
const ITEMS = [
  { description: 'Consultation', category: 'consultation', amountCents: 3000 },
  { description: 'Full blood count', category: 'investigation', amountCents: 2400 },
  { description: 'Chest X-ray', category: 'investigation', amountCents: 5000 },
  { description: 'Paracetamol 500mg', category: 'medication', amountCents: 300 },
  { description: 'Metformin 500mg', category: 'medication', amountCents: 900 },
  { description: 'Omeprazole 20mg', category: 'medication', amountCents: null },
  { description: 'Wound dressing', category: 'procedure', amountCents: 1500 },
  { description: 'Medical report', category: 'other', amountCents: 2000 },
]
const BILL = { clinic: 'Eastwater General Hospital', place: 'hospital', visitDate: '2026-10-15', items: ITEMS, subsidies: [], medisaveCents: 0, totalPayableCents: 16780 }

async function scanBill(page, bill, unclear) {
  await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
  await page.route('**/api/scan', (route) => route.fulfill({ json: { ok: true, data: { type: 'bill', source: 'ai', unclear, bill } } }))
  await page.goto('/scan?type=bill')
  await page.getByTestId('upload-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: TINY_PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your bill items')
}
const amountOf = (page, item) => page.getByRole('spinbutton', { name: `Amount for ${item}` })

test('Confirm: a long bill opens only the line that needs checking; the rest are one tap away and still saved', async ({ page }) => {
  await scanBill(page, BILL, ['bill.items.5.amountCents'])
  await expect(amountOf(page, 'Omeprazole 20mg')).toBeVisible()
  await expect(amountOf(page, 'Consultation')).toHaveCount(0)
  const toggle = page.getByTestId('confirm-fine-toggle')
  await expect(toggle).toHaveText('7 other lines look fine. Show them')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(amountOf(page, 'Consultation')).toBeVisible()
  await expect(toggle).toHaveText('Hide the lines that look fine')
  await toggle.click()
  await expect(amountOf(page, 'Consultation')).toHaveCount(0)

  // Fixing the line keeps it in view (nothing folds away while typing), and Save keeps every line.
  await amountOf(page, 'Omeprazole 20mg').fill('16.80')
  await amountOf(page, 'Omeprazole 20mg').blur()
  await expect(amountOf(page, 'Omeprazole 20mg')).toBeVisible()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.getByRole('link', { name: /See full breakdown/ }).click()
  await expect(page.getByTestId('bill-total')).toContainText('$167.80')
})

test('Confirm: lines that don\'t add up with no subtotal to point at open every line', async ({ page }) => {
  const items = ITEMS.map((item) => ({ ...item, amountCents: item.amountCents ?? 1680 }))
  await scanBill(page, { ...BILL, items, totalPayableCents: 16680 }, []) // $1.00 off, and the bill prints no subtotals
  await expect(page.getByTestId('confirm-gap')).toBeVisible()
  for (const item of items) await expect(amountOf(page, item.description)).toBeVisible()
})

test('Confirm: a short bill looks as before, with no fold', async ({ page }) => {
  await scanBill(page, { ...BILL, items: ITEMS.slice(0, 4), totalPayableCents: 10700 }, [])
  await expect(amountOf(page, 'Consultation')).toBeVisible()
  await expect(page.getByTestId('confirm-fine-toggle')).toHaveCount(0)
})

test('Bill page: a long bill\'s charges open as one row per kind, biggest first, and the summary names the biggest', async ({ page }) => {
  await scanBill(page, BILL, ['bill.items.5.amountCents'])
  await amountOf(page, 'Omeprazole 20mg').fill('16.80')
  await amountOf(page, 'Omeprazole 20mg').blur()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.getByRole('link', { name: /See full breakdown/ }).click()

  await expect(page.getByTestId('bill-biggest')).toContainText('Tests $74.00 · Doctor visit $30.00 · Medicine $28.80')
  await page.getByTestId('bill-items-toggle').click()
  const groups = page.getByTestId('bill-group')
  await expect(groups).toHaveCount(5)
  await expect(groups.first()).toContainText('Tests')
  await expect(groups.first()).toContainText('2 items')
  await expect(groups.first()).toContainText('$74.00')
  await expect(page.getByRole('button', { name: /Omeprazole 20mg/ })).toHaveCount(0)

  const medicine = groups.filter({ hasText: 'Medicine' })
  await medicine.click()
  await expect(medicine).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: /Omeprazole 20mg/ }).click() // a line still opens its plain explanation
  await expect(page.getByRole('button', { name: /Omeprazole 20mg/ })).toHaveAttribute('aria-expanded', 'true')
})

test('Bill page: a short bill keeps the plain list and no "biggest" line', async ({ page }) => {
  await page.goto('/bill')
  await page.getByRole('button', { name: 'Bedok: doctor visit and medicine' }).click()
  await expect(page.getByTestId('bill-biggest')).toHaveCount(0)
  await page.getByTestId('bill-items-toggle').click()
  await expect(page.getByTestId('bill-group')).toHaveCount(0)
})

test('phones: with the charges open, "You pay" stays in view once the summary is scrolled past', async ({ page, isMobile }) => {
  await page.goto('/bill')
  await page.getByRole('button', { name: 'Hospital stay: ward, GST and MediShield Life' }).click()
  await page.getByTestId('bill-items-toggle').click()
  for (const group of await page.getByTestId('bill-group').all()) await group.click()
  await page.getByTestId('bill-total').scrollIntoViewIfNeeded()
  const bar = page.getByTestId('bill-pay-bar')
  if (!isMobile) return await expect(bar).toBeHidden() // desktop: the summary sits beside the list
  await expect(bar).toBeVisible()
  await expect(bar).toContainText('$106.53')
  await page.getByTestId('bill-pay-bar-top').click()
  await expect(bar).toHaveCount(0)
  await page.getByTestId('bill-items-toggle').click() // charges closed: no bar, wherever the page is
  await page.getByTestId('bill-total').scrollIntoViewIfNeeded()
  await expect(bar).toHaveCount(0)
})
