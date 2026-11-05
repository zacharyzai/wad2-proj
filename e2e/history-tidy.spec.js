// History, tidied: a medicine is one row however often it was scanned, the ones taken now come first, the rest fold away;
// a find box and one-tap chips; bills under their month, with chips to jump and what was paid at each clinic this year;
// a row opens that medicine or bill, where Listen again and Delete are. Everything loads at once (no "show older").
// /api/history/all is mocked with a year of scans; the medicines on the timetable go in this browser's storage.
// The clock is fixed on Tuesday 3 November 2026 in Singapore, so "this month" and "this year" never drift.
import { test, expect } from './fixtures.js'

let n = 0
const med = (title, createdAt, purpose = null) => ({
  id: `m${++n}`,
  type: 'medication',
  source: 'ai',
  title,
  purpose,
  createdAt,
  visitDate: null,
  totalPayableCents: null,
})
const bill = (title, visitDate, cents) => ({
  id: `b${++n}`,
  type: 'bill',
  source: 'ai',
  title,
  purpose: null,
  createdAt: `${visitDate}T04:00:00Z`,
  visitDate,
  totalPayableCents: cents,
})

const ITEMS = [
  med('Metformin 500 mg', '2026-11-01T02:00:00Z', 'diabetes'),
  med('Metformin 500 mg', '2026-10-01T02:00:00Z', 'diabetes'),
  med('Metformin 500 mg', '2026-09-01T02:00:00Z', 'diabetes'),
  med('Metformin 500 mg', '2026-08-01T02:00:00Z', 'diabetes'),
  med('Amlodipine 5 mg', '2026-07-15T02:00:00Z', 'blood_pressure'),
  med('Panadol', '2026-10-20T02:00:00Z'),
  med('Panadol', '2026-05-02T02:00:00Z'),
  med('Cough syrup', '2026-03-10T02:00:00Z'),
  bill('Merlion Valley General Hospital', '2026-11-01', 10653),
  bill('Bedok Polyclinic', '2026-10-28', 1400),
  bill('Bedok Polyclinic', '2026-10-02', 1400),
  ...Array.from({ length: 10 }, (_, i) =>
    bill('Tan Family Clinic', `2026-0${(i % 9) + 1}-1${i % 9}`, 3000),
  ),
  bill('Bedok Polyclinic', '2025-12-15', 1400),
].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

// On the timetable: Metformin and Amlodipine (taking now). Panadol and the cough syrup aren't.
const onList = (id, name, strength, timing) => ({
  id,
  source: 'label',
  sample: false,
  medication: {
    name,
    strength,
    doseAmount: 1,
    doseUnit: 'tablet',
    timesPerDay: timing.length,
    timing,
    withFood: 'after',
    frequencyType: 'daily',
    rawInstruction: 'x',
    warnings: [],
  },
  schedule: { startDate: '2026-11-01', days: 30, times: {} },
})

async function setUp(page) {
  await page.clock.setFixedTime(new Date('2026-11-03T10:00:00+08:00'))
  await page.addInitScript(
    (list) => localStorage.setItem('medicines', JSON.stringify(list)),
    [
      onList('s1', 'Metformin', '500 mg', ['morning', 'evening']),
      onList('s2', 'Amlodipine', '5 mg', ['morning']),
    ],
  )
  await page.route(/\/api\/history\/all$/, (route) =>
    route.fulfill({
      json: { ok: true, data: { items: ITEMS, total: ITEMS.length, capped: false } },
    }),
  )
}
const rows = (page, testid) => page.getByTestId(testid).getByTestId('history-row')

test('medicines: one row each, however often scanned; taking now first, the rest folded away', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history')
  await expect(rows(page, 'history-taking')).toHaveText([
    /Metformin 500 mg\s*Scanned 4 times\s*(Nov 1|1 Nov)/,
    /Amlodipine 5 mg\s*Usually used for high blood pressure/,
  ])
  const fold = page.getByTestId('history-not-taking-toggle')
  await expect(fold).toHaveText(/No longer taking \(2\)/)
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('history-not-taking')).toBeHidden()
  await fold.click()
  await expect(rows(page, 'history-not-taking')).toHaveText([
    /Panadol\s*Scanned 2 times/,
    /Cough syrup/,
  ])
})

test('find a medicine: one tap on a chip, or a few letters, even one that is folded away', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history')
  const chips = page.getByTestId('history-quick')
  await expect(chips).toHaveText(['Metformin 500 mg', 'Amlodipine 5 mg']) // the ones they take
  await chips.nth(1).click()
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('history-row')).toHaveCount(1)
  await expect(page.getByTestId('history-row')).toContainText('Amlodipine 5 mg')
  await chips.nth(1).click() // again: everything back
  await expect(page.getByTestId('history-find')).toHaveValue('')

  await page.getByLabel('Find a medicine').fill('pana')
  await expect(page.getByTestId('history-row')).toHaveCount(1)
  await expect(page.getByTestId('history-row')).toContainText('Panadol')
  await page.getByLabel('Find a medicine').fill('zzz')
  await expect(page.getByTestId('history-no-match')).toHaveText('Nothing matches “zzz”.')
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(rows(page, 'history-taking')).toHaveCount(2)
})

