// Day/night mode: follows the device until the user picks, then remembers the pick.
import { test, expect } from '@playwright/test'

test('follows the device setting by default', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'true')
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
