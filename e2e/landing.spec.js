// Welcome page (/welcome): shown once to first-time visitors. Cycling headline, scroll-tied falling items, read-aloud demo, axe.
import { test, expect } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'
import { signIn, mockAuth, fillLogin, DEMO_USER } from './helpers/auth.js'

// These tests are first-time visitors: no "seen" flag (the config gives every other test one).
test.use({ storageState: { cookies: [], origins: [] }, loggedIn: false })

const headline = (page) => page.getByTestId('landing-headline')
const billCard = (page) => page.locator('#scan .bill')

test('a first visit to "/" opens the welcome page once; after that "/" asks to log in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Understand your medical bills')
  for (const id of ['landing-hero', 'landing-scan', 'landing-listen', 'landing-doses', 'landing-ask', 'landing-final']) await expect(page.getByTestId(id)).toBeAttached()
  // Full-width page of its own: no app sidebar or tab bar.
  await expect(page.locator('.shell')).toHaveCount(0)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/) // every page needs an account
  await expect(page.getByTestId('landing-hero')).toHaveCount(0)
})

test('someone with a login on this device skips the welcome page', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
})

test('someone with an account who never saw the welcome page goes to Log in after logging out, not the welcome page', async ({ page }) => {
  await mockAuth(page)
  await page.goto('/login') // straight to Log in, e.g. from a link
  await fillLogin(page)
  await expect(page).toHaveURL(/\/$/)
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }) // logged out
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('signed in before: Home opens straight away, without waiting for the server', async ({ page }) => {
  await signIn(page)
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), DEMO_USER)
  let answer
  await page.route('**/api/auth/me', (route) => (answer = () => route.fulfill({ json: { ok: true, data: { user: DEMO_USER } } }))) // held until released
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 2000 })
  await expect(page).toHaveURL(/\/$/)
  answer()
})

test('signed in before, but the server no longer accepts that login: off to Log in, and the saved copy is gone', async ({ page }) => {
  await signIn(page)
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), DEMO_USER)
  await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, json: { ok: false, error: { code: 'NOT_LOGGED_IN', message: 'Please log in' } } }))
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?expired=1$/)
  await expect(page.getByTestId('login-error')).toHaveText(/You were logged out/) // says why (H1)
  expect(await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('user')])).toEqual([null, null])
})

test('both "Try me out" buttons go to Create account, then on to Scan', async ({ page }) => {
  await page.goto('/welcome')
  await page.getByTestId('landing-cta-hero').click()
  await expect(page).toHaveURL(/\/signup\?next=(%2F|\/)scan$/)

  await page.goto('/welcome')
  // It lands at the very end of the page. Retry: the router's scroll-to-top can still run just after load and undo one scroll.
  await expect.poll(() => page.evaluate(() => (window.scrollTo(0, document.body.scrollHeight), scrollY > 0))).toBe(true)
  await page.getByTestId('landing-cta-final').click()
  await expect(page).toHaveURL(/\/signup\?next=(%2F|\/)scan$/)
})

test('the headline changes language on its own; tapping a language stops it and switches the page', async ({ page }) => {
  await page.goto('/welcome')
  const first = await headline(page).innerText()
  await expect(headline(page)).not.toHaveText(first, { timeout: 5000 })

  await page.getByRole('group', { name: 'Language', exact: true }).getByRole('button', { name: '中文' }).click()
  await expect(headline(page)).toHaveText('看懂您的医药账单')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('看懂您的医药账单')
  await page.waitForTimeout(3600)
  await expect(headline(page)).toHaveText('看懂您的医药账单')
})

