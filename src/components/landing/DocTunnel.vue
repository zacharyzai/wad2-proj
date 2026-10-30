<!-- Owner: Asher. Welcome page: real labels and bills fly towards you through a 3D tunnel as you scroll, with the plain
     words the app turns them into, in all four languages. Between the hero and "Snap a photo".
     Driven by the page's own scrolling (the section stays pinned while the papers fly), so touch, keyboard and scrollbars
     all work and scrolling is never taken over. Desktop: the papers lean towards the mouse. Phones: fewer papers, a shorter
     flight. Reduced motion: no pinning or flying, just a still fan of the papers. The papers are decoration (aria-hidden):
     the heading and sentence say it in words. Styles are written into the papers directly, not through Vue, every frame. -->
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// The app's own samples (public/samples), and what the app makes of a label, in each language (the Explain page's words).
const SIZE = { 'med-1': 360, 'med-2': 360, 'med-3': 360, 'bill-1': 360, 'bill-2': 420, 'bill-3': 448, 'bill-4': 448 } // height at 480 wide
const ITEMS = [
  { doc: 'med-1' }, { doc: 'bill-1' }, { chip: 'zh' }, { doc: 'med-2' }, { doc: 'bill-2', phone: false }, { chip: 'ms' },
  { doc: 'med-3', phone: false }, { doc: 'bill-3' }, { chip: 'ta', phone: false }, { doc: 'bill-4', phone: false }, { chip: 'en' },
]
const chipText = (l) => t('explain.med.title', { amount: 1, unit: t('unit.tablet', 1, { locale: l }), times: 2 }, { plural: 2, locale: l })

// Where each paper flies: spread round the centre by the golden angle (never two in a line), at different distances, tilted.
const CARDS = ITEMS.map((item, i) => {
  const angle = i * 137.5 * (Math.PI / 180)
  return { ...item, i, cos: Math.cos(angle), sin: Math.sin(angle), rx: 0.3 + (i % 3) * 0.07, ry: 0.24 + (i % 2) * 0.08, tilt: (i % 2 ? -1 : 1) * (3 + (i % 5) * 2) }
})

const sec = ref(null)
const copy = ref(null)
const hint = ref(null)
const cardEls = ref([])
const calm = ref(false) // reduced motion: the still fan

const reduceMq = matchMedia('(prefers-reduced-motion: reduce)')
const phoneMq = matchMedia('(max-width: 767.98px)')
const mouseMq = matchMedia('(hover: hover) and (pointer: fine)')
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const between = (v, a, b) => clamp((v - a) / (b - a))

// target: how far through the pinned section the page is (0 to 1); shown eases towards it, so the flight glides.
let target = 0
let shown = 0
let lean = { x: 0, y: 0 }
let leanTo = { x: 0, y: 0 }
let raf = 0
let onScreen = false

function measure() {
  const box = sec.value.getBoundingClientRect()
  const run = box.height - innerHeight
  target = run > 0 ? clamp(-box.top / run) : 0
}

