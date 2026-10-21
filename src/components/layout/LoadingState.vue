<!-- Owner: Isaac. The "loading" state every data page needs: a 3x3 pixel grid, a shimmering label and a running timer.
     variant: Drive (square cells sweeping), Dots (round cells), Orbit (one cell circling the edge). -->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  label: { type: String, default: null }, // falls back to "Loading…" in the page language
  variant: { type: String, default: 'Drive', validator: (v) => ['Drive', 'Dots', 'Orbit'].includes(v) },
})
const { t } = useI18n()

const ORBIT = [0, 1, 2, 5, 8, 7, 6, 3] // perimeter, clockwise from the top-left
const cells = computed(() =>
  Array.from({ length: 9 }, (_, i) => {
    if (props.variant === 'Orbit') {
      return i === 4 ? { centre: true } : { style: { '--dur': '950ms', '--delay': `${ORBIT.indexOf(i) * 110}ms` } }
    }
    const r = Math.floor(i / 3), c = i % 3
    return { style: { '--dur': '650ms', '--delay': `${(c + Math.abs(r - 1)) * 90}ms` } }
  }),
)

const tenths = ref(0)
let timer
onMounted(() => (timer = setInterval(() => tenths.value++, 100)))
onUnmounted(() => clearInterval(timer))
const elapsed = computed(() => {
  const s = tenths.value / 10
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(1)}s`
})
</script>

<template>
  <div class="ls" role="status" aria-live="polite">
    <span class="ls-grid" :class="{ 'ls-round': variant === 'Dots' }" aria-hidden="true">
      <span v-for="(cell, i) in cells" :key="i" class="ls-cell" :class="{ 'ls-centre': cell.centre }" :style="cell.style"></span>
    </span>
    <span class="ls-label">{{ label ?? t('common.loading') }}</span>
    <span class="ls-time" aria-hidden="true">{{ elapsed }}</span>
  </div>
</template>

<style scoped>
.ls { display: inline-flex; align-items: center; gap: 10px; width: fit-content; }
.ls-grid { display: grid; grid-template-columns: repeat(3, 4px); gap: 1.5px; }
.ls-cell { width: 4px; height: 4px; border-radius: 1px; background: var(--color-text); opacity: 0.15; }
.ls-round .ls-cell { border-radius: 50%; }
.ls-cell:not(.ls-centre) { animation: pixel-on var(--dur) ease-in-out var(--delay) infinite; }
.ls-centre { opacity: 0.07; }
/* 16px, not 13px: the app's minimum text size for seniors. */
.ls-label {
  font-size: 16px; font-weight: 500; color: transparent;
  background-image: linear-gradient(90deg, var(--color-text-muted) 35%, var(--color-text) 50%, var(--color-text-muted) 65%);
  background-size: 200% 100%; -webkit-background-clip: text; background-clip: text;
  animation: shimmer-text 1.4s linear infinite;
}
.ls-time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }

@keyframes pixel-on { 0%, 100% { opacity: 0.12; } 50% { opacity: 1; } }
@keyframes shimmer-text { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

@media (prefers-reduced-motion: reduce) {
  .ls-cell { animation: none !important; }
  .ls-label { animation: none; background: none; color: var(--color-text); }
}
</style>
