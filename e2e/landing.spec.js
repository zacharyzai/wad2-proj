// Welcome page (/welcome): shown once to first-time visitors. Cycling headline, scroll-tied falling items, read-aloud demo, axe.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// These tests are first-time visitors: no "seen" flag (the config gives every other test one).
test.use({ storageState: { cookies: [], origins: [] } })

const headline = (page) => page.getByTestId('landing-headline')
const billCard = (page) => page.locator('#scan .bill')

test('a first visit to "/" opens the welcome page once; after that "/" is Home', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Understand your medical bills')
  for (const id of ['landing-hero', 'landing-scan', 'landing-listen', 'landing-doses', 'landing-ask', 'landing-final']) await expect(page.getByTestId(id)).toBeAttached()
  // Full-width page of its own: no app sidebar or tab bar.
  await expect(page.locator('.shell')).toHaveCount(0)

  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('landing-hero')).toHaveCount(0)
})

test('someone with a login on this device skips the welcome page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'any'))
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
})

test('both "Try me out" buttons go to Scan', async ({ page }) => {
  await page.goto('/welcome')
  await page.getByTestId('landing-cta-hero').click()
  await expect(page).toHaveURL(/\/scan$/)

  await page.goto('/welcome')
  // It lands at the very end of the page. Retry: the router's scroll-to-top can still run just after load and undo one scroll.
  await expect.poll(() => page.evaluate(() => (window.scrollTo(0, document.body.scrollHeight), scrollY > 0))).toBe(true)
  await page.getByTestId('landing-cta-final').click()
  await expect(page).toHaveURL(/\/scan$/)
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

test('items fall in with scroll and go back up when scrolling back', async ({ page, isMobile }) => {
  await page.goto('/welcome')
  // Below the fold: not landed yet (desktop: hidden above the screen; phone: faded out).
  if (isMobile) await expect(billCard(page)).toHaveCSS('opacity', '0')
  else await expect(billCard(page)).toHaveCSS('visibility', 'hidden')

  // Fully played: its top at the top of the screen, or its bottom at the bottom if it is taller than the screen (phones).
  await page.locator('#scan').evaluate((el) => window.scrollTo(0, Math.max(el.offsetTop, el.offsetTop + el.offsetHeight - innerHeight)))
  await expect(billCard(page)).toHaveCSS('transform', 'none')
  await expect(billCard(page)).toHaveCSS('opacity', '1')
  await expect(page.locator('#scan .receipt')).toHaveCSS('visibility', 'hidden') // the fine print has become plain words

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

test('read-aloud demo: pick a language, tap the speaker, tap again to stop', async ({ page }) => {
  // Fake speech so the test never depends on the machine's voices.
  await page.addInitScript(() => {
    window.__spoken = []
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
