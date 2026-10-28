// Owner: Lokesh. Dose ticks (server/routes/doses.js) against an in-memory MongoDB. Never reads the shared Atlas database.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { connectDb } from '../db.js'
import { Dose } from '../models/Dose.js'
import { signToken } from '../services/auth.js'

process.env.JWT_SECRET = randomBytes(48).toString('hex')
process.env.DOSE_RATE_LIMIT = '1000' // read when the rate limiter loads, so the routes are imported after this line
const { default: app } = await import('../app.js')
const { checkDate, MAX_PER_DAY } = await import('../routes/doses.js')
let mongo, server, base

// Two accounts. The routes trust the signed token, so no User documents are needed.
const alice = signToken(new mongoose.Types.ObjectId().toString(), true)
const bob = signToken(new mongoose.Types.ObjectId().toString(), true)
const day = (offset) => new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10) // Singapore
const TODAY = day(0)
const YESTERDAY = day(-1)

before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('doses_test')
  await connectDb()
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api/doses`
})
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await mongoose.disconnect()
  await mongo?.stop()
})

const request = (method, { body, query = '', token } = {}) => fetch(`${base}${query}`, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
const tick = (token, doseId, date = TODAY) => request('POST', { token, body: { doseId, date } })
const untick = (token, doseId, date = TODAY) => request('DELETE', { token, body: { doseId, date } })
const taken = async (token, date = TODAY) => (await (await request('GET', { token, query: `?date=${date}` })).json()).data.taken
async function error(response, status, code) {
  assert.equal(response.status, status)
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error.code, code)
}

test('every route needs a login', async () => {
  await error(await request('GET', { query: `?date=${TODAY}` }), 401, 'NOT_LOGGED_IN')
  await error(await tick(undefined, 'm1-morning'), 401, 'NOT_LOGGED_IN')
  await error(await untick(undefined, 'm1-morning'), 401, 'NOT_LOGGED_IN')
  await error(await tick('not-a-token', 'm1-morning'), 401, 'NOT_LOGGED_IN')
  // A correctly signed token whose id isn't a database id is not a real account.
  await error(await tick(signToken('legacy-user', true), 'm1-morning'), 401, 'NOT_LOGGED_IN')
})

test('tick, then tick again: one record, the first time kept, never cached', async () => {
  const first = await tick(alice, 'm1-morning')
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  const { ok, data } = await first.json()
  assert.equal(ok, true)
  assert.deepEqual(Object.keys(data).sort(), ['date', 'doseId', 'takenAt'])
  assert.deepEqual([data.doseId, data.date], ['m1-morning', TODAY])

  const again = await (await tick(alice, 'm1-morning')).json()
  assert.equal(again.data.takenAt, data.takenAt)
  assert.equal(await Dose.countDocuments({ doseId: 'm1-morning' }), 1)
  assert.deepEqual(await taken(alice), ['m1-morning'])
})

test('the same tick arriving several times at once still makes one record', async () => {
  const answers = await Promise.all(Array.from({ length: 5 }, () => tick(alice, 'm1-bedtime')))
  assert.deepEqual(answers.map((r) => r.status), [200, 200, 200, 200, 200])
  assert.equal(await Dose.countDocuments({ doseId: 'm1-bedtime' }), 1)
})

test('untick, and untick something not ticked: both 200', async () => {
  await tick(alice, 'm2-morning')
  const res = await untick(alice, 'm2-morning')
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).data, { doseId: 'm2-morning', date: TODAY, taken: false })
  assert.ok(!(await taken(alice)).includes('m2-morning'))
  const missing = await untick(alice, 'never-ticked')
  assert.equal(missing.status, 200)
  assert.equal((await missing.json()).ok, true)
})

test('GET returns only that date and only that user, and nobody can untick someone else\'s dose', async () => {
  await Dose.deleteMany({})
  await tick(alice, 'm1-morning')
  await tick(alice, 'm1-bedtime')
  await tick(alice, 'm1-morning', YESTERDAY)
  await tick(bob, 'm9-morning')

  assert.deepEqual(await taken(alice), ['m1-bedtime', 'm1-morning'])
  assert.deepEqual(await taken(alice, YESTERDAY), ['m1-morning'])
  assert.deepEqual(await taken(bob), ['m9-morning'])
  assert.deepEqual(await taken(bob, YESTERDAY), [])

  // Bob uses Alice's dose id: only Bob's (missing) tick is touched.
  await untick(bob, 'm1-morning')
  assert.deepEqual(await taken(alice), ['m1-bedtime', 'm1-morning'])
  const res = await request('GET', { token: alice, query: `?date=${TODAY}` })
  assert.deepEqual(await res.json(), { ok: true, data: { date: TODAY, taken: ['m1-bedtime', 'm1-morning'] } })
})

test('bad dose ids and dates are 400', async () => {
  for (const doseId of ['', 'm1 morning', 'm1_morning', 'm1-<script>', 'a'.repeat(81), 12, null, undefined, { $gt: '' }, ['m1']]) {
    await error(await tick(alice, doseId), 400, 'BAD_REQUEST')
    await error(await untick(alice, doseId), 400, 'BAD_REQUEST')
  }
  assert.equal((await tick(alice, 'a'.repeat(80))).status, 200)
  for (const date of ['2026-02-30', '2026-13-01', '28-10-2026', '2026-1-5', '', null, 20261028, day(2), day(-366)]) {
    await error(await tick(alice, 'm1-morning', date), 400, 'BAD_REQUEST')
  }
  for (const query of ['', '?date=', '?date=2026-02-30', `?date=${day(2)}`, `?date[$gt]=2000-01-01`]) {
    await error(await request('GET', { token: alice, query }), 400, 'BAD_REQUEST')
  }
  await error(await request('POST', { token: alice }), 400, 'BAD_REQUEST')
  // Malformed JSON gets the app-wide 400, not a crash.
  const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${alice}` }, body: '{bad' })
  await error(res, 400, 'BAD_REQUEST')
})

