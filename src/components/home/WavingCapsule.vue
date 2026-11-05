<!-- The capsule from the log-out pop-up (LeaveDialog.vue), alive on Home. It turns towards you in 3D as it
     arrives and waves three times. After that it breathes gently, and every few seconds does one thing on its own, picked
     at random (never the same twice in a row): blinks, looks around, hops, wiggles, turns round, stretches, or waves.
     A tap makes it wave hello, with a hop and happy eyes. It only moves while it can be seen: not on another page, not in
     a hidden tab. Decoration (aria-hidden): the greeting beside it says hello in words. Reduced motion: it stands still. -->
<script setup>
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { capsuleBeat } from '../../composables/useCapsuleBeat'

const clip = `capsule-${useId()}`.replace(/[^\w-]/g, '-')

// What it is doing now ('' = just breathing), and how long each thing takes (ms; matches the keyframes below).
const ACTIONS = {
  blink: 500,
  look: 1700,
  hop: 900,
  wiggle: 1200,
  turn: 1100,
  stretch: 900,
  wave: 1400,
}
const HELLO_MS = 2600
const action = ref('')
// Each new action redraws its moving parts (a new key), so the same animation can run again from the start.
const take = ref(0)

// True when the user prefers reduced motion.
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
let timer = 0
let last = ''

// Plays one capsule animation for `ms` milliseconds, then returns to idle.
function play(name, ms) {
  clearTimeout(timer)
  action.value = name
  take.value++
  capsuleBeat.value++ // the reminder bell rings with it
  timer = setTimeout(() => {
    action.value = ''
    next()
  }, ms)
}

// The next thing to do, a few seconds from now: anything but what it just did.
function next(wait = 2500 + Math.random() * 3500) {
  clearTimeout(timer)
  if (still() || document.hidden) return
  timer = setTimeout(() => {
    const choices = Object.keys(ACTIONS).filter((a) => a !== last)
    last = choices[Math.floor(Math.random() * choices.length)]
    play(last, ACTIONS[last])
  }, wait)
}

// A tap: wave hello (it was waiting or busy, either way).
function hello() {
  if (still()) return
  last = 'wave'
  play('hello', HELLO_MS)
}

// Back on the tab: carry on; away: rest.
const onVisible = () => (document.hidden ? clearTimeout(timer) : next())
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  next(5200) // after the arrival and its first three waves
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <span
    class="capsule"
    aria-hidden="true"
    data-testid="home-capsule"
    :data-action="action"
    @click="hello"
  >
    <span class="spin">
      <svg viewBox="0 0 240 170" width="240" height="170" focusable="false">
        <defs>
          <clipPath :id="clip"><rect x="60" y="62" width="120" height="60" rx="30" /></clipPath>
        </defs>
        <circle class="dot" cx="38" cy="40" r="6" />
        <circle class="dot soft" cx="206" cy="132" r="9" />
        <circle class="dot" cx="214" cy="56" r="4" />
        <ellipse
          :key="`g${take}`"
          class="ground"
          :class="action && `do-${action}`"
          cx="120"
          cy="150"
          rx="56"
          ry="7"
        />
        <!-- actor: hops, wiggles, turns, stretches. breathe: always, gently. -->
        <g :key="`a${take}`" class="actor" :class="action && `do-${action}`">
          <g class="breathe">
            <g transform="rotate(-14 120 92)">
              <path class="limb" d="M70 112 L56 128" />
              <circle class="hand" cx="54" cy="131" r="6" />
              <g :clip-path="`url(#${clip})`">
                <rect class="half-a" x="60" y="62" width="60" height="60" />
                <rect class="half-b" x="120" y="62" width="60" height="60" />
                <rect class="gloss" x="72" y="68" width="96" height="9" rx="4.5" />
              </g>
              <g class="eyes">
                <circle class="eye" cx="142" cy="88" r="4" />
                <circle class="eye" cx="160" cy="88" r="4" />
              </g>
              <!-- Happy, closed eyes (^ ^): only while saying hello. -->
              <g class="happy">
                <path d="M138 89 q4 -6 8 0" />
                <path d="M156 89 q4 -6 8 0" />
              </g>
              <path class="smile" d="M141 99 Q151 107 161 99" />
              <circle class="cheek" cx="134" cy="98" r="4" />
              <circle class="cheek" cx="168" cy="98" r="4" />
              <g class="wave-arm">
                <path class="limb" d="M172 70 L192 44" />
                <circle class="hand" cx="194" cy="40" r="7" />
              </g>
            </g>
          </g>
        </g>
        <g :key="`s${take}`" class="swishes" :class="action && `do-${action}`">
          <path class="swish" d="M212 28 q8 8 2 18" />
          <path class="swish" d="M222 22 q10 12 2 26" />
        </g>
      </svg>
    </span>
  </span>
</template>

