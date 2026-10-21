// Ask (feature 6) usability checks from docs/heuristic-audit.md: loading state, friendly errors, form validation, axe.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const answer = (text) => ({ ok: true, data: { type: 'ANSWER', answer: text, askPharmacist: false } })
const fail = (code) => ({ ok: false, error: { code, message: 'technical detail the user must not see' } })

// WCAG 2.1 A + AA only; best-practice rules are advice, not failures.
async function expectNoA11yViolations(page) {
  // The dev server adds page styles a moment after load; check colours only once they have all arrived (as in landing.spec.js).
  await page.waitForLoadState('networkidle')
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual([])
}

test('a "Thinking…" state shows while the answer is on its way, and Ask is disabled', async ({ page }) => {
  let release
  const held = new Promise((resolve) => (release = resolve))
  await page.route('**/api/chat', async (route) => {
    await held
    await route.fulfill({ json: answer('Take it after your meal.') })
  })
  await page.goto('/ask')
  await page.getByLabel('Or type your own question').fill('When do I take it?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByTestId('ask-loading')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
  release()
  await expect(page.getByTestId('ask-answer')).toContainText('Take it after your meal.')
  await expect(page.getByTestId('ask-loading')).toBeHidden()
})

test('a failed question shows a plain message with Try again, never the technical error', async ({ page }) => {
  const replies = [fail('BAD_REQUEST'), answer('Keep them in a cool, dry place.')]
  await page.route('**/api/chat', (route) => route.fulfill({ json: replies.shift() }))
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('We couldn’t send that question')
  await expect(alert).not.toContainText('technical detail')
  await expect(alert).not.toContainText('BAD_REQUEST')
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('ask-answer')).toContainText('Keep them in a cool, dry place.')
})

test('offline shows the connection message', async ({ page }) => {
  await page.route('**/api/chat', (route) => route.abort())
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await expect(page.getByRole('alert')).toContainText('Cannot connect')
})

test('adding a medicine without a name says what is missing', async ({ page }) => {
  await page.goto('/ask')
  await page.getByRole('button', { name: /^My medicines/ }).click()
  await page.getByRole('button', { name: 'Type it in' }).click()
  await page.getByRole('button', { name: 'Add medicine' }).click()
  const name = page.getByLabel('Medicine name')
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Type the medicine name first.')).toBeVisible()
  // Typing a name clears the message; adding works.
  await name.fill('Panadol')
  await expect(page.getByText('Type the medicine name first.')).toBeHidden()
  await page.getByRole('button', { name: 'Add medicine' }).click()
  await expect(page.getByTestId('my-medicines')).toContainText('Panadol')
})

for (const theme of ['light', 'dark']) {
  test(`Ask has no WCAG A/AA violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.route('**/api/chat', (route) => route.fulfill({ json: answer('Keep them in a cool, dry place.') }))
    await page.goto('/ask')
    await expectNoA11yViolations(page) // empty page with starters

    await page.getByRole('button', { name: /^My medicines/ }).click()
    await page.getByRole('button', { name: 'Type it in' }).click()
    await page.getByRole('button', { name: 'How do I store medicines?' }).click()
    await expect(page.getByTestId('ask-answer')).toBeVisible()
    await expectNoA11yViolations(page) // conversation, open medicines panel and form
  })
}
