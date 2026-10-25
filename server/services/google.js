// Owner: Zachary (built by Claude, declared in README.txt). Google Calendar: OAuth, encrypted refresh tokens, and one repeating
// event per dose with its own alert, so the phone rings at dose time even when our app is closed. Plain fetch, no googleapis package.
// Contract: docs/google-contract.md
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { DOSE_UNITS, WITH_FOOD } from './normalizeScan.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
// Events only: we can add and change our own events, but never read the rest of the person's calendar.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const STATE_SECONDS = 10 * 60
const TIME_ZONE = 'Asia/Singapore'
export const MAX_DAYS = 366 // a schedule longer than a year is almost certainly a typo

export class GoogleError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const isConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_TOKEN_KEY)

// --- state: proves the callback belongs to the user who pressed Connect ---------------------------------------------------------
// Signed like a login token, but with `purpose`, so a state (which passes through Google's address bar) can never be used as a login.
const hmac = (body) => createHmac('sha256', process.env.JWT_SECRET).update(`google-state.${body}`).digest('base64url')

export function signState(userId, next, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ purpose: 'google', sub: String(userId), next, exp: Math.floor(now / 1000) + STATE_SECONDS })).toString('base64url')
  return `${body}.${hmac(body)}`
}

export function readState(state, now = Date.now()) {
  const [body, sig] = String(state ?? '').split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(hmac(body))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.purpose === 'google' && p.sub && p.exp > now / 1000 ? p : null
  } catch {
    return null
  }
}

