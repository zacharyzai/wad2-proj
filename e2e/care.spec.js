// Feature 9 (Isaac): caregiver role at signup, caregiver-only tab and pages, the invite link, and "Your caregivers" on a senior's Account page.
// The /api/care calls are mocked, so these tests need no database.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolationsDayAndNight, expectSeniorFriendly, expectVisibleFocus } from './helpers/checks.js'
import { DEMO_USER, signIn } from './helpers/auth.js'

const CAREGIVER = { ...DEMO_USER, name: 'Wei Ling', role: 'caregiver' }
const SENIOR = { ...DEMO_USER, role: 'senior' }
const TOKEN = 'e'.repeat(32)

const SENIORS = { seniors: [{ id: 'u2', name: 'Mei Ling Tan', today: { taken: 1, missed: 1, upcoming: 1 } }] }
const TODAY = {
  senior: { id: 'u2', name: 'Mei Ling Tan' },
  doses: [
    { doseId: 'm1-morning', label: 'Metformin 500mg', time: '08:00', status: 'missed' },
    { doseId: 'm2-noon', label: 'Amlodipine 5mg', time: '12:00', status: 'taken' },
    { doseId: 'm1-night', label: 'Metformin 500mg', time: '21:00', status: 'upcoming' },
  ],
}
const METFORMIN = { id: 'm1', purpose: 'diabetes', rawInstruction: 'Take 1 tablet 2 times a day', warnings: ['Do not skip meals'], entry: { label: 'Metformin 500mg', instruction: { count: 1, unit: 'tablet', food: 'after' }, doses: [{ id: 'm1-morning', time: '08:00' }, { id: 'm1-night', time: '21:00' }] } }
const PANADOL = { id: 'm3', purpose: null, rawInstruction: 'Take when there is pain', warnings: [], entry: { label: 'Panadol', instruction: { count: null, unit: null, food: null }, doses: [] } }
const ok = (data) => ({ json: { ok: true, data } })
const fail = (status, code) => ({ status, json: { ok: false, error: { code, message: 'x' } } })

test.describe('signup role', () => {
  test.use({ loggedIn: false })

  test('the caregiver choice is sent to the server', async ({ page }) => {
    let sent
    await page.route('**/api/auth/signup', (route) => {
      sent = route.request().postDataJSON()
      return route.fulfill(ok({ token: 'x', user: { ...CAREGIVER } }))
    })
    await page.goto('/signup')
    await page.getByTestId('signup-role-caregiver').check()
    await page.getByTestId('signup-name').fill('Wei Ling')
    await page.getByTestId('signup-email').fill('weiling@example.com')
    await page.getByTestId('signup-password').fill('teh-tarik-1952')
    await page.getByTestId('signup-dob').fill('1985-05-05')
    await page.getByTestId('signup-citizenship').selectOption('pr')
    await page.getByTestId('signup-submit').click()
    await expect.poll(() => sent?.role).toBe('caregiver')
  })

  test('an invite link opens signup with Caregiver already chosen', async ({ page }) => {
    await page.goto('/signup?role=caregiver')
    await expect(page.getByTestId('signup-role-caregiver')).toBeChecked()
  })
})

