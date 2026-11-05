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
// GET /all: every scan's summary at once (newest first), so the History page can group, search and sort without paging.
// A generous cap keeps one response small (each summary is about 300 bytes).
const ALL_LIMIT = 500
const SUMMARY_FIELDS =
  'type source createdAt medication.name medication.strength medication.purpose bill.clinic bill.totalPayableCents'
const missing = (res) => sendError(res, 404, 'NOT_FOUND', 'Saved scan not found')
const record = (doc) => ({
  id: String(doc._id),
  createdAt: doc.createdAt,
  scan: { type: doc.type, source: doc.source, unclear: [], [doc.type]: doc[doc.type] },
})

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
router.use(requireAuth)

// A deleted account's still-signed token must not create orphan history. Never expose driver errors/URIs.
async function database(req, res, work) {
  if (!mongoose.isObjectIdOrHexString(req.userId))
    return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  try {
    await connectDb()
    await Scan.init()
    if (!(await User.exists({ _id: req.userId })))
      return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    return await work()
  } catch (error) {
    if (
      error instanceof mongoose.Error ||
      error instanceof mongoose.mongo.MongoError ||
      mongoose.connection.readyState !== 1
    ) {
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

// What the History page shows per row: the amount paid for a bill.
function summary(d) {
  return {
    id: String(d._id),
    type: d.type,
    source: d.source,
    createdAt: d.createdAt,
    title:
      d.type === 'medication'
        ? [d.medication.name, d.medication.strength].filter(Boolean).join(' ')
        : (d.bill.clinic ?? null),
    purpose: d.type === 'medication' ? (d.medication.purpose ?? null) : null,
    totalPayableCents: d.type === 'bill' ? d.bill.totalPayableCents : null,
  }
}

router.get('/', (req, res) => {
  const raw = req.query.page ?? '1'
  if (
    typeof raw !== 'string' ||
    !/^[1-9]\d{0,5}$/.test(raw) ||
    Number(raw) > 100000 ||
    Object.keys(req.query).some((k) => k !== 'page')
  ) {
    return sendError(
      res,
      400,
      'BAD_REQUEST',
      'page must be an integer from 1 to 100000; no other query parameters are supported',
    )
  }
  const page = Number(raw)
  return database(req, res, async () => {
    const owner = { userId: req.userId }
    const [docs, total] = await Promise.all([
      Scan.find(owner)
        .select(SUMMARY_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      Scan.countDocuments(owner),
    ])
    const now = new Date()
    const items = docs.map((d) => summary(d, now))
    res.json({
      ok: true,
      data: {
        items,
        page,
        pageSize: PAGE_SIZE,
        pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        total,
        hasMore: page * PAGE_SIZE < total,
      },
    })
  })
})

// Every summary at once (up to ALL_LIMIT, newest first), plus each bill's visit date for its month. No query parameters.
// Declared before /:id, which would otherwise take "all" as an id.
router.get('/all', (req, res) => {
  if (Object.keys(req.query).length)
    return sendError(res, 400, 'BAD_REQUEST', 'no query parameters are supported')
  return database(req, res, async () => {
    const owner = { userId: req.userId }
    const [docs, total] = await Promise.all([
      Scan.find(owner)
        .select(`${SUMMARY_FIELDS} bill.visitDate`)
        .sort({ createdAt: -1, _id: -1 })
        .limit(ALL_LIMIT)
        .lean(),
      Scan.countDocuments(owner),
    ])
    const now = new Date()
    const items = docs.map((d) => ({
      ...summary(d, now),
      visitDate: d.type === 'bill' ? (d.bill.visitDate ?? null) : null,
    }))
    res.json({ ok: true, data: { items, total, capped: total > items.length } })
  })
})

router.get('/:id', (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return missing(res)
  return database(req, res, async () => {
    const doc = await Scan.findOne({ _id: req.params.id, userId: req.userId })
      .select('-__v -userId -updatedAt')
      .lean()
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
