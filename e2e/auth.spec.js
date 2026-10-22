// Accounts: every page needs one. Login (with Remember me), signup with date of birth and citizenship, the Account page,
// and the Bill page filling in its subsidy questions from the account. The auth API is mocked (see helpers/auth.js).
import { test, expect } from './fixtures.js'
import { DEMO_USER, mockAuth, mockWrongLogin, fillLogin, login, signIn } from './helpers/auth.js'

test.describe('logged out', () => {
  test.use({ loggedIn: false })

  test('every app page sends you to log in, then back to the page you wanted', async ({ page }) => {
    await mockAuth(page)
    for (const path of ['/scan', '/bill', '/ask', '/account']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`/login\\?next=(%2F|/)${path.slice(1)}$`))
    }
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/history')
    await fillLogin(page) // already on the login page, so do not navigate again
    await expect(page).toHaveURL(/\/history$/)
  })

  test('share links stay open for family without an account', async ({ page }) => {
    await page.goto('/shared/abc123')
    await expect(page).toHaveURL(/\/shared\/abc123$/)
  })

  test('wrong password shows an error and stays on the login page', async ({ page }) => {
    await mockWrongLogin(page)
    await login(page, 'demo@example.com', 'not-the-password')
    await expect(page.getByTestId('login-error')).toContainText('That email or password is not right.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('Remember me keeps you logged in after the browser closes; without it, only for this visit', async ({ page, context }) => {
    await mockAuth(page)
    await login(page)
    await expect(page).toHaveURL(/\/$/)
    expect(await page.evaluate(() => [Boolean(localStorage.getItem('token')), Boolean(sessionStorage.getItem('token'))])).toEqual([true, false])
    await page.reload()
    await expect(page).toHaveURL(/\/$/) // /api/auth/me recognised the saved token

    // A new tab is like opening the browser again: only a remembered login is still there.
    await page.getByRole('link', { name: 'Account' }).first().click()
    await page.getByTestId('account-logout').click()
    await page.getByTestId('login-email').fill(DEMO_USER.email)
    await page.getByTestId('login-password').fill('password123')
    await page.getByTestId('login-remember').uncheck()
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/$/)
    expect(await page.evaluate(() => [Boolean(localStorage.getItem('token')), Boolean(sessionStorage.getItem('token'))])).toEqual([false, true])
    const fresh = await context.newPage()
    await mockAuth(fresh)
    await fresh.goto('/scan')
    await expect(fresh).toHaveURL(/\/login\?next=/)
  })

  test('signup shows every missing detail at once and calls nothing until they are fixed', async ({ page }) => {
    await mockAuth(page)
    let calls = 0
    page.on('request', (r) => r.url().includes('/api/auth/signup') && calls++)
    await page.goto('/signup')
    await page.getByTestId('signup-password').fill('short')
    await page.getByTestId('signup-submit').click()
    await expect(page.getByTestId('signup-missing')).toBeVisible()
    for (const id of ['signup-name', 'signup-email', 'signup-password', 'signup-dob', 'signup-citizenship']) {
      await expect(page.getByTestId(id)).toHaveAttribute('aria-invalid', 'true')
    }
    await expect(page.getByTestId('signup-name')).toBeFocused() // the first problem
    expect(calls).toBe(0)
  })

  test('signup sends name, email, password, date of birth and citizenship (with the year), then continues', async ({ page }) => {
    await mockAuth(page)
    const sent = page.waitForRequest('**/api/auth/signup')
    await page.goto('/signup?next=/scan')
    await page.getByTestId('signup-name').fill('Lim Ah Huat')
    await page.getByTestId('signup-email').fill('ahhuat@example.com')
    await page.getByTestId('signup-password').fill('password123')
    await page.getByTestId('signup-dob').fill('1958-11-02')
    await page.getByTestId('signup-citizenship').selectOption('became')
    await page.getByTestId('signup-citizen-year').fill('1975')
    await page.getByTestId('signup-submit').click()
    expect((await sent).postDataJSON()).toEqual({
      name: 'Lim Ah Huat', email: 'ahhuat@example.com', password: 'password123', dob: '1958-11-02', citizenship: 'became', citizenSince: 1975, remember: true,
    })
    await expect(page).toHaveURL(/\/scan$/)
  })

  test('login page has no missing translations in any language', async ({ page }) => {
    await page.goto('/login')
    for (const language of ['中文', 'BM', 'தமிழ்', 'EN']) {
      await page.getByRole('button', { name: language, exact: true }).click()
      await expect(page.locator('main')).not.toContainText(/\b(auth|common|errors|pages|account)\.[A-Za-z]+/)
    }
  })
})

test('logged-in people opening Log in go Home instead', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/$/)
})

test('Account shows the details, saves edits and logs out', async ({ page, isMobile }) => {
  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account')
  await expect(page.getByTestId('account-name')).toContainText('Tan Mei Ling')
  await expect(page.getByTestId('account-dob')).toContainText('1952')
  await expect(page.getByTestId('account-citizenship')).toContainText('Singapore citizen (by birth)')
  if (!isMobile) await expect(page.locator('.acct')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('account-edit').click()
  await page.getByTestId('account-edit-citizenship').selectOption('became')
  await page.getByTestId('account-edit-year').fill('1970')
  await page.getByTestId('account-save').click()
  await expect(page.getByText('Your details are saved.')).toBeVisible()
  await expect(page.getByTestId('account-citizenship')).toContainText('Singapore citizen since 1970')

  await page.getByTestId('account-logout').click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/scan')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('the Bill page fills in birth year and citizenship from the account, and they can be changed', async ({ page }) => {
  await page.goto('/bill')
  await page.getByRole('button', { name: /Tampines/ }).click()
  const note = page.getByTestId('from-account')
  await expect(note).toContainText('born 1952, Singapore citizen (by birth)')
  await expect(page.locator('#q-birth')).toHaveValue('1952')
  // Born 1952, citizen by birth: Merdeka Generation.
  await expect(page.locator('[data-rule="merdeka"]')).toContainText('You may qualify')

  // A caregiver checking a parent's bill changes the answers; the note gives way to a button to go back.
  await page.locator('#q-birth').fill('1945')
  await expect(note).toHaveCount(0)
  await page.getByTestId('use-account').click()
  await expect(page.locator('#q-birth')).toHaveValue('1952')
})

test('details from a different account fill in its own year', async ({ page }) => {
  await signIn(page, { ...DEMO_USER, dob: '1946-05-01', citizenship: 'became', citizenSince: 1980 })
  await page.goto('/bill')
  await page.getByRole('button', { name: /Bedok/ }).click()
  await expect(page.getByTestId('from-account')).toContainText('born 1946, Singapore citizen since 1980')
  await expect(page.locator('#q-citizen-year')).toHaveValue('1980')
})
