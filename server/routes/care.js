// Owner: Sheen Hern. Invite/account linking, and (built by Claude, declared in README.txt) a caregiver's read-only view of a
// linked senior's doses today.
import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { rateLimit } from 'express-rate-limit'
import { connectDb } from '../db.js'
import { sendError } from '../errors.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { CareLink } from '../models/CareLink.js'
import { CareInviteQuota } from '../models/CareInviteQuota.js'
import { User } from '../models/User.js'
import { Dose } from '../models/Dose.js'
import { Schedule } from '../models/Schedule.js'
import { dosesOn, timeInSingapore, timeStates, todayInSingapore } from '../../src/rules/schedule.js'

const router = Router()
const WEEK = 7 * 24 * 3600_000
const HOUR = 3600_000
const tokenHash = (token) => createHash('sha256').update(token).digest('hex')
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
const roleOf = (user) => user.role ?? 'senior'
const gone = (res) => sendError(res, 404, 'NOT_FOUND', 'Invitation or link not found')
const wrongRole = (res) => sendError(res, 403, 'WRONG_ROLE', 'This account cannot perform that caregiver action')
const linked = (res) => sendError(res, 409, 'CAREGIVER_ALREADY_LINKED', 'Remove the current caregiver before creating another invitation')

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
// Public preview/accept abuse protection. The creation budget below is persistent across Vercel instances.
const inviteRateLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, 'RATE_LIMITED', 'Too many invitation requests; try again later') })

async function database(res, work) {
  try {
    await connectDb()
    await Promise.all([CareLink.init(), CareInviteQuota.init()])
    return await work()
  } catch (error) {
    if (error instanceof mongoose.Error || error instanceof mongoose.mongo.MongoError || mongoose.connection.readyState !== 1) {
      return sendError(res, 503, 'SERVER_ERROR', 'Caregiver linking is not available right now')
    }
    throw error
  }
}

// Roles come from the database, never a role/id in a request body or a cached browser profile.
function account(role) {
  return async (req, res, next) => {
    if (!mongoose.isObjectIdOrHexString(req.userId)) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    return database(res, async () => {
      const user = await User.findById(req.userId).select('name role').lean()
      if (!user) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
      if (role && roleOf(user) !== role) return wrongRole(res)
      req.careUser = user
      return next()
    })
  }
}
const senior = [requireAuth, account('senior')]
const caregiver = [requireAuth, account('caregiver')]
const either = [requireAuth, account()]

function liveInvite(token, now = new Date()) {
  return { tokenHash: tokenHash(token), caregiverId: null, inviteExpiresAt: { $gt: now } }
}

// At most five issued invites per account per fixed UTC hour; replacing/revoking a link cannot reset this budget.
async function takeInviteQuota(userId, now) {
  const window = new Date(Math.floor(now.getTime() / HOUR) * HOUR)
  const filter = { userId, window, count: { $lt: 5 } }
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(window.getTime() + 2 * HOUR) } }
  try {
    return Boolean(await CareInviteQuota.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' }))
  } catch (error) {
    if (error?.code !== 11000) throw error
    // Concurrent first inserts may collide; retry without upsert. A full budget still cannot be incremented.
    return Boolean(await CareInviteQuota.findOneAndUpdate(filter, { $inc: { count: 1 } }, { returnDocument: 'after' }))
  }
}

