// Owner: Zachary (built by Claude, declared in README.txt). Google Calendar connection. Contract: docs/google-contract.md
import { Router } from 'express'
import { sendError } from '../errors.js'
import { connectDb, withDb } from '../db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { GoogleLink } from '../models/GoogleLink.js'
import {
  GoogleError, LANGS, authUrl, checkEntries, encrypt, exchangeCode, isConfigured, readState, removeAllEvents, decrypt, revoke, signState, syncSchedule,
} from '../services/google.js'

const router = Router()

// Only a plain path on our own site (like /account or /schedule), so the callback cannot be used to send people elsewhere.
const safeNext = (next) => (typeof next === 'string' && /^\/[a-z0-9/-]*$/i.test(next) && !next.startsWith('//') ? next : '/account')
const back = (res, next, result) => res.redirect(`${safeNext(next)}?google=${result}`)

// Google errors become our envelope; "access removed" also forgets the dead token, so the page shows Connect again.
async function google(res, userId, work) {
  try {
    return await work()
  } catch (err) {
    if (!(err instanceof GoogleError)) throw err
    if (err.code === 'GOOGLE_DISCONNECTED') await GoogleLink.deleteOne({ userId })
    return sendError(res, err.status, err.code, err.message)
  }
}

router.use((req, res, next) => (isConfigured() ? next() : sendError(res, 503, 'GOOGLE_UNAVAILABLE', 'Google Calendar is not set up on this server')))

// 1. Pressed "Connect Google Calendar": answer with Google's permission page. The page then goes there itself
// (a page visit can't carry our login token, which is why this is not a redirect).
router.post('/connect', requireAuth, (req, res) => {
  res.json({ ok: true, data: { url: authUrl(signState(req.userId, safeNext(req.body?.next))) } })
})

// 2. Google sends the browser back here with ?code&state, or ?error=access_denied when they said no.
// No requireAuth: it is a page visit from Google. `state` says who it is. Always ends on one of our pages, never on JSON.
router.get('/callback', async (req, res) => {
  const state = readState(req.query.state)
  if (!state) return back(res, null, 'failed')
  if (req.query.error || typeof req.query.code !== 'string') return back(res, state.next, 'cancelled')
  try {
    const refreshToken = await exchangeCode(req.query.code)
    await connectDb()
    // Reconnecting keeps the events we made, so the next sync updates them instead of making copies.
    await GoogleLink.updateOne({ userId: state.sub }, { $set: { refreshToken: encrypt(refreshToken) } }, { upsert: true })
    back(res, state.next, 'connected')
  } catch (err) {
    console.error('Google connect failed:', err.code ?? err.message) // never the token or the code
    back(res, state.next, 'failed')
  }
})

router.get('/status', requireAuth, (req, res) =>
  withDb(res, async () => {
    const link = await GoogleLink.findOne({ userId: req.userId }).catch(() => null)
    res.json({ ok: true, data: { connected: Boolean(link), events: link?.events.size ?? 0 } })
  }),
)

// 3. Make the user's Google Calendar match their schedule (call after the schedule is saved or changed).
router.post('/sync', requireAuth, (req, res) => {
  const { entries, error } = checkEntries(req.body?.entries)
  if (error) return sendError(res, 400, 'BAD_REQUEST', error)
  const lang = LANGS.includes(req.body?.lang) ? req.body.lang : 'en'
  return withDb(res, async () => {
    const link = await GoogleLink.findOne({ userId: req.userId }).catch(() => null)
    if (!link) return sendError(res, 409, 'GOOGLE_NOT_CONNECTED', 'Connect Google Calendar first')
    return google(res, req.userId, async () => res.json({ ok: true, data: await syncSchedule(link, entries, lang) }))
  })
})

// 4. Disconnect, optionally removing our events from their calendar first. Gives Google's access back either way.
router.post('/disconnect', requireAuth, (req, res) =>
  withDb(res, async () => {
    const link = await GoogleLink.findOne({ userId: req.userId }).catch(() => null)
    if (link) {
      if (req.body?.removeEvents === true) await removeAllEvents(link).catch(() => {}) // still disconnect if Google is down
      await revoke(decrypt(link.refreshToken))
      await link.deleteOne()
    }
    res.json({ ok: true, data: { connected: false } })
  }),
)

export default router
