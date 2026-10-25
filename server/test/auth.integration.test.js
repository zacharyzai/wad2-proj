// Database integration and migration compatibility. Never reads the shared Atlas database.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHmac, randomBytes, scryptSync } from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import argon2 from 'argon2'
import { User } from '../models/User.js'
import { connectDb } from '../db.js'
import { signToken, TOKEN_SECONDS } from '../services/auth.js'

process.env.JWT_SECRET = randomBytes(48).toString('hex')
process.env.AUTH_RATE_LIMIT = '100'
process.env.USE_MOCK_AI = 'true'
const { default: app } = await import('../app.js')
let mongo, server, base, token, userId
const profile = { name: 'Test Citizen', dob: '1952-03-07', citizenship: 'birth', citizenSince: null, income: 'upTo1500' }
const email = 'auth@example.com'
const password = 'password123'
const publicUser = { ...profile, email }

before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('auth_test')
  await connectDb()
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  base = `http://127.0.0.1:${server.address().port}/api`
})
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await mongoose.disconnect()
  await mongo?.stop()
})
const request = (path, body, { method = 'POST', token: bearer, ip = '192.0.2.1' } = {}) => fetch(`${base}${path}`, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
const post = (path, body) => request(`/auth/${path}`, body)
const me = (value) => request('/auth/me', undefined, { method: 'GET', token: value })
async function error(response, status, code) {
  assert.equal(response.status, status)
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error.code, code)
}

test('profile signup returns the current main contract, hashes passwords and signs a remembered JWT', async () => {
  const res = await post('signup', { ...profile, email: ' AUTH@Example.com ', password, remember: true })
  assert.equal(res.status, 201)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  assert.deepEqual(Object.keys(body.data).sort(), ['token', 'user'])
  assert.deepEqual(body.data.user, publicUser)
  token = body.data.token
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  assert.equal(claims.exp - claims.iat, TOKEN_SECONDS.remember)
  const user = await User.findOne({ email })
  userId = user.id
  assert.equal(claims.sub, userId)
  assert.match(user.passwordHash, /^\$argon2id\$/)
  assert.equal(await argon2.verify(user.passwordHash, password), true)
  assert.equal(body.data.user.passwordHash, undefined)
})

test('duplicate and concurrent case-variant signups enforce the database unique email index', async () => {
  await error(await post('signup', { ...profile, email: email.toUpperCase(), password }), 409, 'EMAIL_TAKEN')
  const responses = await Promise.all(['race@example.com', 'RACE@example.com'].map((email) => post('signup', { ...profile, email, password })))
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409])
  assert.equal(await User.countDocuments({ email: 'race@example.com' }), 1)
})

test('session login survives reconnect, is valid for 12 hours and is not renewed by me', async () => {
  await mongoose.disconnect()
  const response = await post('login', { email, password, remember: false })
  assert.equal(response.status, 200)
  const body = await response.json()
  const claims = jwt.verify(body.data.token, process.env.JWT_SECRET)
  assert.equal(claims.exp - claims.iat, TOKEN_SECONDS.session)
  const restored = await me(body.data.token)
  assert.deepEqual(await restored.json(), { ok: true, data: { user: publicUser } })
  const remembered = await me(token)
  const renewed = await remembered.json()
  assert.deepEqual(renewed.data.user, publicUser)
  assert.equal(typeof renewed.data.token, 'string')
})

test('profile updates feed the account and bill subsidy fields without exposing hashes', async () => {
  const updated = { ...profile, name: 'Updated Citizen', citizenship: 'pr', income: null }
  const response = await request('/auth/me', updated, { method: 'PATCH', token })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.user, { ...updated, email })
  await error(await request('/auth/me', { ...updated, dob: '1952-02-30' }, { method: 'PATCH', token }), 400, 'BAD_REQUEST')
})

