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
async function openForm() {
  medsOpen.value = true
  adding.value = true
  await nextTick()
  nameInput.value.focus()
  nameInput.value.scrollIntoView({ block: 'center' })
}
function addTyped() {
  if (!newName.value.trim()) return nameInput.value.focus()
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
  <!-- Chat layout: one centred column, plain answers beside the app logo, a rounded composer that docks at the bottom. -->
  <div class="chat" :class="{ empty: !messages.length }">
    <header class="intro">
      <img src="/logo.svg" alt="" class="intro-logo" />
      <h1 class="h-page">{{ t('ask.title') }}</h1>
      <!-- The disclaimer, once for the whole page. -->
      <p class="safety">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M12 8v5 M12 16.5v.5" /></svg>
        <span>{{ t('ask.safety') }}</span>
      </p>
    </header>

    <section class="meds-panel" data-testid="my-medicines">
      <button type="button" class="meds-toggle" :aria-expanded="medsOpen" aria-controls="meds-body" @click="medsOpen = !medsOpen">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4.5a4.95 4.95 0 0 1 7 7l-6 6a4.95 4.95 0 0 1-7-7z M5 9l7 7" /></svg>
        <span class="fw-bold">{{ t('ask.meds.title') }}</span>
        <span class="text-soft meds-count">{{ t('ask.meds.count', medicines.length) }}</span>
        <span class="chev" aria-hidden="true"></span>
      </button>

      <!-- No Bootstrap d-flex here: its !important display would beat v-show. -->
      <div v-show="medsOpen" id="meds-body" class="meds-body">
        <p class="text-soft">{{ t(medicines.length ? 'ask.meds.note' : 'ask.meds.empty') }}</p>
        <ul v-if="medicines.length" class="meds">
          <li v-for="m in medicines" :key="m.id" class="med">
            <div class="d-flex flex-column gap-1 min-w-0">
              <span class="med-name">{{ medName(m.medication) }}</span>
              <span v-if="m.medication.rawInstruction" class="text-soft" :lang="m.source === 'label' ? 'en' : null">“{{ m.medication.rawInstruction }}”</span>
              <span v-if="m.sample || m.source === 'typed'" class="tag align-self-start">{{ t(m.sample ? 'ask.meds.sample' : 'ask.meds.typed') }}</span>
            </div>
            <button type="button" class="btn-small" :aria-label="t('ask.meds.removeOne', { name: medName(m.medication) })" @click="remove(m)">
              {{ t('ask.meds.remove') }}
            </button>
          </li>
        </ul>

        <form v-if="adding" class="d-flex flex-column gap-3 add-form" @submit.prevent="addTyped">
          <div class="d-flex flex-column gap-2">
            <label for="new-name" class="fw-bold">{{ t('ask.form.name') }}</label>
            <input id="new-name" ref="nameInput" v-model="newName" class="inp" maxlength="80" autocomplete="off" />
          </div>
          <div class="d-flex flex-column gap-2">
            <label for="new-text" class="fw-bold">{{ t('ask.form.instructions') }}</label>
            <input id="new-text" v-model="newText" class="inp" maxlength="200" autocomplete="off" aria-describedby="new-text-hint" />
            <span id="new-text-hint" class="text-soft">{{ t('ask.form.hint') }}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="submit" class="btn-alt">{{ t('ask.form.add') }}</button>
            <button type="button" class="btn-small" @click="adding = false">{{ t('ask.form.cancel') }}</button>
          </div>
        </form>
        <div v-else class="d-flex flex-wrap gap-2">
          <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn-small">{{ t('ask.meds.photo') }}</RouterLink>
          <button type="button" class="btn-small" @click="openForm">{{ t('ask.meds.type') }}</button>
        </div>
      </div>
    </section>

    <ol v-if="messages.length" ref="thread" class="thread" role="log" aria-live="polite" :aria-label="t('ask.title')" data-testid="ask-thread">
      <li v-for="m in messages" :key="m.id" class="turn">
        <div class="you" :lang="m.lang"><span class="visually-hidden">{{ t('ask.you') }}: </span>{{ m.q }}</div>

        <div class="reply" :data-reply="m.id">
          <img src="/logo.svg" alt="" class="avatar" />
          <div class="reply-body">
            <span class="visually-hidden">{{ t('ask.bot') }}: </span>

            <div v-if="m.state === 'loading'" class="thinking" data-testid="ask-loading">
              <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{{ t('ask.thinking') }}
            </div>

            <div v-else-if="m.state === 'error'" class="card-note err" role="alert">
              <span>{{ errorText(m.error) }}</span>
              <button type="button" class="btn-small align-self-start" :disabled="loading" @click="ask(m.q, m.chip, m)">{{ t('ask.retry') }}</button>
            </div>

            <div v-else-if="m.reply.type === 'URGENT'" class="alert-red flex-column" data-testid="ask-urgent">
              <span class="title">{{ t('ask.urgent.title') }}</span>
              <span>{{ t('ask.urgent.text') }}</span>
              <a href="tel:995" class="btn-call">{{ t('ask.urgent.call') }}</a>
            </div>

            <!-- We don't know which medicine this is about: ask for its label, or its name and instructions. -->
            <div v-else-if="m.reply.type === 'NEED_MEDICINE'" class="card-note need" data-testid="ask-need">
              <span>{{ t('ask.need.text') }}</span>
              <div class="d-flex flex-wrap gap-2">
                <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn-small">{{ t('ask.meds.photo') }}</RouterLink>
                <button type="button" class="btn-small" @click="openForm">{{ t('ask.meds.type') }}</button>
                <button type="button" class="btn-small" :disabled="loading || !medicines.length" @click="ask(m.q, m.chip, m)">{{ t('ask.need.again') }}</button>
              </div>
            </div>

            <template v-else>
              <div class="answer" :lang="m.reply.answer ? m.lang : null" data-testid="ask-answer">
                <p>{{ answerText(m) }}</p>
                <div class="actions">
                  <button v-if="canSpeak && voiceFor(m.lang)" type="button" class="ghost" :aria-pressed="speaking === m.id" @click="speaking === m.id ? stopReading() : play(m)">
                    <span :class="speaking === m.id ? 'stop-icon' : 'play-icon'" aria-hidden="true"></span>
                    {{ speaking === m.id ? t('ask.read.stop') : t('ask.read.play') }}
                  </button>
                </div>
              </div>
              <p v-if="m.reply.sources?.length" class="from" data-testid="ask-from">{{ t('ask.from', { source: m.reply.sources.map(sourceText).join(', ') }) }}</p>
              <div v-if="m.reply.askPharmacist" class="pharm" data-testid="ask-pharmacist">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6 M12 15v4 M10 17h4" /></svg>
                <span>{{ t('ask.pharmacist') }}</span>
              </div>
              <!-- Follow-ups under the newest answer only, so the next question is one tap away. -->
              <div v-if="m === latest" class="follow" role="group" :aria-label="t('ask.followLabel')" data-testid="ask-follow">
                <span class="fw-bold text-soft">{{ t('ask.followLabel') }}</span>
                <div class="d-flex flex-column gap-2">
                  <button v-for="c in FOLLOW_UPS[m.chip]" :key="c" type="button" class="suggest" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">
                    {{ t(`ask.chips.${c}`) }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </li>
    </ol>

    <!-- Starter questions until there is an answer with its own follow-ups (under the composer on the empty page). -->
    <div v-if="messages.length && !isAnswer(latest)" class="starters" role="group" :aria-label="t('ask.chipsLabel')">
      <button v-for="c in CHIPS" :key="c" type="button" class="suggest" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">{{ t(`ask.chips.${c}`) }}</button>
    </div>

    <div class="dock">
      <form class="composer" @submit.prevent="ask(question)">
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
          <button type="button" class="tool" :aria-label="t('ask.meds.add')" :title="t('ask.meds.add')" @click="openForm">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14" /></svg>
            <span class="tool-label">{{ t('ask.meds.add') }}</span>
          </button>
          <button v-if="Recognition" type="button" class="tool" :aria-pressed="listening" :aria-label="listening ? t('ask.mic.stop') : t('ask.mic.start')" :disabled="loading" data-testid="ask-mic" @click="toggleMic">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3" /></svg>
            <span class="tool-label">{{ listening ? t('ask.mic.stop') : t('ask.mic.start') }}</span>
          </button>
          <button type="submit" class="send" :disabled="loading || !question.trim()">
            <span>{{ t('ask.send') }}</span>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5 M6 11l6-6 6 6" /></svg>
          </button>
        </div>
      </form>
      <span role="status" class="mic-status">
        <template v-if="listening">{{ t('ask.mic.listening') }}</template>
        <template v-else-if="micError">{{ t('ask.mic.error') }}</template>
      </span>
      <div v-if="!messages.length" class="starters" role="group" :aria-label="t('ask.chipsLabel')">
        <button v-for="c in CHIPS" :key="c" type="button" class="suggest" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">{{ t(`ask.chips.${c}`) }}</button>
      </div>
    </div>

    <!-- Undo for Remove. Polite, so screen readers hear it without being interrupted. -->
    <div v-if="removed" class="toast-undo" role="status" data-testid="ask-undo">
      <span>{{ t('ask.toast.removed', { name: medName(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn-small" @click="undo">{{ t('ask.toast.undo') }}</button>
    </div>
  </div>
</template>

<style scoped>
/* One reading column, centred like a chat app. */
.chat { display: flex; flex-direction: column; gap: 24px; max-width: 46rem; margin: 0 auto; }
.min-w-0 { min-width: 0; }

.intro { display: flex; flex-direction: column; gap: 10px; }
.intro-logo { width: 56px; height: 56px; }
.empty .intro { align-items: center; text-align: center; padding-top: 8px; }
.safety { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; border-radius: 14px; background: var(--teal-soft); color: var(--ink); font-size: 17px; text-align: left; }
.safety svg { flex: none; margin-top: 2px; color: var(--teal-dark); }

/* My medicines: one row, opens to manage. */
.meds-panel { border: 1.5px solid var(--line-strong); border-radius: 20px; background: var(--surface); }
.meds-toggle { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 10px 18px; border: 0; border-radius: 20px; background: none; color: var(--ink); font-size: 19px; text-align: left; }
.meds-toggle svg { flex: none; color: var(--teal-dark); }
.meds-count { margin-left: auto; font-size: 17px; }
.chev { flex: none; width: 10px; height: 10px; border-right: 2.5px solid currentColor; border-bottom: 2.5px solid currentColor; transform: translateY(-3px) rotate(45deg); transition: transform 0.15s; }
.meds-toggle[aria-expanded='true'] .chev { transform: translateY(2px) rotate(-135deg); }
.meds-body { display: flex; flex-direction: column; gap: 16px; padding: 0 18px 18px; }
.meds { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.med { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1.5px solid var(--line); }
.med:last-child { padding-bottom: 0; border-bottom: 0; }
.med-name { font-size: 21px; font-weight: 800; line-height: 1.25; overflow-wrap: anywhere; }
.add-form { padding: 16px; border-radius: 14px; background: var(--soft); }

/* Conversation: the user's words in a soft bubble on the right, answers as plain text beside the logo. */
.thread { display: flex; flex-direction: column; gap: 28px; margin: 0; padding: 0; list-style: none; }
.turn { display: flex; flex-direction: column; gap: 16px; }
.you { align-self: flex-end; max-width: 85%; padding: 12px 18px; border-radius: 22px; background: var(--teal-soft); color: var(--ink); font-size: 20px; line-height: 1.45; overflow-wrap: anywhere; }
.reply { display: flex; gap: 14px; align-items: flex-start; scroll-margin-top: 16px; }
.avatar { flex: none; width: 34px; height: 34px; margin-top: 2px; }
.reply-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.answer p { font-size: 21px; line-height: 1.55; overflow-wrap: anywhere; }
.actions { display: flex; gap: 4px; margin-top: 6px; margin-left: -10px; }
.ghost { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 12px; border: 0; border-radius: 12px; background: none; color: var(--muted); font-size: 17px; font-weight: 700; }
.ghost:hover, .ghost[aria-pressed='true'] { background: var(--line); color: var(--ink); }
.play-icon { width: 0; height: 0; border-left: 11px solid currentColor; border-top: 7px solid transparent; border-bottom: 7px solid transparent; }
.stop-icon { width: 12px; height: 12px; border-radius: 2px; background: currentColor; }
.thinking { display: flex; align-items: center; min-height: 34px; color: var(--muted); font-size: 19px; }
.card-note { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 16px; font-size: 19px; }
.need { border: 1.5px solid var(--teal); background: var(--teal-soft); }
.err { border: 2px solid var(--amber); background: var(--amber-soft); color: var(--amber-ink); font-weight: 700; }
.from { color: var(--muted); font-size: 16px; }
/* Its own card (icon + words), so "check with the pharmacist" never relies on colour. */
.pharm { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 2px solid var(--amber); border-radius: 14px; background: var(--amber-bg); color: var(--amber-ink); font-size: 18px; font-weight: 700; }
.pharm svg { flex: none; }
.alert-red { gap: 8px; }
.btn-call { display: inline-flex; align-items: center; align-self: flex-start; min-height: 56px; padding: 10px 24px; margin-top: 4px; border-radius: 18px; background: var(--red); color: #fff; font-size: 22px; font-weight: 800; text-decoration: none; }
.btn-call:hover { color: #fff; }
.follow { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }

/* Suggestions: outlined pills, like a chat app's suggested prompts. */
.starters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.suggest { min-height: 52px; padding: 10px 18px; border: 1.5px solid var(--line-strong); border-radius: 16px; background: var(--surface); color: var(--ink); font-size: 18px; font-weight: 700; line-height: 1.3; text-align: left; }
.suggest:hover:not(:disabled) { border-color: var(--teal); background: var(--teal-soft); }
.suggest:disabled { opacity: 0.5; cursor: not-allowed; }
.follow .suggest { align-self: flex-start; }

/* Composer: one rounded box with its tools inside. Docks above the phone tab bar once the conversation starts. */
.dock { display: flex; flex-direction: column; gap: 8px; }
.chat:not(.empty) .dock { position: sticky; bottom: calc(82px + env(safe-area-inset-bottom)); z-index: 5; padding-top: 16px; background: linear-gradient(to bottom, transparent, var(--soft) 16px); }
.composer { display: flex; flex-direction: column; gap: 6px; padding: 12px 12px 10px 18px; border: 1.5px solid var(--line-strong); border-radius: 26px; background: var(--surface); box-shadow: 0 2px 12px rgb(0 0 0 / 0.08); }
.composer:focus-within { border-color: var(--teal); }
.composer textarea { width: 100%; min-height: 2lh; max-height: 8lh; padding: 6px 0; border: 0; outline: none; resize: none; background: none; color: var(--ink); font: inherit; font-size: 20px; line-height: 1.45; field-sizing: content; }
.composer textarea::placeholder { color: var(--muted); }
.tools { display: flex; align-items: center; gap: 6px; }
.tool { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; padding: 6px 12px; border: 1.5px solid var(--line); border-radius: 999px; background: none; color: var(--ink); font-size: 17px; font-weight: 700; }
.tool:hover:not(:disabled), .tool[aria-pressed='true'] { background: var(--teal-soft); border-color: var(--teal); }
.send { display: inline-flex; align-items: center; gap: 6px; min-height: 52px; margin-left: auto; padding: 6px 18px; border: 0; border-radius: 999px; background: var(--teal); color: #fff; font-size: 19px; font-weight: 800; }
.send:hover:not(:disabled) { background: var(--teal-press); }
.send:disabled { background: var(--line); color: var(--muted); cursor: not-allowed; }
.mic-status:empty { display: none; }
.mic-status { padding-left: 18px; font-weight: 700; color: var(--teal-dark); }

/* Dots while waiting; the global reduced-motion rule stops the animation. */
.dots { display: inline-flex; gap: 5px; margin-right: 10px; }
.dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); animation: blink 1.2s infinite ease-in-out; }
.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .chev { transition: none; } }

/* Above the phone tab bar and the composer; bottom corner on desktop. */
.toast-undo { position: fixed; left: 16px; right: 16px; bottom: calc(96px + env(safe-area-inset-bottom)); z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 12px; max-width: 32em; margin: 0 auto; padding: 12px 12px 12px 18px; border-radius: 16px; background: var(--ink); color: var(--surface); font-weight: 700; }
.toast-undo .btn-small { flex: none; }

/* Phones: the docked composer stays short so the conversation keeps most of the screen. Tools become labelled icons. */
@media (max-width: 575.98px) {
  .tool { justify-content: center; width: 48px; padding: 0; }
  .tool-label { display: none; }
  .chat:not(.empty) .composer textarea { min-height: 1lh; }
}
@media (min-width: 576px) {
  .starters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 992px) {
  .chat:not(.empty) .dock { bottom: 0; padding-bottom: 16px; }
  .toast-undo { left: auto; right: 32px; bottom: 32px; }
}
</style>
