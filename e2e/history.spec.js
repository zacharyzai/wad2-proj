// Feature 6 (Isaac): History list, replay, share link + WhatsApp, delete, and the public Shared page.
// The /api/history and /api/share calls are mocked, so these tests need no database.
import { test, expect } from './fixtures.js'

const MED = { id: 'h1', type: 'medication', createdAt: '2026-10-20T08:00:00Z', title: 'Metformin', subtitle: '500 mg', totalPayableCents: null, shareToken: null, shareExpiresAt: null }
const BILL = { id: 'h2', type: 'bill', createdAt: '2026-10-19T08:00:00Z', title: 'Bedok Polyclinic', subtitle: null, totalPayableCents: 1400, shareToken: null, shareExpiresAt: null }
const SCAN = {
  type: 'medication', source: 'sample', unclear: [],
  medication: { name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', timesPerDay: 2, timing: ['morning', 'evening'], withFood: 'after', frequencyType: 'daily', rawInstruction: 'Take 1 tablet twice a day after food', warnings: [] },
}

async function mockHistory(page, items = [MED, BILL]) {
  await page.route(/\/api\/history\?page=\d+$/, (route) => route.fulfill({ json: { ok: true, data: { items, page: 1, pages: 1, total: items.length } } }))
}

test.describe('history list', () => {
  test('lists saved scans and filters by type', async ({ page }) => {
    await mockHistory(page)
    await page.goto('/history')
    await expect(page.getByTestId('history-item')).toHaveCount(2)
    await page.getByTestId('history-filter-bill').click()
    await expect(page.getByTestId('history-item')).toHaveCount(1)
    await expect(page.getByText('Bedok Polyclinic')).toBeVisible()
  })

  test('empty history says nothing is saved yet and offers a scan button', async ({ page }) => {
    await mockHistory(page, [])
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
    await expect(page.getByTestId('history-empty-scan')).toBeVisible()
  })

  test('a failed load shows an error with Try again', async ({ page }) => {
    await page.route(/\/api\/history\?page=\d+$/, (route) => route.fulfill({ status: 500, json: { ok: false, error: { code: 'SERVER_ERROR', message: 'x' } } }))
    await page.goto('/history')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('Listen again opens the explanation for that scan', async ({ page }) => {
    await mockHistory(page)
    await page.route(/\/api\/history\/h1$/, (route) => route.fulfill({ json: { ok: true, data: { scan: SCAN } } }))
    await page.goto('/history')
    await page.getByTestId('history-replay').first().click()
    await expect(page).toHaveURL(/\/scan\/explain$/)
    await expect(page.getByText('Metformin').first()).toBeVisible()
  })
})

test.describe('sharing and deleting', () => {
  test('says what is shared first, then gives a link and a WhatsApp button', async ({ page }) => {
    await mockHistory(page)
    await page.route('**/api/share', (route) => route.fulfill({ json: { ok: true, data: { token: 'a'.repeat(32), expiresAt: '2026-11-19T00:00:00Z' } } }))
    await page.goto('/history')
    await page.getByTestId('history-share').first().click()
    await expect(page.getByText('They will not see your name, email, date of birth or your photo.')).toBeVisible()
    await expect(page.getByTestId('history-link')).toHaveCount(0) // no link before the person agrees
    await page.getByTestId('history-share-create').click()
    await expect(page.getByTestId('history-link')).toHaveValue(new RegExp(`/shared/scan/${'a'.repeat(32)}$`))
    await expect(page.getByTestId('history-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/)
  })

  test('stop sharing revokes the link', async ({ page }) => {
    await mockHistory(page, [{ ...MED, shareToken: 'b'.repeat(32), shareExpiresAt: '2026-11-19T00:00:00Z' }])
    let revoked = false
    await page.route(/\/api\/share\/b+$/, (route) => { revoked = true; return route.fulfill({ json: { ok: true, data: {} } }) })
    await page.goto('/history')
    await page.getByTestId('history-share').click()
    await page.getByTestId('history-unshare').click()
    await expect(page.getByTestId('history-share-create')).toBeFocused() // the panel stays open, focus isn't lost
    expect(revoked).toBe(true)
  })

  test('delete asks first, then removes the scan', async ({ page }) => {
    await mockHistory(page)
    await page.route(/\/api\/history\/h1$/, (route) => route.fulfill({ json: { ok: true, data: {} } }))
    await page.goto('/history')
    await page.getByTestId('history-delete').first().click()
    await expect(page.getByText('Delete this scan?')).toBeVisible()
    await page.getByTestId('history-delete-confirm').click()
    await expect(page.getByTestId('history-item')).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: 'Scan deleted.' })).toBeAttached()
  })
})

test.describe('shared page (no login)', () => {
  test.use({ loggedIn: false })

  test('shows a read-only medicine summary', async ({ page }) => {
    await page.route(/\/api\/share\/c+$/, (route) => route.fulfill({ json: { ok: true, data: { scan: SCAN } } }))
    await page.goto(`/shared/scan/${'c'.repeat(32)}`)
    await expect(page.getByTestId('shared-name')).toHaveText('Metformin')
    // The page's own note (the app footer also says "always confirm with your doctor or pharmacist").
    await expect(page.getByText('This is a summary of what the label or bill says. Always confirm with your doctor or pharmacist.')).toBeVisible()
  })

  test('an expired or revoked link shows one friendly message', async ({ page }) => {
    await page.route(/\/api\/share\/d+$/, (route) => route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND', message: 'x' } } }))
    await page.goto(`/shared/scan/${'d'.repeat(32)}`)
    await expect(page.getByRole('heading', { name: 'This link is no longer available' })).toBeVisible()
  })
})