router.post('/invites', ...senior, inviteRateLimit, (req, res) => {
  if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
    return sendError(res, 400, 'BAD_REQUEST', 'No invitation fields are accepted; the signed-in senior owns the invitation')
  }
  return database(res, async () => {
    const active = await CareLink.findOne({ seniorId: req.userId, caregiverId: { $ne: null } }).select('caregiverId').lean()
    if (active) {
      if (await User.exists({ _id: active.caregiverId, role: 'caregiver' })) return linked(res)
      // A deleted caregiver cannot keep the senior's only slot locked forever. Compare the old link ID so a
      // concurrent replacement is never removed by this cleanup.
      await CareLink.deleteOne({ _id: active._id, seniorId: req.userId, caregiverId: active.caregiverId })
    }
    const now = new Date()
    if (!await takeInviteQuota(req.userId, now)) return sendError(res, 429, 'RATE_LIMITED', 'At most five caregiver invitations per hour')
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(now.getTime() + WEEK)
    try {
      // Creating a new invite rotates the old hash, but can NEVER overwrite an already accepted link.
      await CareLink.findOneAndUpdate({ seniorId: req.userId, caregiverId: null }, {
        $set: { tokenHash: tokenHash(token), inviteExpiresAt: expiresAt },
      }, { upsert: true, returnDocument: 'after', runValidators: true })
    } catch (error) {
      if (error?.code !== 11000) throw error
      // Another creation may have inserted a pending slot; it is safe to rotate that, never an active link.
      const pending = await CareLink.findOneAndUpdate({ seniorId: req.userId, caregiverId: null }, {
        $set: { tokenHash: tokenHash(token), inviteExpiresAt: expiresAt },
      }, { returnDocument: 'after', runValidators: true })
      if (!pending) return linked(res)
    }
    res.status(201).json({ ok: true, data: { token, expiresAt } })
  })
})

// Explicit cancel before acceptance; an active link must be removed by its own link ID instead.
router.delete('/invites', ...senior, (req, res) => database(res, async () => {
  const result = await CareLink.deleteOne({ seniorId: req.userId, caregiverId: null })
  res.json({ ok: true, data: { revoked: result.deletedCount === 1 } })
}))

router.get('/invites/:token', inviteRateLimit, (req, res) => {
  if (!validToken(req.params.token)) return gone(res)
  return database(res, async () => {
    const invite = await CareLink.findOne(liveInvite(req.params.token)).select('seniorId inviteExpiresAt').lean()
    if (!invite) return gone(res)
    const owner = await User.findById(invite.seniorId).select('name role').lean()
    if (!owner || roleOf(owner) !== 'senior') return gone(res)
    // Public possession of the random link reveals only the inviter's display name and expiry.
    res.json({ ok: true, data: { senior: { name: owner.name ?? '' }, expiresAt: invite.inviteExpiresAt } })
  })
})

router.post('/invites/:token/accept', ...caregiver, inviteRateLimit, (req, res) => {
  if (!validToken(req.params.token)) return gone(res)
  if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
    return sendError(res, 400, 'BAD_REQUEST', 'No acceptance fields are accepted; log in as the accepting caregiver')
  }
  return database(res, async () => {
    const filter = liveInvite(req.params.token)
    const invite = await CareLink.findOne(filter).select('seniorId').lean()
    if (!invite || String(invite.seniorId) === req.userId) return gone(res)
    const owner = await User.findById(invite.seniorId).select('role').lean()
    if (!owner || roleOf(owner) !== 'senior') return gone(res)
    const result = await CareLink.findOneAndUpdate({ ...liveInvite(req.params.token), _id: invite._id }, {
      $set: { caregiverId: req.userId, linkedAt: new Date() },
      $unset: { tokenHash: 1, inviteExpiresAt: 1 },
    }, { returnDocument: 'after', runValidators: true })
    if (!result) return gone(res) // already used, expired, replaced or revoked; one atomic update wins
    res.json({ ok: true, data: { seniorId: String(result.seniorId) } })
  })
})

router.get('/caregivers', ...senior, (req, res) => database(res, async () => {
  const link = await CareLink.findOne({ seniorId: req.userId, caregiverId: { $ne: null } }).lean()
  const user = link && await User.findById(link.caregiverId).select('name role').lean()
  const caregivers = user && roleOf(user) === 'caregiver' ? [{ id: String(link._id), name: user.name ?? '', since: link.linkedAt }] : []
  res.json({ ok: true, data: { caregivers } }) // zero or ONE; id is the link ID used for removal
}))

