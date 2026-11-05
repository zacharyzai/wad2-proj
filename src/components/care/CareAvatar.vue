<!-- Owner: Asher. A senior's picture on the caregiver pages (CareView, CareSeniorView): their initials on a soft colour
     of their own (the same colour every time, from their name), with a small dot for how today is going: amber when a
     dose has not been ticked (it pulses gently), green when all are taken, teal otherwise. Decoration (aria-hidden): the
     name and the words beside it say it all. Reduced motion: the dot doesn't pulse. -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  state: { type: String, default: null }, // 'missed' | 'done' | 'onTrack' | 'none' | null (no dot)
  size: { type: Number, default: 64 },
})

const HUES = [174, 200, 28, 340, 262, 140, 12, 220]
const initials = computed(() => {
  const words = props.name.split(/[\s()]+/).filter((w) => /\p{L}/u.test(w))
  if (!words.length) return '?'
  if (/\p{Script=Han}/u.test(words[0])) return [...words[0]][0] // 陈美玲: 陈
  return words
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join('')
})
const hue = computed(
  () => HUES[[...props.name].reduce((sum, ch) => sum + ch.codePointAt(0), 0) % HUES.length],
)
</script>

<template>
  <span
    class="ca"
    :class="state && `ca-${state}`"
    :style="{ '--size': `${size}px`, '--hue': hue }"
    aria-hidden="true"
  >
    <span class="ca-face">{{ initials }}</span>
    <span v-if="state" class="ca-dot"></span>
  </span>
</template>

<style scoped>
.ca {
  position: relative;
  flex: none;
  display: inline-grid;
  width: var(--size);
  height: var(--size);
}
.ca-face {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(145deg, hsl(var(--hue) 62% 86%), hsl(var(--hue) 48% 72%));
  color: hsl(var(--hue) 55% 22%);
  font-family: var(--font-display);
  font-size: calc(var(--size) * 0.38);
  line-height: 1;
  box-shadow:
    inset 0 -3px 0 hsl(var(--hue) 40% 60% / 0.45),
    0 6px 14px -8px hsl(var(--hue) 50% 30% / 0.6);
}
.ca-dot {
  position: absolute;
  right: 2%;
  bottom: 2%;
  width: 28%;
  height: 28%;
  border-radius: 50%;
  border: 3px solid var(--color-card);
  background: var(--color-primary);
}
.ca-done .ca-dot {
  background: var(--color-success);
}
.ca-missed .ca-dot {
  background: var(--color-warning);
}
.ca-none .ca-dot {
  background: var(--color-border-strong);
}
.ca-missed .ca-dot::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--color-warning);
  animation: ca-pulse 2s ease-out infinite;
}
@keyframes ca-pulse {
  from {
    scale: 1;
    opacity: 0.9;
  }
  to {
    scale: 2;
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ca-missed .ca-dot::after {
    animation: none;
    opacity: 0;
  }
}
</style>
