// Every app feature needs an account. Checks the signed login token only (no database call), then sets req.userId.
import { sendError } from '../errors.js'
import { bearer, readToken } from '../services/auth.js'

export function requireAuth(req, res, next) {
  const payload = readToken(bearer(req))
  if (!payload) return sendError(res, 401, 'NOT_LOGGED_IN', 'Please log in')
  req.userId = payload.sub
  req.remember = payload.rem
  next()
}
