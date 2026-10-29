// Forgot your password? → email → choose a new password (docs/auth-contract.md). The auth API is mocked here; the real
// flow against a disposable MongoDB is in e2e/auth-api.spec.js.
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { DEMO_USER, testToken } from './helpers/auth.js'

test.use({ loggedIn: false })

const mockForgot = (page, answer = { json: { ok: true, data: { minutes: 30 } } }) => {
  const sent = []
  page.route('**/api/auth/forgot', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill(answer)
  })
  return sent
}

test('Forgot your password? on Log in carries the email over and says to check it, whether or not an account uses it', async ({ page }) => {
  const sent = mockForgot(page)
  await page.goto('/login')
  await page.getByTestId('login-email').fill('mei@example.com')
  await page.getByTestId('login-forgot').click()
  await expect(page).toHaveURL(/\/forgot$/) // the email is never in the address
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forgot your password?')
  await expect(page.getByTestId('forgot-email')).toHaveValue('mei@example.com')

  await page.getByTestId('forgot-submit').click()
  await expect(page.getByTestId('forgot-sent')).toContainText('Check your email')
  await expect(page.getByTestId('forgot-sent')).toContainText('If an account uses mei@example.com')
  await expect(page.getByTestId('forgot-sent')).toContainText('30 minutes')
  await expect(page.getByTestId('forgot-sent')).toBeFocused() // screen readers hear it next
  expect(sent).toEqual([{ email: 'mei@example.com', language: 'en' }])

  await page.getByTestId('forgot-again').click()
  await expect(page.getByTestId('forgot-again-done')).toHaveText('Sent again. Use the newest email.')
  expect(sent).toHaveLength(2)
  await page.getByTestId('forgot-back').click()
  await expect(page).toHaveURL(/\/login$/)
})

test('Forgot: a typo is caught before sending, and too many links for one email says to wait an hour', async ({ page }) => {
  const sent = mockForgot(page, { status: 429, json: { ok: false, error: { code: 'RATE_LIMITED', message: '' } } })
  await page.goto('/forgot')
  await page.getByTestId('forgot-email').fill('mei@example')
  await page.getByTestId('forgot-submit').click()
  await expect(page.getByTestId('forgot-email')).toHaveAttribute('aria-invalid', 'true')
  expect(sent).toHaveLength(0)
  await page.getByTestId('forgot-email').fill('mei@example.com')
  await page.getByTestId('forgot-submit').click()
  await expect(page.getByTestId('forgot-error')).toHaveText('We’ve already sent several links to this email. Please wait an hour, then try again.')
})

test('Reset: the link is taken out of the address, the new password logs this device in, then Continue goes Home', async ({ page }) => {
  let body
  await page.route('**/api/auth/reset', (route) => {
    body = route.request().postDataJSON()
    return route.fulfill({ json: { ok: true, data: { token: testToken(), user: { ...DEMO_USER, role: 'senior' } } } })
  })
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { ok: true, data: { user: { ...DEMO_USER, role: 'senior' } } } }))
  await page.goto('/reset#token=link.from.email')
  await expect(page).toHaveURL(/\/reset$/) // single-use link: not left in history
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a new password.')

  await page.getByTestId('reset-password').fill('short')
  await page.getByTestId('reset-submit').click()
  await expect(page.getByText('Your password needs at least 8 characters.')).toBeVisible()
  expect(body).toBeUndefined()

  await page.getByTestId('reset-password').fill('brand-new-pass')
  await page.getByTestId('reset-toggle').click()
  await expect(page.getByTestId('reset-password')).toHaveAttribute('type', 'text') // can check what they typed
  await page.getByTestId('reset-submit').click()
  await expect(page.getByTestId('reset-done')).toContainText('Password changed')
  expect(body).toEqual({ token: 'link.from.email', password: 'brand-new-pass', remember: true })
  await page.getByTestId('reset-continue').click()
  await expect(page).toHaveURL(/localhost:5173\/$/)
})

test('Reset: an expired or used link, or none, offers a new link instead of a dead end', async ({ page }) => {
  await page.route('**/api/auth/reset', (route) => route.fulfill({ status: 400, json: { ok: false, error: { code: 'RESET_LINK_INVALID', message: '' } } }))
  await page.goto('/reset#token=old.used.link')
  await page.getByTestId('reset-password').fill('brand-new-pass')
  await page.getByTestId('reset-submit').click()
  await expect(page.getByTestId('reset-bad')).toContainText('This link has expired or was already used')
  await page.goto('/reset') // no link at all
  await expect(page.getByTestId('reset-bad')).toBeVisible()
  await page.getByTestId('reset-new-link').click()
  await expect(page).toHaveURL(/\/forgot$/)
})

test('Forgot and Reset have no missing translations in any language', async ({ page }) => {
  mockForgot(page)
  for (const path of ['/forgot', '/reset#token=a.b.c', '/reset']) {
    await page.goto(path)
    for (const language of ['中文', 'BM', 'தமிழ்', 'EN']) {
      await page.getByRole('button', { name: language, exact: true }).click()
      await expect(page.locator('main')).not.toContainText(/\b(auth|common|errors|pages)\.[A-Za-z.]+/)
    }
  }
})

for (const colorScheme of ['light', 'dark']) {
  test(`Forgot and Reset have no WCAG A/AA violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), colorScheme)
    mockForgot(page)
    const bad = []
    const check = async (where) => {
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      bad.push(...violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`))
    }
    await page.goto('/forgot')
    await check('forgot')
    await page.getByTestId('forgot-email').fill('mei@example.com')
    await page.getByTestId('forgot-submit').click()
    await expect(page.getByTestId('forgot-sent')).toBeVisible()
    await check('sent')
    await page.goto('/reset#token=a.b.c')
    await check('reset')
    await page.goto('/reset')
    await check('bad link')
    expect(bad).toEqual([])
  })
}
