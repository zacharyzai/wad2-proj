// Password reset email: the link, the four languages, and console mode. No database or real email needed.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { appUrl, resetLink, sendMail, sentMail } from '../services/mail.js'
import { resetEmail } from '../services/resetEmail.js'

const ENV = ['APP_URL', 'MAIL_PROVIDER', 'MAIL_API_KEY', 'MAIL_FROM', 'VERCEL', 'NODE_ENV']
const realFetch = globalThis.fetch
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
afterEach(() => {
  for (const k of ENV) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])
  sentMail.length = 0
  globalThis.fetch = realFetch
})
const quiet = (fn) => async () => {
  const { log, warn } = console
  console.log = console.warn = () => {}
  try { await fn() } finally { Object.assign(console, { log, warn }) }
}

test('reset links use APP_URL with the token after #, never the request; local work defaults to the dev server', () => {
  for (const k of ['APP_URL', 'VERCEL', 'NODE_ENV']) delete process.env[k]
  assert.equal(resetLink('a.b-c_d'), 'http://localhost:5173/reset#token=a.b-c_d')
  process.env.APP_URL = 'https://ahma-ahgong-can.vercel.app/'
  assert.equal(appUrl(), 'https://ahma-ahgong-can.vercel.app')
  assert.equal(resetLink('x y'), 'https://ahma-ahgong-can.vercel.app/reset#token=x%20y')
  for (const bad of ['not a url', 'javascript:alert(1)', 'https://site.example/?next=evil', 'ftp://site.example']) {
    process.env.APP_URL = bad
    assert.throws(() => resetLink('t'), /APP_URL/)
  }
  delete process.env.APP_URL
  process.env.VERCEL = '1'
  assert.throws(() => resetLink('t'), /APP_URL/) // the live site must say where it is
})

test('the email comes in the account language, English otherwise, with the link, the time limit and what to do if unasked', () => {
  const link = 'https://ahma-ahgong-can.vercel.app/reset#token=abc'
  const en = resetEmail({ name: 'Tan Ah Kow', language: 'en', link })
  assert.match(en.subject, /Reset your Ah Ma Ah Gong Can password/)
  for (const part of ['Hello Tan Ah Kow,', link, '30 minutes', 'ignore this email']) assert.ok(en.text.includes(part), part)
  assert.ok(en.html.includes(`href="${link}"`))
  assert.equal(resetEmail({ name: '', language: null, link }).subject, en.subject) // no language yet: English
  assert.equal(resetEmail({ name: 'x', language: 'fr', link }).subject, en.subject)
  for (const [lang, word] of [['zh', '密码'], ['ms', 'kata laluan'], ['ta', 'கடவுச்சொல்']]) {
    const mail = resetEmail({ name: 'Siti', language: lang, link })
    assert.ok(mail.subject.toLowerCase().includes(word), lang)
    assert.ok(mail.text.includes(link) && mail.text.includes('30') && mail.html.includes(`lang="${lang}"`), lang)
  }
})

test('names are escaped in the HTML email, so an account name can never inject markup or links', () => {
  const mail = resetEmail({ name: '<a href="https://evil.example">Click</a>', language: 'en', link: 'https://site.example/reset#token=t' })
  assert.ok(!mail.html.includes('<a href="https://evil.example"'))
  assert.ok(mail.html.includes('&lt;a href=&quot;https://evil.example&quot;&gt;'))
})

test('console mode keeps the email locally for tests, but on the live site never prints or keeps the link', quiet(async () => {
  for (const k of ['MAIL_PROVIDER', 'VERCEL', 'NODE_ENV']) delete process.env[k]
  const message = { to: 'mei@example.com', subject: 'Reset', text: 'link: https://x/reset#token=secret', html: '' }
  assert.deepEqual(await sendMail(message), { provider: 'console', sent: true })
  assert.equal(sentMail.at(-1), message)

  sentMail.length = 0
  const printed = []
  console.log = console.warn = (...args) => printed.push(args.join(' '))
  process.env.VERCEL = '1'
  assert.deepEqual(await sendMail(message), { provider: 'console', sent: false })
  assert.equal(sentMail.length, 0)
  assert.ok(printed.length && printed.every((line) => !line.includes('secret') && !line.includes('mei@example.com')))

  process.env.MAIL_PROVIDER = 'pigeon'
  await assert.rejects(sendMail(message), /Unknown MAIL_PROVIDER/)
}))

// Real providers, with fetch replaced: what each service is sent, and how a refusal is reported.
function fakeFetch(status = 201) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ message: 'echo mei@example.com' }), { status })
  }
  return calls
}
const message = { to: 'mei@example.com', subject: 'Reset', text: 'plain', html: '<p>html</p>' }

test('Brevo and Resend each get their own API request, with the sender from MAIL_FROM and the key from MAIL_API_KEY', async () => {
  process.env.MAIL_API_KEY = 'key-123'
  process.env.MAIL_FROM = 'Ah Ma Ah Gong Can <ahma@example.com>'
  process.env.MAIL_PROVIDER = 'brevo'
  let calls = fakeFetch(201)
  assert.deepEqual(await sendMail(message), { provider: 'brevo', sent: true })
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
  assert.equal(calls[0].headers['api-key'], 'key-123')
  assert.deepEqual(calls[0].body, { sender: { name: 'Ah Ma Ah Gong Can', email: 'ahma@example.com' }, to: [{ email: 'mei@example.com' }], subject: 'Reset', textContent: 'plain', htmlContent: '<p>html</p>' })

  process.env.MAIL_PROVIDER = 'resend'
  process.env.MAIL_FROM = 'ahma@example.com' // a bare address gets the app's name
  calls = fakeFetch(200)
  assert.deepEqual(await sendMail(message), { provider: 'resend', sent: true })
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].headers.authorization, 'Bearer key-123')
  assert.deepEqual(calls[0].body, { from: 'Ah Ma Ah Gong Can <ahma@example.com>', to: ['mei@example.com'], subject: 'Reset', text: 'plain', html: '<p>html</p>' })
  assert.equal(sentMail.length, 0) // real providers never keep the email
})

test('a missing key or sender, or a refused email, fails without sending or leaking the address', async () => {
  process.env.MAIL_PROVIDER = 'brevo'
  const calls = fakeFetch(201)
  process.env.MAIL_FROM = 'Ah Ma <ahma@example.com>'
  delete process.env.MAIL_API_KEY
  await assert.rejects(sendMail(message), /MAIL_API_KEY and MAIL_FROM/)
  process.env.MAIL_API_KEY = 'key-123'
  process.env.MAIL_FROM = 'not an address'
  await assert.rejects(sendMail(message), /MAIL_API_KEY and MAIL_FROM/)
  assert.equal(calls.length, 0)

  process.env.MAIL_FROM = 'Ah Ma <ahma@example.com>'
  fakeFetch(401)
  await assert.rejects(sendMail(message), (error) => /brevo refused the email \(HTTP 401\)/.test(error.message) && !error.message.includes('mei@'))
})
