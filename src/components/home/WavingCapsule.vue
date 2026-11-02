<!-- Owner: Asher. The capsule from the log-out pop-up (LeaveDialog.vue), saying hello on Home: it turns towards you in 3D as
     it arrives and waves three times; a tap makes it hop and wave again. Decoration (aria-hidden): the greeting beside it
     says hello in words. Reduced motion: it stands still. -->
<script setup>
import { ref, useId } from 'vue'

const clip = `capsule-${useId()}`.replace(/[^\w-]/g, '-')
// Each tap draws it afresh (a new key), which restarts the hop and the wave.
const hellos = ref(0)
</script>

<template>
  <span class="capsule" aria-hidden="true" data-testid="home-capsule" @click="hellos++">
    <span :key="hellos" class="spin" :class="{ hello: hellos }">
      <svg viewBox="0 0 240 170" width="240" height="170" focusable="false">
        <defs><clipPath :id="clip"><rect x="60" y="62" width="120" height="60" rx="30" /></clipPath></defs>
        <circle class="dot" cx="38" cy="40" r="6" /><circle class="dot soft" cx="206" cy="132" r="9" /><circle class="dot" cx="214" cy="56" r="4" />
        <ellipse class="ground" cx="120" cy="150" rx="56" ry="7" />
        <g transform="rotate(-14 120 92)">
          <path class="limb" d="M70 112 L56 128" /><circle class="hand" cx="54" cy="131" r="6" />
          <g :clip-path="`url(#${clip})`">
            <rect class="half-a" x="60" y="62" width="60" height="60" /><rect class="half-b" x="120" y="62" width="60" height="60" />
            <rect class="gloss" x="72" y="68" width="96" height="9" rx="4.5" />
          </g>
          <circle class="eye" cx="142" cy="88" r="4" /><circle class="eye" cx="160" cy="88" r="4" />
          <path class="smile" d="M141 99 Q151 107 161 99" />
          <circle class="cheek" cx="134" cy="98" r="4" /><circle class="cheek" cx="168" cy="98" r="4" />
          <g class="wave-arm"><path class="limb" d="M172 70 L192 44" /><circle class="hand" cx="194" cy="40" r="7" /></g>
        </g>
        <path class="swish" d="M212 28 q8 8 2 18" /><path class="swish" d="M222 22 q10 12 2 26" />
      </svg>
    </span>
  </span>
</template>

<style scoped>
.capsule { display: block; flex: none; perspective: 600px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.spin { display: block; transform-style: preserve-3d; animation: arrive 1100ms var(--ease-settle) 150ms both; }
.spin.hello { animation: hop 1000ms var(--ease-settle) both; }
svg { display: block; width: 100%; height: auto; overflow: visible; }

/* The same colours as the log-out pop-up. */
.dot { fill: var(--color-primary); opacity: 0.18; }
.dot.soft { fill: #f3d27a; opacity: 0.7; }
.ground { fill: rgba(0, 0, 0, 0.1); }
.half-a { fill: var(--color-primary); }
.half-b { fill: #f3d27a; }
.gloss { fill: #fff; opacity: 0.35; }
.eye { fill: #2b2622; }
.smile { fill: none; stroke: #2b2622; stroke-width: 3; stroke-linecap: round; }
.cheek { fill: #f08a7e; opacity: 0.5; }
.limb { fill: none; stroke: var(--color-text); stroke-width: 3.5; stroke-linecap: round; }
.hand { fill: #fffdfa; stroke: var(--color-text); stroke-width: 2.5; }
.wave-arm { transform-box: view-box; transform-origin: 172px 70px; animation: wave 1.2s ease-in-out 3 900ms; }
.swish { fill: none; stroke: var(--color-primary-text); stroke-width: 2.5; stroke-linecap: round; opacity: 0; animation: swish 1.2s ease-in-out 3 900ms; }
.hello :is(.wave-arm, .swish) { animation-delay: 250ms; }

/* Arrives turned away and swings round to face you; a tap is a little hop with a look left and right. */
@keyframes arrive { 0% { opacity: 0; transform: translateY(18px) rotateY(-55deg) scale(0.9); } 55% { opacity: 1; transform: rotateY(14deg); } 100% { transform: none; } }
@keyframes hop { 30% { transform: translateY(-12px) rotateY(-24deg); } 65% { transform: translateY(0) rotateY(16deg); } 100% { transform: none; } }
@keyframes wave { 0%, 100% { rotate: 0deg; } 30% { rotate: -16deg; } 70% { rotate: 14deg; } }
@keyframes swish { 40%, 60% { opacity: 0.8; } }
@media (prefers-reduced-motion: reduce) { .spin, .wave-arm, .swish { animation: none !important; } }
</style>
