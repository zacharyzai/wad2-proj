// Owner: Asher. Add keys to all four locale files at the same time; English is the fallback.
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'
import ms from './locales/ms.json'
import ta from './locales/ta.json'

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
  messages: { en, zh, ms, ta },
})

export function setLocale(code) {
  i18n.global.locale.value = code
  // Screen readers and speech voices pick their language from <html lang>.
  document.documentElement.lang = code
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Not critical; the choice just won't persist.
  }
}

document.documentElement.lang = i18n.global.locale.value

export default i18n
