// Owner: Sheen Hern (built by Claude, declared in README.txt). Contract: docs/auth-contract.md
import { Router } from 'express'
import { sendError } from '../errors.js'
import { connectDb } from '../db.js'
import { User, CITIZENSHIP } from '../models/User.js'
import { hashPassword, signToken, verifyPassword } from '../services/auth.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { authRateLimit } from '../middleware/rateLimit.js'

const MIN_PASSWORD = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Name, date of birth and citizenship: checked the same way at signup and when editing on the Account page.
// Returns the clean profile, or a message for a 400.
export function checkProfile(body, now = new Date()) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 80) return { error: 'name must be 1 to 80 characters' }

  const dob = typeof body?.dob === 'string' ? body.dob : ''
  const born = new Date(`${dob}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(born.getTime()) || born.toISOString().slice(0, 10) !== dob) return { error: 'dob must be a real date, YYYY-MM-DD' }
  const birthYear = born.getUTCFullYear()
  if (birthYear < 1900 || born > now) return { error: 'dob must be between 1900 and today' }

  const { citizenship } = body
  if (!CITIZENSHIP.includes(citizenship)) return { error: `citizenship must be one of ${CITIZENSHIP.join(', ')}` }
  let citizenSince = null
  if (citizenship === 'became') {
    citizenSince = Number(body.citizenSince)
    if (!Number.isInteger(citizenSince) || citizenSince < birthYear || citizenSince > now.getFullYear()) {
      return { error: 'citizenSince must be a year from the birth year to this year' }
    }
  }
  return { profile: { name, dob, citizenship, citizenSince } }
}

const answer = (res, user, remember) => res.json({ ok: true, data: { token: signToken(user.id, remember), user: user.toPublic() } })

// A database outage is our problem, not the user's: say so plainly instead of a 500 stack.
async function withDb(res, work) {
  try {
    await connectDb()
  } catch (err) {
    console.error('MongoDB:', err.message)
    return sendError(res, 503, 'SERVER_ERROR', 'Accounts are not available right now')
  }
  return work()
}

const router = Router()

router.post('/signup', authRateLimit, (req, res) => {
  const { email, password, remember = true } = req.body ?? {}
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!EMAIL.test(cleanEmail) || cleanEmail.length > 254) return sendError(res, 400, 'BAD_REQUEST', 'email is not valid')
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) {
    return sendError(res, 400, 'BAD_REQUEST', `password must be ${MIN_PASSWORD} to 200 characters`)
  }
  const { profile, error } = checkProfile(req.body)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)

  return withDb(res, async () => {
    try {
      const user = await User.create({ ...profile, email: cleanEmail, passwordHash: await hashPassword(password) })
      answer(res, user, remember)
    } catch (err) {
      if (err?.code === 11000) return sendError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists')
      throw err
    }
  })
})

router.post('/login', authRateLimit, (req, res) => {
  const { email, password, remember = true } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') return sendError(res, 400, 'BAD_REQUEST', 'email and password are required')

  return withDb(res, async () => {
    const user = await User.findOne({ email: email.trim().toLowerCase() })
    // Same answer for "no such email" and "wrong password", so the login form can't be used to find out who has an account.
    if (!user || !(await verifyPassword(password, user.passwordHash))) return sendError(res, 401, 'WRONG_LOGIN', 'Wrong email or password')
    answer(res, user, remember)
  })
})

// Who is logged in. With "Remember me", every visit hands back a fresh 30-day token, so regular users stay logged in.
router.get('/me', requireAuth, (req, res) =>
  withDb(res, async () => {
    const user = await User.findById(req.userId).catch(() => null)
    if (!user) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    res.json({ ok: true, data: { user: user.toPublic(), ...(req.remember ? { token: signToken(user.id, true) } : {}) } })
  }),
)

// Edit name, date of birth and citizenship (Account page). Email and password are not changed here.
router.patch('/me', requireAuth, (req, res) => {
  const { profile, error } = checkProfile(req.body)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  return withDb(res, async () => {
    const user = await User.findByIdAndUpdate(req.userId, profile, { returnDocument: 'after', runValidators: true }).catch(() => null)
    if (!user) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    res.json({ ok: true, data: { user: user.toPublic() } })
  })
})

export default router
