<!-- Owner: Isaac. The "loading" state every data page needs: the turning pill (PillLoader), a gently brightening label and a running timer. -->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PillLoader from './PillLoader.vue'

defineProps({
  label: { type: String, default: null }, // falls back to "Loading…" in the page language
  pill: { type: Boolean, default: true }, // false when a larger pill is already showing nearby (Scan)
})
const { t } = useI18n()

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
    <PillLoader v-if="pill" :size="30" />
    <span class="ls-label">{{ label ?? t('common.loading') }}</span>
    <span class="ls-time" aria-hidden="true">{{ elapsed }}</span>
  </div>
</template>

<style scoped>
.ls { display: inline-flex; align-items: center; gap: 10px; width: fit-content; }
/* 16px, not 13px: the app's minimum text size for seniors. */
.ls-label { font-size: 16px; font-weight: 500; color: var(--color-text-muted); animation: label-breathe 1.8s ease-in-out infinite; } /* solid words that gently brighten between two AA text colours, never a gradient */
.ls-time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }

@keyframes label-breathe { 50% { color: var(--color-text); } }

@media (prefers-reduced-motion: reduce) {
  .ls-label { animation: none; }
}
</style>
