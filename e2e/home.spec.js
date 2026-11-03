// Home, kept simple: one question, three big choices, and the last bill as one line (only when there is one).
// Phones: the choices in one column; desktop: in one row.
import { test, expect } from './fixtures.js'

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
  await page.clock.setFixedTime(new Date(`${TODAY}T${at}:00+08:00`))
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

test('Today: no medicines yet says how to get reminders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home-today')).toContainText('Scan a medicine label and we will remind you when to take it.')
  await page.getByTestId('home-today-open').click()
  await expect(page).toHaveURL(/\/schedule$/)
})

test('Today: the dose due now is taken from Home, and the card turns to what is next', async ({ page }) => {
  await seed(page, [METFORMIN])
  const sent = await mockDoses(page, { at: '08:10' })
  await page.goto('/')
  const due = page.getByTestId('home-today-due')
  await expect(due).toContainText('Time for Metformin 500 mg')
  await expect(due).toContainText('1 tablet · After food')
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
