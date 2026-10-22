<!-- Owner: Zachary. "Ask about my medicine" (feature 6): open any time. Answers use the user's own medicines (checked labels
     or typed in); if a question is about a medicine we don't know, the reply asks for its label or its name and instructions.
     Contract: docs/chat-contract.md -->
<script>
import { reactive } from 'vue'
// One thread for the visit, so leaving this page and coming back keeps the answers.
const messages = reactive([])
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { askMedicine } from '../api/client'
import { medicines, rememberMedicine, forgetMedicine, restoreMedicine } from '../stores/medicines'
import { speechRate } from '../stores/speech'
import AppIcon from '../components/layout/AppIcon.vue'

const CHIPS = ['when', 'food', 'missed', 'store']
// Follow-ups offered under an answer, by the chip that was asked (typed questions use `typed`).
// All are self-contained questions, because each question is answered on its own (no chat history is sent).
const FOLLOW_UPS = {
  when: ['food', 'missed', 'side'],
  food: ['when', 'side', 'missed'],
  missed: ['when', 'food', 'pharm'],
  store: ['missed', 'side', 'pharm'],
  side: ['pharm', 'when', 'food'],
  pharm: ['when', 'food', 'side'],
  typed: ['when', 'missed', 'side'],
}
const MAX = 300 // same limit as the server (MAX_QUESTION)

const { t, te, locale } = useI18n()

const question = ref('')
const loading = computed(() => messages.some((m) => m.state === 'loading'))
const latest = computed(() => messages.at(-1))
const answerText = (m) => m.reply.answer ?? t('ask.noAnswer')
const errorText = (code) => (te(`ask.errors.${code}`) ? t(`ask.errors.${code}`) : t(`errors.${code}`))
const medName = (m) => [m.name, m.strength].filter(Boolean).join(' ')
const isAnswer = (m) => m?.state === 'done' && m.reply.type === 'ANSWER'
const sourceText = (s) => (typeof s === 'string' ? s : s?.title)

const thread = ref(null)
const input = ref(null)
let nextId = messages.length

// `msg` is set for "Try again" / "Ask again": the same bubble is re-asked, with the medicines the user has now.
async function ask(text, chip = 'typed', msg = null) {
  const q = text.trim()
  if (!q || loading.value) return
  if (!msg) {
    msg = reactive({ id: nextId++, q, chip, lang: locale.value, state: 'loading', reply: null, error: null })
    messages.push(msg)
    if (chip === 'typed') question.value = ''
  } else {
    msg.state = 'loading'
  }
  scrollTo(msg, 'nearest')
  const list = medicines.map(({ source, medication }) => ({ source, medication: toRaw(medication) }))
  const res = await askMedicine(list, q, msg.lang)
  // On error the question stays in the bubble, so "Try again" resends it.
  Object.assign(msg, res.ok ? { state: 'done', reply: res.data } : { state: 'error', error: res.error.code })
  scrollTo(msg, 'start')
}

