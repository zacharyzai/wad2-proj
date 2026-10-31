// Who is logged in. Same pattern as stores/scan.js: one reactive object shared by every page.
// "Remember me": the token lives in localStorage (kept for 30 days, renewed on every visit). Without it, in sessionStorage,
// so closing the browser logs you out. api/client.js sends the token with every request.
// A copy of the account details is kept next to the token, so a returning user opens the app instantly
// while restore() checks with the server in the background. Logging out removes both.
// The app language is part of the account: logging in on any device uses it, and changing it anywhere saves it.
// A language picked while logged out (Login, Sign up, welcome page) wins at login and becomes the account's.
// Day/night mode is part of the account too: asked once after signing up (ThemePrompt), changed on the Account page.
import { reactive, watch } from 'vue'
import { api, TOKEN_KEY, readToken } from '../api/client'
import i18n, { setLocale } from '../i18n'
import { resetTheme, setTheme } from '../theme'
import { fadeScreen } from '../screenFade'

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
      useAccountLanguage(res.data.user)
      useAccountTheme(res.data.user)
      // Remembered logins get a fresh 30 days from today; either way the saved copy is updated.
      save(res.data.token ?? readToken(), Boolean(res.data.token) || isRemembered(), res.data.user)
    } else if (res.error.code === 'NOT_LOGGED_IN') {
      // Only a bad token logs you out, not a network blip (then the saved copy keeps working).
      save(null)
      authStore.user = null
      resetTheme()
    }
    authStore.checked = true
  })
  return pending
}

// The account's language and day/night, held back after logging in until the app opens (enterApp), so they arrive in
// the same calm fade as the first page instead of snapping in, one after the other, on the Log in page.
let arrival = null
function settleArrival() {
  const go = arrival
  arrival = null
  go?.()
}

async function start(path, body, remember) {
  const res = await api(path, { method: 'POST', body: { ...body, remember } })
  if (res.ok) {
    const user = res.data.user
    const keepPicked = pickedLoggedOut
    save(res.data.token, remember, user)
    authStore.user = user
    arrival = () => {
      useAccountLanguage(user, keepPicked)
      useAccountTheme(user)
    }
    pickedLoggedOut = false
    authStore.checked = true
  }
  return res // { ok, data } or { ok: false, error: { code } }
}

// Into the app after logging in, creating an account or choosing a new password: the page fades out and the first page
// fades and settles in, already in the account's language and colours (screenFade.js).
export const enterApp = (router, to) => fadeScreen(async () => {
  settleArrival()
  await router.push(to)
}, 'enter')

export const login = (email, password, remember = true) => start('/auth/login', { email, password }, remember)
// Forgot your password? Emails a reset link if an account uses this address (the answer is the same either way).
// The language in use picks the email's language for accounts that haven't chosen one.
export const requestReset = (email) => api('/auth/forgot', { method: 'POST', body: { email, language: i18n.global.locale.value } })
// The new password from an emailed link: logs this device in (and every other device out).
export const resetPassword = (token, password, remember = true) => start('/auth/reset', { token, password }, remember)
// profile = { name, dob, citizenship, citizenSince }
// The language in use when they sign up (picked on the welcome page or above the form) becomes the account's language.
export const signup = (email, password, profile, remember = true) =>
  start('/auth/signup', { ...profile, email, password, language: i18n.global.locale.value }, remember)

// Account page: change name, date of birth or citizenship.
export async function updateProfile(profile) {
  const res = await api('/auth/me', { method: 'PATCH', body: profile })
  if (res.ok) {
    authStore.user = res.data.user
    save(readToken(), isRemembered(), res.data.user)
  }
  return res
}

// Save a new app language to the account. The page changes language straight away; this only remembers it.
export async function saveLanguage(language) {
  if (!authStore.user) return null
  authStore.user = { ...authStore.user, language } // now, so the watcher below doesn't save it a second time
  const res = await api('/auth/me', { method: 'PATCH', body: { language } })
  if (res.ok) {
    authStore.user = res.data.user
    save(readToken(), isRemembered(), res.data.user)
  }
  return res
}

// Save a new day/night choice to the account. The page changes straight away (setTheme); this only remembers it.
export async function saveTheme(theme) {
  if (!authStore.user) return null
  authStore.user = { ...authStore.user, theme }
  const res = await api('/auth/me', { method: 'PATCH', body: { theme } })
  if (res.ok) {
    authStore.user = res.data.user
    save(readToken(), isRemembered(), res.data.user)
  }
  return res
}

// Logged in: use the account's day/night choice. Accounts that haven't chosen are asked on Home (stores/guide.js).
function useAccountTheme(user) {
  if (user.theme) setTheme(user.theme)
}

// Logged in: switch to the account's language, unless they just picked one on the way in (then that one is saved).
// Accounts from before languages were saved get this device's language.
let pickedLoggedOut = false
function useAccountLanguage(user, keepPicked = false) {
  if (!user.language || (keepPicked && user.language !== i18n.global.locale.value)) saveLanguage(i18n.global.locale.value)
  else if (user.language !== i18n.global.locale.value) setLocale(user.language)
}

// The language switcher anywhere (sidebar, phone header, welcome page) changes the account's language too.
watch(
  () => i18n.global.locale.value,
  (language) => {
    if (!authStore.user) pickedLoggedOut = true
    else if (authStore.user.language !== language) saveLanguage(language)
  },
)

// Log out, and the same calm fade back to Start. The saved login is cleared at once (closing the tab straight after
// pressing Log out still logs out); only what is on screen changes inside the fade.
export function leaveApp(router) {
  save(null)
  return fadeScreen(async () => {
    logout()
    await router.push({ name: 'start' })
  }, 'enter')
}

// Night mode is for logged-in accounts only: logging out always goes back to day mode.
export function logout() {
  save(null)
  authStore.user = null
  authStore.checked = true
  resetTheme()
}