<style scoped>
.capsule {
  display: block;
  flex: none;
  perspective: 600px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.spin {
  display: block;
  transform-style: preserve-3d;
  animation: arrive 1100ms var(--ease-settle) 150ms both;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
svg * {
  transform-box: fill-box;
}

/* The same colours as the log-out pop-up. */
.dot {
  fill: var(--color-primary);
  opacity: 0.18;
}
.dot.soft {
  fill: #f3d27a;
  opacity: 0.7;
}
.ground {
  fill: rgba(0, 0, 0, 0.1);
  transform-origin: center;
}
.half-a {
  fill: var(--color-primary);
}
.half-b {
  fill: #f3d27a;
}
.gloss {
  fill: #fff;
  opacity: 0.35;
}
.eye {
  fill: #2b2622;
}
.happy path {
  fill: none;
  stroke: #2b2622;
  stroke-width: 3;
  stroke-linecap: round;
}
.happy {
  opacity: 0;
}
.smile {
  fill: none;
  stroke: #2b2622;
  stroke-width: 3;
  stroke-linecap: round;
}
.cheek {
  fill: #f08a7e;
  opacity: 0.5;
}
.limb {
  fill: none;
  stroke: var(--color-text);
  stroke-width: 3.5;
  stroke-linecap: round;
}
.hand {
  fill: #fffdfa;
  stroke: var(--color-text);
  stroke-width: 2.5;
}
.swish {
  fill: none;
  stroke: var(--color-primary-text);
  stroke-width: 2.5;
  stroke-linecap: round;
  opacity: 0;
}

/* Arriving: turned away, it swings round to face you, then waves three times. */
.wave-arm {
  transform-box: view-box;
  transform-origin: 172px 70px;
  animation: wave 1.2s ease-in-out 3 900ms;
}
.swishes .swish {
  animation: swish 1.2s ease-in-out 3 900ms;
}
@keyframes arrive {
  0% {
    opacity: 0;
    transform: translateY(18px) rotateY(-55deg) scale(0.9);
  }
  55% {
    opacity: 1;
    transform: rotateY(14deg);
  }
  100% {
    transform: none;
  }
}

/* Always: a slow breath, so it never looks frozen. */
.breathe {
  transform-origin: 50% 100%;
  animation: breathe 3.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    transform: translateY(-2px) scale(1.015, 1.03);
  }
}

/* Its own things, one at a time. The actor moves from its feet (bottom centre), so it lands where it stood. */
.actor {
  transform-origin: 50% 100%;
}
.actor.do-hop {
  animation: hop 900ms cubic-bezier(0.3, 0.7, 0.4, 1);
}
.ground.do-hop,
.ground.do-hello {
  animation: ground-hop 900ms cubic-bezier(0.3, 0.7, 0.4, 1);
}
.actor.do-wiggle {
  animation: wiggle 1200ms ease-in-out;
}
.actor.do-turn {
  transform-origin: 50% 50%;
  animation: turn 1100ms ease-in-out;
}
.actor.do-stretch {
  animation: stretch 900ms ease-in-out;
}
.actor.do-blink .eyes {
  transform-origin: center;
  animation: blink 500ms ease-in-out;
}
.actor.do-look .eyes {
  animation: look 1700ms ease-in-out;
}
.actor.do-wave .wave-arm {
  animation: wave 1.2s ease-in-out 1;
}
.swishes.do-wave .swish {
  animation: swish 1.2s ease-in-out 1;
}
/* Hello (a tap): a hop, three quick waves and happy eyes. */
.actor.do-hello {
  animation: hop 900ms cubic-bezier(0.3, 0.7, 0.4, 1);
}
.actor.do-hello .wave-arm {
  animation: wave 800ms ease-in-out 3;
}
.swishes.do-hello .swish {
  animation: swish 800ms ease-in-out 3;
}
.actor.do-hello .eyes {
  animation: hide 2600ms steps(1) both;
}
.actor.do-hello .happy {
  animation: show 2600ms steps(1) both;
}
.actor.do-hello .cheek {
  animation: blush 2600ms ease-in-out;
}

@keyframes wave {
  0%,
  100% {
    rotate: 0deg;
  }
  30% {
    rotate: -16deg;
  }
  70% {
    rotate: 14deg;
  }
}
@keyframes swish {
  40%,
  60% {
    opacity: 0.8;
  }
}
@keyframes hop {
  0%,
  100% {
    transform: none;
  }
  18% {
    transform: scale(1.06, 0.92);
  }
  50% {
    transform: translateY(-22px) scale(0.97, 1.04);
  }
  82% {
    transform: scale(1.05, 0.94);
  }
}
@keyframes ground-hop {
  50% {
    transform: scale(0.7);
    opacity: 0.6;
  }
}
@keyframes wiggle {
  0%,
  100% {
    rotate: 0deg;
  }
  20% {
    rotate: -8deg;
  }
  45% {
    rotate: 7deg;
  }
  70% {
    rotate: -4deg;
  }
  88% {
    rotate: 2deg;
  }
}
@keyframes turn {
  0%,
  100% {
    transform: scaleX(1);
  }
  25% {
    transform: scaleX(0.05);
  }
  50% {
    transform: scaleX(-1);
  }
  75% {
    transform: scaleX(0.05);
  }
}
@keyframes stretch {
  0%,
  100% {
    transform: none;
  }
  40% {
    transform: scale(0.94, 1.1);
  }
  75% {
    transform: scale(1.04, 0.96);
  }
}
@keyframes blink {
  0%,
  100% {
    transform: scaleY(1);
  }
  45%,
  55% {
    transform: scaleY(0.1);
  }
}
@keyframes look {
  0%,
  100% {
    translate: 0 0;
  }
  20%,
  40% {
    translate: -4px -1px;
  }
  60%,
  80% {
    translate: 4px -1px;
  }
}
@keyframes hide {
  0%,
  100% {
    opacity: 1;
  }
  5%,
  92% {
    opacity: 0;
  }
}
@keyframes show {
  0%,
  100% {
    opacity: 0;
  }
  5%,
  92% {
    opacity: 1;
  }
}
@keyframes blush {
  20%,
  80% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin,
  .breathe,
  .actor,
  .actor *,
  .ground,
  .swish {
    animation: none !important;
  }
}
</style>