function render() {
  const phone = phoneMq.matches
  const W = innerWidth
  const H = innerHeight
  const far = phone ? -1100 : -1700
  const near = phone ? 300 : 520
  const pan = phone ? 0 : 40
  const span = 0.55 // each paper's share of the flight; they overlap, one starting after another
  const cards = CARDS.filter((c) => !phone || c.phone !== false)
  cards.forEach((c, n) => {
    const el = cardEls.value[c.i]
    if (!el) return
    const start = (n / cards.length) * (1 - span)
    const p = between(shown, start, start + span)
    const z = far + (near - far) * p
    const x = c.cos * W * c.rx - lean.x * pan
    const y = c.sin * H * c.ry - lean.y * pan
    el.style.opacity = (between(p, 0, 0.16) * (1 - between(p, 0.84, 0.98))).toFixed(3)
    el.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), ${z.toFixed(1)}px) rotate(${c.tilt}deg)`
  })
  // The words stay readable at the start, grow a little as the papers pass, and make way at the very end.
  copy.value.style.transform = `translate3d(-50%, -50%, 0) scale(${(0.92 + 0.28 * shown).toFixed(3)})`
  copy.value.style.opacity = (1 - between(shown, 0.86, 1)).toFixed(3)
  hint.value.style.opacity = (1 - between(shown, 0, 0.08)).toFixed(3)
}

function tick() {
  raf = 0
  if (!sec.value || calm.value) return
  measure()
  shown += (target - shown) * 0.14
  lean.x += (leanTo.x - lean.x) * 0.08
  lean.y += (leanTo.y - lean.y) * 0.08
  render()
  const moving = Math.abs(target - shown) > 0.0004 || Math.abs(leanTo.x - lean.x) > 0.002 || Math.abs(leanTo.y - lean.y) > 0.002
  if (moving && onScreen) raf = requestAnimationFrame(tick)
}
const kick = () => (raf ||= onScreen && !calm.value ? requestAnimationFrame(tick) : 0)

function onPointer(event) {
  leanTo = { x: event.clientX / innerWidth - 0.5, y: event.clientY / innerHeight - 0.5 }
  kick()
}

// Reduced motion: no inline positions at all, so the CSS fan shows. Switching back measures and draws straight away.
function useMotionSetting() {
  calm.value = reduceMq.matches
  if (calm.value) {
    cancelAnimationFrame(raf)
    raf = 0
    for (const el of [...cardEls.value, copy.value, hint.value]) el?.removeAttribute('style')
    return
  }
  measure()
  shown = target
  render()
}

const seen = new IntersectionObserver(([entry]) => {
  onScreen = entry.isIntersecting
  kick()
})

onMounted(() => {
  useMotionSetting()
  seen.observe(sec.value)
  addEventListener('scroll', kick, { passive: true })
  addEventListener('resize', kick)
  if (mouseMq.matches) addEventListener('pointermove', onPointer, { passive: true })
  reduceMq.addEventListener('change', useMotionSetting)
  phoneMq.addEventListener('change', kick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  seen.disconnect()
  removeEventListener('scroll', kick)
  removeEventListener('resize', kick)
  removeEventListener('pointermove', onPointer)
  reduceMq.removeEventListener('change', useMotionSetting)
  phoneMq.removeEventListener('change', kick)
})
</script>

<template>
  <section ref="sec" class="tunnel" :class="{ calm }" aria-labelledby="tunnel-title" data-testid="landing-tunnel">
    <div class="stage">
      <span class="dots" aria-hidden="true"></span>
      <span class="glow" aria-hidden="true"></span>
      <span class="ring" aria-hidden="true"></span>
      <span class="ring outer" aria-hidden="true"></span>

      <!-- The words sit in the same 3D space as the papers, at depth 0: far papers pass behind them, near ones in front. -->
      <div class="space">
        <div ref="copy" class="copy">
          <span class="kicker">{{ t('landing.tunnel.kicker') }}</span>
          <h2 id="tunnel-title" class="title">{{ t('landing.tunnel.title') }}</h2>
          <p class="lede">{{ t('landing.tunnel.text') }}</p>
        </div>
        <div
          v-for="c in CARDS"
          :key="c.i"
          :ref="(el) => (cardEls[c.i] = el)"
          class="paper"
          aria-hidden="true"
          :class="[c.doc ? 'doc' : 'chip', { 'not-phone': c.phone === false }]"
          :style="calm ? { '--tilt': `${c.tilt}deg` } : null"
        >
          <img v-if="c.doc" :src="`/samples/${c.doc}.svg`" alt="" width="480" :height="SIZE[c.doc]" loading="lazy" decoding="async" draggable="false" />
          <span v-else :lang="c.chip">{{ chipText(c.chip) }}</span>
        </div>
      </div>

      <span ref="hint" class="hint" aria-hidden="true">{{ t('landing.tunnel.hint') }}<span class="hint-line"></span></span>
    </div>
  </section>
</template>

<style scoped>
/* The section is tall; its stage stays pinned to the screen while the page scrolls through it (that scroll is the flight). */
.tunnel { position: relative; height: 290vh; background: var(--l-bg); }
.stage { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; display: grid; place-items: center; perspective: 1200px; }

/* Background: a faint dot grid fading out to the edges, a soft teal glow, and two depth rings, so the papers have a space to fly through. */
.dots { position: absolute; inset: 0; background: radial-gradient(oklch(0.8 0.02 75) 1.2px, transparent 1.2px) 0 0 / 28px 28px; -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 55%, transparent 100%); mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, #000 55%, transparent 100%); opacity: 0.7; }
.glow { position: absolute; inset: 0; background: radial-gradient(circle at center, rgba(26, 112, 112, 0.12) 0%, transparent 65%); }
.ring { position: absolute; width: 48vmin; height: 48vmin; border-radius: 50%; border: 1.5px solid rgba(26, 112, 112, 0.16); }
.ring.outer { width: 78vmin; height: 78vmin; border: 1.5px dashed oklch(0.85 0.02 75); }

/* The words: real text in the middle of the tunnel, at depth 0 (far papers pass behind, near ones in front). */
.copy { position: absolute; left: 50%; top: 50%; width: min(34rem, 100%); padding: 0 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; transform: translate3d(-50%, -50%, 0) scale(0.92); will-change: transform, opacity; }
/* A soft mist of the page colour behind the words (part of their plane): far papers fade behind it, so the words stay
   clear; papers come through it only as they reach you. */
.copy::before { content: ''; position: absolute; inset: -22% -26%; z-index: -1; background: radial-gradient(closest-side, color-mix(in oklch, var(--l-bg) 96%, transparent) 0%, color-mix(in oklch, var(--l-bg) 88%, transparent) 58%, transparent 100%); pointer-events: none; }
.kicker { font-size: 18px; font-weight: 700; color: var(--l-accent-text); }
.title { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: clamp(40px, 6vw, 84px); line-height: 1.04; letter-spacing: -0.015em; color: var(--l-ink); text-wrap: balance; }
.title:lang(ta), :lang(ta) .title { font-family: var(--font-sans); font-weight: 800; font-size: clamp(30px, 4vw, 52px); line-height: 1.25; }
.lede { margin: 0; font-size: clamp(19px, 1.45vw, 22px); line-height: 1.55; color: var(--l-muted); text-wrap: pretty; }

/* The papers fly in a 3D space centred on the screen. Inline transform and opacity come from the script. */
.space { position: absolute; inset: 0; transform-style: preserve-3d; }
.paper { position: absolute; left: 50%; top: 50%; width: clamp(190px, 17vw, 280px); opacity: 0; will-change: transform, opacity; user-select: none; pointer-events: none; }
/* Plain-words cards size to their sentence (a narrow box would break Chinese and Tamil a word at a time). */
.paper.chip { width: max-content; max-width: min(300px, 72vw); }
.doc img { display: block; width: 100%; height: auto; border-radius: 12px; background: #fff; box-shadow: 0 30px 60px -28px var(--l-shadow), 0 1px 0 oklch(0.87 0.022 70); }
.chip span { display: block; padding: 16px 18px; border-radius: 18px; background: var(--l-accent); color: var(--l-on-accent); font-family: var(--font-display); font-size: clamp(18px, 1.5vw, 22px); line-height: 1.3; text-align: center; text-wrap: balance; box-shadow: 0 24px 40px -20px rgba(19, 85, 85, 0.7); font-variant-numeric: lining-nums; }
.chip span:lang(ta) { font-family: var(--font-sans); font-weight: 700; font-size: 18px; }

.hint { position: absolute; bottom: 28px; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: var(--l-muted); }
.hint-line { width: 2px; height: 28px; border-radius: 2px; background: linear-gradient(var(--l-accent), transparent); }

@media (max-width: 767.98px) {
  .tunnel { height: 230vh; }
  .stage { perspective: 900px; }
  .paper { width: clamp(140px, 38vw, 180px); }
  .paper.chip { max-width: min(240px, 64vw); }
  .not-phone { display: none; }
}

/* Reduced motion: an ordinary section; the papers lie still in a loose fan under the words. */
.tunnel.calm { height: auto; }
.calm .stage { position: relative; height: auto; overflow: visible; padding: clamp(56px, 9vh, 112px) 20px; display: flex; flex-direction: column; align-items: center; gap: 40px; perspective: none; }
.calm .space { position: relative; inset: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 18px; max-width: 1100px; transform-style: flat; }
.calm .copy { position: relative; left: auto; top: auto; flex: 0 0 100%; width: auto; max-width: 34rem; margin: 0 auto 24px; transform: none; }
.calm .paper { position: relative; left: auto; top: auto; width: clamp(140px, 16vw, 210px); opacity: 1; transform: rotate(var(--tilt)); }
.calm .paper.chip { width: max-content; max-width: min(260px, 80vw); }
.calm .hint { display: none; }
</style>
