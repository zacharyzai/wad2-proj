// Owner: Lokesh (updated by Claude for the tabbed redesign). Schedule page: Today (a tick for each dose), This week, My medicines
// (Edit number of days and times, Remove + Undo, the pharmacist list) and Reminders (Google Calendar). Medicines go into this browser's storage before the page loads;
// /api/doses is answered by a small in-memory stand-in for the server (no database needed).
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { useSampleLabel } from './helpers/auth.js'

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
const medicine = (id, fields, schedule) => ({
  id,
  source: 'label',
  sample: false,
  medication: { name: 'Metformin', strength: '500 mg', doseAmount: 1, doseUnit: 'tablet', timesPerDay: 2, timing: ['morning', 'evening'], withFood: 'after', frequencyType: 'daily', rawInstruction: 'Take 1 tablet twice a day after food', warnings: [], ...fields },
  ...(schedule ? { schedule } : {}),
})
const METFORMIN = medicine('m1', {})
const SCHEDULED = medicine('m1', {}, { startDate: TODAY, days: 30, times: {} })
const PANADOL = medicine('m2', { name: 'Panadol', strength: null, doseAmount: 2, frequencyType: 'as_needed', timesPerDay: null, timing: null, rawInstruction: 'Take 2 tablets when necessary for pain' })

// Put medicines in storage once (a reload keeps whatever the page saved since).
async function seed(page, list) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('e2e-medicines')) return
    sessionStorage.setItem('e2e-medicines', '1')
    localStorage.setItem('medicines', JSON.stringify(list))
  }, list)
}

// A time today in Singapore. Which band says "Take now", and whether a tick is "too early", depend on the time.
const sgAt = (hhmm) => new Date(`${TODAY}T${hhmm}:00+08:00`)

// Answers /api/doses like the server does (docs/doses-contract.md) and remembers ticks across reloads.
// Google Calendar answers "not set up on this server" unless a test calls mockGoogle (routes added later win).
// The clock is fixed at 10 pm Singapore time unless `at` says otherwise, so no dose is "too early" by accident and the
// results don't depend on when the tests run. Timers keep running. `at: null` leaves the clock alone (for clock.install).
async function mockDoses(page, { failChanges = false, at = '22:00' } = {}) {
  if (at) await page.clock.setFixedTime(sgAt(at))
  const taken = new Set()
  const sent = []
  await page.route('**/api/google/**', (route) => route.fulfill({ status: 503, json: { ok: false, error: { code: 'GOOGLE_UNAVAILABLE', message: 'Google Calendar is not set up on this server' } } }))
  await page.route('**/api/doses**', (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      const date = new URL(request.url()).searchParams.get('date')
      return route.fulfill({ json: { ok: true, data: { date, taken: [...taken].filter((k) => k.startsWith(`${date}/`)).map((k) => k.split('/')[1]) } } })
    }
    const { doseId, date } = request.postDataJSON()
    sent.push({ method: request.method(), doseId, date })
    if (failChanges) return route.fulfill({ status: 503, json: { ok: false, error: { code: 'SERVER_ERROR', message: 'Accounts are not available right now' } } })
    request.method() === 'POST' ? taken.add(`${date}/${doseId}`) : taken.delete(`${date}/${doseId}`)
    return route.fulfill({ json: { ok: true, data: { doseId, date } } })
  })
  return sent
}

const tick = (page, name, time) => page.getByRole('button', { name: new RegExp(`^Taken: ${name}, ${time}$`, 'i') })

// Each medicine's options open from its one "Change" button: Days and times, Fix what we read, Remove.
const OPTIONS = { days: (name) => `Days and times for ${name}`, fix: (name) => `Fix what we read for ${name}`, remove: (name) => `Remove ${name}` }
// The tabs are links to ?view=week | meds | reminders; Today has none.
async function toTab(page, view) {
  if (page.url().includes('view=reminders')) await page.getByRole('link', { name: 'Back to schedule' }).click() // no tabs on Reminders
  await page.getByTestId(`tab-${view}`).click()
  await expect(page).toHaveURL(view === 'today' ? /\/schedule$/ : new RegExp(`view=${view}`))
}
async function pick(page, name, option) {
  if (!page.url().includes('view=meds')) await toTab(page, 'meds') // medicines are managed on My medicines
  const change = page.getByRole('button', { name: `Change ${name}`, exact: true })
  await change.click()
  await expect(change).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: OPTIONS[option](name), exact: true }).click()
}
async function noAxeViolations(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([])
}

