// Day/night mode. Three choices: day ('light'), night ('dark') or the same as this phone or computer ('system').
// Day mode unless the person picked another (the sidebar toggle, Sign up's question or the Account page); the pick is
// remembered on this device and saved to the account (stores/auth.js). index.html sets the first value before the app
// loads, so the page never flashes.
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
const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
export const themeChoice = ref(saved()) // what they picked
export const shownTheme = ref('light') // what is showing: always 'light' or 'dark' ('system' resolved)

// What shows is always 'light' or 'dark' (tokens.css): 'system' becomes whichever the device is using now.
const resolve = () => (themeChoice.value === 'system' ? (deviceDark?.matches ? 'dark' : 'light') : themeChoice.value)
function apply() {
  shownTheme.value = resolve()
  document.documentElement.dataset.theme = shownTheme.value
}

// When someone presses Day or Night, the whole screen cross-fades from the old colours to the new ones in half a second,
// as one picture (styles/global/motion.css), so nothing snaps or fades on its own timing. Without View Transitions:
// every colour fades together. Reduced motion, a hidden tab, or a change nobody pressed (login, the device at sunset): at once.
const FADE_MS = 500
function applyChange(pressed) {
  const root = document.documentElement
  if (!pressed || reduceMotion?.matches || document.hidden || root.dataset.theme === resolve()) return apply()
  if (!document.startViewTransition) {
    root.classList.add('theme-fade')
    apply()
    return setTimeout(() => root.classList.remove('theme-fade'), FADE_MS)
  }
  root.classList.add('theme-vt')
  document.startViewTransition(apply).finished.finally(() => root.classList.remove('theme-vt'))
}

// `pressed`: the click (or element) that chose it, so the change fades; omit it to change at once (login, saved choice).
export function setTheme(choice, pressed = null) {
  if (!THEMES.includes(choice)) return
  themeChoice.value = choice
  applyChange(pressed)
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Not critical; the choice just won't persist on this device.
  }
}

// "Same as my phone": follow the device when it switches (e.g. dark mode at sunset).
deviceDark?.addEventListener?.('change', () => themeChoice.value === 'system' && apply())
apply()
