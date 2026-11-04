// Google Calendar: state, token encryption, event building, the sync plan, and the routes' answers before the database.
// Google is never called for real (fetch is stubbed).
import { test, beforeAll, afterAll, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long!!'
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/google/callback'
process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64')
delete process.env.MONGODB_URI
const { default: app } = await import('../app.js')
const { signToken, readToken } = await import('../services/auth.js')
const g = await import('../services/google.js')

let server, base
beforeAll(() => {
  server = app.listen(0)
  base = `http://localhost:${server.address().port}`
})
afterAll(() => server.close())
const realFetch = globalThis.fetch
afterEach(() => (globalThis.fetch = realFetch))
const AUTH = { authorization: `Bearer ${signToken('64b000000000000000000001', false)}` }
const call = (method, path, body, headers = AUTH) =>
  realFetch(`${base}/api/google${path}`, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) })

// Metformin twice a day for 30 days, as the Schedule page will send it.
const metformin = {
  medicineId: 'm1',
  label: 'Metformin 500mg',
  instruction: { count: 1, unit: 'tablet', food: 'after' },
  doses: [{ id: 'm1-morning', slot: 'morning', time: '08:00' }, { id: 'm1-night', slot: 'night', time: '21:00' }],
  startDate: '2026-10-23',
  endDate: '2026-11-21',
  flagged: false,
}

test('state: belongs to one user, expires after 10 minutes, and is never accepted as a login (or the other way round)', () => {
  const now = Date.UTC(2026, 9, 25)
  const state = g.signState('u1', '/schedule', now)
  assert.deepEqual({ ...g.readState(state, now), exp: undefined }, { purpose: 'google', sub: 'u1', next: '/schedule', exp: undefined })
  assert.equal(g.readState(state, now + 11 * 60 * 1000), null)
  assert.equal(g.readState(state.slice(0, -2) + 'xx', now), null)
  assert.equal(g.readState('nonsense', now), null)
  assert.equal(readToken(state, now), null) // a state from Google's address bar can't log anyone in
  assert.equal(g.readState(signToken('u1', true, now), now), null)
})

test('refresh tokens are encrypted at rest: unreadable, different every time, and tamper-proof', () => {
  const a = g.encrypt('1//refresh-token')
  assert.notEqual(a, g.encrypt('1//refresh-token'))
  assert.ok(!a.includes('refresh'))
  assert.equal(g.decrypt(a), '1//refresh-token')
  const [iv, tag, data] = a.split('.')
  assert.throws(() => g.decrypt([iv, tag, data.slice(0, -2) + (data.endsWith('A') ? 'BB' : 'AA')].join('.')))
})

test('the permission page asks for events only, with a refresh token', () => {
  const url = new URL(g.authUrl('s'))
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events')
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:5173/api/google/callback')
})

test('one repeating event per dose, in Singapore time, with an alert at dose time, in the user\'s language', () => {
  const [entry] = g.checkEntries([metformin]).entries
  const event = g.buildEvent(entry, entry.doses[1], 'en')
  assert.deepEqual(event, {
    summary: 'Take Metformin 500mg',
    description: '1 tablet, after food. Ask your pharmacist if unsure.',
    start: { dateTime: '2026-10-23T21:00:00', timeZone: 'Asia/Singapore' },
    end: { dateTime: '2026-10-23T21:15:00', timeZone: 'Asia/Singapore' },
    recurrence: ['RRULE:FREQ=DAILY;COUNT=30'],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  })
  assert.equal(g.buildEvent(entry, entry.doses[0], 'zh').summary, '服用 Metformin 500mg')
  assert.equal(g.buildEvent(entry, entry.doses[0], 'zh').description, '1 粒，饭后。如有疑问，请问药剂师。') // the unit and punctuation follow the language
  assert.equal(g.buildEvent({ ...entry, instruction: { count: 2, unit: 'tablet', food: null } }, entry.doses[0]).description, '2 tablets. Ask your pharmacist if unsure.')
  assert.equal(g.buildEvent({ ...entry, instruction: { count: 10, unit: 'ml', food: 'with' } }, entry.doses[0], 'ms').description, '10 ml, semasa makan. Tanya ahli farmasi jika tidak pasti.')
  // A dose at 23:50 ends after midnight, on the next day.
  assert.equal(g.buildEvent(entry, { id: 'x', time: '23:50' }).end.dateTime, '2026-10-24T00:05:00')
})

test('the schedule sent by the client is checked', () => {
  assert.equal(g.checkEntries([metformin]).entries[0].endDate, '2026-11-21')
  for (const bad of [
    'Metformin',
    Array(21).fill(metformin),
    [{ ...metformin, label: '' }],
    [{ ...metformin, doses: [{ id: 'a', time: '8am' }] }],
    [{ ...metformin, doses: [{ id: 'a', time: '24:00' }] }],
    [{ ...metformin, startDate: '2026-02-30' }],
    [{ ...metformin, endDate: '2026-10-01' }], // before the start
    [{ ...metformin, endDate: '2028-01-01' }], // over a year
  ]) {
    assert.ok(g.checkEntries(bad).error, JSON.stringify(bad).slice(0, 60))
  }
})

