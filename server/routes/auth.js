// Owner: Sheen Hern (built by Claude, declared in README.txt). Contract: docs/auth-contract.md
import { createHash } from 'node:crypto'
import { Router } from 'express'
import { sendError } from '../errors.js'
import { withDb } from '../db.js'
import { User, CITIZENSHIP, INCOME, LANGUAGES, THEMES, ROLES } from '../models/User.js'
import { PasswordResetQuota } from '../models/PasswordResetQuota.js'
import { hashPassword, signToken, verifyPassword, jwtSecret, signResetToken, readResetToken, resetTokenMatches, RESET_SECONDS } from '../services/auth.js'
import { appUrl, resetLink, sendMail } from '../services/mail.js'
import { resetEmail } from '../services/resetEmail.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { authRateLimit, forgotRateLimit, resetRateLimit } from '../middleware/rateLimit.js'

const MIN_PASSWORD = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Name, date of birth, citizenship and (for citizens) household income: checked the same way at signup and when editing on the Account page.
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
  // CHAS is for citizens only, so only they are asked; anyone else stores null.
  let income = null
  if (citizenship === 'birth' || citizenship === 'became') {
    if (!INCOME.includes(body.income)) return { error: `income must be one of ${INCOME.join(', ')}` }
    income = body.income
  }
  return { profile: { name, dob, citizenship, citizenSince, income } }
}

// The app language: optional (the client sends the one in use), so accounts made before it existed still work.
const checkLanguage = (language) => (language === undefined || LANGUAGES.includes(language) ? null : `language must be one of ${LANGUAGES.join(', ')}`)
// Day, night or follow the device: optional in the same way.
const checkTheme = (theme) => (theme === undefined || THEMES.includes(theme) ? null : `theme must be one of ${THEMES.join(', ')}`)

const answer = (res, user, remember, status = 200) => res.status(status).json({ ok: true, data: { token: signToken(user.id, remember), user: user.toPublic() } })

let dummyHash
const router = Router()
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
function configured(res) {
  try { jwtSecret(); return true } catch {
    sendError(res, 503, 'AUTH_UNAVAILABLE', 'Authentication is not configured')
    return false
  }
}

router.post('/signup', authRateLimit, (req, res) => {
  const { email, password, remember = true } = req.body ?? {}
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const role = req.body?.role === undefined ? 'senior' : req.body.role
  if (!ROLES.includes(role)) return sendError(res, 400, 'BAD_REQUEST', 'role must be senior or caregiver')
  if (!EMAIL.test(cleanEmail) || cleanEmail.length > 254) return sendError(res, 400, 'BAD_REQUEST', 'email is not valid')
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) {
    return sendError(res, 400, 'BAD_REQUEST', `password must be ${MIN_PASSWORD} to 200 characters`)
  }
  const { profile, error } = checkProfile(req.body)
  const settingError = checkLanguage(req.body?.language) ?? checkTheme(req.body?.theme)
  if (error || settingError) return sendError(res, 400, 'BAD_REQUEST', error ?? settingError)

  if (!configured(res)) return
  return withDb(res, async () => {
    try {
      const user = await User.create({ ...profile, role, language: req.body.language ?? null, theme: req.body.theme ?? null, email: cleanEmail, passwordHash: await hashPassword(password) })
      answer(res, user, remember, 201)
    } catch (err) {
      if (err?.code === 11000) return sendError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists')
      throw err
    }
  })
})

