// The language switch in the app's own bar: one tap from any page, without going to Account. Phones: a row under the
// header; computers: the sidebar's settings group, above Night mode. The same switch as the top bar before logging in.
// The choice is saved to the account (PATCH /api/auth/me), so the app opens in it next time.
import { test, expect } from './fixtures.js'

const sw = (page) => page.locator('.side').getByTestId('lang-switch')

test('from any page: one tap changes the language at once and saves it to the account', async ({
  page,
}) => {
  const saved = []
  page.on(
    'request',
    (r) =>
      r.url().endsWith('/api/auth/me') && r.method() === 'PATCH' && saved.push(r.postDataJSON()),
  )
  await page.goto('/schedule')
  await expect(sw(page).getByRole('button')).toHaveText([/^EN/, '中文', /^BM/, 'தமிழ்']) // the full name follows, for screen readers
  await expect(sw(page).getByRole('button', { name: /^EN\b/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await sw(page).getByRole('button', { name: '中文' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
  await expect(page).toHaveURL(/\/schedule$/) // stays on the page
  await expect(sw(page).getByRole('button', { name: '中文' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect.poll(() => saved).toContainEqual({ language: 'zh' })

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
  await sw(page).getByRole('button', { name: /^BM\b/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms')
})

test('screen readers hear each language in full; the short label starts the name', async ({
  page,
}) => {
  await page.goto('/')
  for (const name of ['EN English', 'BM Bahasa Melayu', '中文', 'தமிழ்'])
    await expect(sw(page).getByRole('button', { name, exact: true })).toBeVisible()
})

test('phones: a full row under the header, big buttons, in view; computers: the sidebar, above Night mode', async ({
  page,
  isMobile,
}) => {
  await page.goto('/')
  const box = await sw(page).boundingBox()
  const buttons = await sw(page)
    .getByRole('button')
    .evaluateAll((els) => els.map((b) => b.getBoundingClientRect()))
  for (const b of buttons) expect(b.height).toBeGreaterThanOrEqual(44)
  const night = await page.locator('.theme-box').boundingBox()
  if (isMobile) {
    const viewport = page.viewportSize()
    expect(box.y).toBeLessThan(200) // near the top, seen on arrival
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width) // all four fit
    expect(box.y).toBeGreaterThan(night.y) // under the name, day/night and Account
  } else {
    expect(box.y + box.height).toBeLessThanOrEqual(night.y) // above Night mode
    await expect(page.locator('.lang-label')).toHaveText('Language')
  }
})

test.describe('before logging in', () => {
  test.use({ loggedIn: false })
  test('the top bar has the same switch', async ({ page }) => {
    await page.goto('/start')
    await expect(page.getByTestId('lang-switch').getByRole('button')).toHaveText([
      /^EN/,
      '中文',
      /^BM/,
      'தமிழ்',
    ]) // the full name follows, for screen readers
    await page.getByTestId('lang-switch').getByRole('button', { name: 'தமிழ்' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
  })
})
