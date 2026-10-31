// Current main UI against a real disposable MongoDB and Express server, never Atlas.
import { test as base, expect } from '@playwright/test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mongoose from 'mongoose'
import { sentMail } from '../server/services/mail.js'

const test = base.extend({
  authBackend: [async ({}, use) => {
    process.env.JWT_SECRET = randomBytes(48).toString('hex')
    process.env.USE_MOCK_AI = 'true'
    for (const name of ['APP_URL', 'MAIL_PROVIDER', 'VERCEL', 'NODE_ENV']) delete process.env[name] // console mail: links to localhost:5173
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
  await page.getByTestId('choose-medication').click() // Scan asks label or bill first
  await page.getByTestId('scan-examples').click() // samples sit behind "Try an example"
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await expect(page).toHaveURL('http://localhost:5173/scan/confirm')
  await expect(page.getByLabel('Medicine name')).toHaveValue('Metformin')
})

// Redirect transport only: authentication, MongoDB, the mailer (console mode) and every API handler stay real.
async function useRealBackend(page, authBackend) {
  await page.route('http://localhost:5173/api/**', async (route) => {
    const original = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${authBackend}${original.pathname}${original.search}` }) })
  })
}

test('real forgotten password: emailed link, new password, every other device logged out', async ({ browser, authBackend }) => {
  const fresh = () => browser.newContext({ storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'seenWelcome', value: '1' }, { name: 'amag.tour', value: 'seen' }, { name: 'theme', value: 'light' }] }] } })
  const email = `reset-${randomUUID()}@example.com`
  const oldPassword = 'old-password123'
  const newPassword = 'new-password456'

  // Phone A: signs up and stays logged in.
  const phoneA = await fresh()
  const a = await phoneA.newPage()
  await useRealBackend(a, authBackend)
  await a.goto('/signup?next=/account')
  await fillSignup(a, email, oldPassword)
  await expect(a).toHaveURL('http://localhost:5173/account')

  // Phone B: forgot the password, asks for a link, opens the email's link and chooses a new password.
  const phoneB = await fresh()
  const b = await phoneB.newPage()
  await useRealBackend(b, authBackend)
  await b.goto('/login')
  await b.getByTestId('login-email').fill(email)
  await b.getByTestId('login-forgot').click()
  sentMail.length = 0
  await b.getByTestId('forgot-submit').click()
  await expect(b.getByTestId('forgot-sent')).toBeVisible()
  const mail = sentMail.find((m) => m.to === email)
  expect(mail.subject).toBe('Reset your Ah Ma Ah Gong Can password')
  const link = /http:\/\/localhost:5173\/reset#token=\S+/.exec(mail.text)[0]
  await b.goto(link)
  await b.getByTestId('reset-password').fill(newPassword)
  await b.getByTestId('reset-submit').click()
  await expect(b.getByTestId('reset-done')).toBeVisible()
  await b.getByTestId('reset-continue').click()
  await expect(b).toHaveURL('http://localhost:5173/')

  // The same link again: used.
  await b.goto(link)
  await b.getByTestId('reset-password').fill('another-password789')
  await b.getByTestId('reset-submit').click()
  await expect(b.getByTestId('reset-bad')).toBeVisible()

  // Phone A: its old login is over.
  await a.goto('/account')
  await expect(a).toHaveURL(/\/login\?/)
  await expect(a.getByTestId('login-error')).toHaveText(/You were logged out/)
  await a.getByTestId('login-email').fill(email)
  await a.getByTestId('login-password').fill(oldPassword)
  await a.getByTestId('login-submit').click()
  await expect(a.getByTestId('login-error')).toBeVisible() // the old password no longer works
  await a.getByTestId('login-password').fill(newPassword)
  await a.getByTestId('login-submit').click()
  await expect(a).not.toHaveURL(/\/login/)
  await phoneA.close()
  await phoneB.close()
})
