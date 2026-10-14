<!-- Owner: Asher. Read-aloud player from wireframe 1d, using the browser's own speech. -->
<!-- shortcut: browser voices only; Tamil/Malay are missing on many devices. Add the cloud TTS fallback (/api/tts) for feature 2. -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({ text: { type: String, required: true } })
const { t, locale } = useI18n()

const SPEEDS = [0.75, 1, 1.25]
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
const voices = ref(supported ? speechSynthesis.getVoices() : [])
const loadVoices = () => (voices.value = speechSynthesis.getVoices())
if (supported) speechSynthesis.addEventListener('voiceschanged', loadVoices)

const voice = computed(() => voices.value.find((v) => v.lang.toLowerCase().startsWith(locale.value)))
const status = ref('idle') // idle | playing | paused
const rate = ref(1)
let current = null

function speak() {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(props.text)
  utterance.voice = voice.value
  utterance.lang = voice.value.lang
  utterance.rate = rate.value
  // cancel() ends the old utterance too, so only the latest one may reset the state.
  utterance.onend = utterance.onerror = () => {
    if (current === utterance) status.value = 'idle'
  }
  current = utterance
  speechSynthesis.speak(utterance)
  status.value = 'playing'
}

function toggle() {
  if (status.value === 'playing') {
    speechSynthesis.pause()
    status.value = 'paused'
  } else if (status.value === 'paused') {
    speechSynthesis.resume()
    status.value = 'playing'
  } else {
    speak()
  }
}

function stop() {
  current = null
  if (supported) speechSynthesis.cancel()
  status.value = 'idle'
}

watch(rate, () => status.value !== 'idle' && speak())
watch([locale, () => props.text], stop)
onBeforeUnmount(() => {
  stop()
  if (supported) speechSynthesis.removeEventListener('voiceschanged', loadVoices)
})
</script>

<template>
  <div class="player d-flex flex-column gap-3">
    <div class="fw-bold">{{ t('player.reading') }}</div>
    <template v-if="voice">
      <div class="d-flex flex-wrap gap-3 align-items-center">
        <button type="button" class="play" @click="toggle">
          <span :class="status === 'playing' ? 'pause-icon' : 'play-icon'" aria-hidden="true"></span>
          {{ status === 'playing' ? t('player.pause') : t('player.play') }}
        </button>
        <button type="button" class="opt pill" @click="speak">{{ t('player.replay') }}</button>
      </div>
      <div class="d-flex flex-column gap-2" role="group" :aria-label="t('player.speed')">
        <span class="fw-bold">{{ t('player.speed') }}</span>
        <div class="speeds">
          <button v-for="speed in SPEEDS" :key="speed" type="button" class="opt" :aria-pressed="rate === speed" @click="rate = speed">
            <span v-if="rate === speed" aria-hidden="true">✓ </span>{{ speed }}×
          </button>
        </div>
      </div>
    </template>
    <p v-else class="text-soft">{{ t('player.unavailable') }}</p>
  </div>
</template>

<style scoped>
.player { border: 2px solid var(--ink); border-radius: 16px; padding: 20px; }
/* Play is dark ink, not teal, so the screen's primary action stays unique. */
.play { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 12px 28px; border: 2px solid var(--ink); border-radius: 999px; background: var(--ink); color: var(--surface); font-size: 22px; font-weight: 700; line-height: 1.2; }
.play-icon { width: 0; height: 0; border-left: 18px solid var(--surface); border-top: 11px solid transparent; border-bottom: 11px solid transparent; }
.pause-icon { width: 16px; height: 20px; border-left: 5px solid var(--surface); border-right: 5px solid var(--surface); }
.speeds { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
</style>
