// Owner: Sheen Hern (built by Claude, declared in README.txt). Read-only share links for one saved scan, for family on
// WhatsApp who have no account. Contract: docs/history-contract.md (Share links).
//   POST   /api/share          { scanId }  owner only: a new link (replaces any earlier one) → { token, expiresAt }
//   DELETE /api/share/:token               owner only: stops the link
//   GET    /api/share/:token               anyone with the link: { scan } (contract fields only, never the account)
import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { withDb } from '../db.js'
import { sendError } from '../errors.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { shareRateLimit } from '../middleware/rateLimit.js'
import { Scan } from '../models/Scan.js'

const DAYS = 30
const TOKEN = /^[a-f0-9]{32}$/
// Expired, stopped, unknown or someone else's: all the same answer, so a link never reveals which.
const gone = (res) => sendError(res, 404, 'NOT_FOUND', 'This link is no longer available')

const router = Router()
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

router.post('/', requireAuth, (req, res) => {
  const { scanId } = req.body ?? {}
  if (!mongoose.isObjectIdOrHexString(req.userId) || !mongoose.isObjectIdOrHexString(scanId)) return gone(res)
  return withDb(res, async () => {
    const token = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + DAYS * 86_400_000)
    const { matchedCount } = await Scan.updateOne({ _id: scanId, userId: req.userId }, { $set: { shareToken: token, shareExpiresAt: expiresAt } })
    if (!matchedCount) return gone(res)
    res.status(201).json({ ok: true, data: { token, expiresAt } })
  })
})

router.delete('/:token', requireAuth, (req, res) => {
  if (!TOKEN.test(req.params.token) || !mongoose.isObjectIdOrHexString(req.userId)) return gone(res)
  return withDb(res, async () => {
    const { matchedCount } = await Scan.updateOne({ shareToken: req.params.token, userId: req.userId }, { $unset: { shareToken: 1, shareExpiresAt: 1 } })
    if (!matchedCount) return gone(res)
    res.json({ ok: true, data: { revoked: true } })
  })
})

router.get('/:token', shareRateLimit, (req, res) => {
  if (!TOKEN.test(req.params.token)) return gone(res)
  return withDb(res, async () => {
    const doc = await Scan.findOne({ shareToken: req.params.token, shareExpiresAt: { $gt: new Date() } }).select('type source medication bill').lean()
    if (!doc) return gone(res)
    res.json({ ok: true, data: { scan: { type: doc.type, source: doc.source, unclear: [], [doc.type]: doc[doc.type] } } })
  })
})

export default router