test('dates: tomorrow and a year back are allowed, by the Singapore calendar', () => {
  // 17:30 UTC on 27 Oct is already 01:30 on 28 Oct in Singapore.
  const now = Date.parse('2026-10-27T17:30:00Z')
  assert.equal(checkDate('2026-10-28', now), null)
  assert.equal(checkDate('2026-10-29', now), null) // tomorrow
  assert.notEqual(checkDate('2026-10-30', now), null)
  assert.equal(checkDate('2025-10-28', now), null) // 365 days back
  assert.notEqual(checkDate('2025-10-27', now), null)
  assert.equal(checkDate('2028-02-29', Date.parse('2028-02-28T12:00:00Z')), null) // leap day
  assert.notEqual(checkDate('2027-02-29', Date.parse('2027-02-28T12:00:00Z')), null)
})

test(`at most ${MAX_PER_DAY} different doses can be ticked on one day`, async () => {
  const date = day(-10)
  await Dose.insertMany(Array.from({ length: MAX_PER_DAY }, (_, i) => ({ userId: JSON.parse(Buffer.from(alice.split('.')[1], 'base64url')).sub, doseId: `x-${i}`, date, takenAt: new Date() })))
  await error(await tick(alice, 'one-more', date), 400, 'BAD_REQUEST')
  assert.equal((await tick(alice, 'x-5', date)).status, 200) // already ticked: still fine
  assert.equal((await tick(bob, 'one-more', date)).status, 200) // the limit is per user
})

test('no database: 503 with the same answer the auth routes give, and a later request reconnects', async () => {
  await mongoose.disconnect()
  const uri = process.env.MONGODB_URI
  delete process.env.MONGODB_URI
  try {
    await error(await tick(alice, 'm1-morning'), 503, 'SERVER_ERROR')
    await error(await request('GET', { token: alice, query: `?date=${TODAY}` }), 503, 'SERVER_ERROR')
    await error(await untick(alice, 'm1-morning'), 503, 'SERVER_ERROR')
  } finally {
    process.env.MONGODB_URI = uri
  }
  assert.equal((await tick(alice, 'm1-morning')).status, 200)
})
