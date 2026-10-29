// Real account linking and races against disposable MongoDB. Never loads .env or shared Atlas data.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { CareLink } from '../models/CareLink.js'
import { CareInviteQuota } from '../models/CareInviteQuota.js'
import { User } from '../models/User.js'
import { signToken } from '../services/auth.js'
import { Dose } from '../models/Dose.js'
import { addDays, todayInSingapore } from '../../src/rules/schedule.js'

process.env.JWT_SECRET = randomBytes(48).toString('hex')
process.env.USE_MOCK_AI = 'true'
process.env.AUTH_RATE_LIMIT = '1000'
const { default: app } = await import('../app.js')
let mongo, server, api, sequence = 0, ipSequence = 0
const profile = { name: 'Test Senior', dob: '1952-03-07', citizenship: 'birth', income: 'unsure' }
const password = 'care-test-password'
const digest = (t) => createHash('sha256').update(t).digest('hex')
const request = (path, { method = 'GET', token, body, ip = `192.0.2.${(++ipSequence % 250) + 1}` } = {}) => fetch(`${api}${path}`, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const care = (path, options) => request(`/care${path}`, options)
const invite = (user, body) => care('/invites', { method: 'POST', token: user.token, body })
const preview = (t) => care(`/invites/${t}`)
const accept = (user, t, body) => care(`/invites/${t}/accept`, { method: 'POST', token: user.token, body })
const links = async (user) => (await (await care('/links', { token: user.token })).json()).data.links
async function user(role = 'senior', name = 'Test User') {
  const email = `care-${++sequence}@example.com`
  const r = await request('/auth/signup', { method: 'POST', body: { ...profile, name, role, email, password } })
  assert.equal(r.status, 201)
  const { data } = await r.json()
  const doc = await User.findOne({ email }).lean()
  return { ...data, id: String(doc._id), email }
}
async function issued(owner) {
  const r = await invite(owner)
  assert.equal(r.status, 201)
  return (await r.json()).data
}
async function error(response, status, code) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.ok, false)
  assert.equal(body.error.code, code)
  return body
}
before(async () => {
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri('care_test')
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  api = `http://127.0.0.1:${server.address().port}/api`
})
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await mongoose.disconnect()
  await mongo?.stop()
})

test('signup persists and returns roles; login/me restore them; legacy accounts default to senior', async () => {
  const cg = await user('caregiver')
  assert.equal(cg.user.role, 'caregiver')
  const login = await request('/auth/login', { method: 'POST', body: { email: cg.email, password } })
  assert.equal((await login.json()).data.user.role, 'caregiver')
  const me = await request('/auth/me', { token: cg.token })
  assert.equal((await me.json()).data.user.role, 'caregiver')
  for (const role of ['admin', null, { $ne: 'senior' }]) {
    await error(await request('/auth/signup', { method: 'POST', body: { ...profile, email: 'bad-role@example.com', password, role } }), 400, 'BAD_REQUEST')
  }
  await error(await request('/auth/me', { method: 'PATCH', token: cg.token, body: { ...profile, role: 'senior' } }), 400, 'BAD_REQUEST')
  const oldId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({ _id: oldId, name: 'Legacy Senior', email: 'legacy-care@example.com', passwordHash: 'not-used' })
  const token = signToken(oldId, false)
  assert.equal((await (await request('/auth/me', { token })).json()).data.user.role, 'senior')
  assert.equal((await care('/invites', { method: 'POST', token })).status, 201)
})

test('private endpoints require a real account and enforce roles from MongoDB', async () => {
  const senior = await user()
  const cg = await user('caregiver')
  const t = randomBytes(32).toString('hex')
  for (const [path, method] of [['/invites', 'POST'], ['/invites', 'DELETE'], [`/invites/${t}/accept`, 'POST'], ['/caregivers', 'GET'], ['/links', 'GET'], [`/links/${new mongoose.Types.ObjectId()}`, 'DELETE'], ['/seniors', 'GET']]) {
    await error(await care(path, { method }), 401, 'NOT_LOGGED_IN')
  }
  await error(await invite(cg), 403, 'WRONG_ROLE')
  await error(await care('/caregivers', { token: cg.token }), 403, 'WRONG_ROLE')
  await error(await accept(senior, t), 403, 'WRONG_ROLE')
  for (const sub of ['invalid', String(new mongoose.Types.ObjectId())]) {
    await error(await care('/links', { token: signToken(sub, false) }), 401, 'NOT_LOGGED_IN')
  }
  await User.deleteOne({ _id: cg.id })
  await error(await care('/links', { token: cg.token }), 401, 'NOT_LOGGED_IN')
})

