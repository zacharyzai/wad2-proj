// Owner: Asher. Add keys to all four locale files at the same time; English is the fallback.
import { createI18n } from 'vue-i18n'
import { fadeScreen } from '../screenFade'
import en from './locales/en.json'

export const LOCALES = { en: 'English', zh: '中文', ms: 'Bahasa Melayu', ta: 'தமிழ்' }
const STORAGE_KEY = 'locale'

function savedLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved in LOCALES) return saved
  } catch {
    // Storage blocked (private mode): fall back to English.
  }
  return 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: savedLocale(),
  fallbackLocale: 'en',
  messages: { en },
})

// Only English ships inside the first download. 中文, Bahasa Melayu and தமிழ் (about 55 kB each) are fetched the first time
// someone uses them, then kept by the browser. main.js waits for the saved language before showing the app, so nobody
// sees English flash first; a language that can't be fetched (offline) simply isn't switched to.
const LOADERS = { zh: () => import('./locales/zh.json'), ms: () => import('./locales/ms.json'), ta: () => import('./locales/ta.json') }
const loading = {}
const hasMessages = (code) => i18n.global.availableLocales.includes(code)
function loadMessages(code) {
  if (hasMessages(code) || !LOADERS[code]) return Promise.resolve()
  loading[code] ??= LOADERS[code]()
    .then((module) => i18n.global.setLocaleMessage(code, module.default))
    .catch(() => delete loading[code]) // try again next time
  return loading[code]
}
export const localeReady = loadMessages(i18n.global.locale.value)

export async function setLocale(code) {
  await loadMessages(code)
  if (!hasMessages(code)) return // could not be fetched: stay in the language that is showing
  i18n.global.locale.value = code
  // Screen readers and speech voices pick their language from <html lang>.
  document.documentElement.lang = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Not critical; the choice just won't persist.
  }
}

// A language button someone pressed: the old words fade into the new ones across the whole screen (a third of a second),
// so lines that change length don't jump. setLocale above stays instant (the account's language on login, tests).
export function chooseLocale(code) {
  if (code === i18n.global.locale.value) return
  return fadeScreen(() => setLocale(code), 'lang')
}

document.documentElement.lang = i18n.global.locale.value

export default i18n
