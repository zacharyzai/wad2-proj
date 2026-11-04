// Home, kept simple: one question, three big choices, and the last bill as one line (only when there is one).
// Phones: the choices in one column; desktop: in one row.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolationsDayAndNight, expectSeniorFriendly } from './helpers/checks.js'

test('three big choices, each to its own place, and no bill line before any bill', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would you like to do?')
  await expect(page.getByTestId('home-last-bill')).toHaveCount(0)

  await page.getByRole('link', { name: /Scan a medicine label/ }).click()
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
  await page.goBack()
  await page.getByRole('link', { name: /Scan a medical bill/ }).click()
  await expect(page).toHaveURL(/\/scan\?type=bill$/)
  await page.goBack()
  await page.getByRole('link', { name: /Ask about my medicine/ }).click()
  await expect(page).toHaveURL(/\/ask$/)
})

test('phones stack the choices; desktop puts them in one row', async ({ page, isMobile }) => {
  await page.goto('/')
  const med = await page.getByTestId('home-med').boundingBox()
  const ask = await page.getByTestId('home-ask').boundingBox()
  if (isMobile) expect(ask.y).toBeGreaterThan(med.y + med.height)
  else expect(Math.abs(ask.y - med.y)).toBeLessThan(2)
})

test('after a bill is checked, Home shows it as one line back to its breakdown', async ({ page }) => {
  await page.goto('/bill')
  await page.getByRole('button', { name: 'Hospital stay: ward, GST and MediShield Life' }).click()
  await expect(page.getByTestId('bill-total')).toContainText('$106.53')
  await page.goto('/')
  const line = page.getByTestId('home-last-bill')
  await expect(line).toContainText('Your last bill')
  await expect(line).toContainText('$106.53')
  await line.click()
  await expect(page).toHaveURL(/\/bill$/)
  await expect(page.getByTestId('bill-total')).toContainText('$106.53')
})

test('reduced motion: the capsule stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const capsule = page.getByTestId('home-capsule')
  await expect(capsule).toHaveAttribute('aria-hidden', 'true') // decoration: the greeting says hello in words
  expect(await capsule.locator('.spin').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  // Nor does it get up to anything on its own, or when tapped.
  await page.clock.install()
  await page.clock.runFor(30_000)
  await capsule.click()
  await expect(capsule).toHaveAttribute('data-action', '')
})

test('the capsule is alive: it does different things on its own, and waves hello when tapped', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  const capsule = page.getByTestId('home-capsule')
  await expect(capsule).toHaveAttribute('data-action', '') // first it arrives and waves
  // Note every change (a blink lasts half a second, so sampling could miss it), over half a minute.
  await capsule.evaluate((el) => {
    window.__acts = []
    new MutationObserver(() => el.dataset.action && window.__acts.push(el.dataset.action)).observe(el, { attributes: true, attributeFilter: ['data-action'] })
  })
  await page.clock.runFor(30_000)
  const seen = new Set(await page.evaluate(() => window.__acts))
  expect(seen.size).toBeGreaterThanOrEqual(2) // more than one kind of thing, without anyone touching it
  for (const a of seen) expect(['blink', 'look', 'hop', 'wiggle', 'turn', 'stretch', 'wave']).toContain(a)

  await capsule.click()
  await expect(capsule).toHaveAttribute('data-action', 'hello')
  await expect(capsule.locator('.actor .happy')).toHaveCSS('opacity', '1') // happy eyes while it waves
  await page.clock.runFor(3_000)
  await expect(capsule).not.toHaveAttribute('data-action', 'hello') // then back to its own things
})

test('the greeting uses the name on the account', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home-greet')).toHaveText(/^Good (morning|afternoon|evening), Tan Mei Ling!$/)
})

