// Caregiver: 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp } from './helpers.js'

test('a senior has no My seniors tab', async ({ page }) => {
  await signUp(page)
  await expect(page.getByRole('link', { name: 'My seniors' })).toHaveCount(0)
})

test("a senior's Account page has a caregiver card", async ({ page }) => {
  await signUp(page)
  await page.goto('/account')
  await expect(page.getByTestId('care-invite')).toBeVisible()
})

test('a senior can make an invite link', async ({ page }) => {
  await signUp(page)
  await page.goto('/account')
  await page.getByTestId('care-invite').click()
  await page.getByTestId('care-invite-create').click()
  await expect(page.getByTestId('care-invite-link')).toHaveValue(/\/shared\//)
  await expect(page.getByTestId('care-invite-whatsapp')).toBeVisible()
})

test('a caregiver sees My seniors', async ({ page }) => {
  await signUp(page, { name: 'Wei Ling', role: 'caregiver' })
  await expect(page.getByRole('link', { name: 'My seniors' }).first()).toBeVisible()
})

test('a caregiver with no seniors is told what to do', async ({ page }) => {
  await signUp(page, { name: 'Wei Ling', role: 'caregiver' })
  await page.goto('/care')
  await expect(page.getByRole('heading', { name: 'No one linked yet' })).toBeVisible()
})