test('find a medicine by what it is for: "diabetes", an everyday word, or another language; the row says why it was found', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history')
  const find = page.getByTestId('history-find')
  const row = page.getByTestId('history-row')
  await find.fill('diabetes')
  await expect(row).toHaveCount(1)
  await expect(row).toHaveText(/Metformin 500 mg\s*Usually used for diabetes \(blood sugar\)/) // why it was found, not "Scanned 4 times"
  for (const [typed, name] of [
    ['blood pressure', 'Amlodipine 5 mg'],
    ['Sugar', 'Metformin 500 mg'],
    ['kencing manis', 'Metformin 500 mg'],
    ['hypertension', 'Amlodipine 5 mg'],
  ]) {
    await find.fill(typed)
    await expect(row, typed).toHaveCount(1)
    await expect(row, typed).toContainText(name)
  }
  await find.fill('asthma') // nothing saved is for that
  await expect(page.getByTestId('history-no-match')).toHaveText('Nothing matches “asthma”.')
  // In 中文, its own word finds it too.
  await page.getByRole('button', { name: /^中文/ }).click()
  await find.fill('糖尿病')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Metformin 500 mg')
})

test('"No longer taking" slides open and closed', async ({ page }) => {
  await setUp(page)
  await page.goto('/history')
  const fold = page.getByTestId('history-not-taking-toggle')
  const list = page.getByTestId('history-not-taking')
  await expect(list).toBeHidden()
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await expect(list).toBeVisible()
  await expect
    .poll(() => list.evaluate((e) => e.getBoundingClientRect().height))
    .toBeGreaterThan(100) // slid open
  await fold.click()
  await expect(list).toBeHidden() // closed: hidden from everyone, not just squeezed
})

test('a medicine opens to every scan of it, each with Listen again and Delete; Back returns to the list', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history')
  await rows(page, 'history-taking').first().click()
  await expect(page).toHaveURL(/\/history\?tab=medication&open=metformin(\+|%20)500(\+|%20)mg$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Metformin 500 mg')
  await expect(page.getByText('Scanned 4 times')).toBeVisible()
  await expect(page.getByTestId('history-item')).toHaveCount(4)
  await expect(page.getByTestId('history-replay')).toHaveCount(4)
  await expect(page.getByTestId('history-back')).toHaveAccessibleName('Back to History') // an arrow on screen, its words for screen readers
  await expect(page.getByTestId('history-back')).toHaveText('')
  await page.getByTestId('history-back').click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(rows(page, 'history-taking')).toHaveCount(2)
})

test('bills: under the month of the visit, all of them at once, with what was paid at each clinic this year', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history?tab=bill')
  await expect(page.getByTestId('history-row')).toHaveCount(14) // more than one old page of 10: no "show older"
  await expect(page.getByTestId('history-month-2026-11')).toContainText(
    'Merlion Valley General Hospital',
  )
  await expect(page.getByRole('heading', { name: 'This month' })).toBeVisible()
  await expect(page.getByTestId('history-month-2026-10').getByTestId('history-row')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'December 2025' })).toBeVisible()
  // This year only (the December 2025 visit is left out), most paid first.
  await expect(page.getByTestId('history-year')).toContainText('What you paid in 2026')
  await expect(page.getByTestId('history-year').locator('li')).toHaveText([
    /Tan Family Clinic\s*10 bills\s*\$300\.00/,
    /Merlion Valley General Hospital\s*1 bill\s*\$106\.53/,
    /Bedok Polyclinic\s*2 bills\s*\$28\.00/,
  ])

  // A chip jumps to its month.
  await page.getByTestId('history-month-chip').filter({ hasText: 'Dec 2025' }).click()
  await expect(page.getByRole('heading', { name: 'December 2025' })).toBeFocused()

  // Find a clinic.
  await page.getByLabel('Find a clinic or hospital').fill('bedok')
  await expect(page.getByTestId('history-row')).toHaveCount(3)
  await expect(page.getByTestId('history-year')).toHaveCount(0) // the totals step aside while finding
})

test('a bill opens on its own, with what was paid; the list it came from is in the address', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('/history')
  await page.getByTestId('history-tab-bill').click()
  await expect(page).toHaveURL(/\?tab=bill$/)
  await page.getByTestId('history-month-2026-11').getByTestId('history-row').click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Merlion Valley General Hospital',
  )
  await expect(page.getByText('You paid $106.53').first()).toBeVisible()
  await expect(page.getByTestId('history-item')).toHaveCount(1)
  await page.goBack()
  await expect(page.getByTestId('history-tab-bill')).toHaveAttribute('aria-pressed', 'true')
})