// ---- Today's medicines: the Schedule page's doses and ticks, on Home -------------------------------------------------------
// Set up like e2e/schedule.spec.js: medicines in this browser's storage, /api/doses answered by a small stand-in, the clock
// fixed at a time of day in Singapore.
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
const METFORMIN = {
  id: 'm1',
  source: 'label',
  sample: false,
  medication: { name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', timesPerDay: 2, timing: ['morning', 'evening'], withFood: 'after', frequencyType: 'daily', rawInstruction: 'Take 1 tablet twice a day after food', warnings: [] },
  schedule: { startDate: TODAY, days: 30, times: {} }, // 8:00 AM and 6:00 PM
}

async function seed(page, list) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('e2e-medicines')) return
    sessionStorage.setItem('e2e-medicines', '1')
    localStorage.setItem('medicines', JSON.stringify(list))
  }, list)
}
async function mockDoses(page, { at, taken = [], failChanges = false }) {
  if (at) await page.clock.setFixedTime(new Date(`${TODAY}T${at}:00+08:00`)) // at: null leaves the clock alone (for clock.install)
  const ticks = new Set(taken)
  const sent = []
  await page.route('**/api/doses**', (route) => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill({ json: { ok: true, data: { date: TODAY, taken: [...ticks] } } })
    const { doseId } = request.postDataJSON()
    sent.push(doseId)
    if (failChanges) return route.fulfill({ status: 503, json: { ok: false, error: { code: 'SERVER_ERROR', message: 'Accounts are not available right now' } } })
    ticks.add(doseId)
    return route.fulfill({ json: { ok: true, data: { doseId, date: TODAY } } })
  })
  return sent
}

test('Today: no medicines yet is the same card, never bare: the bell in its corner, a picture, a line and a way to start', async ({ page, isMobile }) => {
  await page.goto('/')
  const empty = page.getByTestId('home-today-empty')
  await expect(page.getByTestId('home-today-empty-title')).toHaveText('No reminders yet')
  await expect(page.getByTestId('home-today')).toContainText('Scan a medicine label and we will remind you when to take it.')
  // The bell sits in the top left corner, as on a reminder, and opens Schedule.
  const [box, bell] = await Promise.all([empty.boundingBox(), page.getByTestId('home-today-bell').boundingBox()])
  expect(bell.x - box.x).toBeLessThan(40)
  expect(bell.y - box.y).toBeLessThan(40)
  await expect(page.getByTestId('home-today-bell')).toHaveAccessibleName('No reminders yet. Open my schedule')
  if (!isMobile) {
    // The same size as the greeting beside it, as with medicines.
    const [greet, today] = await Promise.all([page.locator('.greet-panel').boundingBox(), page.getByTestId('home-today').boundingBox()])
    expect(Math.abs(today.height - greet.height)).toBeLessThan(2)
  }
  await page.getByTestId('home-today-scan').click()
  await expect(page.getByTestId('card-launch')).toHaveAttribute('data-kind', 'med') // the same picture as the Scan card
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
  await page.goBack()
  await page.getByTestId('home-today-open').click()
  await expect(page).toHaveURL(/\/schedule$/)
})

test('Today: the dose due now is taken from Home, and the card turns to what is next', async ({ page }) => {
  await seed(page, [METFORMIN])
  const sent = await mockDoses(page, { at: '08:10' })
  await page.goto('/')
  const due = page.getByTestId('home-today-due')
  await expect(due).toContainText('Time for Metformin 500 mg')
  await expect(due).toContainText('1 tablet') // how much, in the pill's tile
  await expect(due).toContainText('After food')
  await expect(page.getByTestId('home-today-progress')).toHaveText('0 of 2 doses taken')
  await page.getByTestId('home-today-take').click()
  await expect(page.getByTestId('home-today-status')).toHaveText('Marked as taken.')
  expect(sent).toEqual(['m1-morning'])
  await expect(due).toHaveCount(0)
  await expect(page.getByTestId('home-today-next')).toHaveText('Next: Metformin 500 mg at 6:00 PM')
  await expect(page.getByTestId('home-today-progress')).toHaveText('1 of 2 doses taken')
  // The Schedule page shows the same tick.
  await page.getByTestId('home-today-open').click()
  await expect(page.getByTestId('schedule-progress-words')).toHaveText('1 of 2 doses taken')
})

test('Today: an earlier dose not ticked is pointed out, gently, with the way to Schedule', async ({ page }) => {
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: '19:00' })
  await page.goto('/')
  await expect(page.getByTestId('home-today-due')).toContainText('Time for Metformin 500 mg')
  const missed = page.getByTestId('home-today-missed')
  await expect(missed).toHaveText('1 earlier dose not ticked yet')
  await missed.click()
  await expect(page).toHaveURL(/\/schedule$/)
})

test('Today: everything taken says well done', async ({ page }) => {
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: '19:00', taken: ['m1-morning', 'm1-evening'] })
  await page.goto('/')
  await expect(page.getByTestId('home-today')).toContainText('All of today’s doses are taken. Well done!')
  await expect(page.getByTestId('home-today-take')).toHaveCount(0)
})

test('Today: a tick the account does not save goes back, and says so', async ({ page }) => {
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: '08:10', failChanges: true })
  await page.goto('/')
  await page.getByTestId('home-today-take').click()
  await expect(page.getByTestId('home-today-status')).toHaveText('That tick was not saved. Please try again.')
  await expect(page.getByTestId('home-today-progress')).toHaveText('0 of 2 doses taken')
  await expect(page.getByTestId('home-today-take')).toBeVisible()
})

