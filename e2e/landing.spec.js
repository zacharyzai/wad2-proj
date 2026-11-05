// Welcome page (/welcome): shown once to first-time visitors. Cycling headline, scroll-tied falling items, read-aloud demo, axe.
import { test, expect } from './fixtures.js'
import { expectSeniorFriendly, nextFrames } from './helpers/checks.js'
import AxeBuilder from '@axe-core/playwright'
import { signIn, mockAuth, fillLogin, DEMO_USER } from './helpers/auth.js'

// These tests are first-time visitors: no "seen" flag (the config gives every other test one).
test.use({ storageState: { cookies: [], origins: [] }, loggedIn: false })

const headline = (page) => page.getByTestId('landing-headline')
const billCard = (page) => page.locator('#scan .bill')

test('a first visit to "/" opens the welcome page once; after that "/" opens Start (Join for free or Log in)', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Understand your medical bills',
  )
  for (const id of [
    'landing-hero',
    'landing-scan',
    'landing-listen',
    'landing-doses',
    'landing-ask',
    'landing-final',
  ])
    await expect(page.getByTestId(id)).toBeAttached()
  // Full-width page of its own: no app sidebar or tab bar.
  await expect(page.locator('.shell')).toHaveCount(0)

  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/) // every page needs an account
  await expect(page.getByTestId('landing-hero')).toHaveCount(0)
})

test('someone with a login on this device skips the welcome page', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
})

test('someone with an account who never saw the welcome page goes to Start after logging out, not the welcome page', async ({
  page,
}) => {
  await mockAuth(page)
  await page.goto('/login') // straight to Log in, e.g. from a link
  await fillLogin(page)
  await expect(page).toHaveURL(/\/$/)
  await page.evaluate(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }) // logged out
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
})

test('signed in before: Home opens straight away, without waiting for the server', async ({
  page,
}) => {
  await signIn(page)
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), DEMO_USER)
  let answer
  await page.route(
    '**/api/auth/me',
    (route) => (answer = () => route.fulfill({ json: { ok: true, data: { user: DEMO_USER } } })),
  ) // held until released
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 2000 })
  await expect(page).toHaveURL(/\/$/)
  answer()
})

test('signed in before, but the server no longer accepts that login: off to Log in, and the saved copy is gone', async ({
  page,
}) => {
  await signIn(page)
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), DEMO_USER)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      json: { ok: false, error: { code: 'NOT_LOGGED_IN', message: 'Please log in' } },
    }),
  )
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login\?expired=1$/)
  await expect(page.getByTestId('login-error')).toHaveText(/You were logged out/) // says why (H1)
  expect(
    await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('user')]),
  ).toEqual([null, null])
})

test('every "Try me out" goes to Create an account; there is no separate Log in button', async ({
  page,
}) => {
  await page.goto('/welcome')
  await expect(
    page.getByTestId('landing-nav').getByRole('link', { name: /^log in$/i }),
  ).toHaveCount(0)
  await page.getByTestId('landing-nav').locator('.cta').click()
  await expect(page).toHaveURL(/\/start$/)

  await page.goto('/welcome')
  await page.getByTestId('landing-cta-hero').click()
  await expect(page).toHaveURL(/\/start$/)

  await page.goto('/welcome')
  // It lands at the very end of the page. Retry: the router's scroll-to-top can still run just after load and undo one scroll.
  await expect
    .poll(() => page.evaluate(() => (window.scrollTo(0, document.body.scrollHeight), scrollY > 0)))
    .toBe(true)
  await page.getByTestId('landing-cta-final').click()
  await expect(page).toHaveURL(/\/start$/)
})

test('the headline changes language on its own; tapping a language stops it and switches the page', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/welcome')
  const first = await headline(page).innerText()
  await expect(headline(page)).not.toHaveText(first, { timeout: 5000 })

  await page
    .getByRole('group', { name: 'Language', exact: true })
    .getByRole('button', { name: '中文' })
    .click()
  await expect(headline(page)).toHaveText('看懂您的医药账单')
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('看懂您的医药账单')
  await page.clock.runFor(3600)
  await expect(headline(page)).toHaveText('看懂您的医药账单')
})

