// Owner: Lokesh. Dose ticks for the Schedule page: which doses the user took on a day. Contract: docs/doses-contract.md
// Mounted behind requireAuth, and every query includes req.userId, so nobody can read or change another user's ticks.
import { Router } from 'express'
import mongoose from 'mongoose'
import { sendError } from '../errors.js'
import { withDb } from '../db.js'
import { Dose } from '../models/Dose.js'
import { doseRateLimit } from '../middleware/rateLimit.js'

// Same as the ids src/rules/schedule.js makes (`${medicineId}-${slot}`): letters, digits and hyphens.
const DOSE_ID = /^[A-Za-z0-9-]{1,80}$/
// 20 medicines × 6 doses (the Google sync limits), so a day can't fill up with made-up ids.
export const MAX_PER_DAY = 120
const DAY_MS = 86_400_000

const singaporeDay = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10) // Singapore has no daylight saving: always UTC+8

// Tomorrow is allowed (a device clock slightly ahead); anything older than a year is not a schedule day.
export function checkDate(date, now = Date.now()) {
  const day = new Date(`${date}T00:00:00Z`)
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
    return 'date must be a real date, YYYY-MM-DD'
  }
  if (date > singaporeDay(now + DAY_MS) || date < singaporeDay(now - 365 * DAY_MS)) return 'date must be within the last year'
  return null
}

function checkTick(body) {
  const { doseId, date } = body ?? {}
  if (typeof doseId !== 'string' || !DOSE_ID.test(doseId)) return { error: 'doseId must be 1 to 80 letters, digits or hyphens' }
  const error = checkDate(date)
  return error ? { error } : { tick: { doseId, date } }
}

const router = Router()
router.use(doseRateLimit, (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  // Tokens always carry a database id; anything else is not a real account.
  if (!mongoose.isValidObjectId(req.userId)) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  next()
})

router.get('/', (req, res) => {
  const error = checkDate(req.query.date)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return withDb(res, async () => {
    const ticks = await Dose.find({ userId: req.userId, date: req.query.date }, { doseId: 1 }).sort({ doseId: 1 }).lean()
    res.json({ ok: true, data: { date: req.query.date, taken: ticks.map((t) => t.doseId) } })
  })
})

// Ticking twice is fine: the first tick (and its time) is kept and returned.
router.post('/', (req, res) => {
  const { tick, error } = checkTick(req.body)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return withDb(res, async () => {
    const key = { userId: req.userId, ...tick }
    let dose = await Dose.findOne(key).lean()
    if (!dose) {
      if (await Dose.countDocuments({ userId: req.userId, date: tick.date }) >= MAX_PER_DAY) {
        return sendError(res, 400, 'BAD_REQUEST', `at most ${MAX_PER_DAY} doses a day`)
      }
      try {
        dose = (await Dose.create({ ...key, takenAt: new Date() })).toObject()
      } catch (err) {
        if (err?.code !== 11000) throw err
        dose = await Dose.findOne(key).lean() // the same tick arrived twice at once: the other one won
      }
    }
    res.json({ ok: true, data: { doseId: dose.doseId, date: dose.date, takenAt: dose.takenAt } })
  })
})

// Unticking a dose that isn't ticked is fine too: the end state is the same.
router.delete('/', (req, res) => {
  const { tick, error } = checkTick(req.body)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return withDb(res, async () => {
    await Dose.deleteOne({ userId: req.userId, ...tick })
    res.json({ ok: true, data: { ...tick, taken: false } })
  })
})

export default router
