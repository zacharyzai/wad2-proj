// Day/night mode. Follows the device setting until the user picks one; the pick is remembered on this device.
// index.html sets the first value before the app loads, so the page never flashes white.
import { ref } from 'vue'

const STORAGE_KEY = 'theme'
const system = window.matchMedia('(prefers-color-scheme: dark)')

function saved() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage blocked (private mode)
  }
}

export const theme = ref(saved() ?? (system.matches ? 'dark' : 'light'))

function apply() {
  document.documentElement.dataset.theme = theme.value
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  apply()
  try {
    localStorage.setItem(STORAGE_KEY, theme.value)
  } catch {
    // Not critical; the choice just won't persist.
  }
}

// Until the user chooses, keep following the device (e.g. phones that switch at sunset).
system.addEventListener('change', (e) => {
  if (saved()) return
  theme.value = e.matches ? 'dark' : 'light'
  apply()
})

apply()
