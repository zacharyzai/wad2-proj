import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useScanStore } from './scan'
import { useAskStore } from './ask'
import { useDosesStore } from './doses'
import { api, TOKEN_KEY, readToken } from '../api/client'
import i18n, { setLocale } from '../i18n'
import { resetTheme, setTheme } from '../theme'
import { fadeScreen } from '../screenFade'

const USER_KEY = 'user'

// Stores the token and user in localStorage ("Remember me") or sessionStorage, and clears the other.
function save(token, remember, user) {
  try {
    for (const s of [localStorage, sessionStorage])
      (s.removeItem(TOKEN_KEY), s.removeItem(USER_KEY))
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

// True when the saved login is the "Remember me" kind.
const isRemembered = () => {
  try {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  } catch {
    return false
  }
}

export const useAuthStore = defineStore('auth', () => {
  // Login state
  const user = ref(savedUser()) // { name, email, dob, citizenship, citizenSince, income } once we know who this is
  const checked = ref(false) // true once we have asked the server (or found no token to ask with)

  let pending = null
  // The account's language and day/night, held back after logging in until the app opens (enterApp), so they arrive in
  // the same calm fade as the first page instead of snapping in, one after the other, on the Log in page.
  let arrival = null
  let pickedLoggedOut = false // a language was picked while logged out: it wins at login

  // Called by the router guard. Asks GET /api/auth/me once per page load, so a refresh keeps you logged in.
  function restore() {
    if (checked.value) return Promise.resolve()
    if (!readToken()) {
      checked.value = true
      return Promise.resolve()
    }
    pending ??= api('/auth/me').then((res) => {
      if (res.ok) {
        user.value = res.data.user
        useAccountLanguage(res.data.user)
        useAccountTheme(res.data.user)
        // Remembered logins get a fresh 30 days from today; either way the saved copy is updated.
        save(
          res.data.token ?? readToken(),
          Boolean(res.data.token) || isRemembered(),
          res.data.user,
        )
      } else if (res.error.code === 'NOT_LOGGED_IN') {
        // Only a bad token logs you out, not a network blip (then the saved copy keeps working).
        save(null)
        user.value = null
        resetTheme()
      }
      checked.value = true
    })
    return pending
  }

  // Signup and login both end here: sends the details and keeps the token and user. The account's language and colours wait for enterApp.
  async function start(path, body, remember) {
    const res = await api(path, { method: 'POST', body: { ...body, remember } })
    if (res.ok) {
      const account = res.data.user
      const keepPicked = pickedLoggedOut
      save(res.data.token, remember, account)
      user.value = account
      arrival = () => {
        useAccountLanguage(account, keepPicked)
        useAccountTheme(account)
      }
      pickedLoggedOut = false
      checked.value = true
    }
    return res // { ok, data } or { ok: false, error: { code } }
  }

  // Into the app after logging in, creating an account or choosing a new password: the page fades out and the first page
  // fades and settles in, already in the account's language and colours (screenFade.js).
  const enterApp = (router, to) =>
    fadeScreen(async () => {
      const go = arrival
      arrival = null
      go?.()
      await router.push(to)
    }, 'enter')

  // Logs in with an email and password.
  const login = (email, password, remember = true) =>
    start('/auth/login', { email, password }, remember)
  // Forgot your password? Emails a reset link if an account uses this address (the answer is the same either way).
  // The language in use picks the email's language for accounts that haven't chosen one.
  const requestReset = (email) =>
    api('/auth/forgot', { method: 'POST', body: { email, language: i18n.global.locale.value } })
  // The new password from an emailed link: logs this device in (and every other device out).
  const resetPassword = (token, password, remember = true) =>
    start('/auth/reset', { token, password }, remember)
  // profile = { name, dob, citizenship, citizenSince }
  // The language in use when they sign up (picked on the welcome page or above the form) becomes the account's language.
  const signup = (email, password, profile, remember = true) =>
    start(
      '/auth/signup',
      { ...profile, email, password, language: i18n.global.locale.value },
      remember,
    )

  // Saves account changes (PATCH /api/auth/me) and keeps the saved copy in step.
  async function patchMe(changes) {
    const res = await api('/auth/me', { method: 'PATCH', body: changes })
    if (res.ok) {
      user.value = res.data.user
      save(readToken(), isRemembered(), res.data.user)
    }
    return res
  }
  // Account page: change name, date of birth or citizenship.
  const updateProfile = (profile) => patchMe(profile)
  // A new app language or day/night choice. The page changes straight away; this only remembers it. Set here first, so
  // the language watcher below doesn't save it a second time.
  function saveLanguage(language) {
    if (!user.value) return null
    user.value = { ...user.value, language }
    return patchMe({ language })
  }
  // Saves the day/night choice to the account.
  function saveTheme(theme) {
    if (!user.value) return null
    user.value = { ...user.value, theme }
    return patchMe({ theme })
  }

  // Logged in: use the account's day/night choice. Accounts that haven't chosen are asked on Home (stores/guide.js).
  function useAccountTheme(account) {
    if (account.theme) setTheme(account.theme)
  }
  // Logged in: switch to the account's language, unless they just picked one on the way in (then that one is saved).
  // Accounts from before languages were saved get this device's language.
  function useAccountLanguage(account, keepPicked = false) {
    if (!account.language || (keepPicked && account.language !== i18n.global.locale.value))
      saveLanguage(i18n.global.locale.value)
    else if (account.language !== i18n.global.locale.value) setLocale(account.language)
  }

  // The language switcher anywhere (Account, welcome page) changes the account's language too.
  watch(
    () => i18n.global.locale.value,
    (language) => {
      if (!user.value) pickedLoggedOut = true
      else if (user.value.language !== language) saveLanguage(language)
    },
  )

  // Night mode is for logged-in accounts only: logging out always goes back to day mode.
  function logout() {
    save(null)
    user.value = null
    checked.value = true
    useScanStore().forget()
    useAskStore().forget() // the next person on this device never sees these questions
    useDosesStore().forget() // nor their ticks
    resetTheme()
  }

  // Log out, and the same calm fade back to Start. The saved login is cleared at once (closing the tab straight after
  // pressing Log out still logs out); only what is on screen changes inside the fade.
  function leaveApp(router) {
    save(null)
    return fadeScreen(async () => {
      logout()
      await router.push({ name: 'start' })
    }, 'enter')
  }

  return {
    user,
    checked,
    restore,
    enterApp,
    login,
    requestReset,
    resetPassword,
    signup,
    updateProfile,
    saveLanguage,
    saveTheme,
    logout,
    leaveApp,
  }
})
