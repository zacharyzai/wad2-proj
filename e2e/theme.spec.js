// Day/night mode: always starts in day mode, even on a phone set to dark; the user's pick is remembered.
import { test, expect } from './fixtures.js'

test('starts in day mode even when the device is set to dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.col-main')).not.toHaveCSS('background-color', 'rgb(18, 24, 23)')
})

test('night mode switch is remembered after reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const night = page.getByRole('button', { name: 'Night mode' })
  await expect(night).toHaveAttribute('aria-pressed', 'false')

  await night.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The page background really changes, not just the attribute.
  await expect(page.locator('.col-main')).toHaveCSS('background-color', 'rgb(18, 24, 23)')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Night mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})
