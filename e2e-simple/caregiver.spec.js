// Caregiver: 6 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

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

test("a caregiver accepts an invite and sees the senior's doses today", async ({
  page,
  browser,
}) => {
  // The senior puts Metformin on the schedule and makes an invite link.
  await signUp(page, { name: 'Mei Ling' })
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.getByRole('link', { name: 'Add to schedule' }).click()
  await page.goto('/account')
  await page.getByTestId('care-invite').click()
  await page.getByTestId('care-invite-create').click()
  const link = await page.getByTestId('care-invite-link').inputValue()
  // The caregiver, in their own browser, opens the link and accepts.
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const caregiver = await context.newPage()
  await signUp(caregiver, { name: 'Wei Ling', role: 'caregiver' })
  await caregiver.goto(link)
  await caregiver.getByTestId('invite-accept').click()
  await expect(caregiver).toHaveURL(/\/care\/.+/) // accepting opens the senior's page
  await expect(caregiver.getByTestId('care-doses')).toContainText('Metformin')
  await context.close()
})
