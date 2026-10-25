// Day/night mode. Always starts in day mode (whatever the phone's setting); night mode only when the user switches it on,
// and that pick is remembered on this device. index.html sets the first value before the app loads, so the page never flashes.
import { ref } from 'vue'

const STORAGE_KEY = 'theme'

function saved() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage blocked (private mode)
  }
}

export const theme = ref(saved() === 'dark' ? 'dark' : 'light')

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

apply()
