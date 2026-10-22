// Owner: Sheen Hern (built by Claude, declared in README.txt). Password hashing and login tokens, with Node's own crypto: no extra packages.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const DAY = 24 * 60 * 60

// "Remember me": 30 days, renewed on every visit (GET /me hands out a fresh one). Otherwise 12 hours, and the
// client keeps it in sessionStorage so it is gone when the browser closes.
export const TOKEN_SECONDS = { remember: 30 * DAY, session: DAY / 2 }

// Stored as scrypt$<salt>$<hash>, so the settings can change later without breaking old passwords.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt$${salt}$${hash.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored).split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scryptAsync(password, salt, expected.length)
  return timingSafeEqual(actual, expected)
}

function secret() {
  const value = process.env.JWT_SECRET
  if (!value) throw new Error('JWT_SECRET is not set') // fail closed: never sign with an empty key
  return value
}
const sign = (body) => createHmac('sha256', secret()).update(body).digest('base64url')

// A small signed token: <payload>.<signature>. payload = { sub: user id, rem: remember me, exp: unix seconds }.
// Checking it needs no database, so the scan and chat routes stay fast.
export function signToken(userId, remember, now = Date.now()) {
  const payload = { sub: String(userId), rem: Boolean(remember), exp: Math.floor(now / 1000) + TOKEN_SECONDS[remember ? 'remember' : 'session'] }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

// The payload, or null if the token is missing, forged or expired.
export function readToken(token, now = Date.now()) {
  const [body, sig] = String(token ?? '').split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return payload.exp > now / 1000 && payload.sub ? payload : null
  } catch {
    return null
  }
}

export const bearer = (req) => /^Bearer (.+)$/.exec(req.get('authorization') ?? '')?.[1]
