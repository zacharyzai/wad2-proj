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

// This device's voices (they load a moment after the page in Chrome). Only speak with a voice that really is the language:
// given just a lang it has no voice for, the browser reads with its English voice (Tamil comes out as "dot").
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
export const voices = ref(synth?.getVoices() ?? [])
synth?.addEventListener?.('voiceschanged', () => (voices.value = synth.getVoices()))
export const voiceFor = (lang) => voices.value.find((v) => v.lang.toLowerCase().startsWith(lang))

export const speechRate = ref(load())
watch(speechRate, (rate) => {
  try {
    localStorage.setItem(KEY, String(rate))
  } catch {
    // Not critical: the speed just won't be remembered.
  }
})
