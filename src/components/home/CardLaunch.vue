<!-- The short picture each Home card plays before its page opens (composables/useCardLaunch.js). It grows
     out of the card that was tapped and settles in the middle of the screen, over a soft wash of the card's colour:
       med       a capsule; camera corners close in around it and a scan line sweeps across
       bill      a receipt prints downwards, line by line, and a green dollar stamps onto it
       ask       chat bubbles pop up one after another, the last one typing
       schedule  a calendar with a clock; the hand goes round once and a big tick draws over it
     About a second (LAUNCH_MS). Decoration (aria-hidden): the page that opens says where you are. Covers the screen, so a
     second tap can't land on another card. Never shown with reduced motion (the link just opens). -->
<script setup>
import { computed } from 'vue'
import { cardLaunch } from '../../composables/useCardLaunch'

const from = computed(() => ({ '--x': `${cardLaunch.x}px`, '--y': `${cardLaunch.y}px` }))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="cardLaunch.kind"
      class="launch"
      :class="`launch-${cardLaunch.kind}`"
      :style="from"
      aria-hidden="true"
      data-testid="card-launch"
      :data-kind="cardLaunch.kind"
    >
      <div class="wash"></div>
      <div class="art">
        <svg v-if="cardLaunch.kind === 'med'" viewBox="0 0 200 200">
          <!-- The tilt (outer) and the wobble (inner) on separate groups, so the wobble turns it where it lies. -->
          <g class="tilt">
            <g class="cap">
              <path class="red" d="M100 76H70a24 24 0 0 0 0 48h30z" />
              <path class="cream" d="M100 76h30a24 24 0 0 1 0 48h-30z" />
              <rect class="line" x="46" y="76" width="108" height="48" rx="24" />
              <path class="line" d="M100 76v48" />
              <rect class="shine" x="56" y="84" width="34" height="7" rx="3.5" />
            </g>
          </g>
          <g class="finder">
            <path d="M30 62V30h32" />
            <path d="M138 30h32v32" />
            <path d="M170 138v32h-32" />
            <path d="M62 170H30v-32" />
          </g>
          <rect class="beam" x="34" y="98" width="132" height="4" rx="2" />
        </svg>

        <svg v-else-if="cardLaunch.kind === 'bill'" viewBox="0 0 200 200">
          <rect class="slot" x="40" y="22" width="120" height="12" rx="6" />
          <g class="paper">
            <path
              class="sheet"
              d="M52 30h96v130l-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6z"
            />
            <rect class="band" x="56" y="34" width="88" height="14" rx="3" />
            <rect class="row r1" x="64" y="62" width="60" height="7" rx="3.5" />
            <rect class="row r2" x="64" y="80" width="44" height="7" rx="3.5" />
            <rect class="row r3" x="64" y="98" width="52" height="7" rx="3.5" />
            <rect class="row r4" x="64" y="122" width="30" height="9" rx="4.5" />
          </g>
          <g class="coin">
            <circle cx="138" cy="138" r="24" />
            <path
              d="M146 128c-2-3-5-4-8-4-5 0-8 2.6-8 6.2 0 8.4 17 4.4 17 13.2 0 4-3.6 6.6-8.8 6.6-3.8 0-7-1.6-8.8-4.4M138 120v4M138 150v4"
            />
          </g>
        </svg>

        <svg v-else-if="cardLaunch.kind === 'ask'" viewBox="0 0 200 200">
          <g class="b b1">
            <rect x="18" y="34" width="112" height="40" rx="20" />
            <rect class="txt" x="34" y="50" width="70" height="8" rx="4" />
          </g>
          <g class="b b2">
            <rect x="70" y="86" width="112" height="40" rx="20" />
            <rect class="txt" x="86" y="102" width="62" height="8" rx="4" />
          </g>
          <g class="b b3">
            <rect x="18" y="138" width="84" height="40" rx="20" />
            <circle class="dot d1" cx="44" cy="158" r="6" />
            <circle class="dot d2" cx="60" cy="158" r="6" />
            <circle class="dot d3" cx="76" cy="158" r="6" />
          </g>
        </svg>

        <svg v-else viewBox="0 0 200 200">
          <g class="cal">
            <rect class="page" x="30" y="40" width="140" height="130" rx="18" />
            <path class="top" d="M30 58a18 18 0 0 1 18-18h104a18 18 0 0 1 18 18v14H30z" />
            <rect class="ring" x="62" y="28" width="10" height="24" rx="5" />
            <rect class="ring" x="128" y="28" width="10" height="24" rx="5" />
          </g>
          <circle class="face" cx="100" cy="122" r="34" />
          <path class="hand" d="M100 122V98" />
          <path class="hand short" d="M100 122h16" />
          <path class="tick" d="M62 120l26 26 52-56" />
        </svg>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.launch {
  position: fixed;
  inset: 0;
  z-index: 60;
  cursor: progress;
}
/* A soft wash of the card's colour, from the middle out. */
.wash {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    var(--hue) 0%,
    color-mix(in srgb, var(--hue) 55%, transparent) 45%,
    transparent 80%
  );
  animation: wash 1000ms ease-out both;
}
.launch-med {
  --hue: #fde9e4;
}
.launch-bill {
  --hue: #e6effa;
}
.launch-ask {
  --hue: #ece5f8;
}
.launch-schedule {
  --hue: #fff1d6;
}
@keyframes wash {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.94;
  }
}

