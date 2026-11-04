// Schedule, the week as a pill box (Sunday to Saturday): each day says how it went (all taken, a dose missed, still to
// come), one sentence for the week, and tapping a day shows its medicines: an earlier day says plainly what was missed (it
// can't be ticked any more), a later day what is coming. A medicine missed never hides behind another taken at the same time.
// Also: when two medicines are due together, each has its own "I've taken it" on Schedule, and Home shows one at a time.
// Medicines go into this browser's storage; /api/doses is a small stand-in that keeps ticks by date. The clock is fixed on
// Wednesday 28 October 2026 in Singapore, so the week always has earlier days.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolationsDayAndNight, nextFrames } from './helpers/checks.js'

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
const SUN = '2026-10-25'
const THU = '2026-10-29'
const SAT = '2026-10-31'
const day = (page, date) => page.getByTestId(`day-${date}`)
const TICKS = { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm1-evening'], [WED]: ['m1-morning', 'm2-morning'] }

test('the pill box: Sunday to Saturday, each day says how it went, in a badge and in words; the week in one sentence', async ({ page }) => {
  // Tuesday: Metformin taken both times, Amlodipine's morning missed. Today (6 pm due now): both mornings ticked.
  await setUp(page, { at: '19:00', ticks: TICKS })
  await page.goto('/schedule')
  const days = page.getByTestId('day-strip').locator('[data-testid^="day-"]')
  await expect(days).toHaveCount(7)
  expect(await days.evaluateAll((els) => els.map((e) => e.dataset.testid))).toEqual([SUN, MON, TUE, WED, THU, '2026-10-30', SAT].map((d) => `day-${d}`))
  await expect(page.getByTestId('day-strip').locator('.lid')).toHaveText(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
  await expect(page.getByTestId('week-sentence')).toHaveText('1 dose missed this week.')
  await expect(day(page, SUN)).toHaveAttribute('data-state', 'none') // before the medicines started
  await expect(day(page, MON)).toHaveAttribute('data-state', 'ok')
  await expect(day(page, TUE)).toHaveAttribute('data-state', 'not')
  await expect(day(page, WED)).toHaveAttribute('data-state', 'open') // the evening is still to tick
  await expect(day(page, TUE)).toHaveAccessibleName(/Tuesday, (27 October|October 27): a dose missed/)
  await expect(day(page, WED)).toHaveAttribute('aria-pressed', 'true') // today is shown first
  await expect(page.getByTestId('schedule-today')).toBeVisible()
})

test('an earlier day: a missed dose is a plain warning, never something to tick; one taken at the same time still shows', async ({ page }) => {
  const sent = await setUp(page, { at: '19:00', ticks: TICKS })
  await page.goto('/schedule')
  await day(page, TUE).click()
  const other = page.getByTestId('schedule-other-day')
  await expect(other).toHaveAttribute('data-date', TUE)
  await expect(other.getByRole('heading', { level: 2 })).toHaveText(/Tuesday/)
  await expect(page.getByTestId('other-lead')).toHaveText('1 dose was missed on this day.')
  await expect(page.getByTestId('other-missed')).toHaveText('If you missed a dose, ask your pharmacist what to do.')
  await expect(page.getByTestId('other-m1-morning')).toHaveAttribute('data-state', 'ok') // taken at the same time...
  await expect(page.getByTestId('other-m2-morning')).toHaveAttribute('data-state', 'not') // ...and this one, missed
  await expect(page.getByTestId('other-m2-morning')).toContainText('Missed')
  await expect(other.getByRole('button')).toHaveCount(0) // the day is over: nothing to tick
  await nextFrames(page)
  expect(sent).toEqual([])
  // Back to today, with its ticks.
  await page.getByTestId('strip-today').click()
  await expect(page.getByTestId('schedule-today')).toBeVisible()
  await expect(day(page, WED)).toHaveAttribute('aria-pressed', 'true')
})

test('a later day: what is coming, to tick on the day', async ({ page }) => {
  await setUp(page, { at: '19:00' })
  await page.goto('/schedule')
  await day(page, THU).click()
  await expect(page.getByTestId('other-lead')).toHaveText('Coming up. You can tick these on the day.')
  await expect(page.getByTestId('other-m1-evening')).toHaveAttribute('data-state', 'later')
  await expect(page.getByTestId('schedule-other-day').getByRole('button')).toHaveCount(0)
})

test('today: an 8 am dose not ticked by 2 pm still says "Take now", and old This week links open the pill box', async ({ page }) => {
  await setUp(page, { at: '14:00', ticks: { [MON]: ['m1-morning', 'm2-morning', 'm1-evening'], [TUE]: ['m1-morning', 'm2-morning', 'm1-evening'] } })
  await page.goto('/schedule?view=week')
  await expect(page.getByTestId('day-strip')).toBeVisible()
  await expect(page.getByTestId('slot-08:00')).toHaveAttribute('data-state', 'now')
  await expect(page.getByTestId('slot-18:00')).toHaveAttribute('data-state', 'later')
  await expect(page.getByTestId('week-sentence')).toHaveText('Every dose so far this week is ticked.')
})

test('the day plan shows doses today and taken, and the % on the ring; the same in a sentence for screen readers only', async ({ page }) => {
  await setUp(page, { at: '19:00', ticks: { [WED]: ['m1-morning'] } })
  await page.goto('/schedule')
  const plan = page.getByTestId('schedule-progress')
  await expect(plan.locator('.ring-num')).toHaveText('33%') // counts up to it
  await expect(plan.locator('.pc-stats')).toHaveText(/Doses today\s*3\s*Taken\s*1/)
  const words = page.getByTestId('schedule-progress-words')
  await expect(words).toHaveText('1 of 3 doses taken')
  await expect(words).toHaveClass(/visually-hidden/) // not shown twice
})

test('tapping a dose asks "Did you take it?" in a pop-up; Not yet leaves it, Yes ticks it', async ({ page }) => {
  const sent = await setUp(page, { at: '19:00', ticks: { [WED]: ['m1-morning', 'm2-morning'] } })
  await page.goto('/schedule')
  const evening = page.getByRole('button', { name: /^Taken: Metformin 500 mg, 6:00\sPM$/i })
  await evening.click()
  const ask = page.getByRole('alertdialog')
  await expect(ask).toContainText('Did you take Metformin 500 mg?')
  await expect(ask).toContainText('1 tablet · After food')
  await expect(ask).toContainText(/Due at 6:00\sPM\./)
  await page.getByRole('button', { name: 'Not yet' }).click()
  await expect(ask).toHaveCount(0)
  await expect(evening).toHaveAttribute('aria-pressed', 'false')
  await expect(evening).toBeFocused()
  expect(sent).toEqual([])
  await evening.click()
  await page.keyboard.press('Escape') // Esc is "Not yet" too
  await expect(ask).toHaveCount(0)
  await evening.click()
  await page.getByRole('button', { name: 'Yes, I took it' }).click()
  await expect(evening).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => sent).toEqual([`POST m1-evening ${WED}`])
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
  await expect.poll(() => sent).toEqual([`POST m2-morning ${WED}`])
  await page.getByRole('button', { name: 'I’ve taken it: Metformin 500 mg' }).click()
  await expect(due).toHaveCount(0) // all taken: the box has done its job
})

test('ticking a dose: a success sweep crosses the plan card, then the ring counts up by what it gained; none on opening', async ({ page }) => {
  await setUp(page, { at: '19:00', ticks: { [WED]: ['m1-morning', 'm2-morning'] } })
  await page.goto('/schedule')
  const plan = page.getByTestId('schedule-progress')
  await expect(plan.locator('.ring-num')).toHaveText('67%')
  await expect(page.getByTestId('schedule-progress-sweep')).toHaveCount(0) // ticks that came with the page: no sweep
  await page.getByRole('button', { name: /^Taken: Metformin 500 mg, 6:00\sPM$/i }).click()
  await page.getByRole('button', { name: 'Yes, I took it' }).click()
  await expect(page.getByTestId('schedule-progress-sweep')).toBeAttached() // the sweep plays first...
  await expect(plan).toHaveClass(/logged/) // ...and as it reaches the ring, it is plainly logged: the card lights up
  await expect(page.getByTestId('schedule-progress-plus')).toHaveText('+1')
  await expect(plan.locator('.pc-sweep-tick')).toHaveCount(0) // no tick of its own
  await expect(plan.locator('.pc-stats')).toHaveText(/Taken\s*3/)
  await expect(plan.locator('.ring-num')).toHaveText('100%') // ...then the ring counts up to it
  // Unticking: the ring goes back, no new sweep.
  const sweeps = await page.getByTestId('schedule-progress-sweep').count()
  await page.getByRole('button', { name: /^Taken: Metformin 500 mg, 6:00\sPM$/i }).click()
  await expect(plan.locator('.ring-num')).toHaveText('67%')
  expect(await page.getByTestId('schedule-progress-sweep').count()).toBe(sweeps)
})

test('reduced motion: no sweep, the ring changes at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setUp(page, { at: '19:00', ticks: { [WED]: ['m1-morning', 'm2-morning'] } })
  await page.goto('/schedule')
  await page.getByRole('button', { name: /^Taken: Metformin 500 mg, 6:00\sPM$/i }).click()
  await page.getByRole('button', { name: 'Yes, I took it' }).click()
  await expect(page.getByTestId('schedule-progress').locator('.ring-num')).toHaveText('100%')
  await expect(page.getByTestId('schedule-progress-sweep')).toBeHidden()
})

