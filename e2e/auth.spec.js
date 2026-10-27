// Accounts: every page needs one. Login (with Remember me), signup with date of birth and citizenship, the Account page,
// and the Bill page filling in its subsidy questions from the account. The auth API is mocked (see helpers/auth.js).
import { test, expect } from './fixtures.js'
import AxeBuilder from '@axe-core/playwright'
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
    await page.getByTestId('account-logout-yes').click() // asks first (H5)
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
    await page.getByTestId('signup-income').selectOption('1501to2300')
    await page.getByTestId('signup-submit').click()
    expect((await sent).postDataJSON()).toEqual({
      name: 'Lim Ah Huat', email: 'ahhuat@example.com', password: 'password123', dob: '1958-11-02', citizenship: 'became', citizenSince: 1975, income: '1501to2300', remember: true, language: 'en',
    })
    await expect(page).toHaveURL(/\/scan$/)
  })

  for (const colorScheme of ['light', 'dark']) {
    test(`Log in and Create account have no WCAG A/AA violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      const bad = []
      for (const path of ['/login', '/signup']) {
        await page.goto(path)
        await page.waitForLoadState('networkidle') // dev styles arrive just after load
        if (path === '/signup') await page.getByTestId('signup-submit').click() // with every error showing
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        bad.push(...violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`))
      }
      expect(bad).toEqual([])
    })
  }

  test('a forgotten password is not a dead end, and an ended login says why (H9, H1)', async ({ page }) => {
    await page.goto('/login?expired=1')
    await expect(page.getByTestId('login-error')).toHaveText(/You were logged out. Please log in again./)
    await page.getByText('Forgot your password?').click()
    await expect(page.getByTestId('login-forgot')).toContainText('Ask the family member who helped set up your account')
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
  await expect(page.getByTestId('account-income')).toContainText('$1,500 or less')
  if (!isMobile) await expect(page.locator('.acct')).toHaveAttribute('aria-current', 'page')

  await page.getByTestId('account-edit').click()
  await page.getByTestId('account-edit-citizenship').selectOption('became')
  await page.getByTestId('account-edit-year').fill('1970')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-toast')).toHaveText('Settings saved')
  await expect(page.getByTestId('account-toast')).toHaveCount(0, { timeout: 4500 }) // fades after 3 seconds
  await expect(page.getByTestId('account-citizenship')).toContainText('Singapore citizen since 1970')

  // A PR is not asked about income (CHAS is for citizens), and it disappears from the details.
  await page.getByTestId('account-edit').click()
  await page.getByTestId('account-edit-citizenship').selectOption('pr')
  await expect(page.getByTestId('account-edit-income')).toHaveCount(0)
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-income')).toHaveCount(0)

  await page.getByTestId('account-logout').click()
  await page.getByTestId('account-logout-yes').click() // asks first (H5)
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/scan')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('language: chosen on the welcome page becomes the account language at signup', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await mockAuth(page)
  await page.goto('/welcome')
  await page.getByTestId('landing-nav').getByRole('link', { name: /Try me out/ }).first().waitFor()
  await page.evaluate(() => localStorage.setItem('locale', 'zh')) // as tapping 中文 on the welcome page does
  const sent = page.waitForRequest('**/api/auth/signup')
  await page.goto('/signup')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/创建|账户|帐户/)
  await page.getByTestId('signup-name').fill('Lim Ah Huat')
  await page.getByTestId('signup-email').fill('ahhuat@example.com')
  await page.getByTestId('signup-password').fill('password123')
  await page.getByTestId('signup-dob').fill('1958-11-02')
  await page.getByTestId('signup-citizenship').selectOption('pr')
  await page.getByTestId('signup-submit').click()
  expect((await sent).postDataJSON().language).toBe('zh')
  await page.close()
})

test('language: logging in on a new device switches to the account language', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await mockAuth(page, { ...DEMO_USER, language: 'ta' })
  await login(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
  await page.close()
})

test('language: picked on the login page wins over the account language, and is saved to the account', async ({ browser }) => {
  const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })
  await mockAuth(page, { ...DEMO_USER, language: 'zh' })
  const patches = []
  page.on('request', (r) => r.url().includes('/api/auth/me') && r.method() === 'PATCH' && patches.push(r.postDataJSON()))
  await page.addInitScript(() => localStorage.getItem('locale') || localStorage.setItem('locale', 'zh')) // this device was in Chinese
  await page.goto('/login')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await fillLogin(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect.poll(() => patches).toEqual([{ language: 'en' }])
  await page.close()
})

test('language: changing it on Account saves it, says "Settings saved", and so does the switcher anywhere else', async ({ page }) => {
  const patches = []
  page.on('request', (r) => r.url().includes('/api/auth/me') && r.method() === 'PATCH' && patches.push(r.postDataJSON()))
  await page.goto('/account')
  await expect.poll(() => patches).toEqual([{ language: 'en' }]) // an account with no language yet gets this device's
  await page.getByTestId('account-language').getByRole('button', { name: 'Bahasa Melayu' }).click()
  await expect(page.getByTestId('account-toast')).toHaveText('Tetapan disimpan')
  await expect(page.getByTestId('account-language').getByRole('button', { name: 'Bahasa Melayu' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => patches.at(-1)).toEqual({ language: 'ms' })

  // The header or sidebar switcher saves it too (no message there: it is not the settings page).
  await page.goto('/')
  await page.getByRole('button', { name: '中文', exact: true }).first().click()
  await expect.poll(() => patches.at(-1)).toEqual({ language: 'zh' })
  await page.getByRole('button', { name: 'EN', exact: true }).first().click()
})

test('Log out asks first, so one stray tap does not log a senior out (H5)', async ({ page }) => {
  await page.goto('/account')
  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-logout-ask')).toContainText('Log out of this phone or computer?')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/account$/) // still logged in
  await expect(page.getByTestId('account-logout')).toBeVisible()
})

test('the Bill page checks subsidies from the account, and links to Account to change the details', async ({ page }) => {
  await page.goto('/bill')
  await page.getByRole('button', { name: /Tampines/ }).click()
  await page.getByText('Press here to see more').click()
  await expect(page.getByTestId('bill-basis')).toContainText('born 1952, Singapore citizen (by birth)')
  // Born 1952, citizen by birth: Merdeka Generation. Income $1,500 or less: a CHAS Blue card.
  await expect(page.locator('[data-rule="merdeka"]')).toContainText('You may qualify')
  await expect(page.getByTestId('chas-card')).toHaveText('Likely a CHAS Blue card')
  await page.getByTestId('bill-basis').getByRole('link', { name: 'Change my details' }).click()
  await expect(page).toHaveURL(/\/account$/)
})

test('details from a different account give its own result', async ({ page }) => {
  await signIn(page, { ...DEMO_USER, dob: '1946-05-01', citizenship: 'became', citizenSince: 1980 })
  await page.goto('/bill')
  await page.getByRole('button', { name: /Bedok/ }).click()
  await page.getByText('Press here to see more').click()
  await expect(page.getByTestId('bill-basis')).toContainText('born 1946, Singapore citizen since 1980')
  await expect(page.locator('[data-rule="pioneer"]')).toContainText('You may qualify') // born by 1949, citizen by 1986
})
