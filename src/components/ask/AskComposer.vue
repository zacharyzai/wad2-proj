<!-- Owner: Zachary (built by Claude, declared in README.txt). Ask's composer: the question box (Enter sends), "Type a medicine",
     the mic (fills the box only; the user checks it and presses Send) with a ring that grows with the voice, and the letters
     left. Two-way bindings (defineModel): v-model is the question, v-model:listening says the mic is on. Anything put inside
     <AskComposer> (the starter questions) shows under it. -->
<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'

const question = defineModel({ type: String, required: true })
const listening = defineModel('listening', { type: Boolean, default: false })
defineProps({ loading: Boolean })
const emit = defineEmits(['send', 'add-medicine'])

const MAX = 300 // same limit as the server (MAX_QUESTION)
const { t, locale } = useI18n()
const input = ref(null)

// Enter sends, Shift+Enter is a new line. Not while an input method (Chinese, Tamil) is still composing a character.
function onEnter(e) {
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  emit('send')
}

// Voice input, in the page language.
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const REC_LANG = { en: 'en-SG', zh: 'zh-CN', ms: 'ms-MY', ta: 'ta-IN' }
const micError = ref(null) // which ask.mic message to show
// The browser's speech service decides which languages work (Safari and iPhones often have no Tamil or Malay): say so.
const MIC_ERRORS = { 'language-not-supported': 'noLang', 'not-allowed': 'blocked', 'service-not-allowed': 'blocked' }
let recognition = null

function toggleMic() {
  if (listening.value) return recognition.stop()
  micError.value = null
  recognition = new Recognition()
  recognition.lang = REC_LANG[locale.value]
  // The words appear in the box as they are said, so people can see they're being heard.
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.onresult = (e) => (question.value = Array.from(e.results, (r) => r[0].transcript).join('').slice(0, MAX))
  recognition.onerror = (e) => (micError.value = e.error === 'aborted' ? null : (MIC_ERRORS[e.error] ?? 'error'))
  recognition.onend = () => {
    listening.value = false
    stopLevel?.()
    input.value?.focus()
  }
  try {
    recognition.start()
    listening.value = true
    followLevel()
  } catch {
    micError.value = 'error'
  }
}

// While listening, a ring round the mic grows with the voice (Web Audio), so people can see they're being heard.
// Without microphone access for it (or with reduced motion) the ring just glows; the speech input works either way.
const level = ref(0)
let stopLevel = null
async function followLevel() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !navigator.mediaDevices?.getUserMedia || typeof AudioContext !== 'function') return
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    return
  }
  if (!listening.value) return stream.getTracks().forEach((track) => track.stop())
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.fftSize)
  let frame = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += ((v - 128) / 128) ** 2
    level.value = level.value * 0.6 + Math.min(1, Math.sqrt(sum / data.length) * 6) * 0.4
    frame = requestAnimationFrame(tick)
  }
  tick()
  stopLevel = () => {
    cancelAnimationFrame(frame)
    stream.getTracks().forEach((track) => track.stop())
    ctx.close()
    level.value = 0
    stopLevel = null
  }
}

onBeforeUnmount(() => {
  recognition?.abort()
  stopLevel?.()
})
</script>

<template>
  <div class="dock">
    <form class="composer" data-guide="ask-box" @submit.prevent="emit('send')">
      <label for="ask-input" class="visually-hidden">{{ t('ask.inputLabel') }}</label>
      <textarea
        id="ask-input"
        ref="input"
        v-model="question"
        rows="2"
        :maxlength="MAX"
        :placeholder="t('ask.placeholder')"
        enterkeyhint="send"
        autocomplete="off"
        @keydown.enter.exact="onEnter"
      ></textarea>
      <div class="tools">
        <button type="button" class="btn btn-outline btn-icon" :aria-label="t('ask.meds.add')" :title="t('ask.meds.add')" @click="emit('add-medicine')"><AppIcon name="plus" :size="22" /></button>
        <button v-if="Recognition" type="button" class="btn btn-outline btn-icon mic" :style="{ '--level': level.toFixed(3) }" :aria-pressed="listening" :aria-label="listening ? t('ask.mic.stop') : t('ask.mic.start')" :title="listening ? t('ask.mic.stop') : t('ask.mic.start')" :disabled="loading" data-testid="ask-mic" @click="toggleMic">
          <AppIcon :name="listening ? 'pause' : 'mic'" :size="22" />
        </button>
        <button type="submit" class="btn btn-primary btn-icon send" :aria-label="t('ask.send')" :title="t('ask.send')" :disabled="loading || !question.trim()"><AppIcon name="send" :size="22" :stroke="2.5" /></button>
      </div>
    </form>
    <span role="status" class="mic-status">
      <template v-if="listening">{{ t('ask.mic.listening') }}</template>
      <template v-else-if="micError">{{ t(`ask.mic.${micError}`) }}</template>
      <!-- Say the limit is near instead of silently stopping the typing. -->
      <template v-else-if="question.length > MAX - 50"><span data-testid="ask-left">{{ t('ask.left', { n: MAX - question.length }) }}</span></template>
    </span>
    <slot />
  </div>
</template>

<style scoped src="../../styles/components/AskComposer.css"></style>
