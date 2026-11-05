// The only way the client calls the backend (Axios). Always resolves to { ok, data } or
// { ok: false, error: { code, message } }. Show errors with t(`errors.${error.code}`).
// Logged-in users send their token (server/middleware/requireAuth.js reads "Authorization: Bearer <token>").
// It is in localStorage with "Remember me", otherwise in sessionStorage (stores/auth.js decides).
import axios from 'axios'

export const TOKEN_KEY = 'token'
// The saved login token (localStorage for "Remember me", else sessionStorage); null if there is none or storage is blocked.
export function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage blocked (private mode)
  }
}
// True when a reply has our { ok, ... } envelope shape.
const isEnvelope = (data) => typeof data === 'object' && data !== null && 'ok' in data
const NETWORK_ERROR = {
  ok: false,
  error: { code: 'NETWORK_ERROR', message: 'Could not reach the server' },
}

// timeout (ms): give up and return TIMEOUT instead of waiting as long as the server takes.
export async function api(path, { method = 'GET', body, timeout } = {}) {
  const token = readToken()
  try {
    const response = await axios({
      url: `/api${path}`,
      method,
      data: body,
      timeout: timeout ? Math.max(1, timeout) : 0,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    // A non-JSON reply (e.g. a hosting error page) counts as not reaching the server.
    return isEnvelope(response.data) ? response.data : NETWORK_ERROR
  } catch (error) {
    // Axios rejects every 4xx/5xx; our server still sends { ok: false, error } with them.
    if (isEnvelope(error.response?.data)) return error.response.data
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')
      return { ok: false, error: { code: 'TIMEOUT', message: 'The server took too long' } }
    return NETWORK_ERROR // offline or server down
  }
}

// Contract: docs/scan-contract.md
// images: the covered pages of one label or bill, in order (usually one photo).
export const scanImage = (type, images, timeout) =>
  api('/scan', { method: 'POST', body: { type, images }, timeout })
// Scans one of the built-in samples by id instead of an uploaded photo.
export const scanSample = (sampleId, timeout) =>
  api('/scan', { method: 'POST', body: { sampleId }, timeout })

// Contract: docs/chat-contract.md
export const askMedicine = (medicines, question, lang, history = []) =>
  api('/chat', { method: 'POST', body: { medicines, question, lang, history } })

// Contract: docs/doses-contract.md
export const dosesTaken = (date) => api(`/doses?date=${encodeURIComponent(date)}`)
// Ticks (POST) or unticks (DELETE) one dose on one day.
export const setDoseTaken = (doseId, date, taken) =>
  api('/doses', { method: taken ? 'POST' : 'DELETE', body: { doseId, date } })

// Contract: docs/google-contract.md
export const googleStatus = () => api('/google/status')
// Google Calendar: the links to connect, sync and disconnect (docs/google-contract.md).
export const googleConnect = (next) => api('/google/connect', { method: 'POST', body: { next } })
export const googleSync = (entries, lang) =>
  api('/google/sync', { method: 'POST', body: { entries, lang } })
export const googleDisconnect = (removeEvents) =>
  api('/google/disconnect', { method: 'POST', body: { removeEvents } })

// Read-aloud audio for devices with no voice for the language: { audio } (base64 WAV). Takes about 6 s.
export const readAloudAudio = (text, lang) => api('/tts', { method: 'POST', body: { text, lang } })

// History (Isaac's pages). Assumed contract until Sheen Hern's API lands: docs/history-contract.md
// Every saved scan's summary at once (the newest 500), for the History page to group and search: docs/history-contract.md
export const listAllScans = () => api('/history/all')
// Saved scans (history): open, save and delete one.
export const getScan = (id) => api(`/history/${encodeURIComponent(id)}`)
export const saveScan = (scan) => api('/history', { method: 'POST', body: { scan } })
export const deleteScan = (id) => api(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' })

// Caregiver tracking (Isaac's pages). Assumed contract until Sheen Hern's /api/care exists: docs/care-contract.md
export const createInvite = () => api('/care/invites', { method: 'POST' }) // senior: { token, expiresAt }
// Caregiver invite links: look one up, accept it, and the senior's lists of caregivers.
export const getInvite = (token) => api(`/care/invites/${encodeURIComponent(token)}`) // public: { senior: { name }, expiresAt }
export const acceptInvite = (token) =>
  api(`/care/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }) // caregiver: { seniorId }
// The account's medicine list (docs/care-contract.md): every device and the linked caregiver see the same Schedule.
export const loadMedicines = () => api('/schedule') // { medicines } (null: never saved)
// Replaces the account's medicine list.
export const saveMedicines = (medicines) => api('/schedule', { method: 'PUT', body: { medicines } })
// Caregiver views: the seniors they look after, one senior's doses today, and removing a link.
export const careSeniors = () => api('/care/seniors') // caregiver: { seniors: [{ id, name, today: { taken, missed, upcoming } }] }
export const careToday = (seniorId) => api(`/care/seniors/${encodeURIComponent(seniorId)}/today`) // { senior: { id, name }, doses: [...] }
export const myCaregivers = () => api('/care/caregivers') // senior: { caregivers: [{ id, name, since }] }
export const removeCareLink = (linkId) =>
  api(`/care/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' })
