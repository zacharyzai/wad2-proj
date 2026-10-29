// Every app feature needs an account. Checks the signed login token, then sets req.userId.
// A login made before the account's password last changed is refused, so a password reset logs out every other device.
import { sendError } from '../errors.js'
import { connectDb } from '../db.js'
import { User } from '../models/User.js'
import { bearer, readToken } from '../services/auth.js'

// True when the password changed after this login was made. Only checked against a real account in a reachable database:
// without one no password can have changed (sample scans and the e2e tests run without it), and during an outage the
// app keeps working rather than logging everyone out. Old tokens without an issue time count as made before the change.
async function endedByPasswordChange({ sub, iat }) {
  if (!process.env.MONGODB_URI || !/^[a-f0-9]{24}$/i.test(sub)) return false
  try {
    await connectDb()
  } catch {
    return false
  }
  const user = await User.findById(sub).select('passwordChangedAt').lean().catch(() => null)
  const changed = user?.passwordChangedAt
  return Boolean(changed) && !(Number.isInteger(iat) && iat >= Math.floor(changed.getTime() / 1000))
}

export async function requireAuth(req, res, next) {
  const payload = readToken(bearer(req))
  if (!payload || (await endedByPasswordChange(payload))) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  req.userId = payload.sub
  req.remember = payload.rem
  next()
}