// Enter sends, Shift+Enter is a new line. Not while an input method (Chinese, Tamil) is still composing a character.
function onEnter(e) {
  if (e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  ask(question.value)
}

// New answer: show it from its first line. Instant when the user asked for less motion.
async function scrollTo(msg, block) {
  await nextTick()
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  thread.value?.querySelector(`[data-reply="${msg.id}"]`)?.scrollIntoView({ block, behavior: smooth ? 'smooth' : 'auto' })
}

// Read-aloud on every answer, in the answer's language, at the shared speed. Hidden when the device has no voice for it.
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
const voices = ref(canSpeak ? speechSynthesis.getVoices() : [])
const loadVoices = () => (voices.value = speechSynthesis.getVoices())
if (canSpeak) speechSynthesis.addEventListener('voiceschanged', loadVoices)
const voiceFor = (lang) => voices.value.find((v) => v.lang.toLowerCase().startsWith(lang))
const speaking = ref(null) // id of the message being read
let utterance = null

function play(m) {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(answerText(m))
  u.voice = voiceFor(m.lang)
  u.lang = u.voice.lang
  u.rate = speechRate.value
  // cancel() also ends the previous utterance, so only the current one may clear the state.
  u.onend = u.onerror = () => {
    if (utterance === u) speaking.value = null
  }
  utterance = u
  speaking.value = m.id
  speechSynthesis.speak(u)
}
function stopReading() {
  utterance = null
  if (canSpeak) speechSynthesis.cancel()
  speaking.value = null
}

// Voice input: fills the text box only; the user checks it and presses Ask.
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const REC_LANG = { en: 'en-SG', zh: 'zh-CN', ms: 'ms-MY', ta: 'ta-IN' }
const listening = ref(false)
const micError = ref(false)
let recognition = null

function toggleMic() {
  if (listening.value) return recognition.stop()
  micError.value = false
  recognition = new Recognition()
  recognition.lang = REC_LANG[locale.value]
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (e) => (question.value = e.results[0][0].transcript.slice(0, MAX))
  recognition.onerror = (e) => (micError.value = e.error !== 'aborted')
  recognition.onend = () => {
    listening.value = false
    input.value?.focus()
  }
  try {
    recognition.start()
    listening.value = true
  } catch {
    micError.value = true
  }
}

// "My medicines" folds into one row (like a chat's attached context); it opens to manage the list.
const medsOpen = ref(false)

// "Type a medicine": name is required, the instructions are what the label says (optional but useful).
const adding = ref(false)
const newName = ref('')
const newText = ref('')
const nameInput = ref(null)
const nameMissing = ref(false)
async function openForm() {
  medsOpen.value = true
  adding.value = true
  nameMissing.value = false
  await nextTick()
  nameInput.value.focus()
  nameInput.value.scrollIntoView({ block: 'center' })
}
function addTyped() {
  if (!newName.value.trim()) {
    nameMissing.value = true
    return nameInput.value.focus()
  }
  rememberMedicine({ name: newName.value.trim(), rawInstruction: newText.value.trim() || null }, 'typed')
  newName.value = newText.value = ''
  adding.value = false
  // If the last question was waiting for this medicine, ask it again straight away (one less step for seniors).
  if (latest.value?.reply?.type === 'NEED_MEDICINE') ask(latest.value.q, latest.value.chip, latest.value)
}

// Remove with Undo: the medicine goes back where it was. The toast stays 8 seconds; a new removal replaces it.
const removed = ref(null)
const undoButton = ref(null)
let toastTimer = null
async function remove(m) {
  clearTimeout(toastTimer)
  removed.value = forgetMedicine(m.id)
  toastTimer = setTimeout(() => (removed.value = null), 8000)
  await nextTick()
  undoButton.value?.focus() // the Remove button is gone, so keep keyboard focus somewhere useful
}
function undo() {
  clearTimeout(toastTimer)
  restoreMedicine(removed.value)
  removed.value = null
}

onBeforeUnmount(() => {
  stopReading()
  recognition?.abort()
  clearTimeout(toastTimer)
  if (canSpeak) speechSynthesis.removeEventListener('voiceschanged', loadVoices)
})
</script>


<template>
  <!-- Chat layout from the Claude Design Ask screen: one centred column, answers beside the app logo, a composer that docks at the bottom. -->
  <div class="chat" :class="{ empty: !messages.length }">
    <header class="intro rise">
      <img src="/logo-192.png" alt="" class="logo-tile intro-logo" />
      <h1>{{ t('ask.title') }}</h1>
      <!-- The disclaimer, once for the whole page. -->
      <p class="safety"><AppIcon name="shield" :size="20" /><span>{{ t('ask.safety') }}</span></p>
    </header>

    <section class="card meds-panel" data-testid="my-medicines">
      <button type="button" class="meds-toggle" :aria-expanded="medsOpen" aria-controls="meds-body" @click="medsOpen = !medsOpen">
        <span class="tile tile-soft"><AppIcon name="pill" :size="22" /></span>
        <span class="meds-head">
          <span class="meds-title">{{ t('ask.meds.title') }}</span>
          <span class="badge badge-teal meds-count">{{ t('ask.meds.count', medicines.length) }}</span>
        </span>
        <AppIcon :name="medsOpen ? 'up' : 'down'" :size="22" class="text-muted-a11y" />
      </button>

      <!-- No Bootstrap d-flex here: its !important display would beat v-show. -->
      <div v-show="medsOpen" id="meds-body" class="meds-body">
        <p class="text-muted-a11y">{{ t(medicines.length ? 'ask.meds.note' : 'ask.meds.empty') }}</p>
        <ul v-if="medicines.length" class="meds">
          <li v-for="m in medicines" :key="m.id" class="med">
            <span class="tile"><AppIcon name="pill" :size="20" /></span>
            <div class="med-info">
              <span class="med-name">{{ medName(m.medication) }}</span>
              <span v-if="m.medication.rawInstruction" class="text-muted-a11y" :lang="m.source === 'label' ? 'en' : null">“{{ m.medication.rawInstruction }}”</span>
              <span v-if="m.sample || m.source === 'typed'" class="badge align-self-start">{{ t(m.sample ? 'ask.meds.sample' : 'ask.meds.typed') }}</span>
            </div>
            <button type="button" class="btn btn-outline btn-sm" :aria-label="t('ask.meds.removeOne', { name: medName(m.medication) })" @click="remove(m)">
              {{ t('ask.meds.remove') }}
            </button>
          </li>
        </ul>

        <form v-if="adding" class="add-form" @submit.prevent="addTyped">
          <div class="field">
            <label for="new-name" class="field-label">{{ t('ask.form.name') }}</label>
            <input
              id="new-name"
              ref="nameInput"
              v-model="newName"
              class="field-input"
              :class="{ 'is-error': nameMissing }"
              maxlength="80"
              autocomplete="off"
              :aria-invalid="nameMissing"
              :aria-describedby="nameMissing ? 'new-name-error' : null"
              @input="nameMissing = false"
            />
            <span v-if="nameMissing" id="new-name-error" class="field-help name-error" role="alert">{{ t('ask.form.nameMissing') }}</span>
          </div>
          <div class="field">
            <label for="new-text" class="field-label">{{ t('ask.form.instructions') }}</label>
            <input id="new-text" v-model="newText" class="field-input" maxlength="200" autocomplete="off" aria-describedby="new-text-hint" />
            <span id="new-text-hint" class="field-help">{{ t('ask.form.hint') }}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary btn-sm"><AppIcon name="plus" :size="20" />{{ t('ask.form.add') }}</button>
            <button type="button" class="btn btn-ghost btn-sm" @click="adding = false">{{ t('ask.form.cancel') }}</button>
          </div>
        </form>
        <div v-else class="acts-row">
          <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-secondary btn-sm"><AppIcon name="camera" :size="20" />{{ t('ask.meds.photo') }}</RouterLink>
          <button type="button" class="btn btn-secondary btn-sm" @click="openForm"><AppIcon name="pencil" :size="20" />{{ t('ask.meds.type') }}</button>
        </div>
      </div>
    </section>

    <!-- The log role goes on a wrapper: on the <ol> itself it would hide the list from screen readers. -->
    <div v-if="messages.length" ref="thread" role="log" aria-live="polite" :aria-label="t('ask.title')" data-testid="ask-thread">
    <ol class="thread">
      <li v-for="m in messages" :key="m.id" class="turn">
        <div class="you rise" :lang="m.lang"><span class="visually-hidden">{{ t('ask.you') }}: </span>{{ m.q }}</div>

        <div class="reply" :data-reply="m.id">
          <img src="/logo-192.png" alt="" class="avatar" />
          <div class="reply-body">
            <span class="visually-hidden">{{ t('ask.bot') }}: </span>

            <div v-if="m.state === 'loading'" class="thinking" data-testid="ask-loading">
              <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{{ t('ask.thinking') }}
            </div>

            <div v-else-if="m.state === 'error'" class="alert alert-warning flex-column rise" role="alert">
              <span class="d-flex gap-2"><AppIcon name="alert" />{{ errorText(m.error) }}</span>
              <button type="button" class="btn btn-outline btn-sm align-self-start" :disabled="loading" @click="ask(m.q, m.chip, m)"><AppIcon name="replay" :size="20" />{{ t('ask.retry') }}</button>
            </div>

            <div v-else-if="m.reply.type === 'URGENT'" class="alert alert-sos rise" data-testid="ask-urgent">
              <div class="d-flex gap-3 align-items-start">
                <span class="tile sos-tile"><AppIcon name="alert" :size="22" /></span>
                <div class="d-flex flex-column gap-1">
                  <span class="title">{{ t('ask.urgent.title') }}</span>
                  <span>{{ t('ask.urgent.text') }}</span>
                </div>
              </div>
              <a href="tel:995" class="btn btn-block"><AppIcon name="phone" />{{ t('ask.urgent.call') }}</a>
            </div>

            <!-- We don't know which medicine this is about: ask for its label, or its name and instructions. -->
            <div v-else-if="m.reply.type === 'NEED_MEDICINE'" class="alert alert-info need flex-column rise" data-testid="ask-need">
              <span class="d-flex gap-2"><AppIcon name="info" />{{ t('ask.need.text') }}</span>
              <div class="acts-row">
                <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-outline btn-sm"><AppIcon name="camera" :size="20" />{{ t('ask.meds.photo') }}</RouterLink>
                <button type="button" class="btn btn-outline btn-sm" @click="openForm"><AppIcon name="pencil" :size="20" />{{ t('ask.meds.type') }}</button>
                <button type="button" class="btn btn-outline btn-sm" :disabled="loading || !medicines.length" @click="ask(m.q, m.chip, m)"><AppIcon name="replay" :size="20" />{{ t('ask.need.again') }}</button>
              </div>
            </div>

            <template v-else>
              <div class="answer rise" :lang="m.reply.answer ? m.lang : null" data-testid="ask-answer">
                <p>{{ answerText(m) }}</p>
                <div v-if="canSpeak && voiceFor(m.lang)" class="actions">
                  <button type="button" class="btn btn-outline btn-sm listen" :aria-pressed="speaking === m.id" @click="speaking === m.id ? stopReading() : play(m)">
                    <AppIcon :name="speaking === m.id ? 'pause' : 'volume'" :size="20" />
                    {{ speaking === m.id ? t('ask.read.stop') : t('ask.read.play') }}
                  </button>
                </div>
              </div>
              <p v-if="m.reply.sources?.length" class="from" data-testid="ask-from">{{ t('ask.from', { source: m.reply.sources.map(sourceText).join(', ') }) }}</p>
              <div v-if="m.reply.askPharmacist" class="alert pharm" data-testid="ask-pharmacist">
                <AppIcon name="users" />
                <span>{{ t('ask.pharmacist') }}</span>
              </div>
              <!-- Follow-ups under the newest answer only, so the next question is one tap away. -->
              <div v-if="m === latest" class="follow" role="group" :aria-label="t('ask.followLabel')" data-testid="ask-follow">
                <span class="follow-label">{{ t('ask.followLabel') }}</span>
                <div class="d-flex flex-wrap gap-2">
                  <button v-for="c in FOLLOW_UPS[m.chip]" :key="c" type="button" class="chip" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">
                    {{ t(`ask.chips.${c}`) }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </li>
    </ol>
    </div>

    <!-- Starter questions until there is an answer with its own follow-ups (under the composer on the empty page). -->
    <div v-if="messages.length && !isAnswer(latest)" class="starters" role="group" :aria-label="t('ask.chipsLabel')">
      <button v-for="c in CHIPS" :key="c" type="button" class="chip" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">{{ t(`ask.chips.${c}`) }}</button>
    </div>

    <div class="dock">
      <form class="composer" data-guide="ask-box" @submit.prevent="ask(question)">
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
          <button type="button" class="btn btn-outline btn-icon" :aria-label="t('ask.meds.add')" :title="t('ask.meds.add')" @click="openForm"><AppIcon name="plus" :size="22" /></button>
          <button v-if="Recognition" type="button" class="btn btn-outline btn-icon mic" :aria-pressed="listening" :aria-label="listening ? t('ask.mic.stop') : t('ask.mic.start')" :title="listening ? t('ask.mic.stop') : t('ask.mic.start')" :disabled="loading" data-testid="ask-mic" @click="toggleMic">
            <AppIcon :name="listening ? 'pause' : 'mic'" :size="22" />
          </button>
          <button type="submit" class="btn btn-primary btn-icon send" :aria-label="t('ask.send')" :title="t('ask.send')" :disabled="loading || !question.trim()"><AppIcon name="send" :size="22" :stroke="2.5" /></button>
        </div>
      </form>
      <span role="status" class="mic-status">
        <template v-if="listening">{{ t('ask.mic.listening') }}</template>
        <template v-else-if="micError">{{ t('ask.mic.error') }}</template>
      </span>
      <div v-if="!messages.length" class="starters stagger" role="group" :aria-label="t('ask.chipsLabel')">
        <button v-for="c in CHIPS" :key="c" type="button" class="chip" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">{{ t(`ask.chips.${c}`) }}</button>
      </div>
    </div>

    <!-- Undo for Remove. Polite, so screen readers hear it without being interrupted. -->
    <div v-if="removed" class="toast-ahma toast-undo rise" role="status" data-testid="ask-undo">
      <span>{{ t('ask.toast.removed', { name: medName(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn btn-on-hero btn-sm" @click="undo">{{ t('ask.toast.undo') }}</button>
    </div>
  </div>
</template>

<style scoped src="../styles/views/AskView.css"></style>
