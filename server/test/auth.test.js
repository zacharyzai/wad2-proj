// Accounts: password hashing, login tokens, profile checks and the routes' answers before the database. No database needed.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.JWT_SECRET = 'test-secret'
delete process.env.MONGODB_URI // so a request that passes the checks gets the "accounts unavailable" answer, not a real DB
const { default: app } = await import('../app.js')
const { hashPassword, verifyPassword, signToken, readToken, TOKEN_SECONDS } = await import('../services/auth.js')
const { checkProfile } = await import('../routes/auth.js')

let server, base
before(() => {
  server = app.listen(0)
  base = `http://localhost:${server.address().port}`
})
after(() => server.close())

const post = (path, body, headers = {}) =>
  fetch(`${base}/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const GOOD = { name: 'Tan Mei Ling', email: 'mei@example.com', password: 'password123', dob: '1952-03-07', citizenship: 'birth' }

test('passwords are salted hashes that only the right password matches', async () => {
  const a = await hashPassword('password123')
  const b = await hashPassword('password123')
  assert.match(a, /^scrypt\$/)
  assert.notEqual(a, b) // different salt each time
  assert.ok(!a.includes('password123'))
  assert.equal(await verifyPassword('password123', a), true)
  assert.equal(await verifyPassword('password124', a), false)
  assert.equal(await verifyPassword('x', 'not-a-hash'), false)
})

test('tokens: remember me lasts 30 days, otherwise 12 hours; forged or expired tokens are refused', () => {
  const now = Date.UTC(2026, 9, 22)
  const long = readToken(signToken('u1', true, now), now)
  assert.equal(long.sub, 'u1')
  assert.equal(long.rem, true)
  assert.equal(long.exp - now / 1000, TOKEN_SECONDS.remember)
  assert.equal(readToken(signToken('u1', false, now), now).exp - now / 1000, 12 * 3600)

  const token = signToken('u1', false, now)
  assert.equal(readToken(token, now + 13 * 3600 * 1000), null) // expired
  const [body] = token.split('.')
  const forgedBody = Buffer.from(JSON.stringify({ sub: 'admin', rem: true, exp: 9e9 })).toString('base64url')
  assert.equal(readToken(`${forgedBody}.${token.split('.')[1]}`, now), null) // payload changed, old signature
  assert.equal(readToken(`${body}.AAAA`, now), null)
  assert.equal(readToken(undefined, now), null)
})

test('profile checks: real dates, known citizenship, and a citizenship year only when it makes sense', () => {
  const now = new Date('2026-10-22T00:00:00Z')
  assert.deepEqual(checkProfile(GOOD, now).profile, { name: 'Tan Mei Ling', dob: '1952-03-07', citizenship: 'birth', citizenSince: null })
  assert.deepEqual(checkProfile({ ...GOOD, citizenship: 'became', citizenSince: '1988' }, now).profile.citizenSince, 1988)
  for (const bad of [
    { name: '  ' },
    { dob: '1952-02-30' }, // not a real day
    { dob: '07/03/1952' },
    { dob: '2030-01-01' }, // future
    { citizenship: 'SG_CITIZEN' },
    { citizenship: 'became' }, // missing year
    { citizenship: 'became', citizenSince: 1940 }, // before birth
  ]) {
    assert.ok(checkProfile({ ...GOOD, ...bad }, now).error, JSON.stringify(bad))
  }
})

test('signup refuses bad details with 400 before touching the database', async () => {
  for (const bad of [{ email: 'not-an-email' }, { password: 'short' }, { dob: '' }, { citizenship: 'martian' }]) {
    const res = await post('/signup', { ...GOOD, ...bad })
    assert.equal(res.status, 400, JSON.stringify(bad))
    assert.equal((await res.json()).error.code, 'BAD_REQUEST')
  }
})

test('with no database, a valid signup or login says accounts are unavailable (503), never crashes', async () => {
  for (const [path, body] of [['/signup', GOOD], ['/login', { email: GOOD.email, password: GOOD.password }]]) {
    const res = await post(path, body)
    assert.equal(res.status, 503)
    assert.equal((await res.json()).ok, false)
  }
})

test('/me needs a valid login token', async () => {
  assert.equal((await fetch(`${base}/api/auth/me`)).status, 401)
  const forged = await fetch(`${base}/api/auth/me`, { headers: { authorization: 'Bearer abc.def' } })
  assert.equal(forged.status, 401)
  assert.equal((await forged.json()).error.code, 'NOT_LOGGED_IN')
})
