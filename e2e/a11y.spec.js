// Shell accessibility: skip link, page titles, focus and scroll after navigation.
import { test, expect } from './fixtures.js'
import { switchLanguage } from './helpers/auth.js'

test('skip link jumps past the navigation @a11y', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari only tabs to links with a system setting')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible() // the app shows once the first page has loaded
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('tab title names the page in the chosen language @i18n', async ({ page }) => {
  await page.goto('/scan?type=medication')
  await expect(page).toHaveTitle('Scan a label or bill · Ah Ma Ah Gong Can')
  await switchLanguage(page, '中文')
  await expect(page).toHaveTitle(/^扫描/)
})

test('a new page opens at the top with its heading focused @a11y', async ({ page }) => {
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

test('a page change on a phone is instant: the new page starts at the top and only fades up quickly', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone tab bar')
  // Phones skip the page transition (it held every tap for about half a second on a slower phone).
  await page.addInitScript(() => {
    window.__transitions = 0
    const start = document.startViewTransition?.bind(document)
    if (start) document.startViewTransition = (update) => (window.__transitions++, start(update))
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
  await page.locator('.nav').getByRole('link', { name: 'Scan', exact: true }).click()
  await expect(page).toHaveURL(/\/scan$/)
  expect(await page.evaluate(() => scrollY)).toBe(0) // at the top straight away, no jump
  expect(await page.evaluate(() => window.__transitions)).toBe(0)
  await expect.poll(() => page.locator('#main').evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  await page.goBack()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100) // Back returns to where Home was
})
