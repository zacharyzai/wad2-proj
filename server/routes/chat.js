// Owner: Zachary. Contract: docs/chat-contract.md
import { Router } from 'express'
import { sendError } from '../errors.js'
import { chatRateLimit, takeDailyQuota } from '../middleware/rateLimit.js'
import { normalizeMedication } from '../services/normalizeScan.js'
import { askAboutMedicine, isRedFlag, mockReply, LANGS, MAX_QUESTION } from '../services/chat.js'
import { ScanError } from '../services/gemini.js'

// A real label is a few hundred characters; more means someone is stuffing the prompt.
const MAX_FACTS = 6000
const MAX_MEDICINES = 10
const SOURCES = ['label', 'typed']

const router = Router()

router.post('/', chatRateLimit, async (req, res) => {
  const { medicines = [], question, lang } = req.body ?? {}

  if (!Object.hasOwn(LANGS, lang)) return sendError(res, 400, 'BAD_REQUEST', 'lang must be en, zh, ms or ta')
  const q = typeof question === 'string' ? question.trim() : ''
  if (!q || q.length > MAX_QUESTION) return sendError(res, 400, 'BAD_REQUEST', `question must be 1 to ${MAX_QUESTION} characters`)
  // The user's medicines (may be empty). Only contract fields survive, so a name or NRIC added to the body never reaches the AI.
  if (!Array.isArray(medicines) || medicines.length > MAX_MEDICINES) {
    return sendError(res, 400, 'BAD_REQUEST', `medicines must be a list of at most ${MAX_MEDICINES}`)
  }
  const facts = medicines.map((m) => ({ source: SOURCES.includes(m?.source) ? m.source : null, ...normalizeMedication(m?.medication ?? {}).medication }))
  if (facts.some((f) => !f.source || !f.name) || JSON.stringify(facts).length > MAX_FACTS) {
    return sendError(res, 400, 'BAD_REQUEST', 'each medicine needs a source (label or typed) and a name')
  }

  // Emergencies get a fixed answer from our code, never from the AI.
  if (isRedFlag(q)) return res.json({ ok: true, data: { type: 'URGENT' } })

  if (!takeDailyQuota('chat')) return sendError(res, 429, 'RATE_LIMITED', 'Daily question limit reached, please try again tomorrow')
  if (process.env.USE_MOCK_AI !== 'false') return res.json({ ok: true, data: mockReply(facts, q) })

  try {
    res.json({ ok: true, data: await askAboutMedicine(facts, q, lang) })
  } catch (err) {
    if (err instanceof ScanError) return sendError(res, err.status, err.code, err.message)
    throw err
  }
})

export default router
