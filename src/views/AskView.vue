<!-- Owner: Zachary. "Ask about my medicine" (feature 6): open any time. Answers use the user's own medicines (checked labels
     or typed in); if a question is about a medicine we don't know, the reply asks for its label or its name and instructions.
     Contract: docs/chat-contract.md
     The chat feel: the app's capsule (CapsuleBuddy) is the bot's face and shows what it's doing (thinking, listening, reading
     aloud); while waiting it says what it's doing in words ("Checking your Metformin label…"); answers appear word by word
     on a card, the first sentence first and larger, with the medicine it's about; read aloud lights up each word as it's said;
     under the newest answer: the next questions, "Explain more simply" and "Say it in …"; every answer asks "Was this
     helpful?". The empty page greets the person by name, with questions about their own medicines. -->
<script>
import { reactive } from 'vue'
// One thread for the visit, so leaving this page and coming back keeps the answers.
const messages = reactive([])
</script>

<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { askMedicine } from '../api/client'
import { medicines, rememberMedicine, forgetMedicine, restoreMedicine } from '../stores/medicines'
import { speak, stopSpeaking } from '../stores/speech'
import { authStore } from '../stores/auth'
import AppIcon from '../components/layout/AppIcon.vue'
import CapsuleBuddy from '../components/layout/CapsuleBuddy.vue'
import PillLoader from '../components/layout/PillLoader.vue'

const CHIPS = ['when', 'food', 'missed', 'store']
// Fallback follow-ups under an answer, by the chip that was asked (typed questions use `typed`), when the AI suggested none.
// Self-contained questions, so they make sense even without the earlier turns.
const FOLLOW_UPS = {
  when: ['food', 'missed', 'side'],
  food: ['when', 'side', 'missed'],
  missed: ['when', 'food', 'pharm'],
  store: ['missed', 'side', 'pharm'],
  side: ['pharm', 'when', 'food'],
  pharm: ['when', 'food', 'side'],
  typed: ['when', 'missed', 'side'],
}
const LANG_NAMES = { en: 'EN', zh: '中文', ms: 'BM', ta: 'தமிழ்' } // each in its own script, as in the language switch
const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const MAX = 300 // same limit as the server (MAX_QUESTION)
const HISTORY = 4 // earlier answered turns sent with a question (server MAX_HISTORY)

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
// `lang`: the language to answer in ("Say it in 中文" asks the same question again in another language).
async function ask(text, chip = 'typed', msg = null, lang = locale.value) {
  const q = text.trim()
  if (!q || loading.value) return
  stopReading()
  if (!msg) {
    msg = reactive({ id: nextId++, q, chip, lang, qLang: locale.value, state: 'loading', reply: null, error: null, stage: 0, shown: undefined, feedback: null, fresh: false })
    messages.push(msg)
    if (chip === 'typed') question.value = ''
  } else {
    msg.state = 'loading'
    msg.stage = 0
  }
  // While waiting, say what is happening, in words (H1): thinking → checking the medicine → writing the answer.
  const stages = [setTimeout(() => (msg.stage = 1), 1200), setTimeout(() => (msg.stage = 2), 3200)]
  scrollTo(msg, 'nearest')
  const list = medicines.map(({ source, medication }) => ({ source, medication: toRaw(medication) }))
  // The last few answered turns before this one, so a follow-up like "and at night?" makes sense.
  const history = messages
    .slice(0, messages.indexOf(msg))
    .filter((m) => isAnswer(m) && m.reply.answer)
    .slice(-HISTORY)
    .map((m) => ({ q: m.q, a: m.reply.answer }))
  const res = await askMedicine(list, q, msg.lang, history)
  stages.forEach(clearTimeout)
  // On error the question stays in the bubble, so "Try again" resends it.
  Object.assign(msg, res.ok ? { state: 'done', reply: res.data } : { state: 'error', error: res.error.code })
  if (isAnswer(msg)) reveal(msg)
  scrollTo(msg, 'start')
}

// The user's medicines a piece of text mentions (by the first word of the name: "Metformin" in "Metformin 500 mg").
function medsIn(text) {
  const low = text.toLowerCase()
  return medicines.filter((e) => {
    const word = e.medication.name?.toLowerCase().split(/\s+/)[0]
    return word && word.length > 2 && low.includes(word)
  })
}
const nameOf = (e) => e.medication.name
function waitText(m) {
  if (m.stage === 0) return t('ask.thinking')
  if (m.stage === 2) return t('ask.stage.writing')
  const med = medsIn(m.q)[0]
  if (med) return t('ask.stage.checkOne', { name: nameOf(med) })
  return t(medicines.length ? 'ask.stage.checkAll' : 'ask.stage.lookUp')
}

