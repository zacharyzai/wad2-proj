<!-- Owner: Zachary. Welcome page for first-time visitors on this device (router sends "/" here once; see WELCOME_KEY).
     From the Claude Design "medicine falling from the sky" page: each section's items fall in as you scroll and become the feature.
     Motion is tied to scroll only (no loops). Under 1024px items just fade and settle; with reduced motion everything is shown landed. -->
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { WELCOME_KEY } from '../router'
import { setLocale } from '../i18n'
import AppIcon from '../components/layout/AppIcon.vue'

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
const PILL = { brand: ['oklch(0.52 0.16 35)', 'oklch(0.89 0.1 88)'], coral: ['oklch(0.74 0.11 38)', 'oklch(0.89 0.1 88)'], green: ['oklch(0.74 0.08 150)', 'oklch(0.86 0.065 150)'], blue: ['oklch(0.74 0.07 240)', 'oklch(0.86 0.055 235)'], gold: ['oklch(0.8 0.12 80)', 'oklch(0.84 0.08 40)'] }
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

// Read-aloud demo. shortcut: browser speech only (no cloud TTS fallback like ReadAloud); fine for a demo line.
const voice = ref(byLocale())
const speaking = ref(false)
function pickVoice(i) {
  window.speechSynthesis?.cancel()
  voice.value = i
  speaking.value = false
}
function speak() {
  const synth = window.speechSynthesis
  if (speaking.value || !synth) return pickVoice(voice.value)
  const L = LANGS[voice.value]
  const u = new SpeechSynthesisUtterance(L.sample)
  u.lang = L.voice
  u.rate = 0.85
  u.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(L.lang)) || null
  u.onend = u.onerror = () => (speaking.value = false)
  synth.cancel()
  synth.speak(u)
  speaking.value = true
}

const remind = ref(true)
const calendarUrl = () =>
  `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(t('landing.doses.calEvent'))}&details=${encodeURIComponent(t('landing.doses.morningText'))}&recur=RRULE%3AFREQ%3DDAILY`

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
    T[s.dataset.sec] = { t: red ? 1 : clamp((H - now) / Math.max(1, H - endTop)), top, now }
  })
  const compact = !red && el.clientWidth < 1024

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
      f.style.transform = f.style.opacity = f.style.visibility = ''
      return
    }
    if (compact) {
      // Small screens: fade in and settle 36px in place, never crossing other content.
      f.style.visibility = ''
      f.style.opacity = e.toFixed(3)
      f.style.transform = `translate3d(0, ${(-(1 - e) * 36).toFixed(1)}px, 0) rotate(${(r0 * 0.15 * (1 - e)).toFixed(2)}deg)`
      return
    }
    // Desktop: start 180px above the screen, slow down as it lands, straighten from its tilt.
    f.style.opacity = ''
    f.style.visibility = e <= 0 ? 'hidden' : ''
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

onMounted(() => {
  // Seen once: from now on "/" opens the normal Home page on this device.
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // Storage blocked (private mode): the welcome page just shows again next time.
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)
  reduceMq.addEventListener('change', onScroll)
  frame()
  document.fonts?.ready.then(frame)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  cancelAnimationFrame(raf)
  removeEventListener('scroll', onScroll)
  removeEventListener('resize', onScroll)
  reduceMq.removeEventListener('change', onScroll)
  window.speechSynthesis?.cancel()
})
</script>

<template>
  <div ref="root" class="landing">
    <section id="top" data-sec="1" class="sec hero-sec" data-testid="landing-hero">
      <header class="top">
        <a href="#top" class="brand">
          <span class="brand-pill capsule" :style="pill('brand')" aria-hidden="true"></span>
          <span class="serif">{{ t('app.name') }}</span>
        </a>
      </header>
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
              <RouterLink :to="{ name: 'scan' }" class="cta" data-testid="landing-cta-hero">{{ t('landing.try') }}</RouterLink>
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

    <section id="scan" data-sec="2" class="sec sand" data-testid="landing-scan" aria-labelledby="scan-title">
      <div class="row">
        <div class="copy">
          <span class="kicker">{{ t('landing.scan.kicker') }}</span>
          <h2 id="scan-title" class="title2 serif">{{ t('landing.scan.title') }}</h2>
          <p class="lede">{{ t('landing.scan.text') }}</p>
        </div>
        <div class="demo">
          <div class="frame">
            <span v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="corner" :class="c" aria-hidden="true"></span>
            <div data-fall="2" data-a="0.02" data-b="0.5" data-r0="-14" data-dx="-50" class="paper bill">
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
              <div data-morph="scan" data-ma="0.5" data-mb="0.72" class="scanline" aria-hidden="true"></div>
            </div>
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
          <button type="button" class="speaker" :class="{ speaking }" :aria-label="speaking ? t('landing.listen.stop') : t('landing.listen.read')" data-fall="3" data-a="0.26" data-b="0.74" data-r0="40" data-dx="0" data-testid="landing-speak" @click="speak">
            <span data-morph="in" data-ma="0.74" data-mb="0.9" class="speaker-face"><AppIcon name="volume" :size="58" /></span>
            <span data-morph="out" data-ma="0.72" data-mb="0.88" class="tablet fill big" aria-hidden="true"><span></span></span>
          </button>
          <div class="said" aria-live="polite">
            <span class="strong">{{ speaking ? t('landing.listen.hintSpeaking') : t('landing.listen.hint') }}</span>
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
            <div data-fall="4" data-a="0.66" data-b="0.97" data-r0="-10" data-dx="-40" class="subsidy">
              <span class="sub-label">{{ t('landing.doses.subsidy') }}</span>
              <span class="strong">{{ t('landing.doses.save') }}</span>
              <span class="serif sub-amount">$120</span>
              <span class="sub-basis">{{ t('landing.doses.basis') }}</span>
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
        <div class="demo col chat">
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
        </div>
      </div>
      <div class="final" data-testid="landing-final">
        <RouterLink :to="{ name: 'scan' }" class="big-cta" data-fall="5" data-a="0.45" data-b="0.88" data-r0="-30" data-dx="0" data-testid="landing-cta-final">
          <span data-morph="in" data-ma="0.86" data-mb="0.98" class="big-face">{{ t('landing.try') }} <span aria-hidden="true">→</span></span>
          <span data-morph="out" data-ma="0.84" data-mb="0.96" class="capsule fill" :style="pill('coral')" aria-hidden="true"></span>
        </RouterLink>
        <p class="muted note">{{ t('landing.note') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped src="../styles/views/LandingPage.css"></style>
