<!-- Owner: Zachary. Welcome page for first-time visitors on this device (router sends "/" here once; see WELCOME_KEY).
     From the Claude Design "medicine falling from the sky" page: each section's items fall in as you scroll and become the feature.
     Motion is tied to scroll. A few demos also loop on their own (headline, scan card, reminder phone, chat); all but the
     chat have a control that stops them, and the phone and chat wait while off screen. Under 1024px items just fade and settle; with reduced motion everything is shown landed. -->
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { WELCOME_KEY } from '../router'
import { setLocale } from '../i18n'
import { speak as sayAloud, stopSpeaking } from '../stores/speech'
import AppIcon from '../components/layout/AppIcon.vue'
import DocTunnel from '../components/landing/DocTunnel.vue'

const { t, locale } = useI18n()

// Headlines, buttons and read-aloud samples are written in their own language, whatever the page language is.
const LANGS = [
  { lang: 'en', label: 'English', voice: 'en-SG', head: 'Understand your medical bills', sample: 'You pay $8.70 today. MediSave paid $15 for you.' },
  { lang: 'zh', label: '中文', voice: 'zh-CN', head: '看懂您的医药账单', sample: '您今天需要付8.70元。保健储蓄已经为您付了15元。' },
  { lang: 'ms', label: 'Melayu', voice: 'ms-MY', head: 'Fahami bil perubatan anda', sample: 'Anda bayar $8.70 hari ini. MediSave telah bayar $15 untuk anda.' },
  { lang: 'ta', label: 'தமிழ்', voice: 'ta-IN', head: 'உங்கள் மருத்துவக் கட்டணங்களைப் புரிந்துகொள்ளுங்கள்', sample: 'இன்று நீங்கள் $8.70 செலுத்த வேண்டும். மெடிசேவ் உங்களுக்காக $15 செலுத்தியது.' },
]
const byLocale = () => Math.max(0, LANGS.findIndex((l) => l.lang === locale.value))

// Pill colours (two halves of a capsule). a/b = section progress where it starts and finishes falling; r0 = start tilt; dx = sideways drift.
// brand: the assistant's capsule, half Pharmacy Teal (the app's accent).
const PILL = { brand: ['#1a7070', 'oklch(0.89 0.1 88)'], coral: ['oklch(0.74 0.11 38)', 'oklch(0.89 0.1 88)'], green: ['oklch(0.74 0.08 150)', 'oklch(0.86 0.065 150)'], blue: ['oklch(0.74 0.07 240)', 'oklch(0.86 0.055 235)'], gold: ['oklch(0.8 0.12 80)', 'oklch(0.84 0.08 40)'] }
const pill = (name) => ({ '--c1': PILL[name][0], '--c2': PILL[name][1] })
const VOICE_FALL = [
  { a: 0.02, b: 0.5, r0: -24, dx: -40, pill: 'coral' },
  { a: 0.08, b: 0.56, r0: 30, dx: 40, pill: 'green' },
  { a: 0.14, b: 0.62, r0: 18, dx: -30, pill: 'blue' },
  { a: 0.2, b: 0.68, r0: -32, dx: 30, pill: 'gold' },
]
const DOSES = [
  { key: 'morning', pills: [{ a: 0.55, b: 0.78, r0: 90, dx: -30, c: 'oklch(0.89 0.1 88)' }, { a: 0.6, b: 0.83, r0: -60, dx: 30, c: 'oklch(0.86 0.055 235)' }] },
  { key: 'afternoon', pills: [{ a: 0.65, b: 0.88, r0: 70, dx: -20, c: 'oklch(0.86 0.055 235)' }] },
  { key: 'night', pills: [{ a: 0.7, b: 0.93, r0: -80, dx: 20, c: 'oklch(0.84 0.08 40)' }] },
]
const CHAT = [
  { key: 'q1', me: true, a: 0.02, b: 0.34, r0: 14, dx: 40, ma: 0.3, pill: 'coral' },
  { key: 'a1', me: false, a: 0.12, b: 0.46, r0: -10, dx: -40, ma: 0.42, pill: 'green' },
  { key: 'q2', me: true, a: 0.22, b: 0.56, r0: 10, dx: 30, ma: 0.52, pill: 'blue' },
]

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')

