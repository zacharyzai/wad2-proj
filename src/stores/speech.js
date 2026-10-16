// Read-aloud speed shared by every player (Explain, Ask) and remembered on this device. A Settings page can bind to it later.
import { ref, watch } from 'vue'

const KEY = 'speechRate'
export const SPEEDS = [0.75, 1, 1.25]

function load() {
  try {
    const rate = Number(localStorage.getItem(KEY))
    return SPEEDS.includes(rate) ? rate : 1
  } catch {
    return 1
  }
}

export const speechRate = ref(load())
watch(speechRate, (rate) => {
  try {
    localStorage.setItem(KEY, String(rate))
  } catch {
    // Not critical: the speed just won't be remembered.
  }
})
