// Schedule, This week, in plain words: one row per medicine, states Taken / Not ticked / Take now / Later, one sentence for
// the week, and "I took it" (with Undo) for a tick that was forgotten. Also: when two medicines are due together, each has
// its own "I've taken it", on Schedule and on Home.
// Medicines go into this browser's storage; /api/doses is a small stand-in that keeps ticks by date. The clock is fixed on
// Wednesday 28 October 2026 in Singapore, so the week always has earlier days.
import { test, expect } from './fixtures.js'

const MON = '2026-10-26'
const TUE = '2026-10-27'
const WED = '2026-10-28'
const medicine = (id, name, strength, timing) => ({
  id,
  source: 'label',
  sample: false,
  medication: { name, strength, doseAmount: 1, doseUnit: 'tablet', timesPerDay: timing.length, timing, withFood: 'after', frequencyType: 'daily', rawInstruction: 'x', warnings: [] },
  schedule: { startDate: MON, days: 30, times: {} },
})
// Metformin at 8 am and 6 pm, Amlodipine at 8 am: two medicines at the same time.
const MEDICINES = [medicine('m1', 'Metformin', '500 mg', ['morning', 'evening']), medicine('m2', 'Amlodipine', '5 mg', ['morning'])]

async function setUp(page, { at, ticks = {} }) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('e2e-medicines')) return
    sessionStorage.setItem('e2e-medicines', '1')
    localStorage.setItem('medicines', JSON.stringify(list))
  }, MEDICINES)
  await page.clock.setFixedTime(new Date(`${WED}T${at}:00+08:00`))
  const taken = new Set(Object.entries(ticks).flatMap(([date, ids]) => ids.map((id) => `${date}/${id}`)))
  const sent = []
  await page.route('**/api/google/**', (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: 'GOOGLE_UNAVAILABLE', message: 'Not set up' } } }))
  await page.route('**/api/doses**', (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      const date = new URL(request.url()).searchParams.get('date')
      return route.fulfill({ json: { ok: true, data: { date, taken: [...taken].filter((k) => k.startsWith(`${date}/`)).map((k) => k.split('/')[1]) } } })
    }
    const { doseId, date } = request.postDataJSON()
    sent.push(`${request.method()} ${doseId} ${date}`)
    request.method() === 'POST' ? taken.add(`${date}/${doseId}`) : taken.delete(`${date}/${doseId}`)
    return route.fulfill({ json: { ok: true, data: { doseId, date } } })
  })
  return sent
}
const states = (page, id) => page.getByTestId(`week-row-${id}`).locator('[data-state]').evaluateAll((marks) => marks.map((m) => m.dataset.state))