test('the "Not ticked yet" alert comes 15 minutes after the dose, every day of the course, in the user\'s language', () => {
  const [entry] = g.checkEntries([metformin]).entries
  assert.equal(g.FOLLOW_UP_MIN, 15)
  assert.deepEqual(g.buildFollowUpEvent(entry, entry.doses[0], 'en'), {
    summary: 'Not ticked yet: Metformin 500mg',
    description: 'If you have taken it, tick it in the app. Ask your pharmacist if unsure.',
    start: { dateTime: '2026-10-23T08:15:00', timeZone: 'Asia/Singapore' },
    end: { dateTime: '2026-10-23T08:30:00', timeZone: 'Asia/Singapore' },
    recurrence: ['RRULE:FREQ=DAILY;COUNT=30'],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  })
  for (const lang of g.LANGS) assert.ok(g.buildFollowUpEvent(entry, entry.doses[0], lang).summary.includes('Metformin 500mg'), lang) // the name stays as printed
  assert.equal(g.buildFollowUpEvent(entry, entry.doses[0], 'zh').summary, '还没打勾：Metformin 500mg')
  // A dose at 23:50 is followed up after midnight: the series starts on the next day, at 00:05.
  assert.equal(g.buildFollowUpEvent(entry, { id: 'x', time: '23:50' }).start.dateTime, '2026-10-24T00:05:00')
})

test('sync plan: create new doses, leave unchanged ones, patch changed ones, remove dropped ones; never flagged or endless ones', () => {
  const { entries } = g.checkEntries([metformin, { ...metformin, medicineId: 'p1', doses: [{ id: 'p1', time: '09:00' }], flagged: true }, { ...metformin, medicineId: 'e1', doses: [{ id: 'e1', time: '09:00' }], endDate: null }])
  const first = g.planSync(entries, new Map())
  assert.deepEqual(first.insert.map((p) => p.doseId), ['m1-morning', 'm1-morning:late', 'm1-night', 'm1-night:late']) // each dose and its follow-up alert
  assert.deepEqual(first.insert.filter((p) => p.doseId.endsWith(':late')).map((p) => p.time), ['08:00', '21:00']) // kept, so a tick can find its day
  assert.deepEqual(first.skipped, [{ medicineId: 'p1', reason: 'flagged' }, { medicineId: 'e1', reason: 'noEndDate' }])

  const stored = new Map(first.insert.map((p) => [p.doseId, { eventId: `ev-${p.doseId}`, hash: p.hash, time: p.time }]))
  const again = g.planSync(entries, stored)
  assert.deepEqual([again.insert, again.patch, again.remove], [[], [], []]) // safe to run twice

  const changed = g.checkEntries([{ ...metformin, doses: [{ id: 'm1-morning', time: '07:30' }] }]).entries
  const plan = g.planSync(changed, stored)
  assert.deepEqual(plan.patch.map((p) => [p.doseId, p.eventId, p.event.start.dateTime]), [
    ['m1-morning', 'ev-m1-morning', '2026-10-23T07:30:00'],
    ['m1-morning:late', 'ev-m1-morning:late', '2026-10-23T07:45:00'], // the follow-up moves with the dose
  ])
  assert.deepEqual(plan.remove, [{ doseId: 'm1-night', eventId: 'ev-m1-night' }, { doseId: 'm1-night:late', eventId: 'ev-m1-night:late' }])
})

// A GoogleLink stand-in: what syncSchedule reads and saves.
const fakeLink = (events = new Map()) => ({ refreshToken: g.encrypt('1//rt'), events, saved: 0, save() { this.saved++ } })

// Google: the token endpoint and the Calendar events endpoint. Records every Calendar call.
function stubGoogle({ tokenError } = {}) {
  const calls = []
  let n = 0
  globalThis.fetch = async (url, init) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return tokenError ? new Response(JSON.stringify({ error: tokenError }), { status: 400 }) : Response.json({ access_token: 'at' })
    }
    calls.push(`${init.method} ${url.replace('https://www.googleapis.com/calendar/v3/calendars/primary/events', '')}`)
    assert.equal(init.headers.authorization, 'Bearer at')
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    return Response.json({ id: `ev${++n}` })
  }
  return calls
}

