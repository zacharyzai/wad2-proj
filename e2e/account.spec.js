// Account page: editing details (bad input, Cancel, a failed save, reload) and senior-friendly layout.
// Saves go to the fake /api/auth/me from helpers/auth.js; tests that count saves watch for PATCH requests.
import { test, expect } from './fixtures.js'
import { expectNoAxeViolations, expectSeniorFriendly } from './helpers/checks.js'

const thisYear = new Date().getFullYear()

async function openEdit(page) {
  await page.goto('/account')
  await page.getByTestId('account-edit').click()
}

// Profile saves only: logging in also PATCHes the language when the account has none (stores/auth.js).
function countSaves(page) {
  const saves = []
  page.on('request', (r) => r.url().includes('/api/auth/me') && r.method() === 'PATCH' && 'name' in r.postDataJSON() && saves.push(r))
  return saves
}

test('a citizenship year in the future, or before birth, is explained and nothing is saved', async ({ page }) => {
  const saves = countSaves(page)
  await openEdit(page)
  await page.getByTestId('account-edit-citizenship').selectOption('became')
  const message = page.getByRole('alert').filter({ hasText: 'Type a year' })
  for (const year of [String(thisYear + 1), '1900']) {
    await page.getByTestId('account-edit-year').fill(year)
    await expect(message).toHaveText(`Type a year from your birth year to ${thisYear}.`)
    await page.getByTestId('account-save').click()
  }
  await expect(page.getByTestId('account-edit-year')).toBeVisible() // still editing
  expect(saves).toHaveLength(0)
})

test('an empty name is explained and nothing is saved', async ({ page }) => {
  const saves = countSaves(page)
  await openEdit(page)
  await page.getByTestId('account-edit-name').fill('   ')
  await expect(page.getByRole('alert').filter({ hasText: 'Please type your name.' })).toBeVisible()
  await page.getByTestId('account-save').click()
  expect(saves).toHaveLength(0)
})

test('Cancel throws away edits', async ({ page }) => {
  await openEdit(page)
  await page.getByTestId('account-edit-name').fill('Someone Else')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('account-name')).toContainText('Tan Mei Ling')
  await page.getByTestId('account-edit').click()
  await expect(page.getByTestId('account-edit-name')).toHaveValue('Tan Mei Ling')
})

test('a save that cannot reach the server says so plainly and keeps what was typed', async ({ page }) => {
  await openEdit(page)
  await page.route('**/api/auth/me', (route) => (route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.fallback()))
  await page.getByTestId('account-edit-name').fill('Tan Mei Mei')
  await page.getByTestId('account-save').click()
  await expect(page.getByRole('alert').filter({ hasText: 'Cannot connect' })).toHaveText('Cannot connect. Please check your internet connection.')
  await expect(page.getByTestId('account-edit-name')).toHaveValue('Tan Mei Mei')
})

test('saved details are still there after a reload', async ({ page }) => {
  await openEdit(page)
  await page.getByTestId('account-edit-name').fill('Tan Mei Mei')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-toast')).toHaveText('Settings saved')
  await page.reload()
  await expect(page.getByTestId('account-name')).toContainText('Tan Mei Mei')
})

test('usable: big targets and text, no axe problems, on the page and in the edit form @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/account')
  await expectSeniorFriendly(page)
  await expectNoAxeViolations(page)
  await page.getByTestId('account-edit').click()
  await expectSeniorFriendly(page)
  await expectNoAxeViolations(page)
})