test('items fall in with scroll and go back up when scrolling back', async ({ page }) => {
  await page.goto('/welcome')
  // Below the fold: not landed yet, so see-through and click-through (never visibility:hidden: keyboards and screen readers still reach it).
  await expect(billCard(page)).toHaveCSS('opacity', '0')
  await expect(billCard(page)).toHaveCSS('pointer-events', 'none')
  await expect(billCard(page)).not.toHaveCSS('visibility', 'hidden')

  // Fully played: its top at the top of the screen, or its bottom at the bottom if it is taller than the screen (phones).
  await page.locator('#scan').evaluate((el) => window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)))
  await expect(billCard(page)).toHaveCSS('transform', 'none')
  await expect(billCard(page)).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-testid="scan-face-bill"] .receipt')).toHaveCSS('visibility', 'hidden') // the fine print has become plain words

  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(billCard(page)).not.toHaveCSS('transform', 'none')
})

test('with reduced motion everything is shown landed and the headline stays in the page language', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('locale', 'ms'))
  await page.goto('/welcome')
  await expect(headline(page)).toHaveText('Fahami bil perubatan anda')
  await expect(billCard(page)).toHaveCSS('transform', 'none')
  await expect(billCard(page)).toHaveCSS('visibility', 'visible')
  await expect(page.locator('#ask .big-face')).toHaveCSS('opacity', '1')
  await page.waitForTimeout(3600)
  await expect(headline(page)).toHaveText('Fahami bil perubatan anda')
})

test('"Snap a photo" takes turns showing a bill and a medicine label; tapping one keeps it', async ({ page }) => {
  await page.clock.install()
  await page.goto('/welcome')
  const bill = page.getByTestId('scan-face-bill')
  const label = page.getByTestId('scan-face-label')
  const pick = page.getByTestId('scan-pick')
  await expect(bill).toHaveClass(/\bon\b/)
  await expect(label).toHaveAttribute('aria-hidden', 'true')
  await expect(pick.getByRole('button', { name: 'Bill' })).toHaveAttribute('aria-pressed', 'true')

  await page.clock.runFor(5100) // swaps on its own every 5 seconds
  await expect(label).toHaveClass(/\bon\b/)
  await expect(label).toContainText('Every morning')
  await expect(bill).toHaveAttribute('aria-hidden', 'true')
  await page.clock.runFor(5100)
  await expect(bill).toHaveClass(/\bon\b/)

  await pick.getByRole('button', { name: 'Medicine label' }).click()
  await expect(label).toHaveClass(/\bon\b/)
  await page.clock.runFor(12000) // picked: it stays
  await expect(label).toHaveClass(/\bon\b/)
  await expect(pick.getByRole('button', { name: 'Medicine label' })).toHaveAttribute('aria-pressed', 'true')
})

test('with reduced motion "Snap a photo" never swaps on its own', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/welcome')
  await page.clock.runFor(11000)
  await expect(page.getByTestId('scan-face-bill')).toHaveClass(/\bon\b/)
  await page.getByTestId('scan-pick').getByRole('button', { name: 'Medicine label' }).click()
  await expect(page.getByTestId('scan-face-label')).toHaveClass(/\bon\b/)
})

test('the Ask chat carries on by itself once it has landed; scrolling back above starts it over', async ({ page }) => {
  await page.clock.install()
  await page.goto('/welcome')
  const live = page.locator('#ask .msg.live')
  // On screen is reported in real time, so step the fake clock until the first bubble shows.
  const stepUntil = async (check) => {
    for (let i = 0; i < 60 && !(await check()); i++) await page.clock.runFor(100)
  }
  await page.locator('#ask .chat-win').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await stepUntil(async () => (await live.count()) > 0)
  await expect(live.locator('.typing')).toHaveCount(1) // a "typing" bubble first, then the answer
  await page.clock.runFor(1400)
  await expect(live.last()).toContainText('Tap Read aloud under my answer')
  await page.clock.runFor(10000)
  await expect(live.filter({ hasText: 'How should I keep my medicines?' })).toHaveCount(1)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.clock.runFor(500)
  await expect(live).toHaveCount(0)
})