test('syncSchedule creates the events once, then a second run does nothing', async () => {
  const calls = stubGoogle()
  const link = fakeLink()
  const { entries } = g.checkEntries([metformin])
  // Counted in doses (2), though each also gets a follow-up alert (4 events): the Schedule page shows "2 doses are in your calendar".
  assert.deepEqual(await g.syncSchedule(link, entries, 'en'), { created: 2, updated: 0, removed: 0, skipped: [] })
  assert.deepEqual(calls, ['POST ', 'POST ', 'POST ', 'POST '])
  assert.deepEqual([...link.events.keys()], ['m1-morning', 'm1-morning:late', 'm1-night', 'm1-night:late'])
  assert.equal(g.doseCount(link), 2)
  assert.equal(link.events.get('m1-night:late').time, '21:00')
  assert.equal(await g.syncSchedule(link, entries, 'en').then((r) => r.created + r.updated + r.removed), 0)
  assert.equal(calls.length, 4)
  assert.equal(link.saved, 2)

  await g.syncSchedule(link, [], 'en') // medicine removed from the schedule: its events go
  assert.deepEqual(calls.slice(4), ['DELETE /ev1', 'DELETE /ev2', 'DELETE /ev3', 'DELETE /ev4'])
  assert.equal(link.events.size, 0)
})

test('ticking a dose cancels that day\'s "Not ticked yet" alert, and unticking brings it back', async () => {
  const calls = []
  let status = 'confirmed' // what Google holds for that day's alert
  globalThis.fetch = async (url, init) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'at' })
    const path = decodeURIComponent(url.replace('https://www.googleapis.com/calendar/v3/calendars/primary/events', ''))
    calls.push(`${init.method} ${path}${init.body ? ' ' + init.body : ''}`)
    if (init.method === 'PATCH') status = JSON.parse(init.body).status
    if (init.method === 'GET') return Response.json({ items: [{ id: 'evL_20261104T001500Z', status }] })
    return Response.json({})
  }
  const link = fakeLink(new Map([['m1-morning:late', { eventId: 'evL', hash: 'h', time: '08:00' }], ['m1-morning', { eventId: 'evD', hash: 'h' }]]))

  assert.equal(await g.setFollowUpCancelled(link, 'm1-morning', '2026-11-04', true), true)
  assert.match(calls[0], /^GET \/evL\/instances\?timeMin=2026-11-04T08:15:00\+08:00&timeMax=2026-11-04T08:16:00\+08:00&showDeleted=true$/) // that one day, in Singapore time
  assert.equal(calls[1], 'PATCH /evL_20261104T001500Z {"status":"cancelled"}')

  assert.equal(await g.setFollowUpCancelled(link, 'm1-morning', '2026-11-04', false), true)
  assert.equal(calls[3], 'PATCH /evL_20261104T001500Z {"status":"confirmed"}')

  assert.equal(await g.setFollowUpCancelled(link, 'm1-morning', '2026-11-04', false), true) // already as wanted: no second PATCH
  assert.equal(calls.length, 5)
})

test('a tick with nothing to cancel does nothing: no follow-up stored, or that day is not in the course', async () => {
  const calls = []
  globalThis.fetch = async (url, init) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'at' })
    calls.push(init.method)
    return Response.json({ items: [] }) // no instance on that day
  }
  assert.equal(await g.setFollowUpCancelled(fakeLink(), 'm1-morning', '2026-11-04', true), false)
  assert.equal(calls.length, 0) // not connected for this dose: Google is not even asked
  const link = fakeLink(new Map([['m1-morning:late', { eventId: 'evL', hash: 'h', time: '08:00' }]]))
  assert.equal(await g.setFollowUpCancelled(link, 'm1-morning', '2027-06-01', true), false)
  assert.deepEqual(calls, ['GET'])
})

test('Google access removed (invalid_grant) is "connect again", not a crash', async () => {
  stubGoogle({ tokenError: 'invalid_grant' })
  await assert.rejects(g.syncSchedule(fakeLink(), [], 'en'), { code: 'GOOGLE_DISCONNECTED', status: 401 })
})

test('routes: login needed, Connect gives a permission page tied to this user, and the callback always lands on our page', async () => {
  assert.equal((await call('POST', '/connect', {}, {})).status, 401)

  const { data } = await (await call('POST', '/connect', { next: '/schedule' })).json()
  const state = new URL(data.url).searchParams.get('state')
  assert.equal(g.readState(state).sub, '64b000000000000000000001')

  let res = await call('GET', `/callback?code=abc&state=forged`, undefined, {})
  assert.equal(res.headers.get('location'), '/account?google=failed')
  res = await call('GET', `/callback?error=access_denied&state=${encodeURIComponent(state)}`, undefined, {})
  assert.equal(res.headers.get('location'), '/schedule?google=cancelled')

  // `next` can't send people to another website.
  const evil = await (await call('POST', '/connect', { next: '//evil.example' })).json()
  assert.equal(g.readState(new URL(evil.data.url).searchParams.get('state')).next, '/account')

  assert.equal((await call('POST', '/sync', { entries: 'nope' })).status, 400)
})

test('a server without Google settings says so instead of crashing', async () => {
  const id = process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_ID
  try {
    const res = await call('POST', '/connect', {})
    assert.equal(res.status, 503)
    assert.equal((await res.json()).error.code, 'GOOGLE_UNAVAILABLE')
  } finally {
    process.env.GOOGLE_CLIENT_ID = id
  }
})
