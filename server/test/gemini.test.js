// Gemini is never called for real: global fetch is stubbed per test.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { attempts, extractScan, forgetResting, ScanError } from '../services/gemini.js'

const IMG = 'data:image/png;base64,AAAA'
const realFetch = globalThis.fetch
afterEach(() => {
  forgetResting() // each test starts with every model fresh
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

// Fallback models: each stubbed reply is used once, in order; `calls` records which model was asked.
function replies(...list) {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url.match(/models\/([^:]+):/)[1])
    const next = list.shift()
    if (next instanceof Error) throw next
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status })
  }
  return calls
}
const OK = { status: 200, body: geminiText({ readable: true, name: 'Metformin', doseAmount: 1, timesPerDay: 2, frequencyType: 'daily' }) }

test('falls back to the next model when one is overloaded, slow, out of quota or retired', async (t) => {
  process.env.GEMINI_MODEL = 'main'
  process.env.GEMINI_FALLBACK_MODELS = 'backup-1, backup-2'
  t.after(() => {
    delete process.env.GEMINI_MODEL
    delete process.env.GEMINI_FALLBACK_MODELS
  })

  for (const failure of [{ status: 503 }, { status: 500 }, { status: 429 }, { status: 404 }, new DOMException('slow', 'TimeoutError')]) {
    forgetResting()
    const calls = replies(failure, OK)
    assert.equal((await extractScan('medication', IMG)).medication.name, 'Metformin')
    assert.deepEqual(calls, ['main', 'backup-1'])
  }

  forgetResting()
  const calls = replies({ status: 503 }, { status: 503 }, OK)
  await extractScan('medication', IMG)
  assert.deepEqual(calls, ['main', 'backup-1', 'backup-2'])
})

test('a model that was just overloaded is tried last for a while, so the next scan goes straight to one that works', async (t) => {
  process.env.GEMINI_MODEL = 'main'
  process.env.GEMINI_FALLBACK_MODELS = 'backup-1, backup-2'
  t.after(() => {
    delete process.env.GEMINI_MODEL
    delete process.env.GEMINI_FALLBACK_MODELS
  })
  let calls = replies({ status: 503 }, new DOMException('slow', 'TimeoutError'), OK)
  await extractScan('medication', IMG)
  assert.deepEqual(calls, ['main', 'backup-1', 'backup-2'])

  calls = replies(OK)
  await extractScan('medication', IMG)
  assert.deepEqual(calls, ['backup-2']) // main and backup-1 are resting

  calls = replies({ status: 503 }, OK) // the working one fails too: the resting ones are still tried, in their usual order
  await extractScan('medication', IMG)
  assert.deepEqual(calls, ['backup-2', 'main'])

  // A bad request is our fault, not the model's: it doesn't send the model to the back.
  forgetResting()
  replies({ status: 400 })
  await rejectsWith('AI_UNAVAILABLE')
  calls = replies(OK)
  await extractScan('medication', IMG)
  assert.deepEqual(calls, ['main'])
})

test('no fallback for a bad request or key, or for an unreadable photo', async (t) => {
  process.env.GEMINI_FALLBACK_MODELS = 'backup-1'
  t.after(() => delete process.env.GEMINI_FALLBACK_MODELS)

  for (const status of [400, 403]) {
    const calls = replies({ status }, OK)
    await rejectsWith('AI_UNAVAILABLE')
    assert.equal(calls.length, 1)
  }

  const calls = replies({ status: 200, body: geminiText({ readable: false }) }, OK)
  await rejectsWith('UNREADABLE_IMAGE')
  assert.equal(calls.length, 1)
})

test('a clear photo of the wrong kind of document says so, instead of "retake it in good light"', async () => {
  reply(200, geminiText({ readable: true, otherDocument: true }))
  await assert.rejects(extractScan('bill', IMG), (e) => e.code === 'WRONG_DOCUMENT' && e.status === 422 && /medical bill/.test(e.message))
  reply(200, geminiText({ readable: true, otherDocument: true }))
  await assert.rejects(extractScan('medication', IMG), (e) => e.code === 'WRONG_DOCUMENT' && /medication label/.test(e.message))
  reply(200, geminiText({ readable: false, otherDocument: false }))
  await rejectsWith('UNREADABLE_IMAGE')
})

test('a bill scanned as a label (or a label as a bill) gets its own code, so the app can offer to read it as the other', async () => {
  reply(200, geminiText({ readable: true, otherDocument: true, looksLike: 'bill' }))
  await assert.rejects(extractScan('medication', IMG), (e) => e.code === 'LOOKS_LIKE_BILL' && e.status === 422)
  reply(200, geminiText({ readable: true, otherDocument: true, looksLike: 'medication' }))
  await assert.rejects(extractScan('bill', IMG), (e) => e.code === 'LOOKS_LIKE_LABEL')
  // Something else entirely (or a label scanned as a label it isn't): the plain "wrong document".
  reply(200, geminiText({ readable: true, otherDocument: true, looksLike: 'other' }))
  await assert.rejects(extractScan('medication', IMG), (e) => e.code === 'WRONG_DOCUMENT')
  reply(200, geminiText({ readable: true, otherDocument: true, looksLike: 'medication' }))
  await assert.rejects(extractScan('medication', IMG), (e) => e.code === 'WRONG_DOCUMENT')
})