test('invite is a seven-day random secret; only its hash is stored and public preview reveals only name/expiry', async () => {
  const owner = await user('senior', 'Sample Senior')
  const data = await issued(owner)
  assert.deepEqual(Object.keys(data).sort(), ['expiresAt', 'token'])
  assert.match(data.token, /^[a-f0-9]{64}$/)
  assert.ok(Math.abs(Date.parse(data.expiresAt) - Date.now() - 7 * 86400_000) < 3000)
  const stored = await CareLink.findOne({ seniorId: owner.id }).select('+tokenHash').lean()
  assert.equal(stored.tokenHash, digest(data.token))
  assert.doesNotMatch(JSON.stringify(stored), new RegExp(data.token))
  assert.equal((await CareLink.findById(stored._id).lean()).tokenHash, undefined)
  assert.equal(stored.caregiverId, null)
  const response = await preview(data.token)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true, data: { senior: { name: 'Sample Senior' }, expiresAt: data.expiresAt } })
  const indexes = await CareLink.collection.indexes()
  assert.ok(indexes.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ seniorId: 1 })))
  assert.ok(!indexes.some((i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ caregiverId: 1 })))
})

test('an existing caregiver can log in and accept; one caregiver may link several seniors', async () => {
  const cg = await user('caregiver', 'Sample Caregiver')
  const owners = [await user('senior', 'Senior One'), await user('senior', 'Senior Two')]
  for (const owner of owners) {
    const i = await issued(owner)
    const accepted = await accept(cg, i.token)
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { ok: true, data: { seniorId: owner.id } })
    await error(await preview(i.token), 404, 'NOT_FOUND')
    await error(await accept(cg, i.token), 404, 'NOT_FOUND')
    const { data } = await (await care('/caregivers', { token: owner.token })).json()
    assert.equal(data.caregivers.length, 1)
    assert.equal(data.caregivers[0].name, 'Sample Caregiver')
    assert.equal(data.caregivers[0].id, (await links(owner))[0].id)
    assert.ok(Number.isFinite(Date.parse(data.caregivers[0].since)))
    await error(await invite(owner), 409, 'CAREGIVER_ALREADY_LINKED')
  }
  const all = await links(cg)
  assert.equal(all.length, 2)
  assert.deepEqual(new Set(all.map((l) => l.senior.id)), new Set(owners.map((o) => o.id)))
  assert.doesNotMatch(JSON.stringify(all), /email|dob|password|token|citizenship|income/)
  await mongoose.disconnect()
  assert.equal((await links(cg)).length, 2)
})

test('two caregivers racing to accept the same invitation cannot claim the same senior', async () => {
  const owner = await user()
  const a = await user('caregiver'), b = await user('caregiver')
  const i = await issued(owner)
  const responses = await Promise.all([accept(a, i.token), accept(b, i.token)])
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404])
  const stored = await CareLink.findOne({ seniorId: owner.id }).select('+tokenHash').lean()
  assert.equal(await CareLink.countDocuments({ seniorId: owner.id }), 1)
  assert.equal(stored.tokenHash, undefined)
  assert.equal(stored.inviteExpiresAt, undefined)
  assert.ok([a.id, b.id].includes(String(stored.caregiverId)))
  assert.equal((await links(a)).length + (await links(b)).length, 1)
  await error(await invite(owner), 409, 'CAREGIVER_ALREADY_LINKED')
})

test('rotating/cancelling an invitation invalidates the old link; expiry is enforced without waiting for cleanup', async () => {
  const owner = await user(), cg = await user('caregiver')
  const first = await issued(owner), second = await issued(owner)
  assert.notEqual(first.token, second.token)
  const unknown = await error(await preview(randomBytes(32).toString('hex')), 404, 'NOT_FOUND')
  assert.deepEqual(await error(await preview(first.token), 404, 'NOT_FOUND'), unknown)
  await error(await accept(cg, first.token), 404, 'NOT_FOUND')
  assert.equal((await preview(second.token)).status, 200)
  assert.deepEqual((await (await care('/invites', { method: 'DELETE', token: owner.token })).json()).data, { revoked: true })
  await error(await accept(cg, second.token), 404, 'NOT_FOUND')
  const third = await issued(owner)
  await CareLink.updateOne({ seniorId: owner.id }, { $set: { inviteExpiresAt: new Date(Date.now() - 1) } })
  assert.deepEqual(await error(await preview(third.token), 404, 'NOT_FOUND'), unknown)
  await error(await accept(cg, third.token), 404, 'NOT_FOUND')
  await error(await preview('bad'), 404, 'NOT_FOUND')
})

