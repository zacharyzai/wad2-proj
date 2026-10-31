<!-- Owner: Asher. Read-aloud player card from the Claude Design Explain screen: the device's voice, or audio from /api/tts
     (Gemini) when the device has none for the language (stores/speech.js). -->
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SPEEDS, speechRate, speak as say, stopSpeaking, pauseSpeaking, resumeSpeaking, setSpeakingRate, usesDeviceVoice } from '../../stores/speech'
import AppIcon from '../layout/AppIcon.vue'
import PillLoader from '../layout/PillLoader.vue'

const props = defineProps({ text: { type: String, required: true } })
const { t, locale } = useI18n()

const status = ref('idle') // idle | loading (fetching audio for a device with no voice) | playing | paused
const failed = ref(false)
// Shared with every read-aloud button in the app (stores/speech.js).
const rate = speechRate
let run = 0

async function speak() {
  const id = ++run
  failed.value = false
  status.value = 'loading'
  const result = await say(props.text, locale.value, { rate: rate.value, onPlaying: () => id === run && (status.value = 'playing') })
  if (id !== run) return // a newer reading (or stop) took over
  status.value = 'idle'
  failed.value = result === 'failed'
}

function toggle() {
  if (status.value === 'playing') {
    pauseSpeaking()
    status.value = 'paused'
  } else if (status.value === 'paused') {
    resumeSpeaking()
    status.value = 'playing'
  } else if (status.value === 'loading') {
    stop() // a second tap while it is getting the audio cancels
  } else {
    speak()
  }
}

function stop() {
  run++
  stopSpeaking()
  status.value = 'idle'
}

// A device voice reads again at the new speed; downloaded audio just changes speed.
watch(rate, (r) => status.value !== 'idle' && (usesDeviceVoice(locale.value) ? speak() : setSpeakingRate(r)))
watch([locale, () => props.text], stop)
onBeforeUnmount(stop)
</script>

<template>
  <section class="card player" :aria-label="t('player.reading')">
    <div class="player-label"><AppIcon name="volume" :size="20" /><span class="section-label">{{ t('player.reading') }}</span></div>
    <div class="d-flex align-items-center gap-3">
      <button type="button" class="play" :class="{ on: status === 'playing', wait: status === 'loading' }" :aria-busy="status === 'loading'" @click="toggle">
        <span class="play-btn"><PillLoader v-if="status === 'loading'" :size="36" tone="light" /><AppIcon v-else :name="status === 'playing' ? 'pause' : 'play'" :size="30" /></span>
        <span>{{ status === 'loading' ? t('player.preparing') : status === 'playing' ? t('player.pause') : t('player.play') }}</span>
      </button>
      <button type="button" class="btn btn-outline btn-icon replay" :aria-label="t('player.replay')" :title="t('player.replay')" @click="speak"><AppIcon name="replay" :size="22" /></button>
    </div>
    <div class="d-flex align-items-center gap-3 flex-wrap" role="group" :aria-label="t('player.speed')">
      <span class="speed-label">{{ t('player.speed') }}</span>
      <div class="segmented speeds">
        <button v-for="speed in SPEEDS" :key="speed" type="button" :aria-pressed="rate === speed" @click="rate = speed">{{ speed }}×</button>
      </div>
    </div>
    <p v-if="failed" class="text-muted-a11y m-0" role="status">{{ t('player.failed') }}</p>
  </section>
</template>

<style scoped src="../../styles/components/ReadAloud.css"></style>
