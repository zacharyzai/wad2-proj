<!-- Owner: Isaac. The first page for anyone not logged in: what the app does in one sentence, "Join for free" (Create
     account) and "Log in", and a picture of it working: a real sample label behind a phone showing what the app makes of it.
     Two choices only, both big and in words. The welcome page (/welcome) tells the longer story.
     Motion: on the first visit in this tab the words rise in one after another; the picture then tells its story once
     (the label slides in, a scan line reads it, the phone fills in, the morning dose is ticked), under 5 seconds so
     nothing keeps moving by itself (WCAG 2.2.2), and the three promises rise in as they scroll into view. All of this
     plays once per page load, never again on hover or on coming back from Log in. With a mouse, the picture tilts a
     little towards it. Behind it all, faint pills and tablets fall slowly through the teal like a waterfall (no pause
     button, by the team's choice, as on the welcome page). With reduced motion everything is shown landed, at once,
     and the pills don't fall. -->
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../components/layout/AppIcon.vue'
import PublicHeader from '../components/layout/PublicHeader.vue'

const { t, locale } = useI18n()
const PROMISES = [
  { key: 'read', icon: 'volume' },
  { key: 'bill', icon: 'receipt' },
  { key: 'private', icon: 'shield' },
]
// The phone shows what the Explain page says about the sample label, in the page language (its own words).
const doseText = () => t('explain.med.title', { amount: 1, unit: t('unit.tablet', 1), times: 2 }, 2)

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')

// The pill waterfall: the same pills on every visit (a fixed seed), spread across the band, more of them on the
// picture's side so the words stay calm. Bigger pills are nearer: they fall faster, show more and lean more with the mouse.
const seeded = (n) => {
  const x = Math.sin(n * 9301 + 49297) * 233280
  return x - Math.floor(x)
}
// Colours that sit well on the teal and next to the cream page: mint (the accent, lighter), honey, peach, blush and the
// page's own cream. Capsules are two-tone (a colour and cream), like real ones; tablets are one colour.
const PILL_COLOURS = ['#8af0e2', '#ffcf5c', '#ff9b73', '#ffb8ab', '#faf7f2']
const PILLS = Array.from({ length: 18 }, (_, i) => {
  const near = seeded(i + 1)
  const side = seeded(i + 40)
  return {
    left: `${Math.round((i % 3 === 0 ? side * 45 : 40 + side * 58) * 10) / 10}%`,
    size: Math.round(12 + near * 18), // px, the pill's height
    round: seeded(i + 80) < 0.3, // a round tablet instead of a capsule
    fall: `${Math.round(26 - near * 12)}s`, // nearer falls faster
    delay: `${-Math.round(seeded(i + 120) * 26)}s`, // already on its way when the page opens
    spin: `${seeded(i + 160) < 0.5 ? -1 : 1}`,
    sway: `${Math.round(8 + seeded(i + 200) * 16)}px`,
    colour: PILL_COLOURS[i % PILL_COLOURS.length],
    alpha: (0.55 + near * 0.3).toFixed(3), // dimmed further behind the words (.rain's mask), so they stay easy to read
    depth: `${Math.round(8 + near * 30)}px`,
  }
})

// The words rise in once per page load, not every time someone comes back from Log in (one continuous place).
const intro = !introPlayed && !reduceMq.matches
introPlayed = true

// The picture's story waits (paused at its first frame) until the picture is on screen; on phones it is below the words.
const demo = ref(null)
const playing = ref(!intro)

// With a mouse, the picture leans a little towards it (the paper less, the phone more, the light the most).
const band = ref(null)
let frame = 0
function lean(event) {
  if (reduceMq.matches || !finePointer.matches || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const box = band.value?.getBoundingClientRect()
    if (!box) return
    band.value.style.setProperty('--px', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    band.value.style.setProperty('--py', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  })
}
function unlean() {
  cancelAnimationFrame(frame)
  frame = 0
  band.value?.style.setProperty('--px', 0)
  band.value?.style.setProperty('--py', 0)
}

// The promises rise in as they scroll into view, first visit only (shown at once with reduced motion).
const gets = ref(null)
const watching = ref(false)
let seen = null
onMounted(() => {
  if (!intro || typeof IntersectionObserver !== 'function') return void (playing.value = true)
  watching.value = true
  seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === demo.value) playing.value = true
        else entry.target.classList.add('seen')
        seen.unobserve(entry.target)
      }
    },
    { threshold: 0.3 },
  )
  seen.observe(demo.value)
  for (const li of gets.value.querySelectorAll('li')) seen.observe(li)
})
onBeforeUnmount(() => {
  seen?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<script>
let introPlayed = false
</script>

<template>
  <div class="start" :class="[`lang-${locale}`, { intro }]">
    <!-- Both choices in the top bar too, as on most sites (wider screens; on phones "Join for free" is the first button below). -->
    <PublicHeader>
      <RouterLink :to="{ name: 'login' }" class="btn btn-outline btn-sm head-btn" data-testid="start-header-login"><AppIcon name="user" :size="20" />{{ t('nav.login') }}</RouterLink>
      <RouterLink :to="{ name: 'signup' }" class="btn btn-primary btn-sm head-btn head-join" data-testid="start-header-join">{{ t('start.join') }}</RouterLink>
    </PublicHeader>

    <section ref="band" class="band" aria-labelledby="start-title" @pointermove="lean" @pointerleave="unlean">
      <span class="band-glow" aria-hidden="true"></span>
      <!-- Soft capsules drifting in the teal, like the app's pills. Decoration. -->
      <span class="band-pill bp-1" aria-hidden="true"></span>
      <span class="band-pill bp-2" aria-hidden="true"></span>
      <span class="band-pill bp-3" aria-hidden="true"></span>
      <!-- The pill waterfall. Decoration. -->
      <span class="rain" aria-hidden="true">
        <span
          v-for="(p, i) in PILLS"
          :key="i"
          class="drop"
          :style="{ left: p.left, '--size': `${p.size}px`, '--fall': p.fall, '--delay': p.delay, '--spin': p.spin, '--sway': p.sway, '--alpha': p.alpha, '--depth': p.depth, '--tint': p.colour }"
        ><span class="drop-pill" :class="{ round: p.round }"></span></span>
      </span>
      <div class="band-in">
        <div class="pitch">
          <h1 id="start-title">{{ t('start.title') }}</h1>
          <p class="pitch-lead">{{ t('start.text') }}</p>
          <RouterLink :to="{ name: 'signup' }" class="btn btn-on-hero join" data-testid="start-join">{{ t('start.join') }}<AppIcon name="right" :size="24" :stroke="2.5" /></RouterLink>
          <div class="have">
            <span>{{ t('start.have') }}</span>
            <RouterLink :to="{ name: 'login' }" class="btn btn-on-hero-outline have-login" data-testid="start-login">{{ t('nav.login') }}</RouterLink>
          </div>
          <RouterLink to="/welcome" class="about">{{ t('auth.about') }}<AppIcon name="right" :size="20" /></RouterLink>
        </div>

        <!-- A real sample label, and the phone showing what the app makes of it. Decoration: the words say it. -->
        <figure ref="demo" class="demo" :class="{ play: playing }" aria-hidden="true">
          <img src="/samples/med-1.svg" alt="" class="paper" width="480" height="360" />
          <span class="beam"></span>
          <div class="phone">
            <span class="phone-top"><img src="/logo-192.png" alt="" class="phone-logo" />Ah Ma Ah Gong Can</span>
            <div class="phone-card">
              <span class="phone-med"><span class="phone-tile"><AppIcon name="pill" :size="20" /></span><span><b>Metformin</b><small>500 mg</small></span></span>
              <span class="phone-dose">{{ doseText() }}</span>
              <span class="phone-chips">
                <span class="phone-chip on"><AppIcon name="sunrise" :size="16" />{{ t('timing.morning') }}</span>
                <span class="phone-chip on"><AppIcon name="sunset" :size="16" />{{ t('timing.evening') }}</span>
                <span class="phone-chip"><AppIcon name="food" :size="16" />{{ t('food.after') }}</span>
              </span>
            </div>
            <!-- Today's doses, as on Schedule: the morning one ticked. -->
            <div class="phone-card phone-today">
              <span class="phone-row done"><span class="phone-box"><AppIcon name="check" :size="14" :stroke="3" /></span><span>{{ t('timing.morning') }}</span><small>1 {{ t('unit.tablet', 1) }}</small></span>
              <span class="phone-row"><span class="phone-box"></span><span>{{ t('timing.evening') }}</span><small>1 {{ t('unit.tablet', 1) }}</small></span>
            </div>
            <span class="phone-play"><span class="phone-play-btn"><AppIcon name="play" :size="18" /></span>{{ t('player.play') }}</span>
          </div>
        </figure>
      </div>
      <svg class="wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path class="wave-back" d="M0 70C240 20 480 10 760 46s520 64 680 16V120H0z" />
        <path class="wave-front" d="M0 92C300 52 560 60 820 86s440 30 620-6V120H0z" />
      </svg>
    </section>

    <section ref="gets" class="gets" :class="{ watching }" aria-labelledby="start-gets">
      <h2 id="start-gets" class="section-label">{{ t('start.what') }}</h2>
      <ul>
        <li v-for="p in PROMISES" :key="p.key"><span class="tile tile-soft tile-lg"><AppIcon :name="p.icon" :size="26" /></span>{{ t(`auth.promise.${p.key}`) }}</li>
      </ul>
      <p class="note"><AppIcon name="lock" :size="20" /><span>{{ t('auth.privacy') }}</span></p>
    </section>
  </div>
</template>

<style scoped>
.start { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--color-page); }
.head-btn { min-height: var(--hit); border-radius: var(--r-pill); padding-inline: 18px; }
.head-join { display: none; }
@media (min-width: 768px) { .head-join { display: inline-flex; } }

/* The teal band: the one big moment. Solid teal (white text 5.9:1), a soft light in one corner, a wave into the page. */
.band { --band: var(--color-primary); position: relative; overflow: hidden; isolation: isolate; background: var(--band); color: #fff; }
:root[data-theme='dark'] .band { --band: var(--color-primary-pressed); }
.band-glow { position: absolute; z-index: -1; width: 720px; height: 720px; right: -220px; top: -320px; border-radius: 50%; background: radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 65%); }
.band-in { max-width: 1180px; margin: 0 auto; padding: 40px 20px 32px; display: grid; gap: 40px; align-items: center; }
.pitch { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; }
.pitch h1 { font-family: var(--font-display); font-weight: 400; font-size: clamp(38px, 8.5vw, 64px); line-height: 1.06; letter-spacing: -0.015em; color: #fff; text-wrap: balance; }
.lang-ta .pitch h1 { font-family: var(--font-sans); font-weight: 800; font-size: clamp(28px, 5vw, 42px); line-height: 1.25; }
.pitch-lead { max-width: 34em; font-size: clamp(19px, 1.6vw, 22px); line-height: 1.55; color: #e0f7f5; text-wrap: pretty; } /* 5.4:1 on teal */
/* The main choice: a big white pill with an arrow, the way to begin. */
.join { min-height: 68px; padding: 0 30px 0 34px; border-radius: var(--r-pill); font-size: clamp(21px, 2vw, 24px); gap: 14px; }
.have { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; font-size: 19px; font-weight: 600; color: #e0f7f5; }
.have-login { min-height: 56px; padding: 0 26px; border-radius: var(--r-pill); font-size: 20px; }
.about { display: inline-flex; align-items: center; gap: 6px; min-height: var(--hit); color: #fff; font-size: 18px; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
.about:hover { color: #e0f7f5; }

/* The picture: the sample label, tilted, behind a phone showing the plain words. Scaled down on phones. */
.demo { position: relative; margin: 0; justify-self: center; width: min(100%, 460px); aspect-ratio: 1 / 1.45; } /* tall enough for the phone's fixed-size content, so it never rides up over the link above */
.paper { position: absolute; left: 0; top: 6%; width: 74%; height: auto; border-radius: 12px; background: #fff; transform: rotate(-6deg); box-shadow: 0 30px 60px -28px rgba(0, 0, 0, 0.55); }
.phone { position: absolute; right: 0; bottom: 0; width: 58%; aspect-ratio: 9 / 16; display: flex; flex-direction: column; gap: 10px; padding: 14px 12px; border: 9px solid #172120; border-radius: 34px; background: var(--color-page); color: var(--color-text); box-shadow: 0 40px 70px -30px rgba(0, 0, 0, 0.6); font-size: 13px; line-height: 1.3; }
.phone-top { display: flex; align-items: center; gap: 7px; font-family: var(--font-display); font-size: 12px; }
.phone-logo { width: 20px; height: 20px; border-radius: 6px; }
.phone-card { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 16px; background: var(--color-card); box-shadow: var(--shadow-card); }
.phone-med { display: flex; align-items: center; gap: 9px; }
.phone-med b { display: block; font-family: var(--font-display); font-weight: 400; font-size: 17px; }
.phone-med small { display: block; color: var(--color-text-muted); font-size: 11px; }
.phone-tile { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: var(--color-primary); color: #fff; }
.phone-dose { font-family: var(--font-display); font-size: 16px; line-height: 1.25; font-variant-numeric: lining-nums; }
.lang-ta .phone-dose { font-family: var(--font-sans); font-weight: 700; font-size: 13px; }
.phone-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.phone-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; background: var(--color-surface-2); color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
.phone-chip.on { background: var(--color-primary); color: #fff; }
.phone-today { gap: 0; padding: 4px 12px; }
.phone-row { display: flex; align-items: center; gap: 9px; padding: 9px 0; font-weight: 700; font-size: 13px; }
.phone-row + .phone-row { border-top: 1px solid var(--color-border); }
.phone-row small { margin-left: auto; color: var(--color-text-muted); font-weight: 600; font-size: 11px; }
.phone-box { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 7px; border: 2px solid var(--color-border-strong); color: #fff; }
.phone-row.done .phone-box { background: var(--color-primary); border-color: var(--color-primary); }
.phone-play { display: flex; align-items: center; gap: 9px; margin-top: auto; padding: 9px 10px; border-radius: 16px; background: var(--color-card); box-shadow: var(--shadow-card); font-weight: 700; font-size: 13px; }
.phone-play-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--color-primary); color: #fff; }

/* The wave: a lighter crest behind, the page colour in front, so the band flows into the page. */
.wave { display: block; width: 100%; height: clamp(48px, 7vw, 110px); margin: -8px 0 -1px; } /* -1px: no hairline of teal under the wave */
.wave-back { fill: rgba(255, 255, 255, 0.16); }
.wave-front { fill: var(--color-page); }

/* What you get, in words. */
.gets { width: 100%; max-width: 1180px; margin: 0 auto; padding: 8px 20px 48px; display: flex; flex-direction: column; gap: 18px; }
.gets ul { display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.gets li { display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-radius: var(--r-card); background: var(--color-card); border: 1px solid var(--color-border); box-shadow: var(--shadow-card); font-size: 18px; font-weight: 600; line-height: 1.45; }
.gets .tile { flex: none; }
.note { display: flex; gap: 10px; margin: 4px 0 0; font-size: 16px; line-height: 1.5; color: var(--color-text-muted); }
.note .icon { flex: none; margin-top: 2px; color: var(--color-primary-text); }

/* ---------- Motion (see the note at the top). Every animation lands on the page's normal look. ---------- */
/* The words, first visit only: one after another, a soft rise. */
.intro .pitch > * { animation: start-rise 620ms var(--ease-out) both; }
.intro .pitch > :nth-child(2) { animation-delay: 90ms; }
.intro .pitch > :nth-child(3) { animation-delay: 190ms; }
.intro .pitch > :nth-child(4) { animation-delay: 280ms; }
.intro .pitch > :nth-child(5) { animation-delay: 360ms; }
.intro .band-glow { animation: glow-in 1600ms var(--ease-out) both; }
.wave-back { transform-box: fill-box; transform-origin: bottom; }
.intro .wave-back { animation: wave-in 1800ms var(--ease-out) both; }
@keyframes start-rise { from { opacity: 0; transform: translateY(18px); } }
@keyframes glow-in { from { opacity: 0; transform: translate(80px, -60px) scale(0.85); } }
@keyframes wave-in { from { transform: translateX(-6%) scaleY(0.6); } }

/* Soft capsules in the teal: they drift in once, then follow the mouse at different depths. */
.band-pill { position: absolute; z-index: -1; border-radius: 999px; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.1); translate: calc(var(--px, 0) * var(--depth)) calc(var(--py, 0) * var(--depth)); transition: translate 900ms var(--ease-out); }
.bp-1 { --depth: 18px; width: 120px; height: 44px; left: 4%; bottom: 18%; rotate: -24deg; }
.bp-2 { --depth: -26px; width: 78px; height: 28px; left: 55%; top: 6%; rotate: 32deg; }
.bp-3 { --depth: 34px; width: 54px; height: 20px; right: 6%; bottom: 30%; rotate: -48deg; }
.intro .band-pill { animation: pill-drift 2200ms var(--ease-out) both; }
.intro .bp-2 { animation-delay: 200ms; }
.intro .bp-3 { animation-delay: 400ms; }
@keyframes pill-drift { from { opacity: 0; transform: translateY(40px); } }

/* The pill waterfall: each drop is a full-height column that slides down by its own height (so the pill falls the whole
   band, whatever its height), while the pill inside sways and turns. Soft colours (PILL_COLOURS), faint, behind everything; fading towards the
   words on wide screens so the text stays easy to read. Leans with the mouse at its own depth. */
.rain { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.drop { position: absolute; top: 0; height: 100%; translate: calc(var(--px, 0) * var(--depth)) calc(var(--py, 0) * var(--depth) * 0.5); transition: translate 900ms var(--ease-out); animation: fall var(--fall) linear var(--delay) infinite; }
.drop-pill { position: absolute; top: calc(var(--size) * -3); left: 0; width: calc(var(--size) * 2.4); height: var(--size); border-radius: 999px; opacity: var(--alpha); background: linear-gradient(90deg, var(--tint) 50%, #faf7f2 50%); animation: sway calc(var(--fall) / 3) ease-in-out var(--delay) infinite alternate; }
.drop-pill.round { width: var(--size); background: var(--tint); box-shadow: inset 0 0 0 calc(var(--size) / 6) rgba(255, 255, 255, 0.35); }
.drop-pill.round::after { content: ''; position: absolute; left: 20%; right: 20%; top: calc(50% - 0.5px); height: 1px; background: rgba(0, 0, 0, 0.25); } /* the score line on a tablet */
@keyframes fall { from { transform: translateY(0); } to { transform: translateY(calc(100% + var(--size) * 6)); } }
@keyframes sway { from { transform: translateX(calc(var(--sway) * -1)) rotate(calc(var(--spin) * -35deg)); } to { transform: translateX(var(--sway)) rotate(calc(var(--spin) * 35deg)); } }
/* Behind the words a pill shows at most about 0.21 (0.85 × 0.25): phones dim the middle column, wide screens the left
   (words) side; the pills show in full colour beside the words and around the picture. */
.rain { mask-image: linear-gradient(to right, #000, rgba(0, 0, 0, 0.25) 14%, rgba(0, 0, 0, 0.25) 86%, #000); }
@media (min-width: 992px) { .rain { mask-image: linear-gradient(to right, #000 3%, rgba(0, 0, 0, 0.25) 6%, rgba(0, 0, 0, 0.25) 50%, #000 55%); } }

/* "Join for free": a light sweeps across it once (first visit); the arrow leans the way it goes on hover. */
.join { position: relative; overflow: hidden; isolation: isolate; }
.join::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(105deg, transparent 35%, rgba(42, 157, 143, 0.18) 50%, transparent 65%); transform: translateX(-110%); }
.intro .join::after { animation: sweep 1100ms var(--ease-out) 900ms both; }
.join .icon, .about .icon { transition: transform 240ms var(--ease-settle); }
.join:hover .icon, .about:hover .icon { transform: translateX(5px); }
.join:hover { box-shadow: 0 10px 28px rgba(0, 0, 0, 0.26); }
@keyframes sweep { from { transform: translateX(-110%); } to { transform: translateX(110%); } }

/* The picture leans towards the mouse (the --px and --py set by the script, -1 to 1). Separate from the story's motion. */
.paper { translate: calc(var(--px, 0) * -8px) calc(var(--py, 0) * -6px); transition: translate 700ms var(--ease-out); }
.phone { translate: calc(var(--px, 0) * 12px) calc(var(--py, 0) * 10px); rotate: calc(var(--px, 0) * 1.5deg); transition: translate 700ms var(--ease-out), rotate 700ms var(--ease-out); }
.band-glow { translate: calc(var(--px, 0) * 60px) calc(var(--py, 0) * 40px); transition: translate 1200ms var(--ease-out); }

/* The story, about 4.5 seconds, first visit only, paused on its first frame until the picture is on screen (.play). */
.intro .demo .paper { animation: paper-in 760ms var(--ease-settle) 100ms both; }
.beam { position: absolute; left: 0; top: 6%; width: 74%; aspect-ratio: 480 / 360; border-radius: 12px; overflow: hidden; transform: rotate(-6deg); pointer-events: none; }
.intro .beam::before { content: ''; position: absolute; left: -4%; right: -4%; top: 0; height: 22%; background: linear-gradient(to bottom, transparent, rgba(42, 157, 143, 0.28) 85%, rgba(42, 157, 143, 0.85) 98%, transparent); box-shadow: 0 6px 18px rgba(42, 157, 143, 0.35); animation: beam 1300ms cubic-bezier(0.45, 0, 0.55, 1) 800ms both; }
.intro .demo .phone { animation: phone-in 760ms var(--ease-out) 1300ms both; }
.intro .demo .phone-card { animation: card-pop 460ms var(--ease-settle) 1900ms both; }
.intro .demo .phone-today { animation-delay: 2700ms; }
.intro .demo .phone-chip.on { animation: chip-on 360ms var(--ease-out) 2300ms both; }
.intro .demo .phone-chip.on + .phone-chip.on { animation-delay: 2500ms; }
.intro .demo .phone-row.done .phone-box { animation: box-tick 300ms var(--ease-out) 3300ms both; }
.intro .demo .phone-row.done .phone-box .icon { animation: tick-in 380ms var(--ease-settle) 3400ms both; }
.intro .demo .phone-play { animation: card-pop 460ms var(--ease-settle) 3500ms both; }
.demo .phone-play-btn { position: relative; }
.intro .demo .phone-play-btn::after { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--color-primary); opacity: 0; animation: ring 700ms ease-out 3900ms 2 both; }
.demo:not(.play), .demo:not(.play) *, .demo:not(.play) *::before, .demo:not(.play) *::after { animation-play-state: paused; }
@keyframes paper-in { from { opacity: 0; transform: translateX(-40px) rotate(-16deg); } to { transform: rotate(-6deg); } }
@keyframes beam { from { transform: translateY(-30%); opacity: 1; } 85% { opacity: 1; } to { transform: translateY(460%); opacity: 0; } }
@keyframes phone-in { from { opacity: 0; transform: translateY(56px) scale(0.94); } }
@keyframes card-pop { from { opacity: 0; transform: translateY(12px) scale(0.96); } }
@keyframes chip-on { from { background: var(--color-surface-2); color: var(--color-text-muted); } }
@keyframes box-tick { from { background: transparent; border-color: var(--color-border-strong); } }
@keyframes tick-in { from { opacity: 0; transform: scale(0.2) rotate(-20deg); } }
@keyframes ring { from { opacity: 0.9; transform: scale(1); } to { opacity: 0; transform: scale(1.9); } }

/* The promises rise in as they come into view, one after another; they lift a little under the mouse. */
.watching li { opacity: 0; transform: translateY(22px); transition: opacity 560ms var(--ease-out), transform 560ms var(--ease-out), box-shadow var(--dur) var(--ease-out); }
.watching li:nth-child(2) { transition-delay: 100ms; }
.watching li:nth-child(3) { transition-delay: 200ms; }
.watching li.seen { opacity: 1; transform: none; }
.gets .tile { transition: transform 320ms var(--ease-settle); }
@media (hover: hover) {
  .gets li { transition: opacity 560ms var(--ease-out), transform 320ms var(--ease-out), box-shadow var(--dur) var(--ease-out); }
  .gets li:hover { transform: translateY(-4px); box-shadow: 0 14px 30px -14px rgba(0, 0, 0, 0.28); transition-delay: 0ms; }
  .gets li:hover .tile { transform: scale(1.08) rotate(-6deg); }
}

@media (prefers-reduced-motion: reduce) {
  .start *, .start *::before, .start *::after { animation: none !important; transition: none !important; translate: none !important; }
  .phone { rotate: none !important; }
  .watching li { opacity: 1; transform: none; }
  .beam, .rain { display: none; }
}

@media (max-width: 575.98px) {
  .join, .have-login { width: 100%; justify-content: center; }
  .have { flex-direction: column; align-items: stretch; text-align: center; width: 100%; }
  .demo { width: min(100%, 340px); }
}
@media (min-width: 768px) {
  .gets ul { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gets li { flex-direction: column; align-items: flex-start; }
}
@media (min-width: 992px) {
  .demo { aspect-ratio: 1 / 1.02; }
  .band-in { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); padding: 56px 28px 24px; gap: 56px; }
  .phone { font-size: 14px; }
  .phone-dose { font-size: 18px; }
}
</style>
