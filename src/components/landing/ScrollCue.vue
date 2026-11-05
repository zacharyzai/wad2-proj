<!-- Owner: Zachary (built by Claude, declared in README.txt). Welcome page: "keep scrolling" cue, two down arrows that
     cascade downwards, with optional words above them. Used under the hero, in the tunnel and at the foot of each feature.
     Decoration only (aria-hidden): the top bar's links reach every section. Reduced motion: the arrows stay still. -->
<script setup>
import AppIcon from '../layout/AppIcon.vue'

defineProps({ text: { type: String, default: '' } })
</script>

<template>
  <p class="scroll-cue" aria-hidden="true">
    <span v-if="text">{{ text }}</span>
    <span class="arrows"><AppIcon name="down" :size="28" /><AppIcon name="down" :size="28" /></span>
  </p>
</template>

<style scoped>
.scroll-cue {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--l-muted);
  text-align: center;
}
.arrows {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--l-accent);
}
.arrows > * + * {
  margin-top: -16px;
} /* the two chevrons nest into one double arrow */
/* Each arrow brightens and nudges down in turn, so the pair reads as one movement downwards. Transform and opacity only. */
.arrows > * {
  opacity: 0.25;
  animation: cue 1.8s cubic-bezier(0.77, 0, 0.175, 1) infinite;
}
.arrows > * + * {
  animation-delay: 0.2s;
}
@keyframes cue {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(-3px);
  }
  45% {
    opacity: 1;
    transform: translateY(4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .arrows > * {
    animation: none;
    opacity: 1;
  }
  .arrows > :first-child {
    opacity: 0.45;
  }
}
</style>