// ---- The answer card: words, the first sentence, appearing word by word ----
// Words come from Intl.Segmenter, so Chinese (no spaces) splits into words too. Each word knows where it sits in the
// text, so read-aloud can light up the one being said. Kept per answer (markRaw: plain data, not watched).
const segmenters = {}
const cache = new Map()
function words(m) {
  const text = answerText(m)
  const key = `${m.id}\n${text}`
  if (cache.has(key)) return cache.get(key)
  let list
  if (typeof Intl.Segmenter === 'function') {
    segmenters[m.lang] ??= new Intl.Segmenter(m.lang, { granularity: 'word' })
    list = [...segmenters[m.lang].segment(text)].map((x) => ({ text: x.segment, start: x.index }))
  } else {
    list = [...text.matchAll(/\S+|\s+/g)].map((x) => ({ text: x[0], start: x.index }))
  }
  // The first sentence leads the card (larger); the rest follows. One sentence: it is all the lead.
  const stop = text.search(/[.!?。！？](\s|$)/)
  const leadEnd = stop >= 0 && stop + 1 < text.trim().length ? stop + 1 : text.length
  list.forEach((w, i) => Object.assign(w, { i, end: w.start + w.text.length, lead: w.start < leadEnd, word: /\S/.test(w.text) }))
  const rest = list.filter((w) => !w.lead)
  while (rest.length && !rest[0].word) rest.shift() // the space after the first sentence
  const parts = markRaw({ all: list, lead: list.filter((w) => w.lead), rest })
  cache.set(key, parts)
  return parts
}
// Word by word, quick (under 2 seconds for any answer) so nobody waits on it; a tap on the card shows it all at once.
// Screen readers get the whole answer at once (a hidden copy); the moving words are hidden from them.
let revealTimer = null
function reveal(m) {
  const total = words(m).all.length
  m.fresh = true
  setTimeout(() => (m.fresh = false), 900) // the capsule's little hop
  if (reduceMq.matches) return (m.shown = total)
  clearInterval(revealTimer)
  m.shown = 0
  const per = Math.min(45, 1700 / total) // ms a word
  const every = Math.max(16, per) // no faster than the screen redraws: several words a tick instead
  const step = Math.ceil(every / per)
  revealTimer = setInterval(() => {
    m.shown = Math.min(total, m.shown + step)
    if (m.shown >= total) clearInterval(revealTimer)
  }, every)
}
const revealing = (m) => m.shown !== undefined && m.shown < words(m).all.length
function showAll(m) {
  if (!revealing(m)) return
  clearInterval(revealTimer)
  m.shown = words(m).all.length
}
// Read aloud: the word being said (by its place in the text), for the highlight.
const wordAt = ref(-1)
const isSaid = (m, w) => speaking.value === m.id && !preparing.value && w.word && wordAt.value >= w.start && wordAt.value < w.end + 1
// The capsule beside each answer: what that answer is doing now.
function moodOf(m) {
  if (m.state === 'loading') return 'thinking'
  if (speaking.value === m.id && !preparing.value) return 'speaking'
  if (listening.value && m === latest.value) return 'listening'
  return m.fresh ? 'happy' : 'idle'
}
// "Was this helpful?": noted on the answer (this device only), with a short reply.
const setFeedback = (m, value) => (m.feedback = m.feedback === value ? null : value)

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

// Read-aloud on every answer, in the answer's language, at the shared speed: the device's voice, or our server's audio
// when the device has none for that language (stores/speech.js).
const speaking = ref(null) // id of the message being read
const preparing = ref(false) // getting the audio for it
const speakFailed = ref(null) // id of the message whose audio couldn't be played
async function play(m) {
  speaking.value = m.id
  preparing.value = true
  speakFailed.value = null
  wordAt.value = -1
  showAll(m)
  const result = await speak(answerText(m), m.lang, {
    onPlaying: () => speaking.value === m.id && (preparing.value = false),
    onWord: (i) => speaking.value === m.id && (wordAt.value = i),
  })
  if (speaking.value !== m.id || result === 'stopped') return // another answer (or Stop) took over
  speaking.value = null
  preparing.value = false
  if (result === 'failed') speakFailed.value = m.id
}
function stopReading() {
  wordAt.value = -1
  speaking.value = null
  preparing.value = false
  stopSpeaking()
}

