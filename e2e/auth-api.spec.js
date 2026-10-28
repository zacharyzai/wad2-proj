// Current main UI against a real disposable MongoDB and Express server, never Atlas.
import { test as base, expect } from '@playwright/test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mongoose from 'mongoose'

const test = base.extend({
  authBackend: [async ({}, use) => {
    process.env.JWT_SECRET = randomBytes(48).toString('hex')
    process.env.USE_MOCK_AI = 'true'
    const mongo = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongo.getUri('auth_browser_test')
    let server
    try {
      const { default: app } = await import('../server/app.js')
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      await use(`http://127.0.0.1:${server.address().port}`)
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await mongoose.disconnect()
      await mongo.stop()
    }
  }, { scope: 'worker' }],
})

async function fillSignup(page, email, password) {
  await page.getByTestId('signup-name').fill('Browser Test Citizen')
  await page.getByTestId('signup-email').fill(email)
  await page.getByTestId('signup-password').fill(password)
  await page.getByTestId('signup-dob').fill('1952-03-07')
  await page.getByTestId('signup-citizenship').selectOption('birth')
  await page.getByTestId('signup-income').selectOption('upTo1500')
  await page.getByTestId('signup-submit').click()
}

test('real profile signup, account editing, session restoration and protected scan', async ({ page, authBackend }) => {
  // Redirect transport only: authentication, MongoDB and every API handler remain real.
  await page.route('http://localhost:5173/api/**', async (route) => {
    const original = new URL(route.request().url())
    const response = await route.fetch({ url: `${authBackend}${original.pathname}${original.search}` })
    await route.fulfill({ response })
  })
  const email = `browser-${randomUUID()}@example.com`
  const password = 'browser-password123'
  await page.goto('/signup?next=/account')
  await fillSignup(page, email, password)
  await expect(page).toHaveURL('http://localhost:5173/account')
  await expect(page.getByTestId('account-name')).toContainText('Browser Test Citizen')
  await page.reload()
  await expect(page.getByTestId('account-email')).toContainText(email)
  expect(await page.evaluate(() => Boolean(localStorage.getItem('token')))).toBe(true)

  await page.getByTestId('account-edit').click()
  await page.getByTestId('account-edit-name').fill('Updated Browser Citizen')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-name')).toContainText('Updated Browser Citizen')
  await page.reload()
  await expect(page.getByTestId('account-name')).toContainText('Updated Browser Citizen')
  await page.getByTestId('account-logout').click()
  await page.getByTestId('account-logout-yes').click() // asks first (H5)

  await page.goto('/signup')
  await fillSignup(page, email, password)
  await expect(page.getByTestId('signup-error')).toBeVisible()
  await page.goto('/login?next=/scan')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill('wrong-password')
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toBeVisible()
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-remember').uncheck()
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('http://localhost:5173/scan')
  expect(await page.evaluate(() => [Boolean(localStorage.getItem('token')), Boolean(sessionStorage.getItem('token'))])).toEqual([false, true])
  await page.reload()
  await expect(page).toHaveURL('http://localhost:5173/scan')
  // A new account is asked day or night once, on its first Scan or Home (e2e/theme.spec.js); keep day mode and go on.
  await page.getByTestId('theme-prompt-next').click()
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await expect(page).toHaveURL('http://localhost:5173/scan/confirm')
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
})
