// Who is logged in. Same pattern as stores/scan.js: one reactive object shared by every page.
// "Remember me": the token lives in localStorage (kept for 30 days, renewed on every visit). Without it, in sessionStorage,
// so closing the browser logs you out. api/client.js sends the token with every request.
// A copy of the account details is kept next to the token, so a returning user opens the app instantly
// while restore() checks with the server in the background. Logging out removes both.
import { reactive } from 'vue'
import { api, TOKEN_KEY, readToken } from '../api/client'

const USER_KEY = 'user'

function save(token, remember, user) {
  try {
    for (const s of [localStorage, sessionStorage]) s.removeItem(TOKEN_KEY), s.removeItem(USER_KEY)
    if (!token) return
    const store = remember ? localStorage : sessionStorage
    store.setItem(TOKEN_KEY, token)
    store.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Storage blocked (private mode): the user just has to log in again after a refresh.
  }
}

// The saved copy, only while there is a token to go with it.
function savedUser() {
  try {
    if (!readToken()) return null
    return JSON.parse(localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export const authStore = reactive({
  user: savedUser(), // { name, email, dob, citizenship, citizenSince, income } once we know who this is
  checked: false, // true once we have asked the server (or found no token to ask with)
})

let pending = null

const isRemembered = () => {
  try {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  } catch {
    return false
  }
}

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
      // Remembered logins get a fresh 30 days from today; either way the saved copy is updated.
      save(res.data.token ?? readToken(), Boolean(res.data.token) || isRemembered(), res.data.user)
    } else if (res.error.code === 'NOT_LOGGED_IN') {
      // Only a bad token logs you out, not a network blip (then the saved copy keeps working).
      save(null)
      authStore.user = null
    }
    authStore.checked = true
  })
  return pending
}

async function start(path, body, remember) {
  const res = await api(path, { method: 'POST', body: { ...body, remember } })
  if (res.ok) {
    save(res.data.token, remember, res.data.user)
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
  if (res.ok) {
    authStore.user = res.data.user
    save(readToken(), isRemembered(), res.data.user)
  }
  return res
}

export function logout() {
  save(null)
  authStore.user = null
  authStore.checked = true
}
