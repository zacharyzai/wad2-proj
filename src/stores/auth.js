// Who is logged in. Same pattern as stores/scan.js: one reactive object shared by every page.
// The login token lives in localStorage (so it survives a refresh) and api/client.js sends it with every request.
import { reactive } from 'vue'
import { api } from '../api/client'

const TOKEN_KEY = 'token'

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage blocked (private mode)
  }
}

function writeToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Not critical; the user just has to log in again after a refresh.
  }
}

export const authStore = reactive({
  user: null, // set once we know who this is
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
    if (res.ok) authStore.user = res.data.user
    // Only throw the token away if the server says it is bad; a network blip should not log people out.
    else if (res.error.code === 'NOT_LOGGED_IN') writeToken(null)
    authStore.checked = true
  })
  return pending
}

async function start(path, email, password) {
  const res = await api(path, { method: 'POST', body: { email, password } })
  if (res.ok) {
    writeToken(res.data.token)
    authStore.user = res.data.user
    authStore.checked = true
  }
  return res // { ok, data } or { ok: false, error: { code } }
}

export const login = (email, password) => start('/auth/login', email, password)
export const signup = (email, password) => start('/auth/signup', email, password)

export function logout() {
  writeToken(null)
  authStore.user = null
  authStore.checked = true
}