test('with no medicines, says so and offers a label scan', async ({ page }) => {
  await mockDoses(page)
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { level: 1, name: 'Your medicines today' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Medicine schedule' })).toHaveCount(0) // no tabs with nothing to show
  await expect(page.getByRole('heading', { name: 'No medicines yet' })).toBeVisible()
  await page.getByRole('link', { name: 'Scan a medicine label' }).click()
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
})

test('a daily medicine asks for the number of days, then shows at its times', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [METFORMIN])
  await page.goto('/schedule')

  // Not silently left out: Today says what is missing and links to it.
  await expect(page.getByTestId('schedule-none-today')).toContainText('Tell us how many days')
  await page.getByTestId('schedule-none-today').getByRole('link', { name: 'My medicines' }).click()
  await expect(page.getByTestId('schedule-need-days')).toContainText('How many days is this medicine for?')
  await page.getByRole('button', { name: 'Add number of days for Metformin 500 mg' }).click()
  await expect(page.getByLabel('Number of days', { exact: true })).toBeFocused()
  await expect(page.getByLabel('Start date')).toHaveValue(TODAY)

  // Nothing typed, or not a whole number: a clear message, and focus goes to the field.
  await page.getByTestId('schedule-save').click()
  await expect(page.getByText('Enter a whole number of days from 1 to 366.')).toBeVisible()
  await expect(page.getByLabel('Number of days', { exact: true })).toBeFocused()
  await page.getByLabel('Number of days', { exact: true }).fill('2.5')
  await page.getByTestId('schedule-save').click()
  await expect(page.getByLabel('Number of days', { exact: true })).toHaveAttribute('aria-invalid', 'true')

  await page.getByLabel('Number of days', { exact: true }).fill('30')
  await page.getByTestId('schedule-save').click()
  await expect(page.getByTestId('schedule-toast')).toHaveText('Schedule saved')
  await expect(page.getByTestId('schedule-need-days')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Change Metformin 500 mg' })).toBeFocused()

  // Morning and evening, from the label, in time order.
  await toTab(page, 'today')
  const today = page.getByTestId('schedule-today')
  await expect(today.getByRole('heading', { level: 3 })).toHaveText([/^Morning · 8:00\sAM$/i, /^Evening · 6:00\sPM$/i])
  await expect(tick(page, 'Metformin 500 mg', '8:00\\sAM')).toHaveAttribute('aria-pressed', 'false')
  await expect(today.getByTestId('dose-m1-morning')).toContainText('1 tablet · After food')
  await expect(page.getByTestId('schedule-progress-words')).toHaveText('0 of 2 doses taken')

  // Change a time: the dose moves, keeping its id.
  await pick(page, 'Metformin 500 mg', 'days')
  await page.getByTestId('schedule-time-morning').fill('07:30')
  await page.getByTestId('schedule-save').click()
  await toTab(page, 'today')
  await expect(today.getByRole('heading', { level: 3 }).first()).toHaveText(/^Morning · 7:30\sAM$/i)
  await expect(today.getByTestId('dose-m1-morning')).toBeVisible()

  // Saved with the medicine, so it is still there after a reload.
  await page.goto('/schedule?view=meds')
  await expect(page.getByTestId('med-m1')).toContainText('7:30')
})

test('ticks are saved to the server and are still there after a reload; keyboard works too', async ({ page }) => {
  const sent = await mockDoses(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')

  const morning = tick(page, 'Metformin 500 mg', '8:00\\sAM')
  const evening = tick(page, 'Metformin 500 mg', '6:00\\sPM')
  await morning.click()
  await expect(morning).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('schedule-progress-words')).toHaveText('1 of 2 doses taken')
  expect(sent).toEqual([{ method: 'POST', doseId: 'm1-morning', date: TODAY }])

  await page.reload()
  await expect(morning).toHaveAttribute('aria-pressed', 'true')
  await expect(evening).toHaveAttribute('aria-pressed', 'false')

  await evening.focus()
  await page.keyboard.press('Space')
  await expect(evening).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('schedule-progress-words')).toHaveText('All of today’s doses are taken. Well done!')

  // Untick.
  await morning.press('Enter')
  await expect(morning).toHaveAttribute('aria-pressed', 'false')
  expect(sent.at(-1)).toEqual({ method: 'DELETE', doseId: 'm1-morning', date: TODAY })
})