test('This week: each medicine has its own row, so one not ticked never hides behind another taken at the same time', async ({ page }) => {
  // Tuesday: Metformin ticked both times, Amlodipine's morning not. Today (6 pm due now): both mornings ticked.
  await setUp(page, { at: '19:00', ticks: { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm1-evening'], [WED]: ['m1-morning', 'm2-morning'] } })
  await page.goto('/schedule?view=week')
  await expect(page.getByTestId('week-sentence')).toHaveText('1 dose not ticked this week')
  expect(await states(page, 'm2-morning')).toEqual(['ok', 'not', 'ok', 'later', 'later', 'later', 'later'])
  expect(await states(page, 'm1-morning')).toEqual(['ok', 'ok', 'ok', 'later', 'later', 'later', 'later'])
  expect(await states(page, 'm1-evening')).toEqual(['ok', 'ok', 'now', 'later', 'later', 'later', 'later']) // due now: "Take now", as on Today
  await expect(page.getByTestId('week-row-m2-morning')).toContainText('Amlodipine 5 mg')
  await expect(page.getByTestId('week-row-m2-morning')).toContainText('Morning · 8:00')
  // Every state is named, and "Not ticked" is explained in one line.
  await expect(page.locator('.legend')).toHaveText(/Taken\s*Not ticked\s*Take now\s*Later/)
  await expect(page.getByText('Not ticked means the time has passed, but there is no tick.')).toBeVisible()
})

test('This week: a forgotten tick is put right with "I took it", and Undo takes it back', async ({ page }) => {
  const sent = await setUp(page, { at: '19:00', ticks: { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm1-evening'], [WED]: ['m1-morning', 'm2-morning'] } })
  await page.goto('/schedule?view=week')
  const list = page.getByTestId('week-not-ticked')
  await expect(list).toContainText('Amlodipine 5 mg')
  await page.getByRole('button', { name: 'I took it: Amlodipine 5 mg, Tuesday Morning' }).click()
  await expect(page.getByTestId('week-ticked')).toHaveText(/Ticked: Amlodipine 5 mg, Tuesday Morning\./)
  await expect(page.getByTestId('week-ticked')).toBeFocused() // the row it was on has gone
  await expect(page.getByTestId('week-sentence')).toHaveText('Every dose so far this week is ticked.')
  await expect(list).toHaveCount(0)
  expect(await states(page, 'm2-morning')).toEqual(['ok', 'ok', 'ok', 'later', 'later', 'later', 'later'])
  expect(sent).toEqual([`POST m2-morning ${TUE}`])

  await page.getByTestId('week-undo').click()
  await expect(page.getByTestId('week-sentence')).toHaveText('1 dose not ticked this week')
  expect(sent).toEqual([`POST m2-morning ${TUE}`, `DELETE m2-morning ${TUE}`])
})

test('This week: a dose earlier today that was not ticked can be ticked here too, and Today shows it', async ({ page }) => {
  const sent = await setUp(page, { at: '19:00', ticks: { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm2-morning', 'm1-evening'], [WED]: ['m1-morning'] } })
  await page.goto('/schedule?view=week')
  await expect(page.getByTestId('week-sentence')).toHaveText('1 dose not ticked this week')
  await page.getByRole('button', { name: 'I took it: Amlodipine 5 mg, Wednesday Morning' }).click()
  await expect(page.getByTestId('week-sentence')).toHaveText('Every dose so far this week is ticked.')
  expect(sent).toEqual([`POST m2-morning ${WED}`])
  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Taken: Amlodipine 5 mg, 8:00\sAM$/i })).toHaveAttribute('aria-pressed', 'true')
})

test('This week: an 8 am dose not ticked by 2 pm still says "Take now", never "Later"', async ({ page }) => {
  await setUp(page, { at: '14:00', ticks: { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm2-morning', 'm1-evening'] } })
  await page.goto('/schedule?view=week')
  await expect(page.getByTestId('week-sentence')).toHaveText('Every dose so far this week is ticked.')
  expect((await states(page, 'm2-morning'))[2]).toBe('now')
  expect((await states(page, 'm1-evening'))[2]).toBe('later') // 6 pm hasn't come yet
})

test('Today: two medicines due together each have their own "I\'ve taken it"', async ({ page }) => {
  const sent = await setUp(page, { at: '08:10' })
  await page.goto('/schedule')
  const due = page.getByTestId('schedule-due')
  await expect(due).toContainText('Time for 2 medicines')
  await expect(due).toContainText('Tap each one after you take it.')
  await page.getByRole('button', { name: 'I’ve taken it: Amlodipine 5 mg' }).click()
  await expect(page.getByTestId('schedule-due-m2-morning')).toContainText('Taken')
  await expect(page.getByRole('button', { name: 'I’ve taken it: Metformin 500 mg' })).toBeVisible() // not ticked with it
  expect(sent).toEqual([`POST m2-morning ${WED}`])
  await page.getByRole('button', { name: 'I’ve taken it: Metformin 500 mg' }).click()
  await expect(due).toHaveCount(0) // all taken: the box has done its job
})

test('Home: two medicines due together each have their own "I\'ve taken it"', async ({ page }) => {
  const sent = await setUp(page, { at: '08:10' })
  await page.goto('/')
  const card = page.getByTestId('home-today-due')
  await expect(card).toContainText('Time for 2 medicines')
  await page.getByRole('button', { name: 'I’ve taken it: Metformin 500 mg' }).click()
  await expect(page.getByTestId('home-today-dose-m1-morning')).toContainText('Taken')
  await expect(page.getByRole('button', { name: 'I’ve taken it: Amlodipine 5 mg' })).toBeVisible()
  expect(sent).toEqual([`POST m1-morning ${WED}`])
  await expect(page.getByTestId('home-today-progress')).toHaveText('1 of 3 doses taken')
})