// Hero headline: changes language every 3.2 s. Tapping a language stops it there (WCAG 2.2.2) and switches the page to it.
const head = ref(byLocale())
const pinned = ref(false)
const timer = setInterval(() => {
  if (!pinned.value && !reduceMq.matches) head.value = (head.value + 1) % LANGS.length
}, 3200)
function pickHead(i) {
  head.value = i
  pinned.value = true
  setLocale(LANGS[i].lang)
}

// "Snap a photo": the scan frame takes turns showing a bill and a medicine label, every 5 s, each swap re-scanned.
// Tapping Bill or Medicine label stops it there (WCAG 2.2.2), like the headline. Still with reduced motion.
const SCAN_ITEMS = ['bill', 'label']
const scanItem = ref('bill')
const scanPinned = ref(false)
const scanTimer = setInterval(() => {
  if (!scanPinned.value && !reduceMq.matches) scanItem.value = scanItem.value === 'bill' ? 'label' : 'bill'
}, 5000)
function pickScan(item) {
  scanItem.value = item
  scanPinned.value = true
}

// Read-aloud demo: the device's voice, or our server's audio when it has none for the language (stores/speech.js).
const voice = ref(byLocale())
const speaking = ref(false)
const preparing = ref(false) // getting the audio
let readRun = 0
const ringing = ref(false) // fast rings: on with speaking, off at the next ring end after it stops
const onRing = (e) => e.animationName.startsWith('ring') && !speaking.value && (ringing.value = false)
// Neither a voice nor the server's audio could play: say so instead of a silent button.
const noVoice = ref(false)
function pickVoice(i) {
  readRun++
  stopSpeaking()
  voice.value = i
  speaking.value = preparing.value = noVoice.value = false
}
async function speak() {
  if (speaking.value) return pickVoice(voice.value)
  const L = LANGS[voice.value]
  const id = ++readRun
  noVoice.value = false
  speaking.value = ringing.value = preparing.value = true
  const result = await sayAloud(L.sample, L.lang, { rate: 0.85, onPlaying: () => id === readRun && (preparing.value = false) })
  if (id !== readRun) return
  speaking.value = preparing.value = false
  noVoice.value = result === 'failed'
}