test('a tick the server could not save goes back, with a short message', async ({ page }) => {
  await mockDoses(page, { failChanges: true })
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  const morning = tick(page, 'Metformin 500 mg', '8:00\\sAM')
  await morning.click()
  await expect(page.getByTestId('schedule-toast')).toHaveText('That tick was not saved. Please try again.')
  await expect(morning).toHaveAttribute('aria-pressed', 'false')
})

test('"when necessary" medicines go to the pharmacist list and never get times', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [PANADOL, SCHEDULED])
  await page.goto('/schedule')
  await expect(page.getByRole('button', { name: /^Taken: Panadol/ })).toHaveCount(0) // never on Today
  await toTab(page, 'meds')
  const pharmacist = page.getByTestId('schedule-pharmacist')
  await expect(pharmacist.getByRole('heading', { name: 'Check with your pharmacist' })).toBeVisible()
  await expect(pharmacist).toContainText('Panadol')
  await expect(pharmacist).toContainText('Only when needed')
  await expect(pharmacist).toContainText('Take 2 tablets when necessary for pain')
  await expect(page.getByTestId('schedule-meds')).not.toContainText('Panadol')
  await expect(page.getByRole('button', { name: /^Taken: Panadol/ })).toHaveCount(0)
  // One Change button; behind it Fix and Remove, but no Days and times (nothing to schedule).
  await expect(page.getByRole('button', { name: /Panadol/ })).toHaveText(['Change'])
  await page.getByRole('button', { name: 'Change Panadol' }).click()
  await expect(page.getByRole('button', { name: /Panadol/ })).toHaveText(['Change', 'Fix what we read', 'Remove'])
  // Another medicine's Change closes this one: one set of options open at a time.
  await page.getByRole('button', { name: 'Change Metformin 500 mg' }).click()
  await expect(page.getByRole('button', { name: 'Change Panadol' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('schedule-manage')).toHaveCount(1)
  await expect(page.getByTestId('schedule-manage')).toContainText('Days and times')
})

test('tabs: Today, This week and My medicines are pages of their own; time cards sit side by side on desktop, one column on phones', async ({ page, isMobile }) => {
  await mockDoses(page, { at: '07:30' })
  await seed(page, [PANADOL, SCHEDULED, BEDTIME])
  await page.goto('/schedule')
  const tabs = page.getByRole('navigation', { name: 'Medicine schedule' }).getByRole('link')
  await expect(tabs).toHaveText(['Today', 'This week', 'My medicines'])
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page')
  const [morning, evening] = await Promise.all(['08:00', '18:00'].map((time) => page.getByTestId(`slot-${time}`).boundingBox()))
  if (isMobile) expect(evening.y).toBeGreaterThan(morning.y + morning.height - 1) // one column
  else expect(Math.abs(evening.y - morning.y)).toBeLessThan(2) // side by side
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true) // never wider than the screen

  await toTab(page, 'meds')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My medicines')
  await expect(tabs.nth(2)).toHaveAttribute('aria-current', 'page')
  await page.goBack() // the browser's Back returns to Today
  await expect(page.getByTestId('schedule-today')).toBeVisible()
})

test('Remove takes a medicine off, and Undo puts it back', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [PANADOL, SCHEDULED])
  await page.goto('/schedule')
  await pick(page, 'Metformin 500 mg', 'remove')
  await expect(page.getByTestId('schedule-undo')).toContainText('Metformin 500 mg removed')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await expect(page.getByTestId('med-m1')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('med-m1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change Metformin 500 mg' })).toBeFocused() // not lost to the top of the page
  await toTab(page, 'today')
  await expect(tick(page, 'Metformin 500 mg', '8:00\\sAM')).toBeVisible()

  // Removing the last one brings back the empty page.
  await pick(page, 'Metformin 500 mg', 'remove')
  await pick(page, 'Panadol', 'remove')
  await expect(page.getByRole('heading', { name: 'No medicines yet' })).toBeVisible()
})