test('the pill box: every compartment and pill alike, but the day you are on, which always stands out', async ({ page }) => {
  await setUp(page, { at: '19:00' })
  await page.goto('/schedule')
  // How a day looks: its compartment's colour and its pill's colour.
  const look = (date) => page.getByTestId(`day-${date}`).evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('.half.top')).backgroundColor].join(' / '))
  await expect(page.getByTestId(`day-${WED}`)).toHaveAttribute('aria-pressed', 'true') // today, to begin with
  // The colours ease in, so each check retries until they have settled.
  let rest
  await expect(async () => {
    rest = await Promise.all([SUN, MON, TUE, THU, SAT].map(look))
    expect(new Set(rest).size).toBe(1) // every other day the same
    expect(await look(WED)).not.toBe(rest[0]) // the one you are on, different
  }).toPass()
  await page.getByTestId(`day-${TUE}`).click()
  await expect(page.getByTestId(`day-${TUE}`)).toHaveAttribute('aria-pressed', 'true')
  await expect(async () => {
    expect(await look(WED)).toBe(rest[0]) // today now looks like the rest...
    expect(await look(TUE)).not.toBe(rest[0]) // ...and Tuesday stands out
  }).toPass()
})

test('Home: two medicines due together come one at a time, each with its own "I\'ve taken it"', async ({ page }) => {
  const sent = await setUp(page, { at: '08:10' })
  await page.goto('/')
  const card = page.getByTestId('home-today-due')
  await expect(card).toContainText('Amlodipine 5 mg')
  await expect(card).not.toContainText('Metformin') // one reminder, not the whole day
  await page.getByRole('button', { name: 'I’ve taken it: Amlodipine 5 mg' }).click()
  await expect(page.getByTestId('home-today-due')).toContainText('Metformin 500 mg') // then the next one
  await expect.poll(() => sent).toEqual([`POST m2-morning ${WED}`])
  await expect(page.getByTestId('home-today-progress')).toHaveText('1 of 3 doses taken')
})

test('the pill box has no axe problems, day or night, with a missed day open @a11y', async ({ page }) => {
  await setUp(page, { at: '19:00', ticks: { [TUE]: ['m1-morning'] } })
  await page.goto('/schedule')
  await page.getByTestId(`day-${TUE}`).click()
  await expect(page.getByTestId('other-missed')).toBeVisible()
  await expectNoAxeViolationsDayAndNight(page)
})
