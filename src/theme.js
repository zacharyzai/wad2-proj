// Day/night mode. Three choices: day ('light'), night ('dark') or the same as this phone or computer ('system').
// Day mode unless the person picked another (on Sign up or the Account page); the pick is remembered on this device
// and saved to the account (stores/auth.js). index.html sets the first value before the app loads, so the page never flashes.
import { ref } from 'vue'

const STORAGE_KEY = 'theme'
export const THEMES = ['light', 'dark', 'system']
export const THEME_ICONS = { light: 'sun', dark: 'moon', system: 'smartphone' }

function saved() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(value) ? value : 'light'
  } catch {
    return 'light' // storage blocked (private mode)
  }
}

const deviceDark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
export const themeChoice = ref(saved()) // what they picked

// What shows is always 'light' or 'dark' (tokens.css): 'system' becomes whichever the device is using now.
function apply() {
  document.documentElement.dataset.theme = themeChoice.value === 'system' ? (deviceDark?.matches ? 'dark' : 'light') : themeChoice.value
}

export function setTheme(choice) {
  if (!THEMES.includes(choice)) return
  themeChoice.value = choice
  apply()
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Not critical; the choice just won't persist on this device.
  }
}

// "Same as my phone": follow the device when it switches (e.g. dark mode at sunset).
deviceDark?.addEventListener?.('change', () => themeChoice.value === 'system' && apply())
apply()
