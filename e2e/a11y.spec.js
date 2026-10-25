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
  await page.goto('/scan')
  await expect(page).toHaveTitle('Scan a medication label · Ah Ma Ah Gong Can')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page).toHaveTitle(/^扫描/)
})

test('a new page opens at the top with its heading focused', async ({ page }) => {
  await page.goto('/scan')
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  // Bootstrap scrolls smoothly (unless reduced motion is on), so wait for it to arrive.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Check what we read' })).toBeFocused()
})
