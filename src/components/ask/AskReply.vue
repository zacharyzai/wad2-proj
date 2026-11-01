<!-- Owner: Zachary (built by Claude, declared in README.txt). One reply in the Ask conversation, beside the capsule:
     waiting (in words), an error with Try again, an emergency (Call 995), "which medicine?", or the answer card.
     Under the newest answer: "Explain more simply", "Say it in …" and the next questions. Every question goes back to
     AskView through the `ask` event: ask(text, chip, message to re-ask, language). -->
<script setup>
import { useI18n } from 'vue-i18n'
import { useMedicinesStore } from '../../stores/medicines'
import { useAnswer } from '../../composables/useAnswer'
import { namedIn } from '../../rules/askFacts'
import AppIcon from '../layout/AppIcon.vue'
import CapsuleBuddy from '../layout/CapsuleBuddy.vue'
import PillLoader from '../layout/PillLoader.vue'

const props = defineProps({
  m: { type: Object, required: true }, // the message
  latest: Boolean, // the newest one: it gets the follow-ups
  loading: Boolean, // a question is on its way: no new ones until it's back
  listening: Boolean, // the mic is on
})
const emit = defineEmits(['ask', 'add-medicine', 'feedback'])

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

const { t, te } = useI18n()
const { medicines } = useMedicinesStore()
const { answerText, words, revealing, showAll, speaking, preparing, speakFailed, play, stopReading, isSaid } = useAnswer()

const errorText = (code) => (te(`ask.errors.${code}`) ? t(`ask.errors.${code}`) : t(`errors.${code}`))
const sourceText = (s) => (typeof s === 'string' ? s : s?.title)
// The user's medicines a piece of text mentions.
const medsIn = (text) => namedIn(medicines, text)
const nameOf = (e) => e.medication.name

// While waiting, say what is happening, in words: thinking → checking the medicine → writing the answer.
function waitText(m) {
  if (m.stage === 0) return t('ask.thinking')
  if (m.stage === 2) return t('ask.stage.writing')
  const med = medsIn(m.q)[0]
  if (med) return t('ask.stage.checkOne', { name: nameOf(med) })
  return t(medicines.length ? 'ask.stage.checkAll' : 'ask.stage.lookUp')
}
// The capsule beside the answer: what it is doing now.
function mood() {
  if (props.m.state === 'loading') return 'thinking'
  if (speaking.value === props.m.id && !preparing.value) return 'speaking'
  if (props.listening && props.latest) return 'listening'
  return props.m.fresh ? 'happy' : 'idle'
}
</script>

<template>
  <div class="reply" :data-reply="m.id">
    <span class="avatar"><CapsuleBuddy :mood="mood()" :size="50" /></span>
    <div class="reply-body">
      <span class="visually-hidden">{{ t('ask.bot') }}: </span>

      <!-- Waiting: says what it is doing, in words; each step fades in. -->
      <div v-if="m.state === 'loading'" class="thinking" data-testid="ask-loading">
        <Transition name="step" mode="out-in"><span :key="m.stage" class="thinking-text">{{ waitText(m) }}</span></Transition>
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>

      <div v-else-if="m.state === 'error'" class="alert alert-warning flex-column rise" role="alert">
        <span class="d-flex gap-2"><AppIcon name="alert" />{{ errorText(m.error) }}</span>
        <button type="button" class="btn btn-outline btn-sm align-self-start" :disabled="loading" @click="emit('ask', m.q, m.chip, m)"><AppIcon name="replay" :size="20" />{{ t('ask.retry') }}</button>
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
          <button type="button" class="btn btn-outline btn-sm" @click="emit('add-medicine')"><AppIcon name="pencil" :size="20" />{{ t('ask.meds.type') }}</button>
          <button type="button" class="btn btn-outline btn-sm" :disabled="loading || !medicines.length" @click="emit('ask', m.q, m.chip, m)"><AppIcon name="replay" :size="20" />{{ t('ask.need.again') }}</button>
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
              <button type="button" class="helpful-btn" :aria-pressed="m.feedback === 'yes'" data-testid="ask-helpful-yes" @click="emit('feedback', 'yes')"><AppIcon name="check" :size="18" />{{ t('ask.feedback.yes') }}</button>
              <button type="button" class="helpful-btn" :aria-pressed="m.feedback === 'no'" data-testid="ask-helpful-no" @click="emit('feedback', 'no')"><AppIcon name="x" :size="18" />{{ t('ask.feedback.no') }}</button>
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
        <div v-if="latest && !revealing(m)" class="quick rise" data-testid="ask-quick">
          <button type="button" class="chip quick-chip" :disabled="loading" data-testid="ask-simpler" @click="emit('ask', t('ask.quick.simplerQ'))"><AppIcon name="sparkles" :size="18" />{{ t('ask.quick.simpler') }}</button>
          <span class="say-in" role="group" :aria-label="t('ask.quick.sayIn')">
            <span class="say-in-label">{{ t('ask.quick.sayIn') }}</span>
            <button v-for="(label, code) in LANG_NAMES" v-show="code !== m.lang" :key="code" type="button" class="chip lang-chip" :lang="code" :disabled="loading" :data-testid="`ask-say-${code}`" @click="emit('ask', m.q, m.chip, null, code)">{{ label }}</button>
          </span>
        </div>
        <div v-if="latest && !revealing(m)" class="follow rise" role="group" :aria-label="t('ask.followLabel')" data-testid="ask-follow">
          <span class="follow-label">{{ t('ask.followLabel') }}</span>
          <div class="d-flex flex-wrap gap-2">
            <template v-if="m.reply.suggestions?.length">
              <button v-for="s in m.reply.suggestions" :key="s" type="button" class="chip" :lang="m.lang" :disabled="loading" @click="emit('ask', s)">{{ s }}</button>
            </template>
            <template v-else>
              <button v-for="c in FOLLOW_UPS[m.chip]" :key="c" type="button" class="chip" :disabled="loading" @click="emit('ask', t(`ask.chips.${c}`), c)">
                {{ t(`ask.chips.${c}`) }}
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/AskReply.css"></style>