// Voice input: fills the text box only; the user checks it and presses Ask.
const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const REC_LANG = { en: 'en-SG', zh: 'zh-CN', ms: 'ms-MY', ta: 'ta-IN' }
const listening = ref(false)
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
  if (reduceMq.matches || !navigator.mediaDevices?.getUserMedia || typeof AudioContext !== 'function') return
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

// H3: start over. The last few turns are sent with each question, so an old topic could steer new answers.
// Undo for 8 seconds (one stray tap must not lose the conversation).
const cleared = ref(null)
const undoClearButton = ref(null)
let clearTimer = null
async function newChat() {
  stopReading()
  clearInterval(revealTimer)
  clearTimeout(clearTimer)
  cleared.value = messages.splice(0)
  clearTimer = setTimeout(() => (cleared.value = null), 8000)
  await nextTick()
  undoClearButton.value?.focus()
}
function undoClear() {
  clearTimeout(clearTimer)
  messages.push(...cleared.value)
  cleared.value = null
}

// The empty page: hello by name and time of day, and questions about their own medicines first (then the usual ones).
const hour = new Date().getHours()
const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
const hello = computed(() => (authStore.user?.name ? t('ask.hello', { greet: t(`home.greet.${greet}`), name: authStore.user.name }) : t(`home.greet.${greet}`)))
const starters = computed(() => {
  const mine = medicines.slice(0, 2)
  const own = mine.length === 1
    ? [{ text: t('ask.personal.when', { name: nameOf(mine[0]) }), chip: 'when' }, { text: t('ask.personal.food', { name: nameOf(mine[0]) }), chip: 'food' }]
    : mine.map((e, i) => ({ text: t(`ask.personal.${i ? 'food' : 'when'}`, { name: nameOf(e) }), chip: i ? 'food' : 'when' }))
  const general = ['missed', 'store'].map((c) => ({ text: t(`ask.chips.${c}`), chip: c }))
  return own.length ? [...own.map((x) => ({ ...x, mine: true })), ...general] : CHIPS.map((c) => ({ text: t(`ask.chips.${c}`), chip: c }))
})

