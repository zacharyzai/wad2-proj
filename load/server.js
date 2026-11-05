// Throwaway test server: our real Express API with a throwaway in-memory MongoDB and mock AI. Used by the k6 load test
// (on :3100) and by the simple E2E tests (playwright.simple.config.js starts it on :3000, where the app's /api goes).
// Never touches Atlas, Gemini or .local. Everything is deleted when it stops (Ctrl+C).
// The per-IP rate limits are raised: every k6 virtual user comes from this one laptop, while real seniors each have their own IP.
import { MongoMemoryServer } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'

Object.assign(process.env, {
  USE_MOCK_AI: 'true',
  JWT_SECRET: randomBytes(48).toString('hex'),
  AUTH_RATE_LIMIT: '100000',
  DOSE_RATE_LIMIT: '100000',
  PORT: process.env.PORT || '3100',
})
const mongo = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongo.getUri('load_test')
await import('../server/index.js')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await mongo.stop()
    process.exit(0)
  })
}
