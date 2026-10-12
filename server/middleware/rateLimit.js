// Protects the Gemini free quota. Only real image scans count; sample scans are exempt.
import { rateLimit } from 'express-rate-limit'

// shortcut: both counters live in process memory, so they reset on restart / serverless cold start
// and are per-instance; move to a MongoDB-backed store once the database is set up.
export const scanRateLimit = rateLimit({
  windowMs: (Number(process.env.SCAN_RATE_WINDOW_MIN) || 10) * 60_000,
  limit: Number(process.env.SCAN_RATE_LIMIT) || 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.body?.sampleId !== undefined,
  handler: (req, res) =>
    res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many scans, please try again later' } }),
})

// Global cap across all users, so rotating IPs can't drain the daily AI quota.
// Call only after validation, right before the AI call, so junk requests don't use it up.
let day = ''
let used = 0

export function takeDailyQuota() {
  const cap = Number(process.env.AI_DAILY_CAP) || 200
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) {
    day = today
    used = 0
  }
  if (used >= cap) return false
  used++
  return true
}