test('only the linked senior/caregiver can revoke; revocation cannot restore a consumed invite', async () => {
  const owner = await user(), cg = await user('caregiver'), stranger = await user('caregiver')
  const first = await issued(owner)
  assert.equal((await accept(cg, first.token)).status, 200)
  const [link] = await links(owner)
  assert.equal((await care(`/seniors/${owner.id}/today`, { token: cg.token })).status, 200)
  await error(await care(`/links/${link.id}`, { method: 'DELETE', token: stranger.token }), 404, 'NOT_FOUND')
  await error(await care(`/links/not-an-id`, { method: 'DELETE', token: owner.token }), 404, 'NOT_FOUND')
  // Cancelling pending invitations never accidentally deletes the active caregiver.
  assert.equal((await (await care('/invites', { method: 'DELETE', token: owner.token })).json()).data.revoked, false)
  assert.equal((await care(`/links/${link.id}`, { method: 'DELETE', token: owner.token })).status, 200)
  assert.deepEqual(await links(cg), [])
  await error(await care(`/seniors/${owner.id}/today`, { token: cg.token }), 404, 'NOT_FOUND')
  await error(await preview(first.token), 404, 'NOT_FOUND')
  await error(await accept(stranger, first.token), 404, 'NOT_FOUND')
  const next = await issued(owner)
  assert.equal((await accept(stranger, next.token)).status, 200)
  const [newLink] = await links(stranger)
  assert.notEqual(newLink.id, link.id)
  assert.equal((await care(`/links/${newLink.id}`, { method: 'DELETE', token: stranger.token })).status, 200)
  assert.equal((await (await care('/caregivers', { token: owner.token })).json()).data.caregivers.length, 0)
})

test('a replaced invitation racing acceptance never installs two caregivers or overwrites an active one', async () => {
  const owner = await user(), cg = await user('caregiver')
  const first = await issued(owner)
  const [created, accepted] = await Promise.all([invite(owner), accept(cg, first.token)])
  assert.ok([201, 409].includes(created.status))
  assert.ok([200, 404].includes(accepted.status))
  assert.equal(await CareLink.countDocuments({ seniorId: owner.id }), 1)
  const stored = await CareLink.findOne({ seniorId: owner.id }).select('+tokenHash').lean()
  if (accepted.status === 200) {
    assert.equal(String(stored.caregiverId), cg.id)
    assert.equal(stored.tokenHash, undefined)
    assert.equal((await links(owner)).length, 1)
  } else {
    assert.equal(created.status, 201)
    assert.equal(stored.caregiverId, null)
    const next = (await created.json()).data
    assert.equal((await accept(cg, next.token)).status, 200)
  }
})

test('a deleted caregiver cannot permanently lock the senior out of issuing a replacement invitation', async () => {
  const owner = await user(), first = await user('caregiver'), replacement = await user('caregiver')
  const i = await issued(owner)
  assert.equal((await accept(first, i.token)).status, 200)
  await User.deleteOne({ _id: first.id })
  assert.deepEqual((await (await care('/caregivers', { token: owner.token })).json()).data.caregivers, [])
  const next = await issued(owner)
  assert.equal((await accept(replacement, next.token)).status, 200)
  assert.equal(await CareLink.countDocuments({ seniorId: owner.id }), 1)
  assert.equal((await links(owner))[0].caregiver.id, replacement.id)
})

test('quota is atomic and survives invite cancellation; concurrent creation is bounded across instances', async () => {
  const owner = await user()
  const responses = await Promise.all(Array.from({ length: 8 }, () => invite(owner)))
  assert.equal(responses.filter((r) => r.status === 201).length, 5)
  assert.equal(responses.filter((r) => r.status === 429).length, 3)
  assert.equal(await CareLink.countDocuments({ seniorId: owner.id }), 1)
  const quota = await CareInviteQuota.findOne({ userId: owner.id }).lean()
  assert.equal(quota.count, 5)
  await care('/invites', { method: 'DELETE', token: owner.token })
  await error(await invite(owner), 429, 'RATE_LIMITED')
  // Leave the old row in place: a new hour gets a new budget without relying on the TTL monitor.
  await CareInviteQuota.updateOne({ _id: quota._id }, { $set: { window: new Date(quota.window.getTime() - 3600_000) } })
  assert.equal((await invite(owner)).status, 201)
})

test('no client body can choose the senior/caregiver or silently change an account role', async () => {
  const owner = await user(), cg = await user('caregiver')
  await error(await invite(owner, { seniorId: cg.id }), 400, 'BAD_REQUEST')
  const i = await issued(owner)
  await error(await accept(cg, i.token, { caregiverId: owner.id }), 400, 'BAD_REQUEST')
  await error(await accept(owner, i.token), 403, 'WRONG_ROLE')
  assert.equal((await preview(i.token)).status, 200)
  // Even a database role change cannot let the same account claim its own outstanding invite.
  await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(owner.id) }, { $set: { role: 'caregiver' } })
  await error(await accept(owner, i.token), 404, 'NOT_FOUND')
})