test('the reminder phone buzzes while Reminders is on; switching it off stops it', async ({ page }) => {
  await page.goto('/welcome')
  const phone = page.getByTestId('landing-phone')
  // The whole section in view, so the plan card (and its switch) has landed.
  await page.locator('#doses').evaluate((el) => window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)))
  await expect.poll(() => phone.evaluate((el) => getComputedStyle(el).animationName)).toMatch(/^buzz/) // scoped: Vue adds a suffix
  await page.getByRole('switch', { name: 'Reminders' }).click()
  await expect(phone).toHaveClass(/\boff\b/)
  await expect.poll(() => phone.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('the speaker rings wait until it has landed, and never freeze while it reads aloud', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechSynthesis.getVoices = () => [{ lang: 'en-SG', name: 'English' }]
    window.speechSynthesis.speak = () => {}
  })
  await page.goto('/welcome')
  const speaker = page.getByTestId('landing-speak')
  await expect(speaker).toHaveClass(/\bidle\b/) // still off screen: the three pulses wait
  await speaker.dispatchEvent('click') // tapped before its face has fully appeared: reading aloud overrides the wait
  await expect(speaker).toHaveClass(/\bringing\b/)
  await expect(speaker).not.toHaveClass(/\bidle\b/)
  await speaker.dispatchEvent('click') // stop
  await page.locator('#listen').evaluate((el) => window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)))
  await expect(speaker).not.toHaveClass(/\bidle\b/)
  await expect(speaker).not.toHaveClass(/\bringing\b/) // the last fast ring finished, back to resting
})

test('with reduced motion the chat stays as three messages and the phone is still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/welcome')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.clock.runFor(20000)
  await expect(page.locator('#ask .msg.live')).toHaveCount(0)
  expect(await page.getByTestId('landing-phone').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('read-aloud demo: pick a language, tap the speaker, tap again to stop', async ({ page }) => {
  // Fake speech so the test never depends on the machine's voices.
  await page.addInitScript(() => {
    window.__spoken = []
    window.speechSynthesis.getVoices = () => [{ lang: 'ta-IN', name: 'Tamil' }, { lang: 'en-SG', name: 'English' }] // this device has a Tamil voice
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, lang: u.lang })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  const voices = page.getByRole('group', { name: 'Reading language' })
  await voices.getByRole('button', { name: 'தமிழ்' }).click()
  await expect(voices.getByRole('button', { name: 'தமிழ்' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-speak')).toHaveAccessibleName('Stop reading')
  expect(await page.evaluate(() => window.__spoken)).toEqual([expect.objectContaining({ lang: 'ta-IN' })])
  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-speak')).toHaveAccessibleName('Read aloud')
})

for (const colorScheme of ['light', 'dark']) {
  test(`welcome page has no WCAG A/AA violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/welcome')
    // The dev server adds page styles a moment after load; check colours only once they have all arrived.
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([])
  })
}

test('desktop: Tab reaches buttons in sections not yet scrolled to; the section lands and comes into view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop scroll animation')
  await page.goto('/welcome')
  const speaker = page.getByTestId('landing-speak')
  await expect(speaker).not.toHaveCSS('visibility', 'hidden') // reachable by keyboard and screen readers, even before it falls in
  await page.getByTestId('landing-listen').getByRole('button', { name: 'தமிழ்' }).focus() // the button just before it
  await page.keyboard.press('Tab') // keyboard focus, as a keyboard user moves through the page
  await expect(speaker).toBeFocused()
  await expect(speaker).toBeInViewport()
  await expect(speaker).toHaveCSS('opacity', '1') // landed, not invisible
  await expect(speaker).toHaveCSS('pointer-events', 'auto')
})

test('read-aloud demo: a device with no voice for the language says so instead of doing nothing', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'English' }]
    window.speechSynthesis.speak = () => {}
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  await page.getByTestId('landing-listen').getByRole('button', { name: 'தமிழ்' }).click()
  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-no-voice')).toHaveText('Read-aloud in this language is not available on this device yet.')
  await page.getByTestId('landing-listen').getByRole('button', { name: 'English' }).click() // a language it has: the note goes
  await expect(page.getByTestId('landing-no-voice')).toHaveCount(0)
})