test('no accessibility problems: ticks, the edit form and the pharmacist list', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [PANADOL, SCHEDULED, medicine('m3', { name: 'Amlodipine', strength: '5 mg', timing: ['morning'], timesPerDay: 1 })])
  await page.goto('/schedule')
  await tick(page, 'Metformin 500 mg', '8:00\\sAM').click()
  await expect(tick(page, 'Metformin 500 mg', '8:00\\sAM')).toHaveAttribute('aria-pressed', 'true')
  await noAxeViolations(page)

  await pick(page, 'Metformin 500 mg', 'days')
  await page.getByLabel('Number of days', { exact: true }).fill('')
  await page.getByTestId('schedule-save').click() // with an error showing
  await expect(page.getByText('Enter a whole number of days from 1 to 366.')).toBeVisible()
  await noAxeViolations(page)

  await toTab(page, 'week')
  await expect(page.getByTestId('week-summary')).toContainText('doses taken so far this week')
  await noAxeViolations(page)
  await page.goto('/schedule?view=reminders')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reminders')
  await noAxeViolations(page)
})

// --- Fix what we read: a saved medicine opens on Confirm, no rescan -----------------------------------------------------------

test('a label misread as "when needed" is fixed without rescanning, and moves onto the timetable', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [medicine('m2', { name: 'Panadol', strength: null, frequencyType: 'as_needed', timesPerDay: null, timing: null, rawInstruction: 'Take 2 tablets twice a day' }, { startDate: TODAY, days: 5, times: {} })])
  await page.goto('/schedule')
  await pick(page, 'Panadol', 'fix')

  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Check what we read' })).toBeVisible()
  await expect(page.getByText('The number of days, your ticks and calendar reminders stay as they are.', { exact: false })).toBeVisible()
  // The label's own words stay in view while "How to take it" is changed.
  await expect(page.getByTestId('confirm-label-says')).toHaveText('The label says: “Take 2 tablets twice a day”')
  await expect(page.getByRole('list', { name: 'Steps' })).toHaveCount(0) // not a new scan
  await expect(page.getByLabel('Medicine name')).toHaveValue('Panadol')
  await noAxeViolations(page)

  await page.getByLabel('How to take it').selectOption('daily')
  await expect(page.getByRole('button', { name: 'Looks correct' })).toBeDisabled() // times a day still needed
  await page.getByLabel('Times a day').fill('2')
  await page.getByRole('button', { name: 'Looks correct' }).click()

  await expect(page).toHaveURL(/\/schedule\?view=meds$/) // back on My medicines, at its Change button
  await expect(page.getByTestId('schedule-toast')).toHaveText('Panadol updated')
  await expect(page.getByRole('button', { name: 'Change Panadol' })).toBeFocused()
  await expect(page.getByTestId('schedule-pharmacist')).toHaveCount(0)
  await expect(page.getByTestId('schedule-meds')).toContainText('Panadol')
  // Its number of days was kept, so it is on today's list straight away.
  await toTab(page, 'today')
  await expect(tick(page, 'Panadol', '8:00\\sAM')).toBeVisible()
  await expect(tick(page, 'Panadol', '9:00\\sPM')).toBeVisible()
  // Said once: not again after a reload.
  await page.reload()
  await expect(page.getByTestId('schedule-today')).toBeVisible()
  await expect(page.getByTestId('schedule-toast')).toHaveCount(0)
})

test('fixing the dose keeps the same doses, so today\'s ticks stay; Cancel changes nothing', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  const morning = tick(page, 'Metformin 500 mg', '8:00\\sAM')
  await morning.click()
  await expect(morning).toHaveAttribute('aria-pressed', 'true')

  // Cancel with a change asks first (as on any check); throwing it away leaves the medicine as it was.
  await pick(page, 'Metformin 500 mg', 'fix')
  await page.getByLabel('Amount each time').fill('3')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByTestId('confirm-discard-yes').click()
  await expect(page).toHaveURL(/\/schedule/)
  await expect(page.getByTestId('med-m1')).toContainText('1 tablet · After food')

  await pick(page, 'Metformin 500 mg', 'fix')
  await page.getByLabel('Amount each time').fill('2')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByTestId('med-m1')).toContainText('2 tablets · After food')
  await toTab(page, 'today')
  await expect(page.getByTestId('dose-m1-morning')).toContainText('2 tablets · After food')
  await expect(morning).toHaveAttribute('aria-pressed', 'true') // same dose id, so the tick is still there
})

