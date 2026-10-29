// Owner: Lokesh (built by Claude, declared in README.txt). The user's medicine list, kept on their account so every device
// shows the same Schedule and a linked caregiver sees the same doses. Behind requireAuth. Contract: docs/care-contract.md.
//   GET /api/schedule               → { medicines }  (null: this account has never saved a list)
//   PUT /api/schedule { medicines } → { saved }      the whole list, replacing the saved one
import { Router } from 'express'
import mongoose from 'mongoose'
import { withDb } from '../db.js'
import { sendError } from '../errors.js'
import { Schedule } from '../models/Schedule.js'
import { checkMedicines } from '../validation/medicines.js'
import { buildSchedule, syncEntries, todayInSingapore } from '../../src/rules/schedule.js'

const router = Router()
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (!mongoose.isObjectIdOrHexString(req.userId)) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  next()
})

router.get('/', (req, res) => withDb(res, async () => {
  const saved = await Schedule.findOne({ userId: req.userId }).select('medicines').lean()
  res.json({ ok: true, data: { medicines: saved?.medicines ?? null } })
}))

router.put('/', (req, res) => {
  const { medicines, error } = checkMedicines(req.body?.medicines)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  // The timetable comes from our own rules here, never from the client, so the caregiver sees exactly what Schedule shows.
  const entries = syncEntries(medicines.map((m) => buildSchedule(m, m.schedule ?? {})), todayInSingapore())
  return withDb(res, async () => {
    await Schedule.updateOne({ userId: req.userId }, { $set: { medicines, entries } }, { upsert: true })
    res.json({ ok: true, data: { saved: medicines.length } })
  })
})

export default router
