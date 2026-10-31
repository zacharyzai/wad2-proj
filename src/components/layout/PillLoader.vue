<!-- Owner: Isaac. The app's loading sign: a two-tone capsule that turns half a turn, rests, and turns again, like a pill
     turned between the fingers, with a soft sheen passing over it. Used wherever something is loading or being fetched
     (LoadingState, Scan, Ask, read-aloud buttons). Decoration only: the words beside it say what is happening.
     size = the capsule's length in px. tone: 'brand' (teal and cream) or 'light' (on a teal button). Reduced motion: still. -->
<script setup>
defineProps({
  size: { type: Number, default: 30 },
  tone: { type: String, default: 'brand', validator: (v) => ['brand', 'light'].includes(v) },
})
</script>

<template>
  <span class="pill-loader" :class="`tone-${tone}`" :style="{ '--len': `${size}px` }" aria-hidden="true"><span class="capsule"></span></span>
</template>

<style scoped>
/* A square box the length of the capsule, so the pill can turn inside it without moving anything around it. */
.pill-loader { display: inline-grid; place-items: center; flex: none; width: var(--len); height: var(--len); }
.capsule {
  position: relative; overflow: hidden; width: var(--len); height: calc(var(--len) * 0.42); border-radius: 999px;
  background: linear-gradient(90deg, var(--c1) 50%, var(--c2) 50%);
  box-shadow: inset 0 calc(var(--len) * 0.06) calc(var(--len) * 0.08) rgba(255, 255, 255, 0.45), inset 0 calc(var(--len) * -0.05) 0 rgba(0, 0, 0, 0.08);
  animation: pill-turn 1.6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
/* The sheen: a soft band of light crossing the capsule while it rests between turns. */
.capsule::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%); transform: translateX(-120%); animation: pill-sheen 1.6s ease-in-out infinite; }
.tone-brand { --c1: var(--color-primary); --c2: #f3d27a; }
.tone-light { --c1: #ffffff; --c2: #f3d27a; }
/* Half a turn, a rest, the other half, a rest: the colours swap ends each time, so the turn is easy to see. */
@keyframes pill-turn { 0% { rotate: 0deg; } 40%, 50% { rotate: 180deg; } 90%, 100% { rotate: 360deg; } }
@keyframes pill-sheen { 0%, 38% { transform: translateX(-120%); } 50% { transform: translateX(120%); } 88% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
@media (prefers-reduced-motion: reduce) { .capsule, .capsule::after { animation: none !important; } }
</style>
