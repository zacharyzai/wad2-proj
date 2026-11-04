// Load-test server (Week 10, load testing): our real Express API on :3100 with a throwaway in-memory MongoDB and mock AI.
// Never touches Atlas, Gemini or .local. Everything is deleted when it stops (Ctrl+C).
// The per-IP rate limits are raised: every k6 virtual user comes from this one laptop, while real seniors each have their own IP.
import { MongoMemoryServer } from 'mongodb-memory-server'
import { randomBytes } from 'node:crypto'

Object.assign(process.env, {
  USE_MOCK_AI: 'true',
  JWT_SECRET: randomBytes(48).toString('hex'),
  AUTH_RATE_LIMIT: '100000',
  DOSE_RATE_LIMIT: '100000',
  PORT: '3100',
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