test('existing email-only Argon2 accounts, seven-day JWTs and main two-part tokens remain usable', async () => {
  // Old accounts have no profile. Insert without inventing personal details; Account can complete it later.
  const oldId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({ _id: oldId, email: 'legacy@example.com', passwordHash: await argon2.hash(password) })
  const login = await post('login', { email: 'legacy@example.com', password, remember: false })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).data.user.dob, '')
  const originalJwt = jwt.sign({}, process.env.JWT_SECRET, { algorithm: 'HS256', issuer: 'ah-ma-ah-gong-can', audience: 'ah-ma-ah-gong-can:web', subject: String(oldId), expiresIn: '7d' })
  assert.equal((await me(originalJwt)).status, 200)
  const payload = Buffer.from(JSON.stringify({ sub: String(oldId), rem: false, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  const signature = createHmac('sha256', process.env.JWT_SECRET).update(payload).digest('base64url')
  assert.equal((await me(`${payload}.${signature}`)).status, 200)
  const completed = await request('/auth/me', profile, { method: 'PATCH', token: originalJwt })
  assert.equal(completed.status, 200)
  assert.deepEqual((await completed.json()).data.user, { ...profile, email: 'legacy@example.com' })
})

test('main-branch scrypt accounts can still log in', async () => {
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(password, salt, 64).toString('base64url')
  await User.create({ ...profile, email: 'scrypt@example.com', passwordHash: `scrypt$${salt}$${hash}` })
  assert.equal((await post('login', { email: 'scrypt@example.com', password })).status, 200)
  await error(await post('login', { email: 'scrypt@example.com', password: 'wrong-password' }), 401, 'WRONG_LOGIN')
})

test('real login tokens authorize protected scans and chat; missing tokens are refused', async () => {
  assert.equal((await request('/scan', { sampleId: 'med-1' }, { token })).status, 200)
  assert.equal((await request('/chat', { medicines: [], question: 'What is a label?', lang: 'en' }, { token })).status, 200)
  await error(await request('/scan', { sampleId: 'med-1' }), 401, 'NOT_LOGGED_IN')
  await error(await request('/chat', {}), 401, 'NOT_LOGGED_IN')
})

test('short passwords and invalid profiles are rejected before account creation', async () => {
  for (const bad of [{ password: 'short' }, { email: { $ne: null } }, { dob: '1952-02-30' }, { income: 'invalid' }]) {
    await error(await post('signup', { ...profile, email: 'invalid@example.com', password, ...bad }), 400, 'BAD_REQUEST')
  }
  assert.equal((await post('signup', { ...profile, email: 'boundary@example.com', password: ' pass123' })).status, 201)
  assert.equal((await post('login', { email: 'boundary@example.com', password: ' pass123' })).status, 200)
  await error(await post('login', { email, password: 'incorrect123' }), 401, 'WRONG_LOGIN')
  await error(await post('login', { email: 'absent@example.com', password }), 401, 'WRONG_LOGIN')
})

test('me rejects malformed, tampered, expired or wrongly scoped JWTs and deleted accounts', async () => {
  await error(await me(), 401, 'NOT_LOGGED_IN')
  const sign = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, { issuer: 'ah-ma-ah-gong-can', audience: 'ah-ma-ah-gong-can:web', ...options })
  for (const value of ['bad', token.slice(0, -10) + 'tampered', sign({ sub: userId }, { expiresIn: -1 }), sign({ sub: userId }, { expiresIn: '7d', algorithm: 'HS384' }), sign({ sub: userId }, { expiresIn: '7d', issuer: 'another-app' }), sign({ sub: userId })]) {
    await error(await me(value), 401, 'NOT_LOGGED_IN')
  }
  await User.deleteOne({ _id: userId })
  await error(await me(token), 401, 'NOT_LOGGED_IN')
  await error(await me(signToken(new mongoose.Types.ObjectId(), false)), 401, 'NOT_LOGGED_IN')
})

test('missing database config fails safely and a later request can reconnect', async () => {
  await mongoose.disconnect()
  const uri = process.env.MONGODB_URI
  delete process.env.MONGODB_URI
  await error(await post('login', { email, password }), 503, 'SERVER_ERROR')
  process.env.MONGODB_URI = uri
  assert.equal((await post('login', { email: 'boundary@example.com', password: ' pass123' })).status, 200)
})

test('login and signup share the configured IP rate limit', async () => {
  let response
  for (let i = 0; i < 101; i++) response = await request(`/auth/${i % 2 ? 'signup' : 'login'}`, {}, { ip: '192.0.2.99' })
  await error(response, 429, 'RATE_LIMITED')
})
