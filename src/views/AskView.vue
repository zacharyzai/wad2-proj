<!-- Owner: Zachary. "Ask about my medicine" (feature 6): open any time. Answers use the user's own medicines (checked labels
     or typed in); if a question is about a medicine we don't know, the reply asks for its label or its name and instructions.
     Contract: docs/chat-contract.md
     The chat feel: the app's capsule (CapsuleBuddy) is the bot's face and shows what it's doing (thinking, listening, reading
     aloud); while waiting it says what it's doing in words ("Checking your Metformin label…"); answers appear word by word
     on a card, the first sentence first and larger, with the medicine it's about; read aloud lights up each word as it's said;
     under the newest answer: the next questions and "Explain more simply". The empty page greets the person by name, with questions about their own medicines.
     The pieces: components/ask/AskMedicines.vue (My medicines), AskReply.vue (one reply), AskComposer.vue (the question box),
     composables/useAnswer.js (word by word and read aloud). This page keeps the conversation and sends the questions. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { askMedicine } from '../api/client'
import { useMedicinesStore, isFinished } from '../stores/medicines'
import { useAuthStore } from '../stores/auth'
import { useAskStore } from '../stores/ask'
import { useAnswer } from '../composables/useAnswer'
import { factsFor } from '../rules/askFacts'
import AppIcon from '../components/layout/AppIcon.vue'
import CapsuleBuddy from '../components/layout/CapsuleBuddy.vue'
import AskMedicines from '../components/ask/AskMedicines.vue'
import AskReply from '../components/ask/AskReply.vue'
import AskComposer from '../components/ask/AskComposer.vue'
const { medicines } = useMedicinesStore()
const authStore = useAuthStore()
const { messages } = useAskStore() // one thread for the visit
const { reveal, stopRevealing, stopReading } = useAnswer()

const CHIPS = ['when', 'food', 'missed', 'store']
const HISTORY = 4 // earlier answered turns sent with a question (server MAX_HISTORY)

const { t, locale } = useI18n()

const question = ref('')
const listening = ref(false) // the mic is on (AskComposer says so)
const loading = computed(() => messages.some((m) => m.state === 'loading'))
const latest = computed(() => messages.at(-1))
const isAnswer = (m) => m?.state === 'done' && m.reply.type === 'ANSWER'

const thread = ref(null)
const medsPanel = ref(null)
let nextId = messages.length

// `msg` is set for "Try again" / "Ask again": the same bubble is re-asked, with the medicines the user has now.
async function ask(text, chip = 'typed', msg = null) {
  const q = text.trim()
  if (!q || loading.value) return
  stopReading()
  if (!msg) {
    msg = reactive({ id: nextId++, q, chip, lang: locale.value, qLang: locale.value, state: 'loading', reply: null, error: null, stage: 0, shown: undefined, fresh: false })
    messages.push(msg)
    if (chip === 'typed') question.value = ''
  } else {
    msg.state = 'loading'
    msg.stage = 0
  }
  // While waiting, say what is happening, in words: thinking → checking the medicine → writing the answer.
  const stages = [setTimeout(() => (msg.stage = 1), 1200), setTimeout(() => (msg.stage = 2), 3200)]
  scrollTo(msg, 'nearest')
  // The last few answered turns before this one, so a follow-up like "and at night?" makes sense.
  const history = messages
    .slice(0, messages.indexOf(msg))
    .filter((m) => isAnswer(m) && m.reply.answer)
    .slice(-HISTORY)
    .map((m) => ({ q: m.q, a: m.reply.answer }))
  // Only what the question needs goes to the AI (src/rules/askFacts.js): the medicine it is about, or a compact list of what is taken now.
  const list = factsFor(medicines, q, { previousQuestion: history.at(-1)?.q, finished: isFinished }).map(({ source, medication }) => ({ source, medication: toRaw(medication) }))
  const res = await askMedicine(list, q, msg.lang, history)
  stages.forEach(clearTimeout)
  // On error the question stays in the bubble, so "Try again" resends it.
  Object.assign(msg, res.ok ? { state: 'done', reply: res.data } : { state: 'error', error: res.error.code })
  if (isAnswer(msg)) reveal(msg)
  scrollTo(msg, 'start')
}

// A typed medicine was added: if the last question was waiting for it, ask it again straight away (one less step for seniors).
function onAdded() {
  if (latest.value?.reply?.type === 'NEED_MEDICINE') ask(latest.value.q, latest.value.chip, latest.value)
}

// New answer: show it from its first line. Instant when the user asked for less motion.
async function scrollTo(msg, block) {
  await nextTick()
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  thread.value?.querySelector(`[data-reply="${msg.id}"]`)?.scrollIntoView({ block, behavior: smooth ? 'smooth' : 'auto' })
}

// Start over. The last few turns are sent with each question, so an old topic could steer new answers.
// Undo for 8 seconds (one stray tap must not lose the conversation).
const cleared = ref(null)
const undoClearButton = ref(null)
let clearTimer = null
async function newChat() {
  stopReading()
  stopRevealing()
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
const nameOf = (e) => e.medication.name
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
  stopRevealing()
  seen?.disconnect()
  stopReading()
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

    <AskMedicines ref="medsPanel" @added="onAdded" />

    <div v-if="messages.length" class="thread-tools">
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading" data-testid="ask-new" @click="newChat"><AppIcon name="plus" :size="20" />{{ t('ask.newChat') }}</button>
    </div>

    <!-- The log role goes on a wrapper: on the <ol> itself it would hide the list from screen readers. -->
    <div v-if="messages.length" ref="thread" role="log" aria-live="polite" :aria-label="t('ask.title')" data-testid="ask-thread">
    <ol class="thread">
      <li v-for="m in messages" :key="m.id" class="turn">
        <div class="you rise" :lang="m.qLang ?? m.lang"><span class="visually-hidden">{{ t('ask.you') }}: </span>{{ m.q }}</div>
        <AskReply :m="m" :latest="m === latest" :loading="loading" :listening="listening" @ask="ask" @add-medicine="medsPanel.openForm()" />
      </li>
    </ol>
    </div>

    <!-- Starter questions until there is an answer with its own follow-ups (under the composer on the empty page). -->
    <div v-if="messages.length && !isAnswer(latest)" class="starters" role="group" :aria-label="t('ask.chipsLabel')">
      <button v-for="c in CHIPS" :key="c" type="button" class="chip" :disabled="loading" @click="ask(t(`ask.chips.${c}`), c)">{{ t(`ask.chips.${c}`) }}</button>
    </div>

    <AskComposer v-model="question" v-model:listening="listening" :loading="loading" @send="ask(question)" @add-medicine="medsPanel.openForm()">
      <!-- Empty page: questions about their own medicines first (a pill on them), then the usual ones. -->
      <div v-if="!messages.length" class="starters stagger" role="group" :aria-label="t('ask.chipsLabel')" data-testid="ask-starters">
        <button v-for="s in starters" :key="s.text" type="button" class="chip" :class="{ mine: s.mine }" :disabled="loading" @click="ask(s.text, s.chip)">
          <AppIcon v-if="s.mine" name="pill" :size="18" />{{ s.text }}
        </button>
      </div>
    </AskComposer>

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
  </div>
</template>

<style scoped src="../styles/views/AskView.css"></style>
