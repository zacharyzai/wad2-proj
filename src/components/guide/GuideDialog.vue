<!-- Beginner's guide (Claude Design "Tour", extended into a walk through the real app). Steps come from stores/guide.js:
     card  - a centred card (bottom sheet on phones) over a dimmed page: the welcome and the finish.
     tap   - the real nav button glows; everything else is dimmed and blocked. Tapping it opens that page and moves on
             ("Take me there" does the same for anyone who can't find it, or uses a keyboard).
     look  - on the page just opened, points at one key button; Next moves on.
     Skip / Esc end it any time (marked seen). Focus goes to each step's title; card steps keep focus inside. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { guide, STEPS, currentStep, endGuide, nextStep, openGuide } from '../../stores/guide'
import GuideArt from './GuideArt.vue'
import AppIcon from '../layout/AppIcon.vue'

const { t, locale } = useI18n()
const router = useRouter()
const VOICE = { en: 'en-SG', zh: 'zh-CN', ms: 'ms-MY', ta: 'ta-IN' }
const PAD = 8 // space between the glow and the button
const GAP = 18 // space between the glow and the speech bubble

const step = computed(() => currentStep())
// Text for a step; tap steps put the real nav label in the title ("Tap Scan"), so the words always match the button.
const say = (part) => t(`guide.steps.${step.value.id}.${part}`, { name: step.value.kind === 'tap' ? t(`nav.${step.value.target.slice(1)}`) : '' })
const isCard = computed(() => step.value.kind === 'card')
const title = ref(null)
const panel = ref(null) // the card, or the speech bubble
const reading = ref(false)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
let returnFocus = null

// ---- read aloud ----
function stopVoice() {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  reading.value = false
}
function speak() {
  if (reading.value || !('speechSynthesis' in window)) return stopVoice()
  const u = new SpeechSynthesisUtterance(`${say('t')}. ${say('b')}`)
  u.lang = VOICE[locale.value] ?? 'en-SG'
  u.rate = 0.9
  u.onend = u.onerror = () => (reading.value = false)
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  reading.value = true
}

// ---- moving on and ending ----
function next() {
  stopVoice()
  nextStep()
}
function takeMeThere() {
  router.push(step.value.target)
  next()
}
function end(kind) {
  stopVoice()
  endGuide(kind)
  if (kind === 'sample') router.push({ name: 'scan', query: { sample: 'med-1' } })
}

// ---- where the glow and the bubble go (tap and look steps) ----
const hole = ref(null) // { top, left, width, height } around the target, or null while it isn't on screen
const bubble = ref({ top: 0, left: 0, side: 'below', arrow: 0 })
// The glow and bubble appear in place first, then glide between buttons (so they never fly in from the corner).
const ringReady = ref(false)
watch(hole, (h) => h && !ringReady.value && requestAnimationFrame(() => (ringReady.value = true)))
let frame = 0
let lastFound = 0
let scrolled = false // each step scrolls its button into view once, as soon as it exists (the page may still be loading)

function findTarget() {
  const el = document.querySelector(`[data-guide="${step.value.target}"]`)
  const r = el?.getBoundingClientRect()
  return r && r.width && r.height ? { el, r } : null
}

// Right of a sidebar button, above a bottom tab, below anything near the top; always kept on screen.
function place(r) {
  const b = panel.value?.getBoundingClientRect() ?? { width: 340, height: 220 }
  const vw = innerWidth
  const vh = innerHeight
  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max))
  if (r.left + r.width < vw * 0.4 && r.left + r.width + GAP + b.width < vw - 12) {
    const top = clamp(r.top + r.height / 2 - b.height / 2, 12, vh - b.height - 12)
    return { side: 'right', left: r.left + r.width + GAP, top, arrow: r.top + r.height / 2 - top }
  }
  const left = clamp(r.left + r.width / 2 - b.width / 2, 12, vw - b.width - 12)
  const arrow = r.left + r.width / 2 - left
  // Below if it fits, else above if it fits, else wherever there is more room (kept on screen, even if it overlaps a little).
  const below = r.top + r.height + GAP
  const above = r.top - GAP - b.height
  if (below + b.height <= vh - 12 && !(r.top > vh / 2 && above >= 12)) return { side: 'below', left, top: below, arrow }
  if (above >= 12 && above + b.height <= vh - 12) return { side: 'above', left, top: above, arrow }
  const roomBelow = vh - below
  return roomBelow >= r.top ? { side: 'below', left, top: clamp(below, 12, vh - b.height - 12), arrow } : { side: 'above', left, top: clamp(above, 12, vh - b.height - 12), arrow }
}