test.describe('caregiver-only tab', () => {
  test.use({ loggedIn: false })

  test('a senior has no My seniors tab and /care sends them Home', async ({ page }) => {
    await signIn(page, SENIOR)
    await page.goto('/account')
    await expect(page.getByRole('link', { name: 'My seniors' })).toHaveCount(0)
    await page.goto('/care')
    await expect(page).not.toHaveURL(/\/care/)
  })

  test('a caregiver sees the tab and the list of seniors with today at a glance', async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors', (route) => route.fulfill(ok(SENIORS)))
    await page.goto('/care')
    await expect(page.getByRole('link', { name: 'My seniors' }).first()).toBeVisible()
    await expect(page.getByTestId('care-senior')).toContainText('Mei Ling Tan')
    await expect(page.getByTestId('care-senior')).toContainText('1 not ticked')
  })

  test('a caregiver with no seniors is told how to get an invite', async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors', (route) => route.fulfill(ok({ seniors: [] })))
    await page.goto('/care')
    await expect(page.getByRole('heading', { name: 'No one linked yet' })).toBeVisible()
  })

  test("tapping a dose turns its card over to the medicine's details, with nothing to change them", async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors/u2/today', (route) => route.fulfill(ok({ ...TODAY, medicines: [METFORMIN, PANADOL] })))
    await page.goto('/care/u2')
    // The front of the dose card: when, what it is for, and how it went.
    const dose = page.getByTestId('care-dose').first()
    const open = dose.getByTestId('care-medicine-open')
    await expect(open).toContainText('08:00')
    await expect(open).toContainText('Metformin 500mg')
    await expect(open).toContainText('Usually used for diabetes (blood sugar)')
    await expect(open).toContainText('Not ticked')
    await expect(page.getByText('Only Mei Ling Tan can change them.')).toBeVisible()
    const back = dose.getByTestId('care-medicine-details')
    await expect(back).toHaveAttribute('inert', '') // the side turned away can't be reached
    // Tap it: this card turns over, and focus goes with it.
    await open.click()
    await expect(back).not.toHaveAttribute('inert', '')
    await expect(back).toContainText('1 tablet · After food')
    await expect(back).toContainText('Do not skip meals')
    const close = dose.getByTestId('care-medicine-close')
    await expect(close).toBeFocused()
    await expect(back.getByRole('button')).toHaveCount(1) // only the way back
    await expect(page.getByTestId('care-doses').locator('input, select, textarea')).toHaveCount(0)
    await close.click()
    await expect(open).toBeFocused()
    // A medicine with no dose today ("when necessary") still has its card, with no time.
    await expect(page.getByTestId('care-other')).toContainText('Panadol')
    await expect(page.getByTestId('care-doses').locator('li.flip')).toHaveCount(4)
  })

  test("a senior's doses show taken, not ticked and to come, with words, and flag what was not ticked", async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors/u2/today', (route) => route.fulfill(ok(TODAY)))
    await page.goto('/care/u2')
    await expect(page.getByTestId('care-dose')).toHaveCount(3)
    await expect(page.getByTestId('care-dose').first()).toContainText('Not ticked')
    await expect(page.getByTestId('care-missed')).toContainText('give them a call')
    await expect(page.getByTestId('care-dose').nth(1)).toContainText('Taken')
    await expect(page.getByTestId('care-dose').nth(2)).toContainText('To come')
  })

  test('after the senior removes the link the caregiver sees a plain message', async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors/u2/today', (route) => route.fulfill(fail(404, 'NOT_FOUND')))
    await page.goto('/care/u2')
    await expect(page.getByRole('heading', { name: 'You can no longer see this person' })).toBeVisible()
  })
})

test.describe('invite link', () => {
  test.use({ loggedIn: false })
  const invite = (page) => page.route(`**/api/care/invites/${TOKEN}`, (route) => route.fulfill(ok({ senior: { name: 'Mei Ling Tan' }, expiresAt: '2026-11-05T00:00:00Z' })))

  test('logged out: says what the caregiver will and will not see, then offers log in or sign up', async ({ page }) => {
    await invite(page)
    await page.goto(`/shared/${TOKEN}`)
    await expect(page.getByTestId('invite-title')).toContainText('Mei Ling Tan')
    await expect(page.getByText('Their scans, photos, bills or account details.')).toBeVisible()
    await expect(page.getByTestId('invite-login')).toHaveAttribute('href', new RegExp(`next=.*${TOKEN}`))
    await expect(page.getByTestId('invite-signup')).toHaveAttribute('href', /role=caregiver/)
  })

  test('a caregiver accepts and lands on that senior', async ({ page }) => {
    await signIn(page, CAREGIVER)
    await invite(page)
    await page.route(`**/api/care/invites/${TOKEN}/accept`, (route) => route.fulfill(ok({ seniorId: 'u2' })))
    await page.route('**/api/care/seniors/u2/today', (route) => route.fulfill(ok(TODAY)))
    await page.goto(`/shared/${TOKEN}`)
    await page.getByTestId('invite-accept').click()
    await expect(page).toHaveURL(/\/care\/u2$/)
  })

  test('a senior account cannot accept', async ({ page }) => {
    await signIn(page, SENIOR)
    await invite(page)
    await page.goto(`/shared/${TOKEN}`)
    await expect(page.getByTestId('invite-wrong-role')).toBeVisible()
    await expect(page.getByTestId('invite-accept')).toHaveCount(0)
  })

  test('an expired invite shows one friendly message', async ({ page }) => {
    await page.route(/\/api\/care\/invites\/f+$/, (route) => route.fulfill(fail(404, 'NOT_FOUND')))
    await page.goto(`/shared/${'f'.repeat(32)}`)
    await expect(page.getByRole('heading', { name: 'This invitation is no longer available' })).toBeVisible()
  })
})

