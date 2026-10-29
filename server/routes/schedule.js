// Owner: Lokesh (built by Claude, declared in README.txt). PUT /api/schedule { entries }: the user's whole timetable, saved to
// their account whenever it changes (src/stores/scheduleSync.js), so a linked caregiver can see today's doses. Behind requireAuth.
import { Router } from 'express'
import mongoose from 'mongoose'
import { withDb } from '../db.js'
import { sendError } from '../errors.js'
import { Schedule } from '../models/Schedule.js'
import { checkEntries } from '../services/google.js'

const router = Router()
router.put('/', (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.userId)) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  const { entries, error } = checkEntries(req.body?.entries)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return withDb(res, async () => {
    await Schedule.updateOne({ userId: req.userId }, { $set: { entries } }, { upsert: true })
    res.json({ ok: true, data: { saved: entries.length } })
  })
})

export default router
