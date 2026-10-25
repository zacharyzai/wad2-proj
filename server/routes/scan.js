// Owner: Zachary. Contract: docs/scan-contract.md
import { Router } from 'express'
import { sendError } from '../errors.js'
import { scanRateLimit, takeDailyQuota } from '../middleware/rateLimit.js'
import { extractScan, ScanError } from '../services/gemini.js'
import med1 from '../fixtures/med-1.json' with { type: 'json' }
import med2 from '../fixtures/med-2.json' with { type: 'json' }
import med3 from '../fixtures/med-3.json' with { type: 'json' }
import bill1 from '../fixtures/bill-1.json' with { type: 'json' }
import bill2 from '../fixtures/bill-2.json' with { type: 'json' }
import bill3 from '../fixtures/bill-3.json' with { type: 'json' }
import bill4 from '../fixtures/bill-4.json' with { type: 'json' }

// Fixed lookup: sampleId is never used as a file path.
const SAMPLES = new Map([
  ['med-1', med1],
  ['med-2', med2],
  ['med-3', med3],
  ['bill-1', bill1],
  ['bill-2', bill2],
  ['bill-3', bill3],
  ['bill-4', bill4], // a hospital stay: ward, GST, MediShield Life (no subsidy estimate: not a polyclinic or GP bill)
])
const MOCK_BY_TYPE = { medication: med1, bill: bill1 }
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

const router = Router()

router.post('/', scanRateLimit, async (req, res) => {
  const { type, image, sampleId } = req.body ?? {}

  if (sampleId !== undefined) {
    const sample = typeof sampleId === 'string' && SAMPLES.get(sampleId)
    if (!sample) return sendError(res, 404, 'NOT_FOUND', 'Unknown sample')
    return res.json({ ok: true, data: { ...sample, source: 'sample' } })
  }

  if (!Object.hasOwn(MOCK_BY_TYPE, type)) return sendError(res, 400, 'BAD_REQUEST', 'type must be "medication" or "bill"')
  if (typeof image !== 'string' || !IMAGE_DATA_URL.test(image)) {
    return sendError(res, 400, 'BAD_REQUEST', 'image must be a base64 JPEG, PNG or WebP data URL')
  }

  if (!takeDailyQuota()) return sendError(res, 429, 'RATE_LIMITED', 'Daily scan limit reached, please try again tomorrow')

  if (process.env.USE_MOCK_AI !== 'false') {
    return res.json({ ok: true, data: { ...MOCK_BY_TYPE[type], source: 'mock' } })
  }

  try {
    res.json({ ok: true, data: await extractScan(type, image) })
  } catch (err) {
    if (err instanceof ScanError) return sendError(res, err.status, err.code, err.message)
    throw err // Express 5 forwards it to the error handler in app.js
  }
})

export default router
