// Beginner's guide ("How to use the app"): a welcome card, then it points at real buttons (nav ones must be tapped) across
// Scan, Bill, Ask and Account, then a finish card. Shown once on the first Home or Scan visit; Skip/Esc any time; reopen any time.
// Other specs start with the guide already seen (playwright.config.js); these start as someone who has never seen it.
import { test, expect } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'

// Clear the "seen" flag once per test (not on every page load, so "it doesn't come back" can be tested).
test.beforeEach(({ page }) =>
  page.addInitScript(() => {
    if (sessionStorage.getItem('guide-test')) return
    sessionStorage.setItem('guide-test', '1')
    localStorage.removeItem('amag.tour')
  }),
)

const guide = (page) => page.getByTestId('guide')
const title = (page) => page.locator('#guide-title')
const stepText = (page, n) => expect(page.getByText(`Step ${n} of 9`)).toBeVisible()

// From the welcome card to the finish card using "Take me there" and Next (no hunting for buttons).
async function walkToFinish(page) {
  await page.getByTestId('guide-next').click() // welcome → Tap Scan
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('guide-there').click() // tap step → its page
    if (i < 3) await page.getByTestId('guide-next').click() // look step → next tap step
  }
  await expect(title(page)).toHaveText('You are ready')
}

test('first visit: welcome card, then it points at the real buttons and waits for a tap on each', async ({ page }) => {
  await page.goto('/')
  await expect(title(page)).toHaveText('Your language, read aloud')
  await expect(title(page)).toBeFocused()
  await stepText(page, 1)
  await expect(page.locator('.shell')).toHaveAttribute('inert', '') // the card blocks the page

  await page.getByTestId('guide-next').click()
  await expect(title(page)).toHaveText('Tap Scan')
  await expect(page.getByTestId('guide-coach')).toBeVisible()
  await expect(page.locator('.shell')).not.toHaveAttribute('inert')
  // Taps anywhere else are blocked: still on Home, still on this step.
  await page.mouse.click(innerWidthOf(page) - 40, 400)
  await expect(page).toHaveURL(/\/$/)
  await expect(title(page)).toHaveText('Tap Scan')

  // The real Scan button opens Scan and the guide moves on to its key button.
  await page.locator('[data-guide="/scan"]').click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(title(page)).toHaveText('Take a photo of the label')
  await stepText(page, 3)
  await page.getByTestId('guide-next').click()

  await expect(title(page)).toHaveText('Tap Bill')
  await page.locator('[data-guide="/bill"]').click()
  await expect(page).toHaveURL(/\/bill$/)
  await expect(title(page)).toHaveText('Try a sample bill')
  await page.getByTestId('guide-next').click()

  await expect(title(page)).toHaveText('Tap Ask')
  await page.locator('[data-guide="/ask"]').click()
  await expect(page).toHaveURL(/\/ask$/)
  await expect(title(page)).toHaveText('Type your question here')
  await page.getByTestId('guide-next').click()

  await expect(title(page)).toHaveText('Tap Account')
  await page.locator('[data-guide="/account"]').click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(title(page)).toHaveText('You are ready')
  await stepText(page, 9)

  await page.getByTestId('guide-start').click()
  await expect(guide(page)).toHaveCount(0)
  await expect(page.getByTestId('guide-toast')).toContainText('You are ready. Open this again from "How to use the app".')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(guide(page)).toHaveCount(0)
})

// The page's width, for a tap well away from the glowing button.
function innerWidthOf(page) {
  return page.viewportSize().width
}

test('"Take me there" does the tap for you', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('guide-next').click()
  await page.getByTestId('guide-there').click()
  await expect(page).toHaveURL(/\/scan$/)
  await expect(title(page)).toHaveText('Take a photo of the label')
})

