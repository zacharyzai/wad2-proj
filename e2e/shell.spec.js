// App shell: the 404 page, and axe + senior-friendly layout on the main pages not covered by their own specs.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolations, expectSeniorFriendly, expectVisibleFocus } from './helpers/checks.js'

test('an unknown address shows a friendly page with a way Home @smoke', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('We can’t find that page')
  await expect(page.getByText('Nothing you saved has been lost.')).toBeVisible()
  await page.getByRole('link', { name: 'Go to home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test.describe('logged out', () => {
  test.use({ loggedIn: false })
  test('the 404 page is open to everyone, and Home leads to Start', async ({ page }) => {
    await page.goto('/old/link')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We can’t find that page')
    await page.getByRole('link', { name: 'Go to home' }).click()
    await expect(page).toHaveURL(/\/start$/)
  })
})

test('404 works by keyboard: Go to home shows its focus ring and opens with Enter', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard: desktop')
  await page.goto('/no-such-page')
  const home = page.getByRole('link', { name: 'Go to home' })
  await home.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expectVisibleFocus(home)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)
})

// Pages whose own specs have no axe or size check. /scan?sample opens Confirm.
for (const path of ['/', '/scan', '/scan?sample=med-1', '/history', '/no-such-page']) {
  test(`${path}: big targets and text, no axe problems @a11y`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectSeniorFriendly(page)
    await expectNoAxeViolations(page)
  })
}