function track() {
  const found = findTarget()
  // Bring the button on screen once: look steps centre it; tap steps only scroll if it is off screen (e.g. the phone top bar).
  if (found && !scrolled) {
    scrolled = true
    const off = found.r.top < 0 || found.r.bottom > innerHeight
    if (step.value.kind === 'look' || off) found.el.scrollIntoView({ block: step.value.kind === 'look' ? 'center' : 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
  }
  if (found) {
    const { r } = found
    hole.value = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
    bubble.value = place(hole.value)
    lastFound = performance.now()
  } else if (performance.now() - lastFound > 1500) {
    hole.value = null // the button isn't on this page (e.g. a real bill is open): the bubble waits in the middle with Next
  }
  frame = requestAnimationFrame(track)
}

// A tap on the glowing nav button moves on (the link itself opens the page).
function onTapTarget(e) {
  if (step.value.kind !== 'tap') return
  if (findTarget()?.el.contains(e.target)) next()
}

// Taps on the dimmed page are blocked; the bubble gives a little shake to say "over here".
function nudge() {
  if (!reduced()) panel.value?.animate([{ translate: '0' }, { translate: '-8px' }, { translate: '8px' }, { translate: '0' }], { duration: 260 })
}

function onKey(e) {
  if (e.key === 'Escape') return e.preventDefault(), end('esc')
  if (!isCard.value || e.key !== 'Tab') return
  // Card steps keep focus inside the card.
  const items = [...panel.value.querySelectorAll('button:not([disabled])')]
  if (e.shiftKey && [items[0], title.value].includes(document.activeElement)) (e.preventDefault(), items.at(-1).focus())
  else if (!e.shiftKey && document.activeElement === items.at(-1)) (e.preventDefault(), items[0].focus())
}

// Card steps: the page behind can't be used. Pointing steps: it can (that's the point), except where it's dimmed.
const shell = () => document.querySelector('.shell')
function lockPage(lock) {
  shell()?.toggleAttribute('inert', lock)
  document.body.style.overflow = lock ? 'hidden' : ''
}

async function enterStep() {
  stopVoice()
  cancelAnimationFrame(frame)
  lockPage(isCard.value)
  if (!isCard.value) {
    // Keep the last glow and bubble where they are until the next button appears, so they glide there instead of blinking.
    lastFound = performance.now()
    scrolled = false
    await nextTick()
    track()
  }
  await nextTick()
  title.value?.focus({ preventScroll: true })
}

watch(
  () => [guide.open, guide.step],
  ([open], [wasOpen] = []) => {
    if (open && !wasOpen) {
      hole.value = null // a fresh start: nothing glides in from where the guide last was
      ringReady.value = false
      returnFocus = document.activeElement
      document.addEventListener('click', onTapTarget, true)
      document.addEventListener('keydown', onKey)
    }
    if (open) return enterStep()
    cancelAnimationFrame(frame)
    lockPage(false)
    document.removeEventListener('click', onTapTarget, true)
    document.removeEventListener('keydown', onKey)
    if (wasOpen) (returnFocus?.isConnected ? returnFocus : document.querySelector('main h1'))?.focus?.({ preventScroll: true })
  },
)
watch(locale, stopVoice) // the step re-renders in the new language; old speech would be in the wrong one

// The four dimmed panels around the glow (they block taps), and the glow itself.
const dims = computed(() => {
  // Always four panels (no swap to one full-screen sheet), so their size changes animate smoothly.
  const h = hole.value ?? { top: innerHeight / 2, left: innerWidth / 2, width: 0, height: 0 }
  const px = (n) => `${Math.max(0, n)}px`
  return [
    { top: 0, left: 0, width: '100%', height: px(h.top) },
    { top: px(h.top + h.height), left: 0, width: '100%', bottom: 0 },
    { top: px(h.top), left: 0, width: px(h.left), height: px(h.height) },
    { top: px(h.top), left: px(h.left + h.width), right: 0, height: px(h.height) },
  ]
})
const ringStyle = computed(() => hole.value && { transform: `translate(${hole.value.left}px, ${hole.value.top}px)`, width: `${hole.value.width}px`, height: `${hole.value.height}px` })
const bubbleStyle = computed(() => (hole.value ? { transform: `translate(${bubble.value.left}px, ${bubble.value.top}px)` } : null))

// ---- the closing message: fades after 3 seconds ----
let toastTimer = 0
const toast = ref(false)
watch(
  () => guide.ended,
  (kind) => {
    clearTimeout(toastTimer)
    toast.value = Boolean(kind)
    if (kind) toastTimer = setTimeout(() => (toast.value = false), 3000)
  },
)
const toastText = computed(() => t(`guide.end.${guide.ended === 'sample' ? 'sample' : guide.ended === 'start' ? 'start' : 'skip'}`))

onBeforeUnmount(() => {
  stopVoice()
  clearTimeout(toastTimer)
  cancelAnimationFrame(frame)
  document.removeEventListener('click', onTapTarget, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <!-- Card steps: welcome and finish -->
  <div v-if="guide.open && isCard" class="guide" :class="`lang-${locale}`">
    <div class="scrim" aria-hidden="true"></div>
    <div ref="panel" class="card-g" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-text" data-testid="guide">
      <div class="top">
        <button type="button" class="speak" :aria-pressed="reading" :aria-label="reading ? t('guide.stop') : t('guide.listen')" data-testid="guide-speak" @click="speak">
          <AppIcon :name="reading ? 'pause' : 'volume'" :size="24" />
        </button>
        <span class="step-text" aria-live="polite">{{ t('guide.step', { n: guide.step, total: STEPS.length }) }}</span>
        <button v-if="step.id !== 'finish'" type="button" class="g-skip" data-testid="guide-skip" @click="end('skip')">{{ t('guide.skip') }}<AppIcon name="x" :size="20" :stroke="2.5" /></button>
      </div>
      <div :key="step.id" class="body">
        <GuideArt :step="step.id === 'intro' ? 1 : 5" />
        <div class="words">
          <h2 id="guide-title" ref="title" tabindex="-1">{{ say('t') }}</h2>
          <p id="guide-text">{{ say('b') }}</p>
        </div>
      </div>
      <button v-if="step.id === 'intro'" type="button" class="btn btn-primary" data-testid="guide-next" @click="next">{{ t('guide.begin') }}<AppIcon name="right" /></button>
      <div v-else class="d-flex flex-column gap-3">
        <button type="button" class="btn btn-primary" data-testid="guide-sample" @click="end('sample')"><AppIcon name="pill" />{{ t('guide.try') }}</button>
        <button type="button" class="btn btn-outline g-outline" data-testid="guide-start" @click="end('start')">{{ t('guide.start') }}</button>
      </div>
    </div>
  </div>

  <!-- Pointing steps: dim everything but the target, glow around it, a speech bubble beside it -->
  <div v-else-if="guide.open" class="coach" :class="`lang-${locale}`" data-testid="guide-coach">
    <div v-for="(d, i) in dims" :key="i" class="dim" :style="d" aria-hidden="true" @pointerdown="nudge"></div>
    <div v-if="hole" class="ring" :class="{ tap: step.kind === 'tap', ready: ringReady }" :style="ringStyle" aria-hidden="true"></div>
    <div ref="panel" class="bubble" :class="[`side-${bubble.side}`, { centred: !hole, ready: ringReady }]" :style="bubbleStyle" role="dialog" aria-modal="false" aria-labelledby="guide-title" aria-describedby="guide-text" data-testid="guide">
      <span v-if="hole" class="arrow" :style="bubble.side === 'right' ? { top: `${bubble.arrow}px` } : { left: `${bubble.arrow}px` }" aria-hidden="true"></span>
      <div :key="step.id" class="bubble-in">
        <div class="top">
          <span class="step-text" aria-live="polite">{{ t('guide.step', { n: guide.step, total: STEPS.length }) }}</span>
          <button type="button" class="speak sm" :aria-pressed="reading" :aria-label="reading ? t('guide.stop') : t('guide.listen')" @click="speak">
            <AppIcon :name="reading ? 'pause' : 'volume'" :size="20" />
          </button>
          <button type="button" class="g-skip sm" data-testid="guide-skip" @click="end('skip')">{{ t('guide.skip') }}<AppIcon name="x" :size="18" :stroke="2.5" /></button>
        </div>
        <h2 id="guide-title" ref="title" tabindex="-1">{{ say('t') }}</h2>
        <p id="guide-text">{{ say('b') }}</p>
        <template v-if="step.kind === 'tap'">
          <p class="tap-hint"><AppIcon name="sparkles" :size="20" />{{ t('guide.tapHint') }}</p>
          <button type="button" class="there" data-testid="guide-there" @click="takeMeThere">{{ t('guide.there') }}<AppIcon name="right" :size="18" /></button>
        </template>
        <button v-else type="button" class="btn btn-primary btn-sm g-next" data-testid="guide-next" @click="next">{{ t('guide.next') }}<AppIcon name="right" :size="20" /></button>
      </div>
    </div>
  </div>

  <div v-if="toast" class="guide-toast" role="status" data-testid="guide-toast">
    <AppIcon name="checkCircle" :size="24" />
    <span>{{ toastText }}</span>
    <button type="button" @click="openGuide">{{ t('guide.again') }}</button>
  </div>
</template>

<style scoped>
/* ---- card steps: bottom sheet on phones, centred card ≥768px (sizes from the Claude Design walkthrough) ---- */
.guide { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; --art-h: 176px; }
.scrim { position: absolute; inset: 0; background: rgba(20, 18, 16, 0.66); animation: fade 200ms ease-out both; }
.card-g { position: relative; display: flex; flex-direction: column; gap: 16px; max-height: 100dvh; overflow-y: auto; padding: 20px 20px calc(28px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background: var(--color-card); box-shadow: 0 -6px 40px rgba(0, 0, 0, 0.22); animation: rise 280ms var(--ease-out) both; }
.top { display: flex; align-items: center; gap: 12px; }
.step-text { flex: 1; min-width: 0; font-size: 16px; font-weight: 700; line-height: 1.3; color: var(--color-text-muted); }
.speak { width: var(--z52, 52px); height: var(--z52, 52px); flex: none; display: grid; place-items: center; padding: 0; border: 2px solid var(--color-primary-text); border-radius: 50%; background: var(--color-card); color: var(--color-tint-text); }
.speak[aria-pressed='true'] { background: var(--color-tint); }
.g-skip { min-height: var(--z52, 52px); flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 16px; border: 0; border-radius: 18px; background: var(--color-tint); color: var(--color-tint-text); font-size: 18px; font-weight: 700; }
.g-skip:hover { background: var(--color-tint-strong); }
.body { display: flex; flex-direction: column; gap: 16px; animation: slide 260ms var(--ease-out) both; }
.words { display: flex; flex-direction: column; gap: 8px; }
h2 { font-family: var(--font-display); font-weight: 400; font-size: var(--t28, 28px); line-height: 1.2; font-variant-numeric: lining-nums; text-wrap: pretty; outline: none; }
h2:focus, h2:focus-visible { box-shadow: none; } /* focused only so screen readers start here; it is not a control */
.lang-ta h2 { font-family: var(--font-sans); font-weight: 800; font-size: var(--t23, 23px); line-height: 1.35; }
p { margin: 0; font-size: 18px; line-height: 1.55; text-wrap: pretty; }
.g-outline { --bs-btn-border-width: 2px; --bs-btn-border-color: var(--color-primary-text); --bs-btn-color: var(--color-tint-text); }
@media (min-width: 768px) {
  .guide { justify-content: center; align-items: center; padding: 40px; --art-h: 232px; }
  .card-g { width: 600px; max-width: 100%; max-height: calc(100dvh - 80px); gap: 20px; padding: 32px; border-radius: 24px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28); }
  h2 { font-size: var(--t34, 34px); }
  .lang-ta h2 { font-size: var(--t28, 28px); }
}

/* ---- pointing steps ---- */
.coach { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
.dim { position: fixed; background: rgba(20, 18, 16, 0.62); pointer-events: auto; animation: fade 220ms ease-out both; transition: top 420ms var(--ease-out), left 420ms var(--ease-out), width 420ms var(--ease-out), height 420ms var(--ease-out); }
/* The glow: follows the button, and pulses on "tap" steps so it's clear what to press. */
.ring { position: fixed; top: 0; left: 0; border-radius: 18px; box-shadow: 0 0 0 3px var(--color-accent), 0 0 24px 4px rgba(0, 184, 169, 0.55); animation: fade 240ms ease-out both; }
.ring.ready { transition: transform 460ms var(--ease-out), width 460ms var(--ease-out), height 460ms var(--ease-out); }
.ring.tap::after { content: ''; position: absolute; inset: -3px; border-radius: inherit; border: 3px solid var(--color-accent); animation: pulse 1.6s ease-out infinite; }
.bubble { position: fixed; top: 0; left: 0; width: min(360px, calc(100vw - 24px)); padding: 18px 18px 16px; border-radius: 22px; background: var(--color-card); color: var(--color-text); box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3); pointer-events: auto; }
.bubble.ready { transition: transform 460ms var(--ease-out); }
.bubble.centred { top: 50%; left: 50%; transform: translate(-50%, -50%); }
.bubble-in { display: flex; flex-direction: column; gap: 10px; animation: pop 320ms var(--ease-spring) both; }
.bubble h2 { font-size: var(--t24, 24px); }
.lang-ta .bubble h2 { font-size: var(--t20, 20px); }
.bubble p { font-size: 17px; line-height: 1.5; }
.speak.sm { width: 44px; height: 44px; }
.g-skip.sm { min-height: 44px; padding: 4px 12px; font-size: 17px; }
.arrow { position: absolute; width: 18px; height: 18px; margin: -9px; background: var(--color-card); transform: rotate(45deg); }
.side-right .arrow { left: 0; }
.side-above .arrow { top: 100%; }
.side-below .arrow { top: 0; }
.tap-hint { display: flex; align-items: center; gap: 8px; color: var(--color-tint-text); font-weight: 700; }
.tap-hint .icon { flex: none; animation: bob 1.2s ease-in-out infinite; }
.there { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-height: var(--hit); padding: 0 2px; border: 0; background: none; color: var(--color-link); font-size: 17px; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.g-next { align-self: flex-end; min-height: var(--z52, 52px); }

/* ---- closing message (fades after 3 seconds) ---- */
.guide-toast { position: fixed; z-index: 45; left: 50%; bottom: calc(96px + env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(560px, calc(100% - 32px)); display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px; border-radius: 18px; background: var(--color-text); color: var(--color-page); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25); animation: toast 3s ease-in-out both; }
.guide-toast span { flex: 1; font-size: 17px; font-weight: 600; line-height: 1.4; }
.guide-toast button { min-height: 48px; flex: none; padding: 6px 14px; border: 0; border-radius: 14px; background: var(--color-page); color: var(--color-text); font-size: 16px; font-weight: 700; }
@media (min-width: 992px) { .guide-toast { bottom: 40px; } }

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(24px); } }
@keyframes slide { from { opacity: 0; transform: translateX(24px); } }
@keyframes pop { from { opacity: 0; transform: scale(0.94); } }
@keyframes pulse { from { opacity: 0.9; transform: scale(1); } to { opacity: 0; transform: scale(1.35); } }
@keyframes bob { 50% { transform: translateY(-3px); } }
@keyframes toast { 0% { opacity: 0; translate: 0 12px; } 10%, 75% { opacity: 1; translate: 0 0; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .scrim, .card-g, .body, .dim, .bubble-in, .guide-toast { animation: none; }
  .dim, .ring, .bubble { transition: none; }
  .ring.tap::after, .tap-hint .icon { animation: none; }
}
</style>
