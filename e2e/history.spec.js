// Feature 6 (Isaac): History list, replay and delete.
// The /api/history calls are mocked, so these tests need no database.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolationsDayAndNight } from './helpers/checks.js'

const MED = {
  id: 'h1',
  type: 'medication',
  createdAt: '2026-10-20T08:00:00Z',
  title: 'Metformin',
  subtitle: '500 mg',
  totalPayableCents: null,
}
const BILL = {
  id: 'h2',
  type: 'bill',
  createdAt: '2026-10-19T08:00:00Z',
  title: 'Bedok Polyclinic',
  subtitle: null,
  totalPayableCents: 1400,
}
async function mockHistory(page, items = [MED, BILL]) {
  await page.route(/\/api\/history\/all$/, (route) =>
    route.fulfill({ json: { ok: true, data: { items, total: items.length, capped: false } } }),
  )
}
// See more and Delete live on the medicine or bill's own view: open its row first.
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
    await page.route(/\/api\/history\/all$/, (route) =>
      route.fulfill({
        status: 500,
        json: { ok: false, error: { code: 'SERVER_ERROR', message: 'x' } },
      }),
    )
    await page.goto('/history')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('a medicine has Delete but no See more; a bill has See more', async ({ page }) => {
    await mockHistory(page)
    await page.goto('/history')
    await openFirst(page)
    await expect(page.getByTestId('history-delete').first()).toBeVisible()
    await expect(page.getByTestId('history-replay')).toHaveCount(0)
    await page.getByTestId('history-back').click()
    await page.getByTestId('history-tab-bill').click()
    await openFirst(page)
    await expect(page.getByTestId('history-replay').first()).toBeVisible()
  })
})

test.describe('deleting', () => {
  test('delete asks first, then removes the scan; with nothing left of that medicine, back to the list', async ({
    page,
  }) => {
    await mockHistory(page)
    await page.route(/\/api\/history\/h1$/, (route) =>
      route.fulfill({ json: { ok: true, data: {} } }),
    )
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
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0)
})

test('the list and a medicine with its scans have no axe problems, day or night @a11y', async ({
  page,
}) => {
  await mockHistory(page)
  await page.goto('/history')
  await expect(page.getByTestId('history-row')).toContainText('Metformin')
  await expectNoAxeViolationsDayAndNight(page)
  await openFirst(page)
  await expect(page.getByTestId('history-item')).toHaveCount(1)
  await expectNoAxeViolationsDayAndNight(page)
})

test('the delete pop-up works by keyboard: Esc keeps the scan and focus goes back to Delete @a11y', async ({
  page,
}) => {
  await mockHistory(page)
  let deleted = false
  await page.route(/\/api\/history\/h1$/, (route) => {
    deleted = true
    return route.fulfill({ json: { ok: true, data: {} } })
  })
  await page.goto('/history')
  await openFirst(page)
  const remove = page.getByTestId('history-delete').first()
  await remove.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Delete this scan?')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Delete this scan?')).toHaveCount(0)
  await expect(page.getByTestId('history-item')).toHaveCount(1)
  await expect(remove).toBeFocused()
  expect(deleted).toBe(false)
})