test('a medicine typed in Ask can be filled in from its label and scheduled', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [{ id: 'm9', source: 'typed', sample: false, medication: { name: 'Lipitor', rawInstruction: 'one at night' } }])
  await page.goto('/schedule?view=meds')
  await expect(page.getByTestId('schedule-pharmacist')).toContainText('Lipitor')
  await pick(page, 'Lipitor', 'fix')
  await expect(page.getByText('2 fields need checking')).toBeVisible() // amount and how often (it was only typed in)
  await page.getByLabel('Amount each time').fill('1')
  await page.getByLabel('How to take it').selectOption('daily')
  await expect(page.getByText('1 field needs checking')).toBeVisible() // daily: times a day now needed too
  await page.getByLabel('Times a day').fill('1')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByTestId('med-m9')).toContainText('How many days is this medicine for?')
})

// --- Google Calendar (docs/google-contract.md) -------------------------------------------------------------------------------

// A stand-in for /api/google/*: answers like the server, skipping flagged entries and those without an end date.
// `failSyncs`: the first syncs answer with these error codes, in order.
async function mockGoogle(page, { connected = true, failSyncs = [] } = {}) {
  const google = { connected, syncs: [], connects: [], disconnects: [] }
  const status = { GOOGLE_DISCONNECTED: 401, GOOGLE_NOT_CONNECTED: 409 }
  await page.route('**/api/google/status', (route) => route.fulfill({ json: { ok: true, data: { connected: google.connected, events: 0 } } }))
  await page.route('**/api/google/sync', (route) => {
    const body = route.request().postDataJSON()
    google.syncs.push(body)
    const code = failSyncs.shift()
    if (code) return route.fulfill({ status: status[code], json: { ok: false, error: { code, message: code } } })
    const synced = body.entries.filter((e) => !e.flagged && e.endDate)
    const skipped = body.entries.filter((e) => e.flagged || !e.endDate).map((e) => ({ medicineId: e.medicineId, reason: e.flagged ? 'flagged' : 'noEndDate' }))
    return route.fulfill({ json: { ok: true, data: { created: synced.flatMap((e) => e.doses).length, updated: 0, removed: 0, skipped } } })
  })
  await page.route('**/api/google/connect', (route) => {
    google.connects.push(route.request().postDataJSON())
    google.connected = true
    // The real answer is Google's permission page, which then sends the browser back to `next` with ?google=connected.
    return route.fulfill({ json: { ok: true, data: { url: '/schedule?google=connected' } } })
  })
  await page.route('**/api/google/disconnect', (route) => {
    google.disconnects.push(route.request().postDataJSON())
    google.connected = false
    return route.fulfill({ json: { ok: true, data: { connected: false } } })
  })
  return google
}

test('connected: the whole schedule goes to Google Calendar after an edit, once, and names what is still missing', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page)
  await seed(page, [PANADOL, METFORMIN])
  await page.goto('/schedule?view=reminders') // the calendar card lives on Reminders

  const calendar = page.getByTestId('schedule-calendar')
  await expect(calendar.getByTestId('calendar-connected')).toHaveText('Connected')
  await expect(calendar).toContainText('Check that your calendar alerts are on.')
  // First visit from this device: sent once on opening. Metformin has no number of days yet, so the page says so.
  await expect(calendar.getByTestId('calendar-missing')).toHaveText('Not in your calendar yet: Metformin 500 mg. Add the number of days above to add it.')
  expect(google.syncs).toHaveLength(1)

  await page.getByRole('link', { name: 'Back to schedule' }).click()
  await toTab(page, 'meds')
  await page.getByRole('button', { name: 'Add number of days for Metformin 500 mg' }).click()
  await page.getByLabel('Number of days', { exact: true }).fill('30')
  await page.getByTestId('schedule-save').click()
  await expect(page.getByTestId('schedule-toast')).toHaveText('Calendar updated') // the card heard it, out of sight
  await page.getByTestId('schedule-reminders-link').click()
  await expect(calendar.getByTestId('calendar-missing')).toHaveCount(0)
  expect(google.syncs).toHaveLength(2)
  // Every medicine, the flagged one too, never just the changed one.
  const sent = google.syncs[1]
  expect(sent.lang).toBe('en')
  expect(sent.entries.map((e) => e.medicineId)).toEqual(['m2', 'm1'])
  expect(sent.entries[0]).toMatchObject({ medicineId: 'm2', flagged: true, doses: [] })
  expect(sent.entries[1]).toMatchObject({
    medicineId: 'm1', label: 'Metformin 500 mg', flagged: false, startDate: TODAY,
    instruction: { count: 1, unit: 'tablet', food: 'after' },
    doses: [{ id: 'm1-morning', time: '08:00' }, { id: 'm1-evening', time: '18:00' }],
  })
  await expect(calendar).toContainText('2 doses are in your calendar.')
  await noAxeViolations(page)

  // Remove then Undo straight away: nothing changed overall, so nothing is sent. Nor on a reload with the same schedule.
  await pick(page, 'Panadol', 'remove')
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(2000)
  await page.goto('/schedule?view=reminders')
  await expect(calendar.getByTestId('calendar-connected')).toBeVisible()
  await page.waitForTimeout(2000)
  expect(google.syncs).toHaveLength(2)

  // Switching language sends the schedule again, so the events read in the new language.
  await page.getByRole('button', { name: '中文' }).first().click()
  await expect.poll(() => google.syncs.length, { timeout: 5000 }).toBe(3)
  expect(google.syncs[2].lang).toBe('zh')
})

