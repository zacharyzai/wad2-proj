// The only way the client calls the backend. Always resolves to { ok, data } or { ok: false, error: { code, message } }.
// Show errors with t(`errors.${error.code}`).
// Logged-in users send their token (server/middleware/requireAuth.js reads "Authorization: Bearer <token>").
// It is in localStorage with "Remember me", otherwise in sessionStorage (stores/auth.js decides).
export const TOKEN_KEY = 'token'
export function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage blocked (private mode)
  }
}
function authHeader() {
  const token = readToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}
// timeout (ms): give up and return TIMEOUT instead of waiting as long as the server takes.
export async function api(path, { method = 'GET', body, timeout } = {}) {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      signal: timeout ? AbortSignal.timeout(Math.max(1, timeout)) : undefined,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return await res.json()
  } catch (err) {
    if (err?.name === 'TimeoutError') return { ok: false, error: { code: 'TIMEOUT', message: 'The server took too long' } }
    // Offline, server down, or a non-JSON response (e.g. a hosting error page).
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Could not reach the server' } }
  }
}

// Contract: docs/scan-contract.md
export const scanImage = (type, image, timeout) => api('/scan', { method: 'POST', body: { type, image }, timeout })
export const scanSample = (sampleId, timeout) => api('/scan', { method: 'POST', body: { sampleId }, timeout })

// Contract: docs/chat-contract.md
export const askMedicine = (medicines, question, lang, history = []) => api('/chat', { method: 'POST', body: { medicines, question, lang, history } })

// Read-aloud audio for devices with no voice for the language: { audio } (base64 WAV). Takes about 6 s.
export const readAloudAudio = (text, lang) => api('/tts', { method: 'POST', body: { text, lang } })
