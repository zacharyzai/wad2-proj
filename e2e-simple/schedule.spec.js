// Schedule: 5 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

// Checks a sample label and adds it to the schedule (Explain has an "Add to schedule" button).
async function addToSchedule(page, sample) {
  await openSample(page, sample)
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.getByRole('link', { name: 'Add to schedule' }).click()
  await expect(page).toHaveURL(/\/schedule/)
}

test('a new account has no medicines', async ({ page }) => {
  await signUp(page)
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: 'No medicines yet' })).toBeVisible()
})

test('a checked label goes on the timetable', async ({ page }) => {
  await signUp(page)
  await addToSchedule(page, 'Metformin label')
  await page.getByTestId('tab-today').click()
  await expect(page.getByTestId('schedule-today')).toContainText('Metformin')
  await expect(page.getByTestId('schedule-today')).toContainText('8:00')
})

test('My medicines shows the medicine', async ({ page }) => {
  await signUp(page)
  await addToSchedule(page, 'Metformin label')
  await page.getByTestId('tab-meds').click()
  await expect(page.getByTestId('med-purpose').first()).toContainText('diabetes')
  await expect(page.getByRole('button', { name: 'Change Metformin 500 mg' })).toBeVisible()
})

test('a when-needed medicine goes to the pharmacist list', async ({ page }) => {
  await signUp(page)
  await addToSchedule(page, 'Cough syrup label')
  await expect(page.getByRole('heading', { name: 'Check with your pharmacist' })).toBeVisible()
  await expect(page.getByText('Cough syrup').first()).toBeVisible()
})

test('delete can be undone', async ({ page }) => {
  await signUp(page)
  await addToSchedule(page, 'Metformin label')
  await page.getByTestId('tab-meds').click()
  await page.getByRole('button', { name: 'Change Metformin 500 mg' }).click()
  await page.getByRole('button', { name: 'Delete Metformin 500 mg from my list' }).click()
  await expect(page.getByRole('button', { name: 'Change Metformin 500 mg' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Change Metformin 500 mg' })).toBeVisible()
})
