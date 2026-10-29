// Owner isolation and persistence against a disposable MongoDB. Never uses .env or Atlas.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { Scan } from '../models/Scan.js'
import { User } from '../models/User.js'
import { connectDb } from '../db.js'
import { signToken } from '../services/auth.js'

process.env.JWT_SECRET = randomBytes(48).toString('hex')
process.env.USE_MOCK_AI = 'true'
const { default: app } = await import('../app.js')
const fixture = async (id) => JSON.parse(await readFile(new URL(`../fixtures/${id}.json`, import.meta.url), 'utf8'))
const med = await fixture('med-1')
let mongo, server, base, alice, bob, aliceToken, bobToken
before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('history_test')
  await connectDb()
  const profile = { name: 'Test User', dob: '1952-03-07', citizenship: 'birth', income: 'unsure', passwordHash: 'not-used-for-login' }
  alice = await User.create({ ...profile, email: 'alice@example.com' })
  bob = await User.create({ ...profile, email: 'bob@example.com' })
  aliceToken = signToken(alice.id, false)
  bobToken = signToken(bob.id, false)
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api/history`
})
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await mongoose.disconnect()
  await mongo?.stop()
})
const request = (path = '', { method = 'GET', token = aliceToken, body } = {}) => fetch(`${base}${path}`, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
const save = (scan, options = {}) => request('', { method: 'POST', body: { scan }, ...options })
async function error(response, status, code, reachedRouter = true) {
  assert.equal(response.status, status)
  if (reachedRouter) assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.deepEqual(Object.keys(body).sort(), ['error', 'ok'])
  assert.equal(body.ok, false)
  assert.equal(body.error.code, code)
  return body
}

test('all history operations require a valid token before touching the database', async () => {
  const id = new mongoose.Types.ObjectId()
  for (const token of [null, 'invalid']) {
    for (const [path, method, body] of [['', 'GET'], ['', 'POST', { scan: med }], [`/${id}`, 'GET'], [`/${id}`, 'DELETE']]) {
      await error(await request(path, { method, body, token }), 401, 'NOT_LOGGED_IN')
    }
  }
})

test('new users have empty paginated history; only the owner can read and delete saved scans', async () => {
  assert.deepEqual((await (await request()).json()).data, { items: [], page: 1, pageSize: 10, pages: 1, total: 0, hasMore: false })
  const response = await save(med)
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const { data } = await response.json()
  assert.deepEqual(data.scan, med)
  assert.match(data.id, /^[a-f0-9]{24}$/)
  assert.ok(Number.isFinite(Date.parse(data.createdAt)))
  assert.deepEqual(Object.keys(data).sort(), ['createdAt', 'id', 'scan'])
  assert.equal(String((await Scan.findById(data.id)).userId), alice.id)
  const bobsList = await request('', { token: bobToken })
  assert.equal((await bobsList.json()).data.total, 0)
  const notFound = await error(await request(`/${data.id}`, { token: bobToken }), 404, 'NOT_FOUND')
  assert.deepEqual(await error(await request(`/${new mongoose.Types.ObjectId()}`, { token: bobToken }), 404, 'NOT_FOUND'), notFound)
  await error(await request(`/${data.id}`, { method: 'DELETE', token: bobToken }), 404, 'NOT_FOUND')
  assert.deepEqual((await (await request(`/${data.id}`)).json()).data, data)
  assert.equal((await request(`/${data.id}`, { method: 'DELETE' })).status, 200)
  await error(await request(`/${data.id}`), 404, 'NOT_FOUND')
  await error(await request(`/${data.id}`, { method: 'DELETE' }), 404, 'NOT_FOUND')
})

test('confirmed medication and bill samples round-trip in cents and survive database reconnect', async () => {
  await Scan.deleteMany({}) // disposable test database only
  for (const id of ['med-1', 'med-2', 'med-3', 'bill-1', 'bill-2', 'bill-3', 'bill-4']) {
    const sample = await fixture(id)
    const response = await save(sample)
    assert.equal(response.status, 201, id)
    const { data } = await response.json()
    if (sample.type === 'bill') {
      assert.equal(data.scan.bill.totalPayableCents, sample.bill.totalPayableCents)
      assert.deepEqual(data.scan.bill.items, sample.bill.items)
      assert.deepEqual(data.scan.bill.subsidies, sample.bill.subsidies.map((s) => ({ ...s, includedInItems: s.includedInItems ?? false })))
    } else assert.deepEqual(data.scan, sample)
    await mongoose.disconnect()
    assert.deepEqual((await (await request(`/${data.id}`)).json()).data, data)
  }
  const indexes = await Scan.collection.indexes()
  assert.ok(indexes.some((i) => JSON.stringify(i.key) === JSON.stringify({ userId: 1, createdAt: -1, _id: -1 })))
})

test('bill subsidies included in net items are not deducted twice', async () => {
  const sample = await fixture('bill-1')
  sample.bill.items = [{ description: 'Net consultation', category: 'consultation', amountCents: 1000 }]
  sample.bill.subsidies = [{ scheme: 'government', amountCents: 500, includedInItems: true }]
  sample.bill.medisaveCents = 0
  sample.bill.totalPayableCents = 1000
  assert.equal((await save(sample)).status, 201)
})

test('history pages contain only summaries, newest first, with deterministic timestamp ties and no other user data', async () => {
  await Scan.deleteMany({})
  const time = new Date('2026-10-28T00:00:00Z')
  const docs = await Scan.insertMany(Array.from({ length: 23 }, (_, i) => ({
    userId: alice.id, type: med.type, source: med.source, medication: { ...med.medication, name: `Medicine ${i}` },
    createdAt: i < 20 ? time : new Date(time.getTime() + i),
  })))
  await save(med, { token: bobToken })
  const expected = [...docs].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)).map((d) => d.id)
  const pages = []
  for (const page of [1, 2, 3, 4]) {
    const { data } = await (await request(`?page=${page}`)).json()
    assert.equal(data.total, 23)
    assert.equal(data.pageSize, 10)
    assert.equal(data.page, page)
    assert.equal(data.hasMore, page < 3)
    assert.equal(data.pages, 3)
    assert.equal(data.items.length, page < 3 ? 10 : page === 3 ? 3 : 0)
    for (const item of data.items) {
      assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'shareExpiresAt', 'shareToken', 'source', 'title', 'totalPayableCents', 'type'])
      assert.equal(item.shareToken, null)
      assert.match(item.title, /^Medicine \d+ 500 mg$/)
    }
    pages.push(...data.items.map((i) => i.id))
  }
  assert.deepEqual(pages, expected)
})

test('rejects unknown fields, photos, owner injection and malformed or unconfirmed data without saving', async () => {
  const bad = []
  const change = (fn) => { const s = structuredClone(med); fn(s); return { scan: s } }
  bad.push({}, [], null, { scan: med, userId: bob.id }, { scan: med, createdAt: '2020-01-01' })
  bad.push(change((s) => { s.image = 'data:image/png;base64,AAAA' }))
  bad.push(change((s) => { s.medication.patientName = 'Private Person' }))
  bad.push(change((s) => { s.medication.name = { $ne: null } }))
  bad.push(change((s) => { s.medication.rawInstruction = 'data:image/png;base64,AAAA' }))
  bad.push(change((s) => { s.unclear = ['medication.name'] }))
  bad.push(change((s) => { s.source = 'typed' }))
  bad.push(change((s) => { s.type = 'constructor' }))
  bad.push(change((s) => { s.bill = {} }))
  bad.push(change((s) => { s.medication = null }))
  bad.push(change((s) => { s.medication.doseAmount = '2' }))
  bad.push(change((s) => { s.medication.doseAmount = 0 }))
  bad.push(change((s) => { s.medication.timesPerDay = 20 }))
  bad.push(change((s) => { s.medication.timing = ['morning'] }))
  bad.push(change((s) => { s.medication.warnings = Array(51).fill('Warning') }))
  bad.push(change((s) => { s.medication.warnings = Array(40).fill('w'.repeat(2000)) }))
  const count = await Scan.countDocuments()
  // Express rejects a top-level JSON null before route middleware runs.
  for (const body of bad) await error(await request('', { method: 'POST', body }), 400, 'BAD_REQUEST', body !== null)
  assert.equal(await Scan.countDocuments(), count)
})

test('rejects malformed bill dates, money and nested private fields', async () => {
  const sample = await fixture('bill-1')
  for (const change of [
    (b) => { b.visitDate = '2026-02-30' }, (b) => { b.items = [] },
    (b) => { b.items[0].amountCents = 1.5 }, (b) => { b.items[0].amountCents = '1450' },
    (b) => { b.items[0].patientName = 'Private Person' }, (b) => { b.subtotals = [{ section: 'Medications', amountCents: -1 }] },
    (b) => { b.medisaveCents = -1 }, (b) => { b.subsidies[0].includedInItems = 'false' },
  ]) {
    const scan = structuredClone(sample)
    change(scan.bill)
    await error(await save(scan), 400, 'BAD_REQUEST')
  }
})

test('a bill whose lines do not add up is saved with its printed total, sections and subtotals (docs/scan-contract.md)', async () => {
  const scan = structuredClone(await fixture('bill-1'))
  scan.bill.totalPayableCents += 50 // one line misread by 50 cents; the person confirmed the printed total
  scan.bill.items[0].section = 'Consultation Fees'
  scan.bill.subtotals = [{ section: 'Consultation Fees', amountCents: scan.bill.items[0].amountCents }]
  const response = await save(scan)
  assert.equal(response.status, 201)
  const { bill } = (await response.json()).data.scan
  assert.equal(bill.totalPayableCents, scan.bill.totalPayableCents)
  assert.equal(bill.items[0].section, 'Consultation Fees')
  assert.equal('section' in bill.items[1], false) // only where the bill printed one
  assert.deepEqual(bill.subtotals, scan.bill.subtotals)
})

test('bad IDs and pagination return JSON errors, not CastErrors or Mongo filters', async () => {
  for (const id of ['invalid', '123456789012', '$ne']) {
    await error(await request(`/${id}`), 404, 'NOT_FOUND')
    await error(await request(`/${id}`, { method: 'DELETE' }), 404, 'NOT_FOUND')
  }
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=100001', 'page=1&page=2', 'page[$ne]=1', 'userId=' + bob.id]) {
    await error(await request(`?${query}`), 400, 'BAD_REQUEST')
  }
})

test('tokens for missing/deleted accounts cannot read or create history', async () => {
  for (const sub of ['not-an-object-id', String(new mongoose.Types.ObjectId())]) {
    const token = signToken(sub, false)
    await error(await request('', { token }), 401, 'NOT_LOGGED_IN')
    await error(await save(med, { token }), 401, 'NOT_LOGGED_IN')
  }
  await User.deleteOne({ _id: bob.id })
  await error(await request('', { token: bobToken }), 401, 'NOT_LOGGED_IN')
})

test('share links: only the owner makes or stops one; anyone with it sees the scan fields only, until it expires', async () => {
  const share = (path = '', options = {}) => fetch(`${base.replace('/history', '/share')}${path}`, {
    method: options.method ?? 'GET', headers: { 'content-type': 'application/json', ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const carol = await User.create({ name: 'Carol', dob: '1960-01-01', citizenship: 'birth', income: 'unsure', passwordHash: 'not-used', email: 'carol@example.com' })
  const carolToken = signToken(carol.id, false)
  const scanId = (await (await save(med)).json()).data.id
  assert.equal((await share('', { method: 'POST', body: { scanId } })).status, 401)
  await error(await share('', { method: 'POST', token: carolToken, body: { scanId } }), 404, 'NOT_FOUND')
  const made = await share('', { method: 'POST', token: aliceToken, body: { scanId } })
  assert.equal(made.status, 201)
  const { token, expiresAt } = (await made.json()).data
  assert.match(token, /^[a-f0-9]{32}$/)
  assert.ok(new Date(expiresAt) > new Date())

  const opened = (await (await share(`/${token}`)).json()).data.scan
  assert.deepEqual(Object.keys(opened).sort(), ['medication', 'source', 'type', 'unclear'])
  assert.equal(opened.medication.name, med.medication.name)
  const [listed] = (await (await request()).json()).data.items.filter((i) => i.id === scanId)
  assert.equal(listed.shareToken, token)

  await error(await share(`/${token}`, { method: 'DELETE', token: carolToken }), 404, 'NOT_FOUND')
  assert.equal((await share(`/${token}`, { method: 'DELETE', token: aliceToken })).status, 200)
  await error(await share(`/${token}`), 404, 'NOT_FOUND')
  await error(await share('/not-a-token'), 404, 'NOT_FOUND')
  const again = (await (await share('', { method: 'POST', token: aliceToken, body: { scanId } })).json()).data.token
  await Scan.updateOne({ _id: scanId }, { $set: { shareExpiresAt: new Date(Date.now() - 1) } })
  await error(await share(`/${again}`), 404, 'NOT_FOUND')
})

test('database unavailable returns sanitized 503 and recovers on a later request', async () => {
  await mongoose.disconnect()
  const uri = process.env.MONGODB_URI
  try {
    delete process.env.MONGODB_URI
    const body = await error(await request(), 503, 'SERVER_ERROR')
    assert.equal(body.error.message, 'History is not available right now')
  } finally { process.env.MONGODB_URI = uri }
  assert.equal((await request()).status, 200)
  const original = Scan.findOne
  try {
    Scan.findOne = () => { throw new mongoose.mongo.MongoServerError({ message: 'mongodb://private-user:private-password@private-host/history' }) }
    const response = await error(await request(`/${new mongoose.Types.ObjectId()}`), 503, 'SERVER_ERROR')
    assert.doesNotMatch(JSON.stringify(response), /private/)
  } finally { Scan.findOne = original }
})