test('access removed in Google: Reconnect, not an error page; back from Google it says so and syncs', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page, { failSyncs: ['GOOGLE_DISCONNECTED'] })
  await seed(page, [SCHEDULED])
  await page.goto('/schedule?view=reminders')

  const calendar = page.getByTestId('schedule-calendar')
  await expect(calendar).toContainText('Google Calendar was disconnected. Please connect it again.')
  await calendar.getByTestId('calendar-reconnect').click()
  await expect(page).toHaveURL(/\/schedule\?view=reminders$/) // back from "Google" on Reminders, ?google=connected tidied away
  expect(google.connects).toEqual([{ next: '/schedule' }])
  await expect(calendar.getByTestId('calendar-connected')).toBeVisible()
  await expect.poll(() => google.syncs.length).toBe(2)
  expect(google.syncs[1].entries[0].doses).toHaveLength(2)
})

test('not connected: a Connect button, and edits send nothing', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page, { connected: false })
  await seed(page, [SCHEDULED])
  await page.goto('/schedule?view=reminders')
  await expect(page.getByTestId('calendar-connect')).toHaveText('Connect Google Calendar')
  await pick(page, 'Metformin 500 mg', 'days')
  await page.getByLabel('Number of days', { exact: true }).fill('10')
  await page.getByTestId('schedule-save').click()
  await page.waitForTimeout(2000)
  expect(google.syncs).toHaveLength(0)
})

test('Google not set up on the server: no calendar card at all', async ({ page }) => {
  await mockDoses(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  await expect(page.getByTestId('schedule-today')).toBeVisible()
  await expect(page.getByTestId('schedule-calendar')).toHaveCount(0)
})

test('back from Google: connected, said no, or failed, each with a short message, and the address is tidied', async ({ page }) => {
  await mockDoses(page)
  await mockGoogle(page, { connected: false })
  await seed(page, [SCHEDULED])
  for (const [result, message] of [['cancelled', 'Google Calendar was not connected.'], ['failed', 'We could not connect Google Calendar. Please try again.']]) {
    await page.goto(`/schedule?google=${result}`)
    await expect(page.getByTestId('schedule-toast')).toHaveText(message)
    await expect(page).toHaveURL(/\/schedule\?view=reminders$/) // tidied, and on Reminders where the card is
  }
})

test('Disconnect asks whether to remove the doses from the calendar too', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule?view=reminders')
  await page.getByRole('button', { name: 'Disconnect Google Calendar' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('Also remove your doses from Google Calendar?')
  await expect(page.getByRole('button', { name: 'Yes, remove them' })).toBeFocused() // focus moves into the question
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Disconnect Google Calendar' })).toBeFocused()
  await page.getByRole('button', { name: 'Disconnect Google Calendar' }).click()
  await page.getByRole('button', { name: 'Yes, remove them' }).click()
  await expect(page.getByTestId('schedule-toast')).toHaveText('Google Calendar disconnected')
  await expect(page.getByTestId('calendar-connect')).toBeVisible()
  expect(google.disconnects).toEqual([{ removeEvents: true }])
})

test('removing the last medicine still reaches Google, so its reminders are deleted', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  await expect.poll(() => google.syncs.length).toBe(1) // first visit from this device
  await pick(page, 'Metformin 500 mg', 'remove')
  await expect(page.getByRole('heading', { name: 'No medicines yet' })).toBeVisible()
  await expect.poll(() => google.syncs.length, { timeout: 5000 }).toBe(2)
  expect(google.syncs[1].entries).toEqual([])
  await page.goto('/schedule?view=reminders')
  await expect(page.getByTestId('calendar-connected')).toBeVisible() // Disconnect stays reachable
})

test('leaving the page straight after an edit still sends it to Google', async ({ page }) => {
  await mockDoses(page)
  const google = await mockGoogle(page)
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  await expect.poll(() => google.syncs.length).toBe(1)
  await pick(page, 'Metformin 500 mg', 'days')
  await page.getByLabel('Number of days', { exact: true }).fill('10')
  await page.getByTestId('schedule-save').click()
  await page.getByRole('link', { name: 'Ask', exact: true }).first().click() // well within the 1.5 second wait
  await expect(page).toHaveURL(/\/ask$/)
  await expect.poll(() => google.syncs.length).toBe(2)
  expect(google.syncs[1].entries[0].endDate).not.toBe(google.syncs[0].entries[0].endDate)
})

test('left open past midnight: the new day starts unticked, and ticks are saved on the new date', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T15:58:00Z') }) // 11:58 pm in Singapore
  const sent = await mockDoses(page, { at: null })
  await seed(page, [medicine('m1', {}, { startDate: '2026-10-20', days: 30, times: {} })])
  await page.goto('/schedule')
  const today = page.getByTestId('schedule-date')
  const morning = tick(page, 'Metformin 500 mg', '8:00\\sAM')
  await expect(today).toContainText('October 27')
  await morning.click()
  await expect(morning).toHaveAttribute('aria-pressed', 'true')
  expect(sent.at(-1)).toMatchObject({ method: 'POST', date: '2026-10-27' })

  await page.clock.runFor('03:00') // 12:01 am: the page checks the day every minute
  await expect(today).toContainText('October 28')
  await expect(morning).toHaveAttribute('aria-pressed', 'false')
  await morning.click()
  // Just after midnight, the 8 am dose is hours away, so it asks first.
  await page.getByRole('button', { name: 'Yes, I took it' }).click()
  await expect(morning).toHaveAttribute('aria-pressed', 'true')
  expect(sent.at(-1)).toEqual({ method: 'POST', doseId: 'm1-morning', date: '2026-10-28' })
})