test('Skip or Esc end it at any step; the closing message fades after a few seconds', async ({ page }) => {
  await page.goto('/scan')
  await page.getByTestId('guide-next').click()
  await page.keyboard.press('Escape')
  await expect(guide(page)).toHaveCount(0)
  await expect(page.getByTestId('guide-toast')).toContainText('Closed. Open it again from "How to use the app".')
  await expect(page.getByTestId('guide-toast')).toHaveCount(0, { timeout: 4500 }) // gone after 3 seconds
})

test('the language buttons on the welcome card switch the app; tap steps name the button in that language', async ({ page }) => {
  await page.goto('/')
  await guide(page).getByRole('button', { name: '中文' }).click()
  await expect(title(page)).toHaveText('选择语言，朗读页面')
  await expect(page.getByText('第 1 步，共 9 步')).toBeVisible()
  await page.getByTestId('guide-next').click()
  await expect(title(page)).toHaveText('点击“扫描”') // the same word as the Scan button
  await page.getByTestId('guide-skip').click()
  await page.getByRole('button', { name: 'EN', exact: true }).first().click()
})

test('the finish card: "Try a sample label" opens a sample', async ({ page }) => {
  await page.goto('/')
  await walkToFinish(page)
  await page.getByTestId('guide-sample').click()
  await expect(page).toHaveURL(/\/scan\/confirm$/)
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
  await expect(guide(page)).toHaveCount(0)
})

test('arriving mid-task (another page first) waits, then shows on Home', async ({ page }) => {
  await page.goto('/bill')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bill breakdown')
  await expect(guide(page)).toHaveCount(0)
  await page.goto('/scan') // deferred: only Home shows it now
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(guide(page)).toHaveCount(0)
  await page.goto('/')
  await expect(guide(page)).toBeVisible()
})

test('it can be opened again any time: sidebar on desktop, Account on every screen', async ({ page, isMobile }) => {
  await page.goto('/account') // not Home or Scan, so the guide waits
  await expect(guide(page)).toHaveCount(0)
  await page.getByTestId('account-guide').click()
  await expect(title(page)).toHaveText('Your language, read aloud')
  await page.getByTestId('guide-skip').click()
  if (!isMobile) {
    await page.getByTestId('open-guide').click()
    await expect(guide(page)).toBeVisible()
    await page.getByTestId('guide-skip').click()
    await expect(guide(page)).toHaveCount(0)
  }
})

test('the speaker reads the step and can be stopped', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spoken = []
    window.speechSynthesis.getVoices = () => [{ lang: 'en-SG', name: 'English' }]
    window.speechSynthesis.speak = (u) => window.__spoken.push({ text: u.text, lang: u.lang })
  })
  await page.goto('/')
  const speak = page.getByTestId('guide-speak')
  await speak.click()
  await expect(speak).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => window.__spoken)).toEqual([
    { text: 'Your language, read aloud. Pick your language, and tap a speaker to hear a page read aloud. Next, we will show you the main buttons.', lang: 'en-SG' },
  ])
  await speak.click()
  await expect(speak).toHaveAttribute('aria-pressed', 'false')
})

test('no speaker when this device has no voice for the language (no English voice reading Tamil as "dot")', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'ta')
    window.speechSynthesis.getVoices = () => [{ lang: 'en-SG', name: 'English' }]
  })
  await page.goto('/')
  await expect(guide(page)).toBeVisible()
  await expect(page.getByTestId('guide-speak')).toHaveCount(0)
})

for (const colorScheme of ['light', 'dark']) {
  test(`the guide has no WCAG A/AA violations: card, pointing step, finish (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const bad = []
    const check = async (where) => {
      const { violations } = await new AxeBuilder({ page }).include('[data-testid="guide"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      bad.push(...violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`))
    }
    await check('welcome')
    await page.getByTestId('guide-next').click()
    await check('tap Scan')
    await page.getByTestId('guide-skip').click()
    await page.getByTestId('guide-toast').getByRole('button').click() // Show again
    await walkToFinish(page)
    await check('finish')
    expect(bad).toEqual([])
  })
}
