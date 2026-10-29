// Isaac's real invitation/signup/Account UI with the caregiver backend, using disposable MongoDB, never Atlas.
import { test as base, expect } from '@playwright/test'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

const test = base.extend({
  careBackend: [async ({}, use) => {
    process.env.JWT_SECRET = randomBytes(48).toString('hex')
    process.env.USE_MOCK_AI = 'true'
    process.env.AUTH_RATE_LIMIT = '100'
    const mongo = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongo.getUri('care_browser_test')
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

test('senior creates an invite → new caregiver signs up and accepts → senior revokes the link', async ({ page, request, careBackend }, testInfo) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://localhost:5173/api/**', async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: `${careBackend}${url.pathname}${url.search}` })
    await route.fulfill({ response }) // transport only: real auth, rate limits and database handlers
  })
  const password = 'browser-care-password'
  const seniorEmail = `senior-${randomUUID()}@example.com`
  const caregiverEmail = `caregiver-${randomUUID()}@example.com`
  const profile = { name: 'Sample Senior', dob: '1952-03-07', citizenship: 'birth', income: 'unsure', language: 'en', theme: 'light' }
  const senior = await request.post(`${careBackend}/api/auth/signup`, { data: { ...profile, email: seniorEmail, password } })
  expect(senior.status()).toBe(201)
  const seniorToken = (await senior.json()).data.token
  async function login(email) {
    await page.goto('/login?next=/account')
    await page.getByTestId('login-email').fill(email)
    await page.getByTestId('login-password').fill(password)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL('http://localhost:5173/account')
  }
  async function logout() {
    await page.getByTestId('account-logout').click()
    await page.getByTestId('account-logout-yes').click()
    await expect(page).toHaveURL(/\/login/)
  }
  await login(seniorEmail)
  await expect(page.getByTestId('care-card')).toBeVisible()
  await page.getByTestId('care-invite').click()
  await page.getByTestId('care-invite-create').click()
  const field = page.getByTestId('care-invite-link')
  await expect(field).toHaveValue(/\/shared\/[a-f0-9]{64}$/)
  const token = (await field.inputValue()).split('/').at(-1)
  await page.screenshot({ path: `/tmp/wad2-caregiver-invite-${testInfo.project.name}.png`, fullPage: false })
  await logout()

  await page.goto(`/shared/${token}`)
  await expect(page.getByTestId('invite-title')).toContainText('Sample Senior')
  await page.getByTestId('invite-signup').click()
  await expect(page.getByTestId('signup-role-caregiver')).toBeChecked()
  await page.getByTestId('signup-name').fill('Sample Caregiver')
  await page.getByTestId('signup-email').fill(caregiverEmail)
  await page.getByTestId('signup-password').fill(password)
  await page.getByTestId('signup-dob').fill('1982-03-07')
  await page.getByTestId('signup-citizenship').selectOption('birth')
  await page.getByTestId('signup-income').selectOption('unsure')
  await page.getByTestId('signup-submit').click()
  await expect(page).toHaveURL(`http://localhost:5173/shared/${token}`)
  await expect(page.getByTestId('invite-accept')).toBeVisible()
  await page.getByTestId('invite-accept').click()
  await expect(page).toHaveURL(/\/care\/[a-f0-9]{24}$/)
  // This senior's app never saved a timetable: "not shared yet", never invented zero doses.
  await expect(page.getByRole('heading', { name: 'Not shared yet' })).toBeVisible()
  const caregiverLogin = await request.post(`${careBackend}/api/auth/login`, { data: { email: caregiverEmail, password } })
  const caregiverToken = (await caregiverLogin.json()).data.token
  const headers = { authorization: `Bearer ${caregiverToken}` }
  const linked = await request.get(`${careBackend}/api/care/links`, { headers })
  const links = (await linked.json()).data.links
  expect(links).toHaveLength(1)
  expect(links[0].senior.name).toBe('Sample Senior')
  await page.goto('/account')
  await expect(page.getByTestId('care-card')).toHaveCount(0)
  await logout()

  await login(seniorEmail)
  await expect(page.getByTestId('care-caregivers')).toContainText('Sample Caregiver')
  // UI currently still offers invite when linked; the backend enforces the one-caregiver rule.
  const extra = await request.post(`${careBackend}/api/care/invites`, { headers: { authorization: `Bearer ${seniorToken}` } })
  expect(extra.status()).toBe(409)
  await page.getByTestId('care-remove').click()
  await page.getByTestId('care-remove-yes').click()
  await expect(page.getByTestId('care-caregivers')).toHaveCount(0)
  expect((await (await request.get(`${careBackend}/api/care/links`, { headers })).json()).data.links).toEqual([])
  expect((await request.get(`${careBackend}/api/care/invites/${token}`)).status()).toBe(404)
  expect(errors).toEqual([])
})