router.post('/login', authRateLimit, (req, res) => {
  const { email, password, remember = true } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') return sendError(res, 400, 'BAD_REQUEST', 'email and password are required')

  if (!configured(res)) return
  return withDb(res, async () => {
    const user = await User.findOne({ email: email.trim().toLowerCase() })
    // Same answer for "no such email" and "wrong password", so the login form can't be used to find out who has an account.
    dummyHash ??= hashPassword('unused-dummy-password')
    const matches = await verifyPassword(password, user?.passwordHash ?? await dummyHash)
    if (!user || !matches) return sendError(res, 401, 'WRONG_LOGIN', 'Wrong email or password')
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

// Edit the details (Account page), the settings (language, theme), or both. `{ language }` or `{ theme }` alone just
// changes that setting; anything else is the full details form. Email and password are not changed here.
router.patch('/me', requireAuth, (req, res) => {
  if (req.body && Object.hasOwn(req.body, 'role')) return sendError(res, 400, 'BAD_REQUEST', 'Account role cannot be changed through profile editing')
  const { language, theme, ...rest } = req.body ?? {}
  const settingError = checkLanguage(language) ?? checkTheme(theme)
  if (settingError) return sendError(res, 400, 'BAD_REQUEST', settingError)
  let update = { ...(language && { language }), ...(theme && { theme }) }
  if (Object.keys(rest).length || !Object.keys(update).length) {
    const { profile, error } = checkProfile(rest)
    if (error) return sendError(res, 400, 'BAD_REQUEST', error)
    update = { ...update, ...profile }
  }
  if (!configured(res)) return
  return withDb(res, async () => {
    const user = await User.findByIdAndUpdate(req.userId, update, { returnDocument: 'after', runValidators: true }).catch(() => null)
    if (!user) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
    res.json({ ok: true, data: { user: user.toPublic() } })
  })
})

// ---- Forgot your password? (docs/auth-contract.md) ----
const HOUR = 60 * 60 * 1000
const EMAILS_PER_HOUR = 3
const emailHash = (email) => createHash('sha256').update(email).digest('hex')

// At most EMAILS_PER_HOUR per address per hour, across every server instance. False once the hour's budget is spent.
async function takeEmailQuota(email, now = new Date()) {
  const window = new Date(Math.floor(now.getTime() / HOUR) * HOUR)
  const filter = { emailHash: emailHash(email), window, count: { $lt: EMAILS_PER_HOUR } }
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(window.getTime() + 2 * HOUR) } }
  try {
    return Boolean(await PasswordResetQuota.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' }))
  } catch (error) {
    if (error?.code !== 11000) throw error
    // A spent budget makes the upsert try a duplicate insert; concurrent first requests can too. Retry without upsert.
    return Boolean(await PasswordResetQuota.findOneAndUpdate(filter, { $inc: { count: 1 } }, { returnDocument: 'after' }))
  }
}

// Emails a reset link when an account uses this address. The answer is the same either way, so the form can't be used
// to find out who has an account. The email is sent before answering (on Vercel the function may stop once it answers).
// shortcut: a real account takes a little longer to answer (the email is sent); fine at this size.
router.post('/forgot', forgotRateLimit, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 254) return sendError(res, 400, 'BAD_REQUEST', 'email is not valid')
  if (!configured(res)) return
  try {
    appUrl()
  } catch {
    console.error('APP_URL is not set, so reset links cannot be made')
    return sendError(res, 503, 'MAIL_UNAVAILABLE', 'Password reset emails are not available right now')
  }
  return withDb(res, async () => {
    if (!(await takeEmailQuota(email))) return sendError(res, 429, 'RATE_LIMITED', 'Too many reset emails for this address, please wait an hour')
    const user = await User.findOne({ email }).select('name email language passwordHash')
    if (user) {
      const language = user.language ?? (LANGUAGES.includes(req.body?.language) ? req.body.language : 'en')
      try {
        await sendMail({ to: user.email, ...resetEmail({ name: user.name, language, link: resetLink(signResetToken(user)) }) })
      } catch (error) {
        console.error('Password reset email failed:', error?.message) // never the address or the link
        return sendError(res, 503, 'MAIL_UNAVAILABLE', 'We could not send the email right now, please try again later')
      }
    }
    res.json({ ok: true, data: { minutes: RESET_SECONDS / 60 } })
  })
})

// Sets the new password from an emailed link, logs out every other device, and logs this one in.
router.post('/reset', resetRateLimit, (req, res) => {
  const { token, password, remember = true } = req.body ?? {}
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) {
    return sendError(res, 400, 'BAD_REQUEST', `password must be ${MIN_PASSWORD} to 200 characters`)
  }
  if (!configured(res)) return
  const link = readResetToken(token)
  const badLink = () => sendError(res, 400, 'RESET_LINK_INVALID', 'This link has expired or was already used')
  if (!link) return badLink()
  return withDb(res, async () => {
    const user = await User.findById(link.sub).catch(() => null)
    if (!user || !resetTokenMatches(link, user)) return badLink()
    // Only if the password is still the one the link was made for: a link pressed twice at once still works only once.
    const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000) // whole second: the login handed back below stays valid
    const updated = await User.findOneAndUpdate(
      { _id: user._id, passwordHash: user.passwordHash },
      { $set: { passwordHash: await hashPassword(password), passwordChangedAt: changedAt } },
      { returnDocument: 'after', runValidators: true },
    )
    if (!updated) return badLink()
    answer(res, updated, remember)
  })
})

export default router
