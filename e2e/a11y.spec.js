// Shell accessibility: skip link, page titles, focus and scroll after navigation.
import { test, expect } from './fixtures.js'

test('skip link jumps past the navigation', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari only tabs to links with a system setting')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible() // the app shows once the first page has loaded
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('tab title names the page in the chosen language', async ({ page }) => {
  await page.goto('/scan?type=medication')
  await expect(page).toHaveTitle('Scan a label or bill · Ah Ma Ah Gong Can')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page).toHaveTitle(/^扫描/)
})

test('a new page opens at the top with its heading focused', async ({ page }) => {
  await page.goto('/scan?type=medication')
  await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  // Bootstrap scrolls smoothly (unless reduced motion is on), so wait for it to arrive.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Check what we read' })).toBeFocused()
})

test('a page change starts the new page at the top straight away (no fade-in scrolled down, then a jump)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone tab bar')
  // Record where the page is scrolled at the moment the page-change animation captures the new page.
  await page.addInitScript(() => {
    const start = document.startViewTransition?.bind(document)
    if (!start) return
    document.startViewTransition = (update) => {
      const transition = start(update)
      transition.ready.then(() => (window.__scrollAtCapture = scrollY), () => {})
      return transition
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  await page.locator('.nav').getByRole('link', { name: 'Scan', exact: true }).click()
  await expect(page).toHaveURL(/\/scan$/)
  // The new page was captured already at the top, so it fades in in place (not scrolled down, then jumping up).
  await expect.poll(() => page.evaluate(() => window.__scrollAtCapture)).toBe(0)
  await expect(page.locator('.nav')).toHaveCSS('view-transition-name', 'tabs') // the tab bar stays on top of the page change
  await page.goBack()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100) // Back returns to where Home was
})