test.describe("senior's Account page", () => {
  test.use({ loggedIn: false })

  test('says what a caregiver will see before the link exists, then shows link and WhatsApp', async ({ page }) => {
    await signIn(page, SENIOR)
    await page.route('**/api/care/caregivers', (route) => route.fulfill(ok({ caregivers: [] })))
    await page.route('**/api/care/invites', (route) => route.fulfill(ok({ token: TOKEN, expiresAt: '2026-11-05T00:00:00Z' })))
    await page.goto('/account')
    await page.getByTestId('care-invite').click()
    await expect(page.getByText('They will not see: your scans, photos, bills or account details.', { exact: false })).toBeVisible()
    await expect(page.getByTestId('care-invite-link')).toHaveCount(0)
    await page.getByTestId('care-invite-create').click()
    await expect(page.getByTestId('care-invite-link')).toHaveValue(new RegExp(`/shared/${TOKEN}$`))
    await expect(page.getByTestId('care-invite-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/)
  })

  test('lists caregivers and removes one after asking', async ({ page }) => {
    await signIn(page, SENIOR)
    await page.route('**/api/care/caregivers', (route) => route.fulfill(ok({ caregivers: [{ id: 'l1', name: 'Wei Ling', since: '2026-10-01T00:00:00Z' }] })))
    let removed = false
    await page.route('**/api/care/links/l1', (route) => { removed = true; return route.fulfill(ok({})) })
    await page.goto('/account')
    await expect(page.getByTestId('care-caregivers')).toContainText('Wei Ling')
    await page.getByTestId('care-remove').click()
    await page.getByTestId('care-remove-yes').click()
    await expect(page.getByTestId('care-caregivers')).toHaveCount(0)
    expect(removed).toBe(true)
  })

  test('a caregiver account has no caregiver card', async ({ page }) => {
    await signIn(page, CAREGIVER)
    await page.goto('/account')
    await expect(page.getByTestId('care-card')).toHaveCount(0)
  })
})

test.describe('usable for a caregiver', () => {
  test.use({ loggedIn: false })

  async function openSenior(page) {
    await signIn(page, CAREGIVER)
    await page.route('**/api/care/seniors', (route) => route.fulfill(ok(SENIORS)))
    await page.route('**/api/care/seniors/u2/today', (route) => route.fulfill(ok({ ...TODAY, medicines: [METFORMIN, PANADOL] })))
  }
  const firstDose = (page) => page.getByTestId('care-dose').first()

  test('My seniors has no axe problems, day or night @a11y', async ({ page }) => {
    await openSenior(page)
    await page.goto('/care')
    await expect(page.getByTestId('care-senior')).toBeVisible()
    await expectNoAxeViolationsDayAndNight(page)
  })

  test("a senior's page with a card turned over has no axe problems, day or night @a11y", async ({ page }) => {
    await openSenior(page)
    await page.goto('/care/u2')
    await firstDose(page).getByTestId('care-medicine-open').click()
    await expect(firstDose(page).getByTestId('care-medicine-close')).toBeFocused()
    await expectNoAxeViolationsDayAndNight(page)
  })

  test('My seniors and a senior\'s page: big targets and text, no sideways scroll @a11y', async ({ page }) => {
    await openSenior(page)
    await page.goto('/care')
    await expect(page.getByTestId('care-senior')).toBeVisible()
    await expectSeniorFriendly(page)
    await page.goto('/care/u2')
    await expect(firstDose(page)).toBeVisible()
    await expectSeniorFriendly(page)
  })

  test('a card turns over and back by keyboard, and focus goes with it @a11y', async ({ page }) => {
    await openSenior(page)
    await page.goto('/care/u2')
    const open = firstDose(page).getByTestId('care-medicine-open')
    await open.focus()
    await expectVisibleFocus(open)
    await page.keyboard.press('Enter')
    const close = firstDose(page).getByTestId('care-medicine-close')
    await expect(close).toBeFocused()
    await expect(firstDose(page).getByTestId('care-medicine-details')).toContainText('Do not skip meals')
    await page.keyboard.press('Enter')
    await expect(open).toBeFocused()
  })

  test('reduced motion: the card changes at once, without spinning', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openSenior(page)
    await page.goto('/care/u2')
    await firstDose(page).getByTestId('care-medicine-open').click()
    await expect(firstDose(page).getByTestId('care-medicine-details')).toContainText('Do not skip meals')
    // Colours may still ease (motion.css); movement must not.
    expect(await firstDose(page).locator('.flip-inner').evaluate((e) => getComputedStyle(e).transitionProperty)).not.toMatch(/transform|all/)
  })

  for (const [lang, script] of [['zh', /\p{Script=Han}/u], ['ms', /\S/], ['ta', /\p{Script=Tamil}/u]]) {
    test(`${lang}: My seniors and a senior's page are fully translated @i18n`, async ({ page }) => {
      const warnings = []
      page.on('console', (m) => /\[intlify\] (Not found '|Fall back)/.test(m.text()) && warnings.push(m.text()))
      await page.addInitScript((l) => localStorage.setItem('locale', l), lang)
      await openSenior(page)
      for (const path of ['/care', '/care/u2']) {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('lang', lang)
        await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(script)
        await expect(page.locator('main')).not.toContainText(/\bcare\.[A-Za-z.]+/)
      }
      expect(warnings).toEqual([])
    })
  }
})
