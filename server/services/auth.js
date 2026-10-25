// Shared authentication for the current profile/Remember me contract and existing Atlas accounts.
import { createHmac, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'

const scryptAsync = promisify(scrypt)
const DAY = 24 * 60 * 60
const ISSUER = 'ah-ma-ah-gong-can'
const AUDIENCE = 'ah-ma-ah-gong-can:web'
export const TOKEN_SECONDS = { remember: 30 * DAY, session: DAY / 2 }

// New passwords use Argon2id. Existing main-branch scrypt hashes remain usable too.
export const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id })
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  try {
    if (stored.startsWith('$argon2id$')) return await argon2.verify(stored, password)
    const [kind, salt, hash, extra] = stored.split('$')
    if (kind !== 'scrypt' || !salt || !hash || extra) return false
    const expected = Buffer.from(hash, 'base64url')
    if (expected.length !== 64) return false
    const actual = await scryptAsync(password, salt, 64)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function jwtSecret() {
  const value = process.env.JWT_SECRET
  if (!value || Buffer.byteLength(value) < 32) throw new Error('JWT_SECRET must be at least 32 bytes')
  return value
}

export function signToken(userId, remember, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  return jwt.sign({ sub: String(userId), rem: Boolean(remember), iat,
    exp: iat + TOKEN_SECONDS[remember ? 'remember' : 'session'] }, jwtSecret(), {
    algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE,
  })
}

export function readToken(token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 8192) return null
  try {
    let payload
    if (token.split('.').length === 3) {
      // Includes the original seven-day JWTs issued before the profile/Remember me update.
      payload = jwt.verify(token, jwtSecret(), {
        algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, clockTimestamp: now / 1000,
      })
    } else {
      // Main previously issued <payload>.<signature>; keep unexpired sessions working.
      const parts = token.split('.')
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null
      const [body, sig] = parts
      const expected = Buffer.from(createHmac('sha256', jwtSecret()).update(body).digest('base64url'))
      const given = Buffer.from(sig)
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
      payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    }
    if (!payload || typeof payload.sub !== 'string' || !payload.sub ||
        !Number.isInteger(payload.exp) || payload.exp <= now / 1000 ||
        (payload.rem !== undefined && typeof payload.rem !== 'boolean')) return null
    return { ...payload, rem: payload.rem ?? false }
  } catch {
    return null
  }
}

export const bearer = (req) => /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '')?.[1]
