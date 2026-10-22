// Who is logged in. Same pattern as stores/scan.js: one reactive object shared by every page.
// "Remember me": the token lives in localStorage (kept for 30 days, renewed on every visit). Without it, in sessionStorage,
// so closing the browser logs you out. api/client.js sends the token with every request.
import { reactive } from 'vue'
import { api, TOKEN_KEY, readToken } from '../api/client'

function writeToken(value, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    if (value) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, value)
  } catch {
    // Storage blocked (private mode): the user just has to log in again after a refresh.
  }
}

export const authStore = reactive({
  user: null, // { name, email, dob, citizenship, citizenSince } once we know who this is
  checked: false, // true once we have asked the server (or found no token to ask with)
})

let pending = null

// Called by the router guard. Asks GET /api/auth/me once per page load, so a refresh keeps you logged in.
export function restore() {
  if (authStore.checked) return Promise.resolve()
  if (!readToken()) {
    authStore.checked = true
    return Promise.resolve()
  }
  pending ??= api('/auth/me').then((res) => {
    if (res.ok) {
      authStore.user = res.data.user
      if (res.data.token) writeToken(res.data.token, true) // remembered: a fresh 30 days from today
    } else if (res.error.code === 'NOT_LOGGED_IN') writeToken(null) // only a bad token logs you out, not a network blip
    authStore.checked = true
  })
  return pending
}

async function start(path, body, remember) {
  const res = await api(path, { method: 'POST', body: { ...body, remember } })
  if (res.ok) {
    writeToken(res.data.token, remember)
    authStore.user = res.data.user
    authStore.checked = true
  }
  return res // { ok, data } or { ok: false, error: { code } }
}

export const login = (email, password, remember = true) => start('/auth/login', { email, password }, remember)
// profile = { name, dob, citizenship, citizenSince }
export const signup = (email, password, profile, remember = true) => start('/auth/signup', { ...profile, email, password }, remember)

// Account page: change name, date of birth or citizenship.
export async function updateProfile(profile) {
  const res = await api('/auth/me', { method: 'PATCH', body: profile })
  if (res.ok) authStore.user = res.data.user
  return res
}

export function logout() {
  writeToken(null)
  authStore.user = null
  authStore.checked = true
}