/* The picture grows out of the card that was tapped and settles in the middle. */
.art {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(56vw, 240px);
  aspect-ratio: 1;
  translate: -50% -50%;
  animation: fly 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
}
@keyframes fly {
  from {
    left: var(--x);
    top: var(--y);
    scale: 0.3;
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
}
svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
svg * {
  transform-box: fill-box;
  transform-origin: center;
}

/* Medicine label: the capsule, then camera corners close in, then a scan line sweeps across. */
.red {
  fill: #e2533c;
}
.cream {
  fill: #fff3d6;
}
.line {
  fill: none;
  stroke: #8a2c1a;
  stroke-width: 4;
}
.shine {
  fill: #fff;
  opacity: 0.6;
}
.tilt {
  rotate: -35deg;
} /* in CSS, not an SVG attribute: both turn about the capsule's own centre */
.cap {
  animation: wobble 600ms ease-in-out 250ms both;
}
.finder path {
  fill: none;
  stroke: #1a7070;
  stroke-width: 9;
  stroke-linecap: round;
  stroke-linejoin: round;
  animation: close 380ms cubic-bezier(0.3, 1.4, 0.5, 1) 320ms both;
}
.beam {
  fill: #00b8a9;
  opacity: 0;
  filter: drop-shadow(0 0 6px #00b8a9);
  animation: sweep 420ms ease-in-out 600ms both;
}
@keyframes wobble {
  30% {
    rotate: -8deg;
  }
  65% {
    rotate: 6deg;
  }
}
@keyframes close {
  from {
    scale: 1.45;
    opacity: 0;
  }
}
@keyframes sweep {
  0% {
    opacity: 1;
    translate: 0 -58px;
  }
  100% {
    opacity: 1;
    translate: 0 58px;
  }
}

/* Medical bill: printed downwards out of the slot, a line at a time, then the dollar stamps on. */
.slot {
  fill: #4b5a69;
}
.paper {
  transform-origin: 50% 0%;
  animation: print 520ms steps(6, end) 150ms both;
}
.sheet {
  fill: #fff;
  stroke: #4b5a69;
  stroke-width: 4;
  stroke-linejoin: round;
}
.band {
  fill: #3a7bc8;
}
.row {
  fill: #b9c2cc;
}
.r4 {
  fill: #4b5a69;
}
.coin circle {
  fill: #1e9a57;
  stroke: #fff;
  stroke-width: 4;
}
.coin path {
  fill: none;
  stroke: #fff;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.coin {
  animation: stamp 360ms cubic-bezier(0.3, 1.6, 0.5, 1) 640ms both;
}
@keyframes print {
  from {
    scale: 1 0;
  }
}
@keyframes stamp {
  from {
    scale: 2.2;
    opacity: 0;
    rotate: -25deg;
  }
}

/* Ask: three bubbles pop up in turn; the last one is the capsule typing. */
.b rect:first-child {
  fill: #fff;
  stroke: #c9bfe2;
  stroke-width: 3;
}
.b2 rect:first-child {
  fill: #5b3f94;
  stroke: none;
}
.b .txt {
  fill: #c9bfe2;
}
.b2 .txt {
  fill: #fff;
  opacity: 0.85;
}
.b {
  animation: pop 300ms cubic-bezier(0.3, 1.5, 0.5, 1) both;
}
.b1 {
  transform-origin: 0% 100%;
  animation-delay: 200ms;
}
.b2 {
  transform-origin: 100% 100%;
  animation-delay: 420ms;
}
.b3 {
  transform-origin: 0% 100%;
  animation-delay: 640ms;
}
.dot {
  fill: #5b3f94;
  animation: type 600ms ease-in-out 700ms infinite;
}
.d2 {
  animation-delay: 800ms;
}
.d3 {
  animation-delay: 900ms;
}
@keyframes pop {
  from {
    scale: 0;
    opacity: 0;
  }
}
@keyframes type {
  50% {
    translate: 0 -6px;
    opacity: 0.4;
  }
}

/* Schedule: a calendar with a clock; the long hand goes round once, then a big tick. */
.page {
  fill: #fff;
  stroke: #b07a12;
  stroke-width: 4;
}
.top {
  fill: #f2b84b;
}
.ring {
  fill: #b07a12;
}
.face {
  fill: #fff8e8;
  stroke: #b07a12;
  stroke-width: 4;
}
.hand {
  stroke: #2b2622;
  stroke-width: 6;
  stroke-linecap: round;
  transform-origin: 50% 100%;
  animation: round 560ms ease-in-out 200ms both;
}
.hand.short {
  transform-origin: 0% 50%;
  animation: none;
}
.tick {
  fill: none;
  stroke: #1e9a57;
  stroke-width: 16;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 140;
  stroke-dashoffset: 140;
  animation: draw 300ms ease-out 700ms both;
}
@keyframes round {
  to {
    rotate: 360deg;
  }
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
