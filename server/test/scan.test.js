import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

// Low limits so the rate-limit tests stay fast. Must be set before the app is imported.
process.env.USE_MOCK_AI = 'true'
process.env.SCAN_RATE_LIMIT = '6'
process.env.AI_DAILY_CAP = '1000'
process.env.JWT_SECRET = 'test-secret-for-auth-checks-at-least-32-bytes'
const { default: app } = await import('../app.js')
const { signToken } = await import('../services/auth.js')
const AUTH = { authorization: `Bearer ${signToken('test-user', false)}` } // scanning needs an account

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
let server, base

before(() => {
  server = app.listen(0)
  base = `http://localhost:${server.address().port}`
})
after(() => server.close())

const scan = (body) =>
  fetch(`${base}/api/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...AUTH },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

function assertContract(data) {
  assert.ok(['medication', 'bill'].includes(data.type))
  assert.ok(['sample', 'mock', 'ai'].includes(data.source))
  assert.ok(Array.isArray(data.unclear))
  if (data.type === 'medication') {
    const m = data.medication
    assert.equal(typeof m.doseAmount, 'number')
    assert.ok(['daily', 'as_needed', 'weekly', 'tapering', 'other'].includes(m.frequencyType))
  } else {
    const b = data.bill
    for (const i of b.items) assert.ok(Number.isInteger(i.amountCents))
    assert.ok(Number.isInteger(b.totalPayableCents))
    const sum = (xs) => xs.reduce((t, x) => t + x.amountCents, 0)
    assert.equal(sum(b.items) - sum(b.subsidies) - b.medisaveCents, b.totalPayableCents)
  }
}

test('sample scans return valid contract data', async () => {
  for (const id of ['med-1', 'med-2', 'med-3', 'bill-1']) {
    const res = await scan({ sampleId: id })
    assert.equal(res.status, 200)
    const { ok, data } = await res.json()
    assert.equal(ok, true)
    assert.equal(data.source, 'sample')
    assertContract(data)
  }
})

test('unknown or path-like sampleId is 404', async () => {
  for (const sampleId of ['nope', '../package', 5]) {
    const res = await scan({ sampleId })
    assert.equal(res.status, 404)
    assert.equal((await res.json()).error.code, 'NOT_FOUND')
  }
})

test('invalid input is 400 with error envelope', async () => {
  for (const body of [{}, { type: 'xray', image: TINY_PNG }, { type: 'constructor', image: TINY_PNG }, { type: 'bill', image: 'hello' }, '{bad json']) {
    const res = await scan(body)
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.ok, false)
    assert.equal(json.error.code, 'BAD_REQUEST')
  }
})

test('oversized body is 413 IMAGE_TOO_LARGE', async () => {
  const res = await scan({ type: 'bill', image: 'data:image/png;base64,' + 'A'.repeat(5_000_000) })
  assert.equal(res.status, 413)
  assert.equal((await res.json()).error.code, 'IMAGE_TOO_LARGE')
})

test('history without a login is refused', async () => {
  const res = await fetch(`${base}/api/history`)
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error.code, 'NOT_LOGGED_IN')
})

test('scanning without a login is refused before anything else runs', async () => {
  const res = await fetch(`${base}/api/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sampleId: 'med-1' }) })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error.code, 'NOT_LOGGED_IN')
})

// Runs last: it uses up this IP's image-scan budget.
test('image scans are rate limited per IP, samples are not', async () => {
  // Earlier tests already sent image requests, so the limit may be hit before the loop ends.
  let res
  for (let i = 0; i < 8; i++) res = await scan({ type: 'medication', image: TINY_PNG })
  assert.equal(res.status, 429)
  assert.equal((await res.json()).error.code, 'RATE_LIMITED')
  assert.ok(res.headers.get('ratelimit'))

  const sample = await scan({ sampleId: 'med-1' })
  assert.equal(sample.status, 200)
})
