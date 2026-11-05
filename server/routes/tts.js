import { Router } from 'express'
import { sendError } from '../errors.js'
import { ttsRateLimit, takeDailyQuota } from '../middleware/rateLimit.js'
import { ScanError } from '../services/gemini.js'
import { MAX_TTS_CHARS, cachedSpeech, silentWav, synthesize } from '../services/tts.js'

const LANGS = new Set(['en', 'zh', 'ms', 'ta'])
const router = Router()

router.post('/', ttsRateLimit, async (req, res) => {
  const { lang } = req.body ?? {}
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text || text.length > MAX_TTS_CHARS || !LANGS.has(lang)) {
    return sendError(
      res,
      400,
      'BAD_REQUEST',
      `text (1–${MAX_TTS_CHARS} characters) and lang (en, zh, ms or ta) are required`,
    )
  }
  if (process.env.USE_MOCK_AI === 'true')
    return res.json({ ok: true, data: { audio: silentWav(), source: 'mock' } })

  const cached = cachedSpeech(text, lang)
  if (cached) return res.json({ ok: true, data: { audio: cached } }) // already made: costs nothing, so no quota taken
  if (!takeDailyQuota('tts'))
    return sendError(
      res,
      429,
      'RATE_LIMITED',
      'Daily read-aloud limit reached, please try again tomorrow',
    )

  try {
    res.json({ ok: true, data: { audio: await synthesize(text, lang) } })
  } catch (err) {
    if (err instanceof ScanError) return sendError(res, err.status, err.code, err.message)
    throw err
  }
})

export default router