// The Reminders switch also stops the phone buzzing (WCAG 2.2.2): reminders off, no reminder arrives.
const remind = ref(true)
// Lock-screen date: today, in the page language (only the time is made up).
const phoneDate = () => new Date().toLocaleDateString(locale.value, { weekday: 'long', day: 'numeric', month: 'long' })
const calendarUrl = () =>
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(t('landing.doses.calEvent'))}&details=${encodeURIComponent(t('landing.doses.morningText'))}&recur=RRULE%3AFREQ%3DDAILY`

// ---- Ask: once the three messages have landed, the chat carries on by itself, one message at a time, round and round.
// Bot answers show "typing" first. It waits while off screen or in a hidden tab, and starts over when you scroll back
// above it. Never with reduced motion. Wording follows the chatbot's rules (chat.js).
// No pause button, by the team's choice (WCAG 2.2.2 asks for one on content that moves for over 5 s).
const LIVE = [{ key: 'a2' }, { key: 'q3', me: true }, { key: 'a3' }, { key: 'q4', me: true }, { key: 'a4' }, { key: 'q1', me: true }, { key: 'a1' }, { key: 'q2', me: true }]
const CHAT_DONE = Math.max(...CHAT.map((m) => m.ma + 0.18)) // section progress when the last bubble has become a message (its morph-in end)
const MAX_LIVE = 6 // older messages have long left the window by then
const live = ref([])
const chatWin = ref(null)
const chatTrack = ref(null)
let chatLanded = false
let chatSeen = false
let chatTimer = 0
let liveStep = 0
let liveId = 0
const chatCanRun = () => chatLanded && chatSeen && !document.hidden && !reduceMq.matches
const readMs = (key) => 1400 + 45 * t(`landing.ask.${key}`).length
const later = (fn, ms) => (chatTimer = setTimeout(fn, ms))
function kickChat(ms = 900) {
  if (!chatTimer && chatCanRun()) later(chatStep, ms)
}
// The newest message sits at the bottom; everything above slides up to make room (FLIP on the whole track).
async function slide(change) {
  const track = chatTrack.value
  const before = track?.getBoundingClientRect().top
  change()
  await nextTick()
  const dy = track ? before - track.getBoundingClientRect().top : 0
  if (dy) track.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
}
function chatStep() {
  chatTimer = 0
  if (!chatCanRun()) return
  const win = chatWin.value
  if (win && !live.value.length) win.style.height = `${win.offsetHeight}px` // the window keeps the size of the first three
  if (live.value.length >= MAX_LIVE) live.value.shift() // off the top already, so nothing visible moves
  const next = LIVE[liveStep++ % LIVE.length]
  const id = ++liveId
  if (next.me) {
    slide(() => live.value.push({ id, ...next }))
    return later(chatStep, readMs(next.key))
  }
  slide(() => live.value.push({ id, typing: true }))
  later(() => {
    slide(() => Object.assign(live.value.find((m) => m.id === id) ?? {}, { typing: false, key: next.key }))
    later(chatStep, readMs(next.key) + 1000)
  }, 1300)
}
function syncChat(t) {
  const now = t >= CHAT_DONE
  if (now === chatLanded) return
  chatLanded = now
  if (now) return kickChat(1400)
  clearTimeout(chatTimer)
  chatTimer = 0
  live.value = []
  liveStep = 0
  if (chatWin.value) chatWin.value.style.height = ''
}
const onVisibility = () => kickChat()

// The phone and the chat only move while they are on screen.
const phoneEl = ref(null)
const phoneSeen = ref(false)
const SPEAKER_IN = 0.9 // section progress when the speaker face has morphed in (its data-mb)
const speakerSeen = ref(false) // set then (in frame), so the three pulses aren't spent while it is still falling
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.target === phoneEl.value) phoneSeen.value = e.isIntersecting
    else {
      chatSeen = e.isIntersecting
      kickChat()
    }
  }
})

// ---- Top bar: links to each section, the one being read is highlighted; solid background once the page scrolls.
const SECTIONS = ['scan', 'listen', 'doses', 'ask']
const navActive = ref(null)
const navSolid = ref(false)
function updateNav() {
  navSolid.value = scrollY > 8
  const line = innerHeight * 0.4 // a section counts as "being read" once its top passes 40% down the screen
  navActive.value = SECTIONS.findLast((id) => document.getElementById(id)?.getBoundingClientRect().top <= line) ?? null
}
function goTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMq.matches ? 'auto' : 'smooth' })
}

function scrollToScan() {
  document.getElementById('scan')?.scrollIntoView({ behavior: reduceMq.matches ? 'auto' : 'smooth' })
}

// ---- Scroll engine (ported from the design). Every position comes from scroll; scrolling back plays it in reverse.
const root = ref(null)
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (v) => 1 - (1 - v) ** 3
// offsetTop ignores transforms, so a falling item's own movement never feeds back into its position.
const docTop = (el) => {
  let y = 0
  for (; el; el = el.offsetParent) y += el.offsetTop
  return y
}

// Sections a keyboard or screen-reader user has moved into: shown landed straight away, whatever the scroll position.
const landed = new Set()

function frame() {
  const el = root.value
  if (!el) return
  const H = innerHeight
  const sy = scrollY
  const red = reduceMq.matches
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - H)
  // One progress value per section: 0 when its top enters at the bottom, 1 when it reaches the top
  // (or when its bottom meets the screen bottom, if it is taller than the screen).
  const T = {}
  el.querySelectorAll('[data-sec]').forEach((s) => {
    const top = docTop(s)
    const now = top - sy
    const endTop = Math.max(Math.min(0, H - s.offsetHeight), top - maxScroll)
    T[s.dataset.sec] = { t: red || landed.has(s.dataset.sec) ? 1 : clamp((H - now) / Math.max(1, H - endTop)), top, now }
  })
  const compact = !red && el.clientWidth < 1024
  syncChat(T[5]?.t ?? 0)
  if ((T[3]?.t ?? 0) >= SPEAKER_IN) speakerSeen.value = true

  el.querySelectorAll('[data-fall]').forEach((f) => {
    const d = f.dataset
    const r0 = +(d.r0 || 0)
    const dx = +(d.dx || 0)
    if (d.fall === 'hero') {
      // Hero items keep falling at ~1.5× scroll speed, turning slowly, and fade out over the first screen. Still on small screens.
      const y = red || compact ? 0 : Math.min(sy, H)
      const op = 1 - clamp((y - 0.15 * H) / (0.55 * H))
      f.style.transform = `translate3d(0, ${(+d.k * y).toFixed(1)}px, 0) rotate(${(r0 + +d.spin * y * 0.05).toFixed(2)}deg)`
      f.style.opacity = op
      f.style.visibility = op <= 0 ? 'hidden' : ''
      return
    }
    const s = T[d.fall]
    const e = ease(clamp((s.t - +d.a) / (+d.b - +d.a)))
    if (e >= 1) {
      f.style.transform = f.style.opacity = f.style.visibility = f.style.pointerEvents = ''
      return
    }
    if (compact) {
      // Small screens: fade in and settle 36px in place, never crossing other content.
      f.style.visibility = ''
      f.style.opacity = e.toFixed(3)
      f.style.pointerEvents = e <= 0 ? 'none' : ''
      f.style.transform = `translate3d(0, ${(-(1 - e) * 36).toFixed(1)}px, 0) rotate(${(r0 * 0.15 * (1 - e)).toFixed(2)}deg)`
      return
    }
    // Desktop: start 180px above the screen, slow down as it lands, straighten from its tilt.
    // Not yet falling: see-through and click-through, but never visibility:hidden, so Tab and screen readers still reach it.
    f.style.opacity = e <= 0 ? '0' : ''
    f.style.pointerEvents = e <= 0 ? 'none' : ''
    const ty = -(1 - e) * (Math.max(s.now, 0) + docTop(f) - s.top + 180)
    f.style.transform = `translate3d(${(dx * (1 - e) ** 2).toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${(r0 * (1 - e)).toFixed(2)}deg)`
  })

  // After landing, the illustration cross-fades into the real UI.
  el.querySelectorAll('[data-morph]').forEach((m) => {
    const d = m.dataset
    const p = ease(clamp((T[m.closest('[data-sec]').dataset.sec].t - +d.ma) / (+d.mb - +d.ma)))
    if (d.morph === 'in') {
      m.style.opacity = p
      m.style.transform = p >= 1 ? '' : `scale(${(0.93 + 0.07 * p).toFixed(3)})`
    } else if (d.morph === 'out') {
      m.style.opacity = 1 - p
      m.style.visibility = p >= 1 ? 'hidden' : ''
    } else if (d.morph === 'scan') {
      m.style.opacity = p > 0 && p < 1 ? 1 : 0
      m.style.transform = `translateY(${(p * m.parentElement.offsetHeight).toFixed(1)}px)`
    } else if (d.morph === 'radius') {
      m.style.borderRadius = p >= 1 ? '' : `${Math.round(999 + (26 - 999) * p)}px`
    }
  })
}

let raf = 0
const onScroll = () => (raf ||= requestAnimationFrame(() => ((raf = 0), frame())))

// Keyboard (Tab) or screen-reader focus inside a section that hasn't landed yet: land it now and bring it into view,
// so nobody tabs onto an invisible button.
// Only keyboard focus (:focus-visible): a tap also focuses, and scrolling under a finger mid-tap would lose the tap.
function onFocusIn(event) {
  const sec = event.target.closest?.('[data-sec]')?.dataset.sec
  if (!sec || landed.has(sec) || reduceMq.matches || !event.target.matches(':focus-visible')) return
  if (!event.target.closest('[data-fall], [data-morph]')) return
  landed.add(sec)
  frame()
  event.target.scrollIntoView({ block: 'center', behavior: reduceMq.matches ? 'auto' : 'smooth' })
}

onMounted(() => {
  // Seen once: from now on "/" opens the normal Home page on this device.
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // Storage blocked (private mode): the welcome page just shows again next time.
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('scroll', updateNav, { passive: true })
  root.value?.addEventListener('focusin', onFocusIn)
  updateNav()
  addEventListener('resize', onScroll)
  reduceMq.addEventListener('change', onScroll)
  frame()
  document.fonts?.ready.then(frame)
  for (const target of [phoneEl.value, chatWin.value]) if (target) seen.observe(target)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(scanTimer)
  clearTimeout(chatTimer)
  seen.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
  cancelAnimationFrame(raf)
  removeEventListener('scroll', onScroll)
  removeEventListener('scroll', updateNav)
  root.value?.removeEventListener('focusin', onFocusIn)
  removeEventListener('resize', onScroll)
  reduceMq.removeEventListener('change', onScroll)
  stopSpeaking()
})
</script>

<template>
  <div ref="root" class="landing">
    <header class="lnav" :class="{ solid: navSolid }" data-testid="landing-nav">
      <a href="#top" class="brand" :aria-label="t('app.name')" @click.prevent="goTo('top')">
        <img src="/logo-192.png" alt="" class="brand-logo" width="40" height="40" />
        <span class="serif brand-name">{{ t('app.name') }}</span>
      </a>
      <nav class="lnav-links" :aria-label="t('landing.nav.label')">
        <a v-for="id in SECTIONS" :key="id" :href="`#${id}`" :class="{ on: navActive === id }" :aria-current="navActive === id ? 'true' : null" @click.prevent="goTo(id)">{{ t(`landing.nav.${id}`) }}</a>
      </nav>
      <div class="lnav-acts">
        <RouterLink :to="{ name: 'login' }" class="lnav-login">{{ t('nav.login') }}</RouterLink>
        <RouterLink :to="{ name: 'login' }" class="cta sm">{{ t('landing.try') }}</RouterLink>
      </div>
    </header>

    <section id="top" data-sec="1" class="sec hero-sec" data-testid="landing-hero">
      <div class="hero-body">
        <div class="row hero-row">
          <div class="hero-text">
            <h1 class="headline serif">
              <!-- Screen readers get one steady heading in the page's language; the cycling one is visual only. -->
              <span class="visually-hidden">{{ t('landing.hero.title') }}</span>
              <span
                v-for="(l, i) in LANGS"
                :key="l.lang"
                :lang="l.lang"
                class="head"
                :class="{ on: i === head }"
                aria-hidden="true"
                :data-testid="i === head ? 'landing-headline' : null"
              >{{ l.head }}</span>
            </h1>
            <div class="hchips" role="group" :aria-label="t('nav.language')">
              <button v-for="(l, i) in LANGS" :key="l.lang" type="button" :lang="l.lang" class="hchip" :aria-pressed="i === head" @click="pickHead(i)">{{ l.label }}</button>
            </div>
            <p class="lede">{{ t('landing.hero.lead') }}</p>
            <div class="ctas">
              <RouterLink :to="{ name: 'login' }" class="cta" data-testid="landing-cta-hero">{{ t('landing.try') }}</RouterLink>
              <button type="button" class="ghost" @click="scrollToScan">{{ t('landing.hero.how') }} <span aria-hidden="true">↓</span></button>
            </div>
          </div>

          <div class="hero-art" aria-hidden="true">
            <div data-fall="hero" data-k="1.45" data-r0="-14" data-spin="-1" class="fly bottle">
              <div class="cap"></div>
              <div class="jar"><div class="label"><span></span><span></span><span></span></div></div>
            </div>
            <div data-fall="hero" data-k="1.7" data-r0="28" data-spin="1" class="fly capsule c1" :style="pill('coral')"></div>
            <div data-fall="hero" data-k="1.6" data-r0="20" data-spin="1" class="fly tablet t1"><span></span></div>
            <div data-fall="hero" data-k="1.35" data-r0="0" data-spin="-1" class="fly tablet t2"></div>
            <div data-fall="hero" data-k="1.55" data-r0="-40" data-spin="-1" class="fly capsule c2" :style="pill('blue')"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Between the hero and "Snap a photo": real labels and bills fly past through a 3D tunnel as you scroll (DocTunnel.vue). -->
    <DocTunnel />

    <section id="scan" data-sec="2" class="sec sand" data-testid="landing-scan" aria-labelledby="scan-title">
      <div class="row">
        <div class="copy">
          <span class="kicker">{{ t('landing.scan.kicker') }}</span>
          <h2 id="scan-title" class="title2 serif">{{ t('landing.scan.title') }}</h2>
          <p class="lede">{{ t('landing.scan.text') }}</p>
        </div>
        <div class="demo col">
          <div class="frame">
            <span v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="corner" :class="c" aria-hidden="true"></span>
            <div data-fall="2" data-a="0.02" data-b="0.5" data-r0="-14" data-dx="-50" class="paper bill">
              <!-- Both cards sit in the same spot (the taller one sets the size, so nothing jumps); only one shows at a time. -->
              <div class="face" :class="{ on: scanItem === 'bill' }" :aria-hidden="scanItem !== 'bill'" data-testid="scan-face-bill">
              <div data-morph="in" data-ma="0.72" data-mb="0.92" class="bill-plain">
                <div class="bill-head">
                  <span class="strong">{{ t('landing.scan.billTitle') }}</span>
                  <span class="tag">{{ t('landing.scan.plain') }}</span>
                </div>
                <div class="bill-line"><span>{{ t('landing.scan.visit') }}</span><b>$14.50</b></div>
                <div class="bill-line"><span>{{ t('landing.scan.med') }}</span><b>$9.20</b></div>
                <div class="bill-line paid"><span>{{ t('landing.scan.medisave') }}</span><b>−$15.00</b></div>
                <div class="bill-total"><span class="strong">{{ t('landing.scan.pay') }}</span><span class="serif amount">$8.70</span></div>
              </div>
              <!-- The fine print stays English on purpose: it is what a real clinic or hospital bill looks like. -->
              <div data-morph="out" data-ma="0.7" data-mb="0.88" class="receipt" aria-hidden="true">
                <div class="r-title">TAX INVOICE #2410-88317</div>
                <div><span>CONSULT GP SUBSQ</span><span>14.50</span></div>
                <div><span>AMLODIPINE BESYL 5MG TAB x30</span><span>9.20</span></div>
                <div><span>MSV CDMP CLAIM</span><span>(15.00)</span></div>
                <div><span>GST ABSORBED</span><span>0.00</span></div>
                <div class="strong"><span>NET PAYABLE</span><span>8.70</span></div>
                <div class="barcode"></div>
              </div>
              </div>

              <div class="face" :class="{ on: scanItem === 'label' }" :aria-hidden="scanItem !== 'label'" data-testid="scan-face-label">
                <div data-morph="in" data-ma="0.72" data-mb="0.92" class="bill-plain">
                  <div class="bill-head">
                    <span class="strong">{{ t('landing.scan.labelTitle') }}</span>
                    <span class="tag">{{ t('landing.scan.plain') }}</span>
                  </div>
                  <!-- The medicine name stays as printed; dose numbers stay digits. -->
                  <div class="label-name serif">Amlodipine 5 mg</div>
                  <div class="bill-line"><span>{{ t('landing.scan.howMuch') }}</span><b>{{ t('landing.scan.oneTablet') }}</b></div>
                  <div class="bill-line"><span>{{ t('landing.scan.when') }}</span><b>{{ t('landing.scan.morning') }}</b></div>
                  <div class="bill-line paid"><span>{{ t('landing.scan.food') }}</span><b>{{ t('landing.scan.anyFood') }}</b></div>
                  <div class="bill-total"><span class="strong">{{ t('landing.scan.forWhat') }}</span><span class="for">{{ t('landing.scan.bloodPressure') }}</span></div>
                </div>
                <!-- Fine print in English on purpose: what a real pharmacy label looks like. -->
                <div data-morph="out" data-ma="0.7" data-mb="0.88" class="receipt" aria-hidden="true">
                  <div class="r-title">POLYCLINIC PHARMACY</div>
                  <div><span>AMLODIPINE BESYLATE 5MG TAB</span></div>
                  <div><span>TAKE 1 TAB OM</span><span>QTY 30</span></div>
                  <div><span>FOR HIGH BLOOD PRESSURE</span></div>
                  <div><span>KEEP OUT OF REACH OF CHILDREN</span></div>
                  <div class="strong"><span>DISP 24/10/26</span><span>RX 5512093</span></div>
                  <div class="barcode"></div>
                </div>
              </div>

              <div data-morph="scan" data-ma="0.5" data-mb="0.72" class="scanline" aria-hidden="true"></div>
              <!-- Each swap is scanned again: a line sweeps down the new card (restarted by the key). -->
              <div :key="scanItem" class="rescan" aria-hidden="true"></div>
            </div>
          </div>
          <div class="segmented scan-pick" role="group" :aria-label="t('landing.scan.pick')" data-testid="scan-pick">
            <button v-for="item in SCAN_ITEMS" :key="item" type="button" :aria-pressed="scanItem === item" @click="pickScan(item)">
              <AppIcon :name="item === 'bill' ? 'receipt' : 'pill'" :size="20" />{{ t(`landing.scan.${item}Tab`) }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section id="listen" data-sec="3" class="sec" data-testid="landing-listen" aria-labelledby="listen-title">
      <div class="row flip">
        <div class="copy">
          <span class="kicker">{{ t('landing.listen.kicker') }}</span>
          <h2 id="listen-title" class="title2 serif">{{ t('landing.listen.title') }}</h2>
          <p class="lede">{{ t('landing.listen.text') }}</p>
        </div>
        <div class="demo col">
          <div class="voices" role="group" :aria-label="t('landing.listen.group')">
            <button
              v-for="(l, i) in LANGS"
              :key="l.lang"
              type="button"
              :lang="l.lang"
              class="voice"
              :aria-pressed="i === voice"
              :data-fall="3"
              :data-a="VOICE_FALL[i].a"
              :data-b="VOICE_FALL[i].b"
              :data-r0="VOICE_FALL[i].r0"
              :data-dx="VOICE_FALL[i].dx"
              @click="pickVoice(i)"
            >
              <span data-morph="in" data-ma="0.68" data-mb="0.86" class="voice-face">{{ l.label }}</span>
              <span data-morph="out" data-ma="0.66" data-mb="0.84" class="capsule fill" :style="pill(VOICE_FALL[i].pill)" aria-hidden="true"></span>
            </button>
          </div>
          <button type="button" class="speaker" :class="{ speaking, ringing, idle: !speakerSeen && !ringing }" :aria-label="speaking ? t('landing.listen.stop') : t('landing.listen.read')" data-fall="3" data-a="0.26" data-b="0.74" data-r0="40" data-dx="0" data-testid="landing-speak" @click="speak" @animationiteration="onRing">
            <span data-morph="in" data-ma="0.74" :data-mb="SPEAKER_IN" class="speaker-face"><AppIcon name="volume" :size="58" /></span>
            <span data-morph="out" data-ma="0.72" data-mb="0.88" class="tablet fill big" aria-hidden="true"><span></span></span>
          </button>
          <div class="said" aria-live="polite">
            <span class="strong">{{ preparing ? t('player.preparing') : speaking ? t('landing.listen.hintSpeaking') : t('landing.listen.hint') }}</span>
            <span v-if="noVoice" class="no-voice" data-testid="landing-no-voice">{{ t('player.failed') }}</span>
            <p :lang="LANGS[voice].lang" class="sample">“{{ LANGS[voice].sample }}”</p>
          </div>
        </div>
      </div>
    </section>

    <section id="doses" data-sec="4" class="sec sand" data-testid="landing-doses" aria-labelledby="doses-title">
      <div class="row">
        <div class="copy">
          <span class="kicker">{{ t('landing.doses.kicker') }}</span>
          <h2 id="doses-title" class="title2 serif">{{ t('landing.doses.title') }}</h2>
          <p class="lede">{{ t('landing.doses.text') }}</p>
          <a :href="calendarUrl()" target="_blank" rel="noopener" class="outline"><AppIcon name="calendar" :size="22" />{{ t('landing.doses.calendar') }}</a>
        </div>
        <div class="demo">
          <div class="plan-wrap">
            <div data-fall="4" data-a="0.02" data-b="0.4" data-r0="12" data-dx="40" class="paper plan">
              <div data-morph="in" data-ma="0.42" data-mb="0.58">
                <div class="plan-head">
                  <span class="serif today">{{ t('landing.doses.today') }}</span>
                  <button type="button" role="switch" class="switch-btn" :aria-checked="remind" @click="remind = !remind">
                    {{ t('landing.doses.reminders') }}<span class="sw" :class="{ on: remind }" aria-hidden="true"></span>
                  </button>
                </div>
                <div v-for="d in DOSES" :key="d.key" class="dose">
                  <span class="sun" :class="d.key" aria-hidden="true"></span>
                  <div class="dose-text">
                    <div class="strong">{{ t(`landing.doses.${d.key}`) }}</div>
                    <div class="muted">{{ t(`landing.doses.${d.key}Text`) }}</div>
                  </div>
                  <div class="slots" aria-hidden="true">
                    <span v-for="(p, i) in d.pills" :key="i" class="slot">
                      <span data-fall="4" :data-a="p.a" :data-b="p.b" :data-r0="p.r0" :data-dx="p.dx" class="tablet small" :style="{ '--c': p.c }"></span>
                    </span>
                  </div>
                </div>
              </div>
              <div data-morph="out" data-ma="0.4" data-mb="0.56" class="blister" aria-hidden="true"><span v-for="n in 6" :key="n"></span></div>
            </div>
            <!-- The morning dose arriving as a Calendar reminder on the phone: what "Add to Google Calendar" gives you today. -->
            <div data-fall="4" data-a="0.66" data-b="0.97" data-r0="-10" data-dx="-40" class="phone-wrap" aria-hidden="true">
              <div ref="phoneEl" class="phone" :class="{ off: !remind, idle: !phoneSeen }" data-testid="landing-phone">
                <span class="side vol-up"></span><span class="side vol-down"></span><span class="side power"></span>
                <span class="island"></span>
                <span class="lock-date">{{ phoneDate() }}</span>
                <span class="lock-time">8:00</span>
                <div class="notif">
                  <span class="notif-icon"><AppIcon name="calendar" :size="16" /></span>
                  <div class="notif-app">{{ t('landing.doses.phoneApp') }}<span class="notif-now">{{ t('landing.doses.now') }}</span></div>
                  <div class="strong notif-title">{{ t('landing.doses.calEvent') }}</div>
                  <div class="notif-body">{{ t('landing.doses.morningText') }}</div>
                </div>
                <span class="home-bar"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="ask" data-sec="5" class="sec ask-sec" data-testid="landing-ask" aria-labelledby="ask-title">
      <div class="row flip">
        <div class="copy">
          <span class="kicker">{{ t('landing.ask.kicker') }}</span>
          <h2 id="ask-title" class="title2 serif">{{ t('landing.ask.title') }}</h2>
          <p class="lede">{{ t('landing.ask.text') }}</p>
        </div>
        <div class="demo col chat-demo">
          <div ref="chatWin" class="chat-win" :class="{ rolling: live.length }">
            <div ref="chatTrack" class="chat">
              <div v-for="m in CHAT" :key="m.key" class="msg" :class="m.me ? 'me' : 'bot'" data-fall="5" :data-a="m.a" :data-b="m.b" :data-r0="m.r0" :data-dx="m.dx">
                <span v-if="!m.me" class="avatar capsule" :style="pill('brand')" aria-hidden="true"></span>
                <div class="bubble" data-morph="radius" :data-ma="m.ma" :data-mb="m.ma + 0.16">
                  <div data-morph="in" :data-ma="m.ma + 0.04" :data-mb="m.ma + 0.18">
                    <span v-if="!m.me" class="bot-name">{{ t('app.name') }}</span>
                    <p>{{ t(`landing.ask.${m.key}`) }}</p>
                  </div>
                  <span data-morph="out" :data-ma="m.ma + 0.02" :data-mb="m.ma + 0.16" class="capsule fill" :style="pill(m.pill)" aria-hidden="true"></span>
                </div>
              </div>
              <!-- The conversation carrying on: decoration for screen readers, which already have the first three messages. -->
              <div v-for="m in live" :key="m.id" class="msg live" :class="m.me ? 'me' : 'bot'" aria-hidden="true">
                <span v-if="!m.me" class="avatar capsule" :style="pill('brand')"></span>
                <div class="bubble">
                  <span v-if="m.typing" class="typing"><i></i><i></i><i></i></span>
                  <div v-else class="said">
                    <span v-if="!m.me" class="bot-name">{{ t('app.name') }}</span>
                    <p>{{ t(`landing.ask.${m.key}`) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="final" data-testid="landing-final">
        <RouterLink :to="{ name: 'login' }" class="big-cta" data-fall="5" data-a="0.45" data-b="0.88" data-r0="-30" data-dx="0" data-testid="landing-cta-final">
          <span data-morph="in" data-ma="0.86" data-mb="0.98" class="big-face">{{ t('landing.try') }} <span aria-hidden="true">→</span></span>
          <span data-morph="out" data-ma="0.84" data-mb="0.96" class="capsule fill" :style="pill('coral')" aria-hidden="true"></span>
        </RouterLink>
        <p class="muted note">{{ t('landing.note') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/views/LandingPage.css"></style>