// --- Morning, afternoon, evening, bedtime: each band looks different, and the one that's due stands out ----------------------

const BEDTIME = medicine('m4', { name: 'Atorvastatin', strength: '20 mg', timing: ['bedtime'], timesPerDay: 1 }, { startDate: TODAY, days: 30, times: {} })
const band = (page, time) => page.getByTestId(`slot-${time}`)

test('in the morning: the morning band says "Take now", the evening and bedtime ones "Later today"', async ({ page }) => {
  await mockDoses(page, { at: '07:30' })
  await seed(page, [SCHEDULED, BEDTIME])
  await page.goto('/schedule')
  await expect(page.getByTestId('schedule-today').getByRole('heading', { level: 3 })).toHaveText([/^Morning · 8:00\sAM$/, /^Evening · 6:00\sPM$/, /^Bedtime · 9:00\sPM$/])
  await expect(band(page, '08:00')).toHaveAttribute('data-state', 'now')
  await expect(band(page, '08:00').getByTestId('slot-state')).toHaveText('Take now')
  for (const time of ['18:00', '21:00']) {
    await expect(band(page, time)).toHaveAttribute('data-state', 'later')
    await expect(band(page, time).getByTestId('slot-state')).toHaveText('Later today')
  }
  // Each time of day has its own colour (its icon tile, like a pill-box compartment).
  const colours = await Promise.all(['08:00', '18:00', '21:00'].map((time) => band(page, time).locator('.slot-tile').evaluate((el) => getComputedStyle(el).backgroundColor)))
  expect(new Set(colours).size).toBe(3)
  await noAxeViolations(page)

  // Night mode: the same colours, darker, still readable.
  // Chosen on the Account page, as a person would: the account's choice wins over anything stored on the device.
  await page.goto('/account')
  await page.getByTestId('account-theme').getByRole('button', { name: 'Night' }).click()
  await page.goto('/schedule')
  await expect(band(page, '08:00')).toHaveAttribute('data-state', 'now')
  // Really the night colours: every card and its time-of-day tile is dark, not the light one.
  for (const time of ['08:00', '18:00', '21:00']) {
    const [r, g, b] = (await band(page, time).locator('.slot-tile').evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g).map(Number)
    expect(r + g + b, time).toBeLessThan(200)
  }
  await noAxeViolations(page)
})