// Link management endpoint, independent of the later senior dashboard's schedule/status contract.
router.get('/links', ...either, (req, res) => database(res, async () => {
  const isCaregiver = roleOf(req.careUser) === 'caregiver'
  const docs = await CareLink.find(isCaregiver ? { caregiverId: req.userId } : { seniorId: req.userId, caregiverId: { $ne: null } }).sort({ linkedAt: -1, _id: -1 }).lean()
  const others = await User.find({ _id: { $in: docs.map((l) => isCaregiver ? l.seniorId : l.caregiverId) } }).select('name role').lean()
  const byId = new Map(others.map((u) => [String(u._id), u]))
  const links = docs.flatMap((l) => {
    const other = byId.get(String(isCaregiver ? l.seniorId : l.caregiverId))
    if (!other || roleOf(other) !== (isCaregiver ? 'senior' : 'caregiver')) return []
    return [{ id: String(l._id), since: l.linkedAt,
      senior: { id: String(l.seniorId), name: (isCaregiver ? other : req.careUser).name ?? '' },
      caregiver: { id: String(l.caregiverId), name: (isCaregiver ? req.careUser : other).name ?? '' } }]
  })
  res.json({ ok: true, data: { links } })
}))

router.delete('/links/:id', ...either, (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return gone(res)
  return database(res, async () => {
    const result = await CareLink.deleteOne({ _id: req.params.id, caregiverId: { $ne: null }, $or: [{ seniorId: req.userId }, { caregiverId: req.userId }] })
    if (!result.deletedCount) return gone(res)
    res.json({ ok: true, data: { id: req.params.id } })
  })
})

// A linked senior's doses today, from the timetable their app saved (PUT /api/schedule) and their ticks: taken, missed (its
// time has passed, the moment their own Today page says "Not ticked yet") or upcoming. null when the senior's app has never
// saved a timetable, so the caregiver sees "not shared yet", never invented zero counts.
async function dosesToday(seniorId) {
  const saved = await Schedule.findOne({ userId: seniorId }).select('entries').lean()
  if (!saved) return null
  const today = todayInSingapore()
  const doses = dosesOn(saved.entries, today)
  const taken = new Set((await Dose.find({ userId: seniorId, date: today }).select('doseId').lean()).map((d) => d.doseId))
  const times = [...new Set(doses.map((d) => d.time))]
  const states = timeStates(times, timeInSingapore())
  const passed = new Set(times.filter((t, i) => states[i] === 'earlier'))
  return doses.map((d) => ({ doseId: d.id, time: d.time, label: d.label, status: taken.has(d.id) ? 'taken' : passed.has(d.time) ? 'missed' : 'upcoming' }))
}
const counts = (doses) => doses && ['taken', 'missed', 'upcoming'].reduce((c, s) => ({ ...c, [s]: doses.filter((d) => d.status === s).length }), {})

router.get('/seniors', ...caregiver, (req, res) => database(res, async () => {
  const links = await CareLink.find({ caregiverId: req.userId }).sort({ linkedAt: -1, _id: -1 }).lean()
  const people = await User.find({ _id: { $in: links.map((l) => l.seniorId) } }).select('name role').lean()
  const seniors = []
  for (const person of people.filter((p) => roleOf(p) === 'senior')) {
    seniors.push({ id: String(person._id), name: person.name ?? '', today: counts(await dosesToday(person._id)) })
  }
  res.json({ ok: true, data: { seniors } })
}))

router.get('/seniors/:seniorId/today', ...caregiver, (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.seniorId)) return gone(res)
  return database(res, async () => {
    if (!await CareLink.exists({ seniorId: req.params.seniorId, caregiverId: req.userId })) return gone(res)
    const owner = await User.findById(req.params.seniorId).select('name role').lean()
    if (!owner || roleOf(owner) !== 'senior') return gone(res)
    const doses = await dosesToday(owner._id)
    res.json({ ok: true, data: { senior: { id: String(owner._id), name: owner.name ?? '' }, shared: doses !== null, doses: doses ?? [] } })
  })
})

export default router
