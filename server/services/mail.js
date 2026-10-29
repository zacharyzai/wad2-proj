// Sending email (password reset links). One function, so the provider can change without touching the routes.
// MAIL_PROVIDER: 'console' (default) prints the email instead of sending it, for local work and tests; 'brevo' or 'resend'
// send it through that service's web API (works on Vercel, no extra packages), with MAIL_API_KEY and MAIL_FROM
// ("Ah Ma Ah Gong Can <sender@example.com>"; the sender must be verified with the service). docs/auth-contract.md.
// On the live site, console mode never prints the link: anyone who can read the server logs could otherwise use it.

const MAX_KEPT = 20
// The last emails console mode "sent", newest last, so tests can read the link. Never used by a real provider.
export const sentMail = []

const live = () => Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'

// Where reset links point: APP_URL (the site's own address), never the request's Host header, which anyone can fake to
// make the email link to their own site. Local work falls back to the Vite dev server.
export function appUrl() {
  const value = process.env.APP_URL || (live() ? '' : 'http://localhost:5173')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('APP_URL must be the site address, e.g. https://ahma-ahgong-can.vercel.app')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) throw new Error('APP_URL must be a plain http(s) address')
  return url.origin + url.pathname.replace(/\/+$/, '')
}

// The token goes after # so browsers never send it to any server (no access logs, no Referer header).
export const resetLink = (token) => `${appUrl()}/reset#token=${encodeURIComponent(token)}`

// Send { to, subject, text, html }. Resolves when the provider has accepted it (on Vercel the function can stop as soon
// as it answers, so callers await this before replying). Throws if it couldn't be sent.
export async function sendMail(message) {
  const provider = process.env.MAIL_PROVIDER || 'console'
  if (provider === 'console') {
    if (live()) {
      console.warn(`Email not sent (no MAIL_PROVIDER set): "${message.subject}"`) // never the link or the address
      return { provider, sent: false }
    }
    sentMail.push(message)
    if (sentMail.length > MAX_KEPT) sentMail.shift()
    console.log(`\n[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n${message.text}\n`)
    return { provider, sent: true }
  }
  const send = PROVIDERS[provider]
  if (!send) throw new Error(`Unknown MAIL_PROVIDER "${provider}"`)
  const key = process.env.MAIL_API_KEY
  const from = sender(process.env.MAIL_FROM)
  if (!key || !from) throw new Error('MAIL_API_KEY and MAIL_FROM ("Name <address>") are required to send email')
  const res = await fetch(send.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...send.auth(key) }, body: JSON.stringify(send.body(from, message)), signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${provider} refused the email (HTTP ${res.status})`) // not the body: it can echo the address
  return { provider, sent: true }
}

// "Ah Ma Ah Gong Can <noreply@example.com>" or a bare address → { name, email }; null if it isn't one.
function sender(value) {
  const match = /^\s*(?:(.*?)\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))\s*$/.exec(value ?? '')
  if (!match) return null
  return { name: match[1] || 'Ah Ma Ah Gong Can', email: match[2] ?? match[3] }
}

// Each service's own API (both answer 2xx once they have accepted the email).
const PROVIDERS = {
  brevo: {
    url: 'https://api.brevo.com/v3/smtp/email',
    auth: (key) => ({ 'api-key': key }),
    body: (from, m) => ({ sender: from, to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html }),
  },
  resend: {
    url: 'https://api.resend.com/emails',
    auth: (key) => ({ authorization: `Bearer ${key}` }),
    body: (from, m) => ({ from: `${from.name} <${from.email}>`, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
  },
}