test('in the evening: an untaken morning dose says "Not ticked yet" and to ask the pharmacist, never to take it now', async ({ page }) => {
  await mockDoses(page, { at: '19:00' })
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  const morningBand = band(page, '08:00')
  await expect(morningBand).toHaveAttribute('data-state', 'earlier')
  await expect(morningBand.getByTestId('slot-state')).toHaveText('Not ticked yet')
  await expect(morningBand).toContainText('If you missed a dose, ask your pharmacist what to do.')
  await expect(band(page, '18:00').getByTestId('slot-state')).toHaveText('Take now')

  await tick(page, 'Metformin 500 mg', '8:00\\sAM').click() // earlier in the day: no question
  await expect(morningBand.getByTestId('slot-state')).toHaveText('All taken')
  await expect(morningBand).not.toContainText('ask your pharmacist')
})

test('ticking a dose more than 2 hours early asks first; "Not yet" leaves it unticked', async ({ page }) => {
  const sent = await mockDoses(page, { at: '07:30' })
  await seed(page, [SCHEDULED])
  await page.goto('/schedule')
  const evening = tick(page, 'Metformin 500 mg', '6:00\\sPM')

  await evening.click()
  const ask = page.getByRole('alertdialog')
  await expect(ask).toContainText('This dose is for later today')
  await expect(ask).toContainText(/Metformin 500 mg is for 6:00\sPM\. Have you already taken it\?/)
  await expect(page.getByRole('button', { name: 'Yes, I took it' })).toBeFocused()
  await noAxeViolations(page)
  expect(sent).toEqual([]) // nothing recorded while asking

  await page.getByRole('button', { name: 'Not yet' }).click()
  await expect(ask).toHaveCount(0)
  await expect(evening).toHaveAttribute('aria-pressed', 'false')
  await expect(evening).toBeFocused()
  expect(sent).toEqual([])

  await evening.click()
  await page.getByRole('button', { name: 'Yes, I took it' }).click()
  await expect(evening).toHaveAttribute('aria-pressed', 'true')
  expect(sent).toEqual([{ method: 'POST', doseId: 'm1-evening', date: TODAY }])

  // The 8 am dose at 7:30: due now, so one tap. Unticking never asks.
  await tick(page, 'Metformin 500 mg', '8:00\\sAM').click()
  await expect(tick(page, 'Metformin 500 mg', '8:00\\sAM')).toHaveAttribute('aria-pressed', 'true')
  await evening.click()
  await expect(evening).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

// --- How long a pack lasts: "Qty: 60 tablets", 1 tablet twice a day -> 30 days, from our own sums (supplyDays) -----------------

test('a label that says how many tablets goes on the timetable for as long as they last, with the sums shown', async ({ page }) => {
  await mockDoses(page)
  await useSampleLabel(page, 'Metformin label') // Qty: 60 tablets, 1 tablet twice a day
  await expect(page.getByLabel('Amount in the pack')).toHaveValue('60') // checked on Confirm like everything else
  await page.getByRole('button', { name: 'Looks correct' }).click()

  await page.goto('/schedule')
  await expect(tick(page, 'Metformin 500 mg', '8:00\\sAM')).toBeVisible() // on today's list, no "how many days?" first
  await expect(page.getByTestId('schedule-need-days-link')).toHaveCount(0)
  await toTab(page, 'meds')
  const card = page.getByTestId('schedule-meds')
  await expect(card.getByTestId('med-supply')).toHaveText('From the label: 60 tablets, 2 tablets a day, so it lasts 30 days.')
  await expect(card.getByText(/ to /)).toBeVisible() // its end date, 30 days from today
  // Still the person's call: Days and times shows the same 30, and can be changed.
  await pick(page, 'Metformin 500 mg', 'days')
  await expect(page.getByLabel('Number of days', { exact: true })).toHaveValue('30')
})

test('changing the amount on Confirm changes the days; leaving it empty means Schedule asks', async ({ page }) => {
  await mockDoses(page)
  await useSampleLabel(page, 'Metformin label')
  await page.getByLabel('Amount in the pack').fill('')
  await page.getByLabel('Amount in the pack').blur()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.goto('/schedule?view=meds')
  await expect(page.getByTestId('schedule-need-days')).toContainText('How many days is this medicine for?')
  await expect(page.getByTestId('med-supply')).toHaveCount(0)
})
