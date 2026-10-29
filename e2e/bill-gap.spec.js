// A bill whose lines don't add up to its printed total (one misread digit, e.g. $14.50 read as $14.00): Confirm says how
// far off and where to look, but doesn't block; the Bill page keeps the bill's own total and says the same.
// The scan is mocked as the server returns it (src/rules/billCheck.js does the sums).
import { test, expect } from './fixtures.js'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const meds = (fexofen) => [
  { description: 'PROCEPTIN-20 CAPSULE 20MG', category: 'medication', amountCents: 957, section: 'Medications List' },
  { description: 'ETORICOXIB 90MG', category: 'medication', amountCents: 2314, section: 'Medications List' },
  { description: 'MAC-EXTRA LOZENGE', category: 'medication', amountCents: 670, section: 'Medications List' },
  { description: 'ILIADIN NASAL DROPS (NON CLAIMABLE)', category: 'medication', amountCents: 1260, section: 'Medications List' },
  { description: 'FEXOFEN 180MG', category: 'medication', amountCents: fexofen, section: 'Medications List' },
  { description: 'HELIXIR COUGH SYRUP', category: 'medication', amountCents: 975, section: 'Medications List' },
  { description: 'STENAC 600MG', category: 'medication', amountCents: 750, section: 'Medications List' },
]
const hmi = (fexofen) => ({
  clinic: 'HMI Managed Healthcare Clinic', place: 'gp', visitDate: null,
  items: [
    { description: 'Tele - Consultation', category: 'consultation', amountCents: 800, section: 'Consultation Fees' },
    { description: 'Surcharge', category: 'other', amountCents: 2000, section: 'Consultation Fees' },
    ...meds(fexofen),
    { description: 'GST (9%)', category: 'tax', amountCents: 1006, section: null },
  ],
  subsidies: [{ scheme: 'other', amountCents: 8629, includedInItems: false }],
  medisaveCents: 0,
  totalPayableCents: 3553,
  subtotals: [{ section: 'Consultation Fees', amountCents: 2800 }, { section: 'Medications List', amountCents: 8376 }],
})

async function scanBill(page, bill) {
  await page.addInitScript(() => (window.__redactForTests = async (dataUrl) => ({ dataUrl, keep: [{ text: 'TOTAL' }], hits: [] })))
  await page.route('**/api/scan', (route) => route.fulfill({ json: { ok: true, data: { type: 'bill', source: 'ai', unclear: [], bill } } }))
  await page.goto('/bill/scan')
  await page.getByTestId('upload-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Scan', exact: true }).click()
}

test('lines that do not add up: Confirm says by how much and where, and still lets them carry on', async ({ page }) => {
  await scanBill(page, hmi(1400))
  const gap = page.getByTestId('confirm-gap')
  await expect(gap).toContainText('These lines add up to $35.03, not $35.53.')
  await expect(gap).toContainText('look at the lines under “Medications List”: the bill says they come to $83.76.')
  await expect(page.locator('#f-total')).not.toHaveClass(/is-flagged/) // the total isn't "unclear"
  await expect(page.getByRole('spinbutton', { name: 'Amount for FEXOFEN 180MG' })).toHaveClass(/is-check/) // a line in the group that is off
  await expect(page.getByRole('spinbutton', { name: 'Amount for Surcharge' })).not.toHaveClass(/is-check/)

  // Fixing the misread line makes the note go away.
  await page.getByRole('spinbutton', { name: 'Amount for FEXOFEN 180MG' }).fill('14.50')
  await page.getByRole('spinbutton', { name: 'Amount for FEXOFEN 180MG' }).blur()
  await expect(gap).toHaveCount(0)
})

test('the Bill page keeps the printed total and says the lines are off, and where', async ({ page }) => {
  await scanBill(page, hmi(1400))
  const ok = page.getByRole('button', { name: 'Looks correct' })
  await expect(ok).toBeEnabled() // never blocked by the sums
  await ok.click()
  // Explain says it too, under its summary, and reads it aloud with the rest.
  await expect(page.getByTestId('explain-gap')).toContainText('They come to $35.03, but your bill’s total is $35.53.')
  await page.getByRole('link', { name: /See full breakdown/ }).click()
  await expect(page.getByTestId('bill-total')).toContainText('$35.53')
  const note = page.getByTestId('bill-gap')
  await expect(note).toContainText('These charges don’t quite add up')
  await expect(note).toContainText('They come to $35.03, but your bill’s total is $35.53.')
  await expect(note).toContainText('“Medications List”')
})

test('a bill that adds up shows no note', async ({ page }) => {
  await scanBill(page, hmi(1450))
  await expect(page.getByRole('button', { name: 'Looks correct' })).toBeEnabled()
  await expect(page.getByTestId('confirm-gap')).toHaveCount(0)
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByTestId('explain-gap')).toHaveCount(0)
  await page.getByRole('link', { name: /See full breakdown/ }).click()
  await expect(page.getByTestId('bill-total')).toContainText('$35.53')
  await expect(page.getByTestId('bill-gap')).toHaveCount(0)
})