test('deleted senior invites cannot be previewed/accepted; today is only readable once linked', async () => {
  const owner = await user(), cg = await user('caregiver')
  const i = await issued(owner)
  await error(await care(`/seniors/${owner.id}/today`, { token: cg.token }), 404, 'NOT_FOUND')
  assert.equal((await accept(cg, i.token)).status, 200)
  // Never saved a timetable: "not shared yet", never invented zero counts.
  const [listed] = (await (await care('/seniors', { token: cg.token })).json()).data.seniors
  assert.deepEqual(listed, { id: owner.id, name: 'Test User', today: null })
  const today = (await (await care(`/seniors/${owner.id}/today`, { token: cg.token })).json()).data
  assert.deepEqual(today, { senior: { id: owner.id, name: 'Test User' }, shared: false, doses: [] })
  const missing = await user(), t = await issued(missing)
  await User.deleteOne({ _id: missing.id })
  await error(await preview(t.token), 404, 'NOT_FOUND')
  await error(await accept(cg, t.token), 404, 'NOT_FOUND')
})

test('database failures are sanitized and recover on later requests', async () => {
  const owner = await user()
  await mongoose.disconnect()
  const uri = process.env.MONGODB_URI
  try {
    delete process.env.MONGODB_URI
    const body = await error(await care('/links', { token: owner.token }), 503, 'SERVER_ERROR')
    assert.equal(body.error.message, 'Caregiver linking is not available right now')
  } finally { process.env.MONGODB_URI = uri }
  assert.equal((await care('/links', { token: owner.token })).status, 200)
  const original = CareLink.find
  try {
    CareLink.find = () => { throw new mongoose.mongo.MongoServerError({ message: 'private connection details must not escape' }) }
    const body = await error(await care('/links', { token: owner.token }), 503, 'SERVER_ERROR')
    assert.doesNotMatch(JSON.stringify(body), /private/)
  } finally { CareLink.find = original }
})

test('public invitation probing is also limited by IP', async () => {
  let response
  for (let i = 0; i < 61; i++) response = await request('/care/invites/unknown', { ip: '198.51.100.99' })
  await error(response, 429, 'RATE_LIMITED')
})

test("a caregiver sees the linked senior's saved timetable and ticks for today, and nobody else's", async () => {
  const owner = await user('senior', 'Ah Ma'), cg = await user('caregiver'), stranger = await user('caregiver')
  assert.equal((await accept(cg, (await issued(owner)).token)).status, 200)
  const today = todayInSingapore()
  const entry = (id, startDate, endDate, flagged = false) => ({ medicineId: id, label: `Medicine ${id}`, instruction: { count: 1, unit: 'tablet', food: null },
    doses: [{ id: `${id}-morning`, time: '08:00' }, { id: `${id}-night`, time: '21:00' }], startDate, endDate, flagged })
  const entries = [entry('m1', today, addDays(today, 6)), entry('old', addDays(today, -9), addDays(today, -3)), entry('prn', today, null, true)]
  const save = (token, body) => request('/schedule', { method: 'PUT', token, body })
  assert.equal((await save(undefined, { entries })).status, 401)
  assert.equal((await save(owner.token, { entries: [{ ...entries[0], startDate: 'soon' }] })).status, 400)
  assert.deepEqual((await (await save(owner.token, { entries })).json()).data, { saved: 3 })
  await Dose.create({ userId: owner.id, date: today, doseId: 'm1-morning', takenAt: new Date() })

  const body = (await (await care(`/seniors/${owner.id}/today`, { token: cg.token })).json()).data
  assert.equal(body.shared, true)
  // Only today's course; the ended one and the "when needed" one are left out. The ticked dose is taken whatever the time.
  assert.deepEqual(body.doses.map((d) => [d.doseId, d.time, d.label]), [['m1-morning', '08:00', 'Medicine m1'], ['m1-night', '21:00', 'Medicine m1']])
  assert.equal(body.doses[0].status, 'taken')
  assert.ok(['missed', 'upcoming'].includes(body.doses[1].status))
  const [listed] = (await (await care('/seniors', { token: cg.token })).json()).data.seniors
  assert.deepEqual(listed.today, { taken: 1, missed: Number(body.doses[1].status === 'missed'), upcoming: Number(body.doses[1].status === 'upcoming') })

  // Saving again replaces the copy (one per account), and a caregiver who is not linked sees nothing.
  assert.equal((await save(owner.token, { entries: [] })).status, 200)
  assert.deepEqual((await (await care(`/seniors/${owner.id}/today`, { token: cg.token })).json()).data.doses, [])
  await error(await care(`/seniors/${owner.id}/today`, { token: stranger.token }), 404, 'NOT_FOUND')
  assert.deepEqual((await (await care('/seniors', { token: stranger.token })).json()).data.seniors, [])
})