// "Latest answer": a button to jump back down when the newest answer is out of view in a long conversation.
const latestInView = ref(true)
let seen = null
onMounted(() => {
  seen = new IntersectionObserver(([entry]) => (latestInView.value = entry.isIntersecting))
  watch(
    () => latest.value?.id,
    async (id) => {
      seen.disconnect()
      latestInView.value = true
      if (id === undefined) return
      await nextTick()
      const el = thread.value?.querySelector(`[data-reply="${id}"]`)
      if (el) seen.observe(el)
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  clearTimeout(clearTimer)
  clearInterval(revealTimer)
  seen?.disconnect()
  stopReading()
  recognition?.abort()
  stopLevel?.()
  clearTimeout(toastTimer)
})
</script>


<template>
  <!-- Chat layout from the Claude Design Ask screen: one centred column, answers beside the capsule, a composer that docks at the bottom. -->
  <div class="chat" :class="{ empty: !messages.length }">
    <header class="intro rise">
      <!-- Empty: the capsule waves hello, by name and time of day. -->
      <template v-if="!messages.length">
        <CapsuleBuddy :size="112" wave :mood="listening ? 'listening' : 'idle'" />
        <p class="hello" data-testid="ask-hello">{{ hello }}</p>
      </template>
      <img v-else src="/logo-192.png" alt="" class="logo-tile intro-logo" />
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

    <div v-if="messages.length" class="thread-tools">
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" data-testid="ask-new" @click="newChat"><AppIcon name="plus" :size="20" />{{ t('ask.newChat') }}</button>
    </div>

    <!-- The log role goes on a wrapper: on the <ol> itself it would hide the list from screen readers. -->
    <div v-if="messages.length" ref="thread" role="log" aria-live="polite" :aria-label="t('ask.title')" data-testid="ask-thread">
    <ol class="thread">
      <li v-for="m in messages" :key="m.id" class="turn">
        <div class="you rise" :lang="m.qLang ?? m.lang"><span class="visually-hidden">{{ t('ask.you') }}: </span>{{ m.q }}</div>

        <div class="reply" :data-reply="m.id">
          <span class="avatar"><CapsuleBuddy :mood="moodOf(m)" :size="50" /></span>
          <div class="reply-body">
            <span class="visually-hidden">{{ t('ask.bot') }}: </span>

            <!-- Waiting: says what it is doing, in words; each step fades in. -->
            <div v-if="m.state === 'loading'" class="thinking" data-testid="ask-loading">
              <Transition name="step" mode="out-in"><span :key="m.stage" class="thinking-text">{{ waitText(m) }}</span></Transition>
              <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
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
              <a href="tel:995" class="btn btn-block call-995"><AppIcon name="phone" />{{ t('ask.urgent.call') }}</a>
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
              <!-- The answer card: the medicine it's about, the first sentence large, then the rest, appearing word by word.
                   Screen readers get the whole answer at once (the hidden copy); the moving words are hidden from them. -->
              <div class="answer answer-card rise" :lang="m.reply.answer ? m.lang : null" data-testid="ask-answer">
                <div v-if="medsIn(`${m.q} ${answerText(m)}`).length" class="about" data-testid="ask-about">
                  <span class="about-label">{{ t('ask.card.about') }}</span>
                  <span v-for="e in medsIn(`${m.q} ${answerText(m)}`)" :key="e.id" class="about-chip"><AppIcon name="pill" :size="16" />{{ nameOf(e) }}</span>
                </div>
                <p class="visually-hidden">{{ answerText(m) }}</p>
                <div class="ans-text" :class="{ revealing: revealing(m) }" aria-hidden="true" @click="showAll(m)">
                  <p class="ans-lead"><span v-for="w in words(m).lead" :key="w.i" class="w" :class="{ wait: m.shown !== undefined && w.i >= m.shown, said: isSaid(m, w) }">{{ w.text }}</span></p>
                  <p v-if="words(m).rest.length" class="ans-more"><span v-for="w in words(m).rest" :key="w.i" class="w" :class="{ wait: m.shown !== undefined && w.i >= m.shown, said: isSaid(m, w) }">{{ w.text }}</span></p>
                </div>
                <div class="actions">
                  <button type="button" class="btn btn-outline btn-sm listen" :aria-pressed="speaking === m.id" :aria-busy="speaking === m.id && preparing" @click="speaking === m.id ? stopReading() : play(m)">
                    <PillLoader v-if="speaking === m.id && preparing" :size="22" />
                    <AppIcon v-else :name="speaking === m.id ? 'pause' : 'volume'" :size="20" />
                    {{ speaking === m.id ? (preparing ? t('player.preparing') : t('ask.read.stop')) : t('ask.read.play') }}
                  </button>
                  <span v-if="speakFailed === m.id" class="text-muted-a11y" role="status">{{ t('player.failed') }}</span>
                  <!-- Was this helpful? Two plain words; the choice stays marked. -->
                  <span class="helpful" role="group" :aria-label="t('ask.feedback.ask')">
                    <span class="helpful-q">{{ t('ask.feedback.ask') }}</span>
                    <button type="button" class="helpful-btn" :aria-pressed="m.feedback === 'yes'" data-testid="ask-helpful-yes" @click="setFeedback(m, 'yes')"><AppIcon name="check" :size="18" />{{ t('ask.feedback.yes') }}</button>
                    <button type="button" class="helpful-btn" :aria-pressed="m.feedback === 'no'" data-testid="ask-helpful-no" @click="setFeedback(m, 'no')"><AppIcon name="x" :size="18" />{{ t('ask.feedback.no') }}</button>
                  </span>
                </div>
                <p v-if="m.feedback" class="helpful-note" role="status">{{ t(`ask.feedback.${m.feedback === 'yes' ? 'thanks' : 'sorry'}`) }}</p>
              </div>
              <p v-if="m.reply.sources?.length" class="from" data-testid="ask-from">{{ t('ask.from', { source: m.reply.sources.map(sourceText).join(', ') }) }}</p>
              <div v-if="m.reply.askPharmacist" class="alert pharm" data-testid="ask-pharmacist">
                <AppIcon name="users" />
                <span>{{ t('ask.pharmacist') }}</span>
              </div>
              <!-- Under the newest answer, once it has appeared: "Explain more simply" and "Say it in …" (the same question,
                   answered in another language), then the next questions, one tap away. -->
              <div v-if="m === latest && !revealing(m)" class="quick rise" data-testid="ask-quick">
                <button type="button" class="chip quick-chip" :disabled="loading" data-testid="ask-simpler" @click="ask(t('ask.quick.simplerQ'))"><AppIcon name="sparkles" :size="18" />{{ t('ask.quick.simpler') }}</button>
                <span class="say-in" role="group" :aria-label="t('ask.quick.sayIn')">
                  <span class="say-in-label">{{ t('ask.quick.sayIn') }}</span>
                  <button v-for="(label, code) in LANG_NAMES" v-show="code !== m.lang" :key="code" type="button" class="chip lang-chip" :lang="code" :disabled="loading" :data-testid="`ask-say-${code}`" @click="ask(m.q, m.chip, null, code)">{{ label }}</button>
                </span>
              </div>
              <div v-if="m === latest && !revealing(m)" class="follow rise" role="group" :aria-label="t('ask.followLabel')" data-testid="ask-follow">
                <span class="follow-label">{{ t('ask.followLabel') }}</span>
                <div class="d-flex flex-wrap gap-2">
                  <template v-if="m.reply.suggestions?.length">
                    <button v-for="s in m.reply.suggestions" :key="s" type="button" class="chip" :lang="m.lang" :disabled="loading" @click="ask(s)">{{ s }}</button>
                  </template>
                  <template v-else>
                    <button v-for="c in FOLLOW_UPS[m.chip]" :key="c" type="button" class="chip" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">
                      {{ t(`ask.chips.${c}`) }}
                    </button>
                  </template>
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
          <button v-if="Recognition" type="button" class="btn btn-outline btn-icon mic" :style="{ '--level': level.toFixed(3) }" :aria-pressed="listening" :aria-label="listening ? t('ask.mic.stop') : t('ask.mic.start')" :title="listening ? t('ask.mic.stop') : t('ask.mic.start')" :disabled="loading" data-testid="ask-mic" @click="toggleMic">
            <AppIcon :name="listening ? 'pause' : 'mic'" :size="22" />
          </button>
          <button type="submit" class="btn btn-primary btn-icon send" :aria-label="t('ask.send')" :title="t('ask.send')" :disabled="loading || !question.trim()"><AppIcon name="send" :size="22" :stroke="2.5" /></button>
        </div>
      </form>
      <span role="status" class="mic-status">
        <template v-if="listening">{{ t('ask.mic.listening') }}</template>
        <template v-else-if="micError">{{ t(`ask.mic.${micError}`) }}</template>
        <!-- H5: say the limit is near instead of silently stopping the typing. -->
        <template v-else-if="question.length > MAX - 50"><span data-testid="ask-left">{{ t('ask.left', { n: MAX - question.length }) }}</span></template>
      </span>
      <!-- Empty page: questions about their own medicines first (a pill on them), then the usual ones. -->
      <div v-if="!messages.length" class="starters stagger" role="group" :aria-label="t('ask.chipsLabel')" data-testid="ask-starters">
        <button v-for="s in starters" :key="s.text" type="button" class="chip" :class="{ mine: s.mine }" :disabled="loading" @click="ask(s.text, s.chip)">
          <AppIcon v-if="s.mine" name="pill" :size="18" />{{ s.text }}
        </button>
      </div>
    </div>

    <!-- A long conversation scrolled up: one tap back down to the newest answer. -->
    <Transition name="jump">
      <button v-if="messages.length > 1 && !latestInView" type="button" class="btn btn-primary btn-sm jump" data-testid="ask-jump" @click="scrollTo(latest, 'start')">
        <AppIcon name="down" :size="20" />{{ t('ask.jump') }}
      </button>
    </Transition>

    <div v-if="cleared" class="toast-ahma toast-undo rise" role="status" data-testid="ask-cleared">
      <span>{{ t('ask.cleared') }}</span>
      <button ref="undoClearButton" type="button" class="btn btn-on-hero btn-sm" @click="undoClear">{{ t('ask.toast.undo') }}</button>
    </div>

    <!-- Undo for Remove. Polite, so screen readers hear it without being interrupted. -->
    <div v-if="removed" class="toast-ahma toast-undo rise" role="status" data-testid="ask-undo">
      <span>{{ t('ask.toast.removed', { name: medName(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn btn-on-hero btn-sm" @click="undo">{{ t('ask.toast.undo') }}</button>
    </div>
  </div>
</template>

<style scoped src="../styles/views/AskView.css"></style>
