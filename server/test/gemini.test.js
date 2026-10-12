// Gemini is never called for real: global fetch is stubbed per test.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { extractScan, ScanError } from '../services/gemini.js'

const IMG = 'data:image/png;base64,AAAA'
const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  process.env.GEMINI_API_KEY = 'test-key'
})
process.env.GEMINI_API_KEY = 'test-key'

const reply = (status, body) => {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status })
}
const geminiText = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] })
const rejectsWith = (code) => assert.rejects(extractScan('medication', IMG), (e) => e instanceof ScanError && e.code === code)

test('success is normalized into the contract', async () => {
  let sent
  globalThis.fetch = async (url, init) => {
    sent = { url, init }
    return new Response(JSON.stringify(geminiText({ readable: true, name: 'Metformin', doseAmount: 1, timesPerDay: 2, frequencyType: 'daily' })))
  }
  const scan = await extractScan('medication', IMG)
  assert.equal(scan.source, 'ai')
  assert.equal(scan.medication.name, 'Metformin')
  assert.equal(sent.init.headers['x-goog-api-key'], 'test-key')
  assert.equal(JSON.parse(sent.init.body).contents[0].parts[0].inline_data.mime_type, 'image/png')
})

test('error mapping', async () => {
  delete process.env.GEMINI_API_KEY
  await rejectsWith('AI_UNAVAILABLE')
  process.env.GEMINI_API_KEY = 'test-key'

  reply(429, {})
  await rejectsWith('RATE_LIMITED')

  reply(500, { error: 'boom' })
  await rejectsWith('AI_UNAVAILABLE')

  reply(200, geminiText({ readable: false }))
  await rejectsWith('UNREADABLE_IMAGE')

  reply(200, { candidates: [] })
  await rejectsWith('UNREADABLE_IMAGE')

  reply(200, { candidates: [{ content: { parts: [{ text: 'not json' }] } }] })
  await rejectsWith('AI_UNAVAILABLE')

  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  await rejectsWith('AI_UNAVAILABLE')
})
