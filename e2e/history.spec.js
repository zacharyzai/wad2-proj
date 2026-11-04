// Feature 6 (Isaac): History list, replay and delete.
// The /api/history calls are mocked, so these tests need no database.
import { test, expect } from './fixtures.js'

const MED = { id: 'h1', type: 'medication', createdAt: '2026-10-20T08:00:00Z', title: 'Metformin', subtitle: '500 mg', totalPayableCents: null }
const BILL = { id: 'h2', type: 'bill', createdAt: '2026-10-19T08:00:00Z', title: 'Bedok Polyclinic', subtitle: null, totalPayableCents: 1400 }
const SCAN = {
  type: 'medication', source: 'sample', unclear: [],
  medication: { name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', timesPerDay: 2, timing: ['morning', 'evening'], withFood: 'after', frequencyType: 'daily', rawInstruction: 'Take 1 tablet twice a day after food', warnings: [] },
}

async function mockHistory(page, items = [MED, BILL]) {
  await page.route(/\/api\/history\/all$/, (route) => route.fulfill({ json: { ok: true, data: { items, total: items.length, capped: false } } }))
}
// Listen again and Delete live on the medicine or bill's own view: open its row first.
const openFirst = (page) => page.getByTestId('history-row').first().click()

test.describe('history list', () => {
  test('medicines and bills are two lists of short rows @smoke', async ({ page }) => {
    await mockHistory(page)
    await page.goto('/history')
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toContainText('Metformin')
    await page.getByTestId('history-tab-bill').click()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toContainText('Bedok Polyclinic')
  })

  test('empty history says nothing is saved yet and offers a scan button', async ({ page }) => {
    await mockHistory(page, [])
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible()
    await expect(page.getByTestId('history-empty-scan')).toBeVisible()
  })

  test('a failed load shows an error with Try again', async ({ page }) => {
    await page.route(/\/api\/history\/all$/, (route) => route.fulfill({ status: 500, json: { ok: false, error: { code: 'SERVER_ERROR', message: 'x' } } }))
    await page.goto('/history')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('Listen again opens the explanation for that scan', async ({ page }) => {
    await mockHistory(page)
    await page.route(/\/api\/history\/h1$/, (route) => route.fulfill({ json: { ok: true, data: { scan: SCAN } } }))
    await page.goto('/history')
    await openFirst(page)
    await page.getByTestId('history-replay').first().click()
    await expect(page).toHaveURL(/\/scan\/explain$/)
    await expect(page.getByText('Metformin').first()).toBeVisible()
  })
})

test.describe('deleting', () => {
  test('delete asks first, then removes the scan; with nothing left of that medicine, back to the list', async ({ page }) => {
    await mockHistory(page)
    await page.route(/\/api\/history\/h1$/, (route) => route.fulfill({ json: { ok: true, data: {} } }))
    await page.goto('/history')
    await openFirst(page)
    await page.getByTestId('history-delete').first().click()
    await expect(page.getByText('Delete this scan?')).toBeVisible()
    await page.getByTestId('history-delete-confirm').click()
    await expect(page.getByTestId('history-item')).toHaveCount(0)
    await expect(page.getByText('No medicine labels saved yet.')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'Scan deleted.' })).toBeAttached()
  })
})
test.describe('delete question is a real alert dialog', () => {
  test('focus moves into it, Esc closes it and puts focus back on Delete', async ({ page }) => {
    await mockHistory(page)
    await page.goto('/history')
    await openFirst(page)
    const del = page.getByTestId('history-delete').first()
    await del.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByTestId('history-delete-keep')).toBeFocused() // the safe answer, not "Yes, delete"
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(del).toBeFocused()
  })

  test('Keep it also closes it and returns focus to Delete', async ({ page }) => {
    await mockHistory(page)
    await page.goto('/history')
    await openFirst(page)
    const del = page.getByTestId('history-delete').first()
    await del.click()
    await page.getByTestId('history-delete-keep').click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(del).toBeFocused()
  })
})
test('a saved scan can no longer be shared', async ({ page }) => {
  await mockHistory(page)
  await page.goto('/history')
  await openFirst(page)
  await expect(page.getByTestId('history-replay').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)
})
