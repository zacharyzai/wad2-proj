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

// Contract: docs/doses-contract.md
export const dosesTaken = (date) => api(`/doses?date=${encodeURIComponent(date)}`)
export const setDoseTaken = (doseId, date, taken) => api('/doses', { method: taken ? 'POST' : 'DELETE', body: { doseId, date } })

// Contract: docs/google-contract.md
export const googleStatus = () => api('/google/status')
export const googleConnect = (next) => api('/google/connect', { method: 'POST', body: { next } })
export const googleSync = (entries, lang) => api('/google/sync', { method: 'POST', body: { entries, lang } })
export const googleDisconnect = (removeEvents) => api('/google/disconnect', { method: 'POST', body: { removeEvents } })

// Read-aloud audio for devices with no voice for the language: { audio } (base64 WAV). Takes about 6 s.
export const readAloudAudio = (text, lang) => api('/tts', { method: 'POST', body: { text, lang } })


// History and share links (Isaac's pages). Assumed contract until Sheen Hern's API lands: docs/history-contract.md
export const listScans = (page = 1) => api(`/history?page=${page}`)
export const getScan = (id) => api(`/history/${encodeURIComponent(id)}`)
export const saveScan = (scan) => api('/history', { method: 'POST', body: { scan } })
export const deleteScan = (id) => api(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const createShare = (scanId) => api('/share', { method: 'POST', body: { scanId } })
export const revokeShare = (token) => api(`/share/${encodeURIComponent(token)}`, { method: 'DELETE' })
export const getShared = (token) => api(`/share/${encodeURIComponent(token)}`)


// Caregiver tracking (Isaac's pages). Assumed contract until Sheen Hern's /api/care exists: docs/care-contract.md
export const createInvite = () => api('/care/invites', { method: 'POST' }) // senior: { token, expiresAt }
export const getInvite = (token) => api(`/care/invites/${encodeURIComponent(token)}`) // public: { senior: { name }, expiresAt }
export const acceptInvite = (token) => api(`/care/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }) // caregiver: { seniorId }
export const careSeniors = () => api('/care/seniors') // caregiver: { seniors: [{ id, name, today: { taken, missed, upcoming } }] }
export const careToday = (seniorId) => api(`/care/seniors/${encodeURIComponent(seniorId)}/today`) // { senior: { id, name }, doses: [...] }
export const myCaregivers = () => api('/care/caregivers') // senior: { caregivers: [{ id, name, since }] }
export const removeCareLink = (linkId) => api(`/care/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' })