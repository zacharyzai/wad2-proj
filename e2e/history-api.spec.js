// Backend handoff journey through Playwright's HTTP client; History UI is owned by Isaac.
// Uses real signup/login and sample scans against a disposable database. Never calls Atlas or AI.
import { test as base, expect } from '@playwright/test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mongoose from 'mongoose'

const test = base.extend({
  historyBackend: [async ({}, use) => {
    process.env.JWT_SECRET = randomBytes(48).toString('hex')
    process.env.USE_MOCK_AI = 'true'
    process.env.AUTH_RATE_LIMIT = '100'
    const mongo = await MongoMemoryServer.create()
    process.env.MONGODB_URI = mongo.getUri('history_browser_test')
    let server
    try {
      const { default: app } = await import('../server/app.js')
      server = app.listen(0, '127.0.0.1')
      await once(server, 'listening')
      await use(`http://127.0.0.1:${server.address().port}/api`)
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await mongoose.disconnect()
      await mongo.stop()
    }
  }, { scope: 'worker' }],
})

test('signup → sample → corrected history → new login → owner-only retrieval and deletion', async ({ request, historyBackend: api }) => {
  const password = 'history-test-password'
  const profile = { name: 'History Test User', dob: '1952-03-07', citizenship: 'birth', income: 'unsure' }
  const email = `history-${randomUUID()}@example.com`
  const signup = await request.post(`${api}/auth/signup`, { data: { ...profile, email, password } })
  expect(signup.status()).toBe(201)
  const headers = { authorization: `Bearer ${(await signup.json()).data.token}` }
  const sample = await request.post(`${api}/scan`, { headers, data: { sampleId: 'med-1' } })
  expect(sample.ok()).toBe(true)
  const scan = (await sample.json()).data
  scan.medication.doseAmount = 0.5 // save the user's correction, not the original extraction
  const saved = await request.post(`${api}/history`, { headers, data: { scan } })
  expect(saved.status()).toBe(201)
  const { id } = (await saved.json()).data
  const bill = await request.post(`${api}/scan`, { headers, data: { sampleId: 'bill-4' } })
  const savedBill = await request.post(`${api}/history`, { headers, data: { scan: (await bill.json()).data } })
  expect(savedBill.status()).toBe(201)

  // A fresh login retrieves the persisted corrected data without any browser scan store.
  const login = await request.post(`${api}/auth/login`, { data: { email, password, remember: false } })
  expect(login.status()).toBe(200)
  const fresh = { authorization: `Bearer ${(await login.json()).data.token}` }
  const list = (await (await request.get(`${api}/history`, { headers: fresh })).json()).data
  expect(list.total).toBe(2)
  expect(list.items.map((item) => item.type)).toEqual(['bill', 'medication'])
  const detail = await request.get(`${api}/history/${id}`, { headers: fresh })
  expect((await detail.json()).data.scan).toEqual(scan)
  expect(detail.headers()['cache-control']).toBe('no-store')

  const other = await request.post(`${api}/auth/signup`, { data: { ...profile, email: `other-${randomUUID()}@example.com`, password } })
  const otherHeaders = { authorization: `Bearer ${(await other.json()).data.token}` }
  expect((await (await request.get(`${api}/history`, { headers: otherHeaders })).json()).data.total).toBe(0)
  expect((await request.get(`${api}/history/${id}`, { headers: otherHeaders })).status()).toBe(404)
  expect((await request.delete(`${api}/history/${id}`, { headers: otherHeaders })).status()).toBe(404)
  expect((await request.delete(`${api}/history/${id}`, { headers: fresh })).status()).toBe(200)
  expect((await request.get(`${api}/history/${id}`, { headers: fresh })).status()).toBe(404)
  expect((await request.get(`${api}/history`)).status()).toBe(401)
})