test('items fall in with scroll and go back up when scrolling back', async ({ page }) => {
  await page.goto('/welcome')
  // Below the fold: not landed yet, so see-through and click-through (never visibility:hidden: keyboards and screen readers still reach it).
  await expect(billCard(page)).toHaveCSS('opacity', '0')
  await expect(billCard(page)).toHaveCSS('pointer-events', 'none')
  await expect(billCard(page)).not.toHaveCSS('visibility', 'hidden')

  // Fully played: its top at the top of the screen, or its bottom at the bottom if it is taller than the screen (phones).
  await page
    .locator('#scan')
    .evaluate((el) =>
      window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)),
    )
  await expect(billCard(page)).toHaveCSS('transform', 'none')
  await expect(billCard(page)).toHaveCSS('opacity', '1')
  await expect(page.locator('[data-testid="scan-face-bill"] .receipt')).toHaveCSS(
    'visibility',
    'hidden',
  ) // the fine print has become plain words

  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(billCard(page)).not.toHaveCSS('transform', 'none')
})

test('with reduced motion everything is shown landed and the headline stays in the page language', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.addInitScript(() => localStorage.setItem('locale', 'ms'))
  await page.goto('/welcome')
  await expect(headline(page)).toHaveText('Fahami bil perubatan anda')
  await expect(billCard(page)).toHaveCSS('transform', 'none')
  await expect(billCard(page)).toHaveCSS('visibility', 'visible')
  await expect(page.locator('#ask .big-face')).toHaveCSS('opacity', '1')
  await page.clock.runFor(3600)
  await expect(headline(page)).toHaveText('Fahami bil perubatan anda')
})

