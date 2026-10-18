<!-- Owner: Asher. Read-aloud player card from the Claude Design Explain screen, using the browser's own speech. -->
<!-- shortcut: browser voices only; Tamil/Malay are missing on many devices. Add the cloud TTS fallback (/api/tts) for feature 2. -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SPEEDS, speechRate } from '../../stores/speech'
import AppIcon from '../layout/AppIcon.vue'

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
  <section class="card player" :aria-label="t('player.reading')">
    <div class="player-label"><AppIcon name="volume" :size="20" /><span class="section-label">{{ t('player.reading') }}</span></div>
    <template v-if="voice">
      <div class="d-flex align-items-center gap-3">
        <button type="button" class="play" :class="{ on: status === 'playing' }" @click="toggle">
          <span class="play-btn"><AppIcon :name="status === 'playing' ? 'pause' : 'play'" :size="30" /></span>
          <span>{{ status === 'playing' ? t('player.pause') : t('player.play') }}</span>
        </button>
        <button type="button" class="btn btn-outline btn-icon replay" :aria-label="t('player.replay')" :title="t('player.replay')" @click="speak"><AppIcon name="replay" :size="22" /></button>
      </div>
      <div class="d-flex align-items-center gap-3 flex-wrap" role="group" :aria-label="t('player.speed')">
        <span class="speed-label">{{ t('player.speed') }}</span>
        <div class="segmented speeds">
          <button v-for="speed in SPEEDS" :key="speed" type="button" :aria-pressed="rate === speed" @click="rate = speed">{{ speed }}×</button>
        </div>
      </div>
    </template>
    <p v-else class="text-muted-a11y">{{ t('player.unavailable') }}</p>
  </section>
</template>

<style scoped src="../../styles/components/ReadAloud.css"></style>