test('when every model fails: quota everywhere is RATE_LIMITED, anything else AI_UNAVAILABLE', async (t) => {
  process.env.GEMINI_FALLBACK_MODELS = 'backup-1'
  t.after(() => delete process.env.GEMINI_FALLBACK_MODELS)

  replies({ status: 429 }, { status: 429 })
  await rejectsWith('RATE_LIMITED')
  replies({ status: 429 }, { status: 503 })
  await rejectsWith('AI_UNAVAILABLE')
  replies(new TypeError('fetch failed'), new TypeError('fetch failed'))
  await rejectsWith('AI_UNAVAILABLE')
})

test('asks for low thinking and the main model first', async () => {
  let sent
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) }
    return new Response(JSON.stringify(OK.body))
  }
  await extractScan('medication', IMG)
  assert.match(sent.url, /models\/gemini-3\.8-flash:generateContent$/)
  assert.deepEqual(sent.body.generationConfig.thinkingConfig, { thinkingLevel: 'low' })
})

test('Groq is the last resort after every Gemini model, in the OpenAI format', async (t) => {
  process.env.GEMINI_FALLBACK_MODELS = 'backup-1'
  process.env.GROQ_API_KEY = 'groq-key'
  process.env.GROQ_MODELS = 'vision-model'
  t.after(() => {
    delete process.env.GEMINI_FALLBACK_MODELS
    delete process.env.GROQ_API_KEY
    delete process.env.GROQ_MODELS
  })

  const sent = []
  const answers = [{ status: 503 }, { status: 503 }]
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init })
    const next = answers.shift()
    if (next) return new Response('{}', { status: next.status })
    const content = JSON.stringify({ readable: true, name: 'Metformin', doseAmount: 1, timesPerDay: 2, frequencyType: 'daily' })
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }))
  }

  const scan = await extractScan('medication', IMG)
  assert.equal(scan.medication.name, 'Metformin')
  assert.equal(sent.length, 3)
  const groq = sent[2]
  assert.equal(groq.url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(groq.init.headers.authorization, 'Bearer groq-key')
  const body = JSON.parse(groq.init.body)
  assert.equal(body.model, 'vision-model')
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.equal(body.messages[0].content[1].image_url.url, IMG)
})

test('Groq alone works when there is no Gemini key', async (t) => {
  delete process.env.GEMINI_API_KEY
  process.env.GROQ_API_KEY = 'groq-key'
  t.after(() => delete process.env.GROQ_API_KEY)
  const content = JSON.stringify({ readable: false })
  const calls = []
  globalThis.fetch = async (url) => (calls.push(url), new Response(JSON.stringify({ choices: [{ message: { content } }] })))
  await rejectsWith('UNREADABLE_IMAGE')
  assert.equal(calls.length, 1)
  assert.match(calls[0], /groq\.com/)
})

// A bill whose lines don't add up is read once more, with a note on where; the second reading is used only if it adds
// up and keeps the same total.
const BILL = (fexofen, total = 35.53) => ({
  readable: true,
  items: [
    { description: 'Consultation', category: 'consultation', amount: 28, section: 'Consultation Fees' },
    { description: 'FEXOFEN 180MG', category: 'medication', amount: fexofen, section: 'Medications List' },
    { description: 'Other medicines', category: 'medication', amount: 69.26, section: 'Medications List' },
    { description: 'GST (9%)', category: 'tax', amount: 10.06 },
  ],
  subtotals: [{ section: 'Medications List', amount: 83.76 }],
  subsidies: [{ scheme: 'other', amount: 86.29 }],
  medisave: 0,
  totalPayable: total,
})
function billReplies(...bodies) {
  const prompts = []
  globalThis.fetch = async (url, init) => {
    prompts.push(JSON.parse(init.body).contents[0].parts[1].text)
    return new Response(JSON.stringify(geminiText(bodies.shift())))
  }
  return prompts
}

test('a bill that does not add up is read once more, pointed at the section that is off', async () => {
  const prompts = billReplies(BILL(14), BILL(14.5))
  const scan = await extractScan('bill', IMG)
  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /"Medications List" add up to \$83\.26, but its subtotal is printed as \$83\.76/)
  assert.match(prompts[1], /never change an amount just to make the numbers add up/)
  assert.equal(scan.bill.items[1].amountCents, 1450) // the second reading, which adds up
})

test('the second reading is kept only if it adds up with the same total; otherwise the first stays', async () => {
  billReplies(BILL(14), BILL(14))
  assert.equal((await extractScan('bill', IMG)).bill.items[1].amountCents, 1400) // still off: first reading, gap shown
  billReplies(BILL(14), BILL(14, 35.03))
  assert.equal((await extractScan('bill', IMG)).bill.totalPayableCents, 3553) // a total changed to make it fit: not used
})

test('no second reading when it adds up, for labels, or when the daily cap says no', async () => {
  let prompts = billReplies(BILL(14.5))
  await extractScan('bill', IMG)
  assert.equal(prompts.length, 1)
  prompts = billReplies(BILL(14))
  await extractScan('bill', IMG, { canRecheck: () => false })
  assert.equal(prompts.length, 1)
})

test('add-on keys are tried only after every model on the main key', (t) => {
  process.env.GEMINI_EXTRA_KEYS = 'key-2, key-3'
  t.after(() => delete process.env.GEMINI_EXTRA_KEYS)
  const names = attempts({ gemini: ['a', 'b'], groq: [], geminiBody: {}, groqBody: {} }).map((x) => x.name)
  assert.deepEqual(names, ['a', 'b', 'a#2', 'b#2', 'a#3', 'b#3'])
})