test('"Snap a photo" takes turns showing a bill and a medicine label; tapping one keeps it', async ({
  page,
}) => {
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
  await expect(pick.getByRole('button', { name: 'Medicine label' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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

test('the Ask chat carries on by itself once it has landed; scrolling back above starts it over', async ({
  page,
}) => {
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

test('the reminder phone buzzes while Reminders is on; switching it off stops it', async ({
  page,
}) => {
  await page.goto('/welcome')
  const phone = page.getByTestId('landing-phone')
  // The whole section in view, so the plan card (and its switch) has landed.
  await page
    .locator('#doses')
    .evaluate((el) =>
      window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)),
    )
  await expect
    .poll(() => phone.evaluate((el) => getComputedStyle(el).animationName))
    .toMatch(/^buzz/) // scoped: Vue adds a suffix
  // dispatchEvent: under load, scroll-snap can pull the page back while click() scrolls the switch into view
  await page.getByRole('switch', { name: 'Reminders' }).dispatchEvent('click')
  await expect(phone).toHaveClass(/\boff\b/)
  await expect.poll(() => phone.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

test('the speaker rings wait until it has landed, and never freeze while it reads aloud', async ({
  page,
}) => {
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
  await page
    .locator('#listen')
    .evaluate((el) =>
      window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)),
    )
  await expect(speaker).not.toHaveClass(/\bidle\b/)
  await expect(speaker).not.toHaveClass(/\bringing\b/) // the last fast ring finished, back to resting
})

test('with reduced motion the chat stays as three messages and the phone is still', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/welcome')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.clock.runFor(20000)
  await expect(page.locator('#ask .msg.live')).toHaveCount(0)
  expect(
    await page.getByTestId('landing-phone').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
})

test('read-aloud demo: pick a language, tap the speaker, tap again to stop', async ({ page }) => {
  // Fake speech so the test never depends on the machine's voices.
  await page.addInitScript(() => {
    window.__spoken = []
    window.speechSynthesis.getVoices = () => [
      { lang: 'ta-IN', name: 'Tamil' },
      { lang: 'en-SG', name: 'English' },
    ] // this device has a Tamil voice
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, lang: u.lang })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  const voices = page.getByRole('group', { name: 'Reading language' })
  await voices.getByRole('button', { name: 'தமிழ்' }).click()
  await expect(voices.getByRole('button', { name: 'தமிழ்' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-speak')).toHaveAccessibleName('Stop reading')
  expect(await page.evaluate(() => window.__spoken)).toEqual([
    expect.objectContaining({ lang: 'ta-IN' }),
  ])
  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-speak')).toHaveAccessibleName('Read aloud')
})

for (const colorScheme of ['light', 'dark']) {
  test(`welcome page has no WCAG A/AA violations (${colorScheme}) @a11y`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/welcome')
    // The dev server adds page styles a moment after load; check colours only once they have all arrived.
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual(
      [],
    )
  })
}

test('desktop: Tab reaches buttons in sections not yet scrolled to; the section lands and comes into view', async ({
  page,
  isMobile,
}) => {
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

test('read-aloud demo: a device with no Tamil voice plays Tamil audio from our server (never its English voice)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__spoken = 0
    window.speechSynthesis.getVoices = () => [{ lang: 'en-US', name: 'English' }]
    window.speechSynthesis.speak = () => window.__spoken++
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  await page.getByTestId('landing-listen').getByRole('button', { name: 'தமிழ்' }).click()
  const sent = page.waitForRequest('**/api/tts')
  await page.getByTestId('landing-speak').click()
  expect((await sent).postDataJSON()).toMatchObject({
    lang: 'ta',
    text: expect.stringContaining('$8.70'),
  })
  await expect(page.getByTestId('landing-no-voice')).toHaveCount(0)
  expect(await page.evaluate(() => window.__spoken)).toBe(0)
})

test('read-aloud demo: when the server has no audio either, it says so instead of doing nothing', async ({
  page,
}) => {
  await page.addInitScript(() => (window.speechSynthesis.getVoices = () => []))
  await page.route('**/api/tts', (route) =>
    route.fulfill({ status: 503, json: { ok: false, error: { code: 'AI_UNAVAILABLE' } } }),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  await page.getByTestId('landing-listen').getByRole('button', { name: 'தமிழ்' }).click()
  await page.getByTestId('landing-speak').click()
  await expect(page.getByTestId('landing-no-voice')).toHaveText(
    "We couldn't play this aloud right now. Please try again in a moment.",
  )
  await page.getByTestId('landing-listen').getByRole('button', { name: 'English' }).click() // picking a language clears the note
  await expect(page.getByTestId('landing-no-voice')).toHaveCount(0)
})

test('on a phone the reminder phone picture is left out (the card says it already); bigger screens keep it', async ({
  page,
}) => {
  await page.goto('/welcome')
  const phone = page.getByTestId('landing-phone')
  if (page.viewportSize().width < 576) await expect(phone).toBeHidden()
  else
    await expect(phone)
      .toBeAttached()
      .then(() => phone.scrollIntoViewIfNeeded())
      .then(() => expect(phone).toBeVisible())
})

test('the hero and tunnel scroll freely; from Scan on, one wheel gesture moves a whole feature, both ways', async ({
  page,
  isMobile,
}) => {
  await page.goto('/welcome')
  const html = page.locator('html')
  await expect(html).toHaveClass(/snap-sections/)
  const top = (id) => page.locator(`#${id}`).evaluate((el) => el.offsetTop - 66) // its scroll-margin-top
  const scrollTop = () => page.evaluate(() => Math.round(window.scrollY))
  const at = async (y) => {
    await expect.poll(scrollTop, { timeout: 8000 }).toBeGreaterThan(y - 4)
    await expect.poll(scrollTop, { timeout: 8000 }).toBeLessThan(y + 4)
  }
  const gesture = async (dy) => {
    await nextFrames(page) // the last gesture has ended
    await page.mouse.wheel(0, dy)
  }

  if (isMobile) {
    // Touch: a gentle CSS pull to each feature, and none on the hero or tunnel.
    expect(await html.evaluate((el) => getComputedStyle(el).scrollSnapType)).toBe('y') // proximity is the default, so it isn't spelled out
    expect(
      await page
        .locator('section.sec')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).scrollSnapAlign.split(' ')[0])),
    ).toEqual(['none', 'start', 'start', 'start', 'start'])
  } else {
    expect(await html.evaluate((el) => getComputedStyle(el).scrollSnapType)).toBe('none')
    await page.mouse.move(100, 400)
    // The hero and tunnel: a scroll stays where it was left.
    await page.mouse.wheel(0, 600)
    await nextFrames(page, 55)
    expect(Math.abs((await scrollTop()) - 600)).toBeLessThan(40)

    // Near the end of the tunnel, a small scroll pulls Scan in whole, then each gesture moves one feature.
    const [scan, listen, doses] = [await top('scan'), await top('listen'), await top('doses')]
    await page.evaluate((y) => window.scrollTo(0, y), scan - 150)
    await gesture(40)
    await at(scan)
    await gesture(40)
    await at(listen)
    await gesture(40)
    await at(doses)
    // Landed where it stops (below the top bar), so the pills finish falling into place.
    await expect
      .poll(() => page.locator('#doses .blister').evaluate((el) => el.style.transform))
      .toBe('')
    // The last feature is one stop: a gesture down stays, and one gesture up goes all the way back to Doses.
    await gesture(40)
    await at(await top('ask'))
    await gesture(40)
    await nextFrames(page, 36)
    await at(await top('ask'))
    await gesture(-40)
    await at(doses)
    // And back up, one feature at a time; up from Scan is free scrolling again.
    await gesture(-40)
    await at(listen)
    await gesture(-40)
    await at(scan)
    await gesture(-300)
    await nextFrames(page, 55)
    expect(await scrollTop()).toBeLessThan(scan - 200)
  }

  // Leaving the page (a link, not a reload) takes the snapping away: Create an account scrolls normally.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByTestId('landing-cta-hero').click()
  await expect(page).toHaveURL(/\/start$/)
  await expect(html).not.toHaveClass(/snap-sections/)
})

test('every part invites a scroll with down arrows (no button); the hero cue fades once the page moves', async ({
  page,
}) => {
  await page.goto('/welcome')
  const cue = page.getByTestId('landing-scroll-cue')
  await expect(cue).toHaveText('Scroll to see how it works')
  await expect(cue).toHaveCSS('opacity', '1')
  await expect(
    page.getByTestId('landing-hero').getByRole('button', { name: /how it works/i }),
  ).toHaveCount(0)
  // Every part has one (down arrows) except the last, which has nothing below it.
  for (const id of ['landing-tunnel', 'landing-scan', 'landing-listen', 'landing-doses'])
    await expect(page.getByTestId(id).locator('.scroll-cue')).toHaveCount(1)
  await expect(page.getByTestId('landing-ask').locator('.scroll-cue')).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect(cue).toHaveCSS('opacity', '0')
})

test("on a phone each feature's arrow sits at the foot of the section, below its content and inside it", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone layout: the content stacks and is taller than the screen')
  await page.goto('/welcome')
  for (const id of ['scan', 'listen', 'doses']) {
    const section = page.locator(`#${id}`)
    const [sec, demo, cue] = await Promise.all([
      section.boundingBox(),
      section.locator('.demo').boundingBox(),
      section.locator('.scroll-cue').boundingBox(),
    ])
    expect(sec.height).toBeGreaterThan(page.viewportSize().height * 0.85) // a feature fills about a screen or more on a phone
    expect(cue.y).toBeGreaterThanOrEqual(demo.y + demo.height) // not on top of the picture
    expect(cue.y + cue.height).toBeLessThanOrEqual(sec.y + sec.height + 1) // still inside its own section
  }
})

test('with reduced motion the page scrolls normally, with no snapping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).scrollSnapType)).toBe(
    'none',
  )
})

test('the "Add to Google Calendar" button is gone from the reminders section', async ({ page }) => {
  await page.goto('/welcome')
  await expect(
    page.locator('#doses').getByRole('link', { name: /google calendar|calendar/i }),
  ).toHaveCount(0)
  await expect(page.locator('a[href*="calendar.google.com"]')).toHaveCount(0)
  await expect(page.locator('#doses').getByRole('heading', { level: 2 })).toBeVisible() // the section itself is still there
})

// The hand-drawn underline on the three "Try me out" buttons (header, hero, final): drawn from the middle outwards.
const TRY = [
  '[data-testid="landing-nav"] .cta',
  '[data-testid="landing-cta-hero"]',
  '[data-testid="landing-cta-final"]',
]
const line = (page, css) => page.locator(`${css} .hand-line`)
const clip = (loc) => loc.evaluate((el) => getComputedStyle(el).clipPath)
// The browser writes inset(0 50% 0 50%) back as inset(0px 50%): hidden = a zero-width slice from the middle.
const HIDDEN = /^inset\(0(px)? 50%( 0(px)? 50%)?\)$/
const SHOWN = /^(inset\(0(px)?\)|none)$/

test('every "Try me out" button has a hand-drawn underline that is hidden until hover or keyboard focus', async ({
  page,
}) => {
  await page.goto('/welcome')
  for (const css of TRY) {
    const l = line(page, css)
    await expect(l).toHaveCount(1)
    expect(
      await l.evaluate((el) => el.closest('svg') !== null || el.tagName.toLowerCase() === 'svg'),
    ).toBe(true)
    expect(await l.getAttribute('aria-hidden')).toBe('true') // decoration only
    expect(await clip(l)).toMatch(HIDDEN)
  }
})

test('hover draws the line from the middle outwards without moving the button; leaving takes it back', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'hover is a mouse thing; touch shows the line while pressed')
  await page.goto('/welcome')
  const cta = page.getByTestId('landing-cta-hero')
  const l = line(page, '[data-testid="landing-cta-hero"]')
  // How tall the button is and how far down its words sit (not its width: the welcome page cycles its language, which changes it).
  const layout = () =>
    cta.evaluate((el) => {
      const b = el.getBoundingClientRect()
      const w = el.querySelector('.hand-label').getBoundingClientRect()
      return { h: b.height, dy: w.top - b.top }
    })
  const before = await layout()
  await cta.hover()
  await expect.poll(async () => SHOWN.test(await clip(l)), { timeout: 3000 }).toBe(true)
  const after = await layout()
  for (const k of Object.keys(before))
    expect(Math.abs(after[k] - before[k]), `${k} moved`).toBeLessThan(1.5) // nothing shifted (the 14px line would show)
  await page.mouse.move(5, 5)
  await expect.poll(async () => HIDDEN.test(await clip(l)), { timeout: 3000 }).toBe(true)
})

test('keyboard focus draws the line too, and the button is still a link with its own name', async ({
  page,
}) => {
  await page.goto('/welcome')
  const cta = page.getByTestId('landing-cta-hero')
  for (let i = 0; i < 12 && !(await cta.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(cta).toBeFocused()
  await expect
    .poll(async () => SHOWN.test(await clip(line(page, '[data-testid="landing-cta-hero"]'))), {
      timeout: 3000,
    })
    .toBe(true)
  await expect(cta).toHaveRole('link')
  await expect(cta).toHaveAccessibleName(/\S/)
})

test('with reduced motion the line only fades in (no sweeping)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'uses hover')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  const l = line(page, '[data-testid="landing-cta-hero"]')
  expect(await l.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  await page.getByTestId('landing-cta-hero').hover()
  await expect
    .poll(() => l.evaluate((el) => getComputedStyle(el).opacity), { timeout: 2000 })
    .toBe('1')
  // No sweep: only opacity is allowed to change over time.
  expect(await l.evaluate((el) => getComputedStyle(el).transitionProperty)).not.toContain(
    'clip-path',
  )
})

test('on a phone the welcome page has big targets and text, and no sideways scroll @a11y', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phones only: the desktop page is for caregivers')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/welcome')
  await expect(headline(page)).toBeVisible()
  // The flying papers are pictures of real small print, hidden from screen readers; the page's own words still count.
  await expectSeniorFriendly(page, 'main', '[aria-hidden="true"], [aria-hidden="true"] *')
})
