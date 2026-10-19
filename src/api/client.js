// The only way the client calls the backend. Always resolves to { ok, data } or { ok: false, error: { code, message } }.
// Show errors with t(`errors.${error.code}`).
// Logged-in users send their token; Sheen Hern's requireAuth middleware reads "Authorization: Bearer <token>".
function authHeader() {
  try {
    const token = localStorage.getItem('token')
    return token ? { authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}
export async function api(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return await res.json()
  } catch {
    // Offline, server down, or a non-JSON response (e.g. a hosting error page).
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Could not reach the server' } }
  }
}

// Contract: docs/scan-contract.md
export const scanImage = (type, image) => api('/scan', { method: 'POST', body: { type, image } })
export const scanSample = (sampleId) => api('/scan', { method: 'POST', body: { sampleId } })

// Contract: docs/chat-contract.md
export const askMedicine = (medicines, question, lang) => api('/chat', { method: 'POST', body: { medicines, question, lang } })
