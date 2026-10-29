// Owner: Sheen Hern. Contract: docs/history-contract.md. Queries are scoped to the authenticated owner.
import { Router } from 'express'
import mongoose from 'mongoose'
import { connectDb } from '../db.js'
import { sendError } from '../errors.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { Scan } from '../models/Scan.js'
import { User } from '../models/User.js'
import { checkConfirmedScan } from '../validation/history.js'

const router = Router()
const PAGE_SIZE = 10
const missing = (res) => sendError(res, 404, 'NOT_FOUND', 'Saved scan not found')
const record = (doc) => ({ id: String(doc._id), createdAt: doc.createdAt, scan: { type: doc.type, source: doc.source, unclear: [], [doc.type]: doc[doc.type] } })

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
router.use(requireAuth)

// A deleted account's still-signed token must not create orphan history. Never expose driver errors/URIs.
async function database(req, res, work) {
  if (!mongoose.isObjectIdOrHexString(req.userId)) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  try {
    await connectDb()
    await Scan.init()
    if (!await User.exists({ _id: req.userId })) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    return await work()
  } catch (error) {
    if (error instanceof mongoose.Error || error instanceof mongoose.mongo.MongoError || mongoose.connection.readyState !== 1) {
      return sendError(res, 503, 'SERVER_ERROR', 'History is not available right now')
    }
    throw error
  }
}

router.post('/', (req, res) => {
  const { scan, error } = checkConfirmedScan(req.body)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return database(req, res, async () => {
    const saved = await Scan.create({ userId: req.userId, ...scan })
    res.status(201).json({ ok: true, data: record(saved.toObject({ versionKey: false })) })
  })
})

router.get('/', (req, res) => {
  const raw = req.query.page ?? '1'
  if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw) || Number(raw) > 100000 || Object.keys(req.query).some((k) => k !== 'page')) {
    return sendError(res, 400, 'BAD_REQUEST', 'page must be an integer from 1 to 100000; no other query parameters are supported')
  }
  const page = Number(raw)
  return database(req, res, async () => {
    const owner = { userId: req.userId }
    const [docs, total] = await Promise.all([
      Scan.find(owner).select('type source createdAt medication.name medication.strength bill.clinic bill.totalPayableCents shareToken shareExpiresAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Scan.countDocuments(owner),
    ])
    const now = new Date()
    // What the History page shows per row: the amount paid for a bill, and the share link while it still works.
    const items = docs.map((d) => {
      const sharing = d.shareToken && d.shareExpiresAt > now
      return { id: String(d._id), type: d.type, source: d.source, createdAt: d.createdAt,
        title: d.type === 'medication' ? [d.medication.name, d.medication.strength].filter(Boolean).join(' ') : d.bill.clinic ?? null,
        totalPayableCents: d.type === 'bill' ? d.bill.totalPayableCents : null,
        shareToken: sharing ? d.shareToken : null, shareExpiresAt: sharing ? d.shareExpiresAt : null }
    })
    res.json({ ok: true, data: { items, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, hasMore: page * PAGE_SIZE < total } })
  })
})

router.get('/:id', (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return missing(res)
  return database(req, res, async () => {
    const doc = await Scan.findOne({ _id: req.params.id, userId: req.userId }).select('-__v -userId -updatedAt').lean()
    if (!doc) return missing(res)
    res.json({ ok: true, data: record(doc) })
  })
})

router.delete('/:id', (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return missing(res)
  return database(req, res, async () => {
    const result = await Scan.deleteOne({ _id: req.params.id, userId: req.userId })
    if (!result.deletedCount) return missing(res)
    res.json({ ok: true, data: { id: req.params.id } })
  })
})

export default router