test('desktop puts Today\'s medicines beside the greeting; phones put it under', async ({ page, isMobile }) => {
  await page.goto('/')
  const greet = await page.locator('.greet-panel').boundingBox()
  const today = await page.getByTestId('home-today').boundingBox()
  if (isMobile) expect(today.y).toBeGreaterThan(greet.y + greet.height)
  else expect(Math.abs(today.y - greet.y)).toBeLessThan(2)
})

test('Today: one reminder, the next pill, with a bell that rings with the capsule and opens Schedule', async ({ page }) => {
  await page.clock.install({ time: new Date(`${TODAY}T08:10:00+08:00`) })
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: null })
  await page.goto('/')
  const card = page.getByTestId('home-today')
  await expect(page.getByTestId('home-today-due')).toBeVisible()
  await expect(card.getByText('Metformin 500 mg', { exact: true })).toHaveCount(1) // the next pill only, not the whole day
  await expect(page.getByTestId('home-today-bell')).toHaveAccessibleName('Take now. Open my schedule') // a bell, named in words
  const bell = page.getByTestId('home-today-bell')
  // It rings each time the greeting's capsule does something.
  await bell.evaluate((el) => {
    window.__rang = 0
    window.__moved = 0
    new MutationObserver(() => el.classList.contains('ringing') && window.__rang++).observe(el, { attributes: true, attributeFilter: ['class'] })
    const capsule = document.querySelector('[data-testid="home-capsule"]')
    new MutationObserver(() => capsule.dataset.action && capsule.dataset.action !== 'hello' && window.__moved++).observe(capsule, { attributes: true, attributeFilter: ['data-action'] })
  })
  await page.clock.runFor(20_000)
  const [rang, moved] = await page.evaluate(() => [window.__rang, window.__moved])
  expect(moved).toBeGreaterThanOrEqual(2)
  expect(rang).toBe(moved) // once for each thing the capsule did
  // Tapping the bell opens Schedule (after its short picture).
  await page.clock.resume()
  await bell.click()
  await expect(page).toHaveURL(/\/schedule$/)
})

test('Today: with reduced motion the bell stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date(`${TODAY}T08:10:00+08:00`) })
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: null })
  await page.goto('/')
  await expect(page.getByTestId('home-today-bell')).toBeVisible()
  await page.clock.runFor(30_000)
  await expect(page.getByTestId('home-today-bell')).not.toHaveClass(/ringing/)
})

test('desktop: Today\'s medicines is the same size as the greeting beside it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'side by side on computers only')
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: '08:10' })
  await page.goto('/')
  await expect(page.getByTestId('home-today-due')).toBeVisible()
  const greet = await page.locator('.greet-panel').boundingBox()
  const today = await page.getByTestId('home-today').boundingBox()
  expect(Math.abs(today.height - greet.height)).toBeLessThan(2)
})

test('the next medicine on Home says what it is for, in brackets beside its name', async ({ page }) => {
  const med = (id, name, purpose) => ({ id, source: 'label', sample: false, schedule: { startDate: '2026-01-01', days: 366, times: {} }, medication: { name, strength: null, purpose, doseAmount: 1, doseUnit: 'tablet', timesPerDay: 1, timing: ['bedtime'], withFood: null, frequencyType: 'daily', rawInstruction: 'x', warnings: [] } })
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  await page.clock.setFixedTime(new Date(`${today}T08:00:00+08:00`))
  await page.route('**/api/doses**', (route) => route.fulfill({ json: { ok: true, data: { date: today, taken: [] } } }))
  await page.addInitScript((list) => localStorage.setItem('medicines', JSON.stringify(list)), [{ ...med('m1', 'Metformin', 'diabetes'), schedule: { startDate: today, days: 30, times: {} } }])
  await page.goto('/')
  await expect(page.getByTestId('home-today-purpose')).toHaveText('(diabetes · blood sugar)') // never brackets inside brackets
})

test('Home with a dose due: no axe problems day or night, big targets and text @a11y', async ({ page }) => {
  await seed(page, [METFORMIN])
  await mockDoses(page, { at: '08:10' })
  await page.goto('/')
  await expect(page.getByTestId('home-today-due')).toContainText('Time for Metformin 500 mg')
  await expectNoAxeViolationsDayAndNight(page)
  await expectSeniorFriendly(page)
})
