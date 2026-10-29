import express from 'express'
import scanRouter from './routes/scan.js'
import chatRouter from './routes/chat.js'
import authRouter from './routes/auth.js'
import historyRouter from './routes/history.js'
import shareRouter from './routes/share.js'
import ttsRouter from './routes/tts.js'
import { sendError } from './errors.js'
import { requireAuth } from './middleware/requireAuth.js'
import googleRouter from './routes/google.js'
import dosesRouter from './routes/doses.js'
import scheduleRouter from './routes/schedule.js'
import careRouter from './routes/care.js'

const app = express()

// Real client IP behind Vercel/Render, needed for per-IP rate limiting.
app.set('trust proxy', 1)
// Vercel serverless rejects bodies over 4.5 MB, so cap below that.
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))
// Every feature needs an account (so only signed-up users use the AI quota). Only /api/auth and /api/health are open.
app.use('/api/scan', requireAuth, scanRouter)
app.use('/api/chat', requireAuth, chatRouter)
app.use('/api/auth', authRouter)
app.use('/api/history', historyRouter)
app.use('/api/share', shareRouter)
app.use('/api/tts', ttsRouter)
app.use('/api/google', googleRouter)
app.use('/api/doses', requireAuth, dosesRouter)
app.use('/api/schedule', requireAuth, scheduleRouter)
app.use('/api/care', careRouter)

app.use('/api', (req, res) => sendError(res, 404, 'NOT_FOUND', 'Unknown API route'))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return sendError(res, 413, 'IMAGE_TOO_LARGE', 'Image is too large')
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'BAD_REQUEST', 'Malformed JSON')
  console.error(err)
  sendError(res, 500, 'SERVER_ERROR', 'Something went wrong')
})

export default app
