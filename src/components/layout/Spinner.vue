<!-- Owner: Isaac. The app's loading sign: a ring with a teal arc that keeps turning, the "please wait" sign people already
     know from phones and TVs (the turning pill it replaced read as a picture, not as "loading"). Used wherever something is
     loading or being fetched (LoadingState, Scan, Ask, read-aloud buttons). Decoration only: the words beside it say what
     is happening. size = the ring's width in px. tone: 'brand' (teal on a light track) or 'light' (on a teal button).
     Reduced motion: it still turns, slowly and steadily, because a still ring would not say "wait". -->
<script setup>
defineProps({
  size: { type: Number, default: 30 },
  tone: { type: String, default: 'brand', validator: (v) => ['brand', 'light'].includes(v) },
})
</script>

<template>
  <span class="spinner" :class="`tone-${tone}`" :style="{ '--len': `${size}px` }" aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <circle class="track" cx="24" cy="24" r="19" />
      <circle class="arc" cx="24" cy="24" r="19" pathLength="100" />
    </svg>
  </span>
</template>

<style scoped>
.spinner { display: inline-grid; place-items: center; flex: none; width: var(--len); height: var(--len); }
svg { width: 100%; height: 100%; animation: spin 0.9s linear infinite; }
circle { fill: none; stroke-width: 6; }
.track { stroke: var(--c-track); }
/* A third of the ring, with round ends: thick enough to see at a glance, turning so the motion is unmistakable. */
.arc { stroke: var(--c-arc); stroke-linecap: round; stroke-dasharray: 32 100; }
.tone-brand { --c-arc: var(--color-primary-text); --c-track: var(--color-tint-strong); }
.tone-light { --c-arc: #ffffff; --c-track: rgba(255, 255, 255, 0.35); }
@keyframes spin { to { rotate: 360deg; } }
@media (prefers-reduced-motion: reduce) { svg { animation-duration: 2.4s; } }
</style>
