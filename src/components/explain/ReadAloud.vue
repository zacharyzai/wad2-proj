<!-- Owner: Asher. Read-aloud player from wireframe 1d, using the browser's own speech. -->
<!-- shortcut: browser voices only; Tamil/Malay are missing on many devices. Add the cloud TTS fallback (/api/tts) for feature 2. -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SPEEDS, speechRate } from '../../stores/speech'

const props = defineProps({ text: { type: String, required: true } })
const { t, locale } = useI18n()

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
const voices = ref(supported ? speechSynthesis.getVoices() : [])
const loadVoices = () => (voices.value = speechSynthesis.getVoices())
if (supported) speechSynthesis.addEventListener('voiceschanged', loadVoices)

const voice = computed(() => voices.value.find((v) => v.lang.toLowerCase().startsWith(locale.value)))
const status = ref('idle') // idle | playing | paused
// Shared with every read-aloud button in the app (stores/speech.js).
const rate = speechRate
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

<style scoped src="../../styles/components/ReadAloud.css"></style>
