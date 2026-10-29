// Protects the free AI quota. Only real image scans and chat questions count; sample scans are exempt.
import { rateLimit } from 'express-rate-limit'

const limiter = (windowMin, limit, message, skip, extra = {}) =>
  rateLimit({
    windowMs: windowMin * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    ...extra,
    handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message } }),
  })

// shortcut: all counters live in process memory, so they reset on restart / serverless cold start
// and are per-instance; move to a MongoDB-backed store once the database is set up.
export const scanRateLimit = limiter(
  Number(process.env.SCAN_RATE_WINDOW_MIN) || 10,
  Number(process.env.SCAN_RATE_LIMIT) || 10,
  'Too many scans, please try again later',
  (req) => req.body?.sampleId !== undefined,
)
export const chatRateLimit = limiter(1, Number(process.env.CHAT_RATE_LIMIT) || 10, 'Too many questions, please try again later')
// Read-aloud for devices without a voice: open without an account (the welcome page uses it), so per IP.
export const ttsRateLimit = limiter(1, Number(process.env.TTS_RATE_LIMIT) || 12, 'Too many read-alouds, please try again later')
// Slows password guessing: only failed logins and signups count.
// Dose ticks are cheap, but a script shouldn't be able to hammer the database. Far above what a person tapping ticks can reach.
export const doseRateLimit = limiter(1, Number(process.env.DOSE_RATE_LIMIT) || 60, 'Too many changes, please wait a minute')
// Opening a share link needs no account: per IP, far above what a family member clicking a link can reach.
export const shareRateLimit = limiter(1, Number(process.env.SHARE_RATE_LIMIT) || 60, 'Too many requests, please wait a minute')
export const authRateLimit =limiter(15, Number(process.env.AUTH_RATE_LIMIT) || 10, 'Too many tries, please wait a few minutes', undefined, { skipSuccessfulRequests: true })

// Global cap across all users, so rotating IPs can't drain the daily AI quota. Scan, chat and read-aloud
// count separately (they use different models, so different quotas). Call only after validation, right before the AI call.
const CAPS = { scan: ['AI_DAILY_CAP', 200], chat: ['AI_CHAT_DAILY_CAP', 500], tts: ['AI_TTS_DAILY_CAP', 300] }
const counters = {}

export function takeDailyQuota(kind = 'scan') {
  const [envName, fallback] = CAPS[kind]
  const cap = Number(process.env[envName]) || fallback
  const today = new Date().toISOString().slice(0, 10)
  const c = (counters[kind] ??= { day: '', used: 0 })
  if (today !== c.day) Object.assign(c, { day: today, used: 0 })
  if (c.used >= cap) return false
  c.used++
  return true
}
