import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.USE_MOCK_AI = 'true'
process.env.TTS_RATE_LIMIT = '1000'
process.env.GEMINI_API_KEY = 'test-key'
process.env.GEMINI_TTS_MODELS = 'tts-a,tts-b'
const { default: app } = await import('../app.js')
const { synthesize, forgetSpeech, silentWav } = await import('../services/tts.js')
const { forgetResting } = await import('../services/gemini.js')

let server, base
before(() => {
  server = app.listen(0)
  base = `http://localhost:${server.address().port}`
})
after(() => server.close())
beforeEach(() => (forgetSpeech(), forgetResting()))

const say = (body) => fetch(`${base}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('read-aloud needs text (up to 900 characters) and one of the four languages', async () => {
  for (const body of [{ lang: 'ta' }, { text: '   ', lang: 'ta' }, { text: 'hi', lang: 'fr' }, { text: 'x'.repeat(901), lang: 'en' }]) {
    const res = await say(body)
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error.code, 'BAD_REQUEST')
  }
})

test('with mock AI it answers with a short silent WAV and no account', async () => {
  const res = await say({ text: 'இன்று 1 மாத்திரை', lang: 'ta' })
  assert.equal(res.status, 200)
  const { data } = await res.json()
  assert.equal(Buffer.from(data.audio, 'base64').subarray(0, 4).toString(), 'RIFF')
  assert.equal(data.audio, silentWav())
})

test('synthesize falls back to the next model, then caches the clip', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const { model, input } = JSON.parse(init.body)
    calls.push(model)
    if (model === 'tts-a') return new Response('overloaded', { status: 503 })
    return Response.json({ steps: [{ content: [{ type: 'audio', data: `AUDIO:${input}` }] }] })
  })
  assert.equal(await synthesize('வணக்கம்', 'ta'), 'AUDIO:வணக்கம்')
  assert.deepEqual(calls, ['tts-a', 'tts-b'])
})

test('a reply with no audio is an outage, not an empty clip', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ steps: [{ content: [{ type: 'text', text: 'sorry' }] }] }))
  await assert.rejects(synthesize('hello', 'en'), { code: 'AI_UNAVAILABLE' })
})

test('24 kHz audio is halved to 12 kHz (same length in seconds); 16 kHz is left alone', async () => {
  const { shrink } = await import('../services/tts.js')
  const wav24 = Buffer.from(silentWav(100), 'base64')
  wav24.writeUInt32LE(24_000, 24) // pretend it is 24 kHz: 1600 samples
  const out = Buffer.from(shrink(wav24.toString('base64')), 'base64')
  assert.equal(out.readUInt32LE(24), 12_000)
  assert.equal(out.readUInt32LE(40), 800 * 2) // half the samples
  assert.equal(shrink(silentWav(100)), silentWav(100))
})