export function authUrl(state) {
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // a refresh token, so we can update events later while the user is not on our site
    prompt: 'consent', // Google only hands out a refresh token on the consent screen, so always show it (reconnects too)
    state,
  })}`
}

// --- refresh token at rest: AES-256-GCM, key in GOOGLE_TOKEN_KEY. Stored as iv.tag.ciphertext (base64url) -----------------------
const key = () => {
  const k = Buffer.from(process.env.GOOGLE_TOKEN_KEY ?? '', 'base64')
  if (k.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes, base64')
  return k
}

export function encrypt(text) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}

export function decrypt(stored) {
  const [iv, tag, data] = String(stored).split('.').map((p) => Buffer.from(p, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag) // a changed ciphertext fails here instead of decrypting to garbage
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// --- talking to Google ---------------------------------------------------------------------------------------------------------
const form = (fields) => new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...fields })

async function tokenRequest(fields) {
  let res
  try {
    res = await fetch(TOKEN_URL, { method: 'POST', body: form(fields) })
  } catch {
    throw new GoogleError(503, 'GOOGLE_UNAVAILABLE', 'Could not reach Google')
  }
  const data = await res.json().catch(() => ({}))
  // invalid_grant: the user removed our access in their Google account, or the token expired. They must connect again.
  if (data.error === 'invalid_grant') throw new GoogleError(401, 'GOOGLE_DISCONNECTED', 'Google access was removed, please connect again')
  if (!res.ok) throw new GoogleError(503, 'GOOGLE_UNAVAILABLE', `Google token request failed (${res.status})`)
  return data
}

// The one-time code from the callback → the refresh token we keep.
export async function exchangeCode(code) {
  const data = await tokenRequest({ code, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' })
  if (!data.refresh_token) throw new GoogleError(503, 'GOOGLE_UNAVAILABLE', 'Google did not send a refresh token')
  return data.refresh_token
}

// A short-lived (1 hour) access token for the Calendar calls.
export const accessToken = async (refreshToken) => (await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token

// Best effort: if Google is down, the token is still deleted on our side.
export const revoke = (refreshToken) => fetch(REVOKE_URL, { method: 'POST', body: new URLSearchParams({ token: refreshToken }) }).catch(() => {})

async function calendar(token, method, path = '', body) {
  let res
  try {
    res = await fetch(EVENTS_URL + path, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    })
  } catch {
    throw new GoogleError(503, 'GOOGLE_UNAVAILABLE', 'Could not reach Google Calendar')
  }
  if (res.status === 401) throw new GoogleError(401, 'GOOGLE_DISCONNECTED', 'Google access was removed, please connect again')
  if (res.status === 404 || res.status === 410) return null // the user already deleted this event in their calendar
  if (!res.ok) throw new GoogleError(503, 'GOOGLE_UNAVAILABLE', `Google Calendar answered ${res.status}`)
  return res.status === 204 ? {} : res.json()
}

// --- the schedule → events ------------------------------------------------------------------------------------------------------
// Event text in the user's language. Dose numbers stay digits; the medicine name stays as printed on the label.
const TEXT = {
  en: { take: (l) => `Take ${l}`, food: { before: 'before food', after: 'after food', with: 'with food', any: 'with or without food' }, ask: 'Ask your pharmacist if unsure.' },
  zh: { take: (l) => `服用 ${l}`, food: { before: '饭前', after: '饭后', with: '随餐', any: '饭前饭后都可以' }, ask: '如有疑问，请问药剂师。' },
  ms: { take: (l) => `Ambil ${l}`, food: { before: 'sebelum makan', after: 'selepas makan', with: 'semasa makan', any: 'sebelum atau selepas makan' }, ask: 'Tanya ahli farmasi jika tidak pasti.' },
  ta: { take: (l) => `${l} எடுக்கவும்`, food: { before: 'உணவுக்கு முன்', after: 'உணவுக்குப் பின்', with: 'உணவுடன்', any: 'உணவுடன் அல்லது இல்லாமல்' }, ask: 'சந்தேகம் இருந்தால் மருந்தாளரிடம் கேளுங்கள்.' },
}
export const LANGS = Object.keys(TEXT)

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isDate = (d) => typeof d === 'string' && DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
const str = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const days = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1

// Checks the schedule sent by the client (shape in docs/google-contract.md). Returns { entries } or { error } for a 400.
export function checkEntries(raw) {
  if (!Array.isArray(raw) || raw.length > 20) return { error: 'entries must be a list of at most 20 medicines' }
  const entries = []
  for (const e of raw) {
    const label = str(e?.label, 80)
    const medicineId = str(e?.medicineId, 40)
    if (!label || !medicineId) return { error: 'each entry needs a medicineId and a label' }
    if (!Array.isArray(e.doses) || e.doses.length > 6) return { error: 'doses must be a list of at most 6' }
    const doses = []
    for (const d of e.doses) {
      const id = str(d?.id, 60)
      if (!id || !TIME.test(d?.time ?? '')) return { error: 'each dose needs an id and a time like "08:00"' }
      doses.push({ id, time: d.time })
    }
    if (!isDate(e.startDate) || (e.endDate != null && !isDate(e.endDate))) return { error: 'startDate and endDate must be real dates, YYYY-MM-DD' }
    if (e.endDate && (days(e.startDate, e.endDate) < 1 || days(e.startDate, e.endDate) > MAX_DAYS)) {
      return { error: `endDate must be on or after startDate, at most ${MAX_DAYS} days` }
    }
    const i = e.instruction ?? {}
    entries.push({
      medicineId,
      label,
      instruction: {
        count: Number.isFinite(i.count) && i.count > 0 && i.count <= 100 ? i.count : null,
        unit: DOSE_UNITS.includes(i.unit) ? i.unit : null,
        food: WITH_FOOD.includes(i.food) ? i.food : null,
      },
      doses,
      startDate: e.startDate,
      endDate: e.endDate ?? null,
      flagged: e.flagged === true,
    })
  }
  return { entries }
}

// "08:00" + 15 minutes on a date, as a local date-time string. UTC is used only as a calculator here, so midnight rolls over correctly.
const localPlus = (date, time, minutes) => new Date(Date.parse(`${date}T${time}:00Z`) + minutes * 60000).toISOString().slice(0, 19)

export function buildEvent(entry, dose, lang = 'en') {
  const t = TEXT[lang] ?? TEXT.en
  const { count, unit, food } = entry.instruction
  const amount = [count, unit].filter((x) => x != null).join(' ')
  const description = [[amount, food && t.food[food]].filter(Boolean).join(', '), t.ask].filter(Boolean).join('. ')
  return {
    summary: t.take(entry.label),
    description,
    start: { dateTime: localPlus(entry.startDate, dose.time, 0), timeZone: TIME_ZONE }, // Google converts; never convert to UTC by hand
    end: { dateTime: localPlus(entry.startDate, dose.time, 15), timeZone: TIME_ZONE },
    recurrence: [`RRULE:FREQ=DAILY;COUNT=${days(entry.startDate, entry.endDate)}`],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  }
}

const fingerprint = (event) => createHash('sha256').update(JSON.stringify(event)).digest('base64url')

// What to do in Google, from what the schedule wants and what we created before (`stored`: doseId → { eventId, hash }).
// Pure, so it is easy to test. Flagged medicines (when necessary, tapering, ...) and schedules with no end date are never synced.
export function planSync(entries, stored, lang = 'en') {
  const plan = { insert: [], patch: [], remove: [], skipped: [] }
  const wanted = new Set()
  for (const entry of entries) {
    if (entry.flagged || !entry.endDate) {
      plan.skipped.push({ medicineId: entry.medicineId, reason: entry.flagged ? 'flagged' : 'noEndDate' })
      continue
    }
    for (const dose of entry.doses) {
      wanted.add(dose.id)
      const event = buildEvent(entry, dose, lang)
      const hash = fingerprint(event)
      const old = stored.get(dose.id)
      if (!old) plan.insert.push({ doseId: dose.id, event, hash })
      else if (old.hash !== hash) plan.patch.push({ doseId: dose.id, eventId: old.eventId, event, hash })
    }
  }
  for (const [doseId, { eventId }] of stored) if (!wanted.has(doseId)) plan.remove.push({ doseId, eventId })
  return plan
}

// Makes Google match the schedule. Safe to run twice: unchanged doses are left alone. `link` is the GoogleLink document.
// Saves after the work even if Google fails halfway, so events already created are remembered and not created twice.
export async function syncSchedule(link, entries, lang) {
  const token = await accessToken(decrypt(link.refreshToken))
  const plan = planSync(entries, link.events, lang)
  try {
    for (const { doseId, event, hash } of plan.insert) {
      const created = await calendar(token, 'POST', '', event)
      link.events.set(doseId, { eventId: created.id, hash })
    }
    for (const p of plan.patch) {
      // Deleted in their calendar since: create it again.
      const done = (await calendar(token, 'PATCH', `/${encodeURIComponent(p.eventId)}`, p.event)) ?? (await calendar(token, 'POST', '', p.event))
      link.events.set(p.doseId, { eventId: done.id, hash: p.hash })
    }
    for (const { doseId, eventId } of plan.remove) {
      await calendar(token, 'DELETE', `/${encodeURIComponent(eventId)}`)
      link.events.delete(doseId)
    }
  } finally {
    await link.save()
  }
  return { created: plan.insert.length, updated: plan.patch.length, removed: plan.remove.length, skipped: plan.skipped }
}

// Disconnect with "also remove the events from my calendar". Best effort per event: one failure doesn't stop the rest.
export async function removeAllEvents(link) {
  const token = await accessToken(decrypt(link.refreshToken))
  for (const { eventId } of link.events.values()) await calendar(token, 'DELETE', `/${encodeURIComponent(eventId)}`).catch(() => {})
}
