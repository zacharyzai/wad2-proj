<!-- Owner: Isaac. The "empty" state: a spot illustration around the icon, what is missing, and what to do next. Put the action button in the slot.
     One drawing for every empty page (two paper sheets on a soft blob), so they all look like one set. -->
<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  title: { type: String, required: true },
  text: { type: String, default: '' },
  icon: { type: String, default: 'info' },
  label: { type: String, default: '' }, // small caps line above the title
  as: { type: String, default: 'h2' }, // 'h1' when it is the whole page (404)
})
</script>

<template>
  <div class="empty rise">
    <span class="art" aria-hidden="true">
      <svg viewBox="0 0 220 170" width="220" height="170">
        <path class="blob" d="M40 112c-18-30 2-74 44-84s82-8 102 22 8 74-30 88-98 4-116-26z" />
        <g class="sheet" transform="rotate(9 132 80)"><rect x="98" y="26" width="74" height="96" rx="10" /><path d="M110 46h40M110 58h48M110 70h30" /></g>
        <g class="sheet" transform="rotate(-8 88 86)"><rect x="52" y="34" width="78" height="102" rx="10" /><path d="M66 56h44M66 69h50M66 82h36M66 95h46" /></g>
        <circle class="dot" cx="34" cy="48" r="5" /><circle class="dot" cx="190" cy="128" r="4" /><circle class="dot soft" cx="196" cy="40" r="7" />
        <path class="spark" d="M176 18v12M170 24h12" />
      </svg>
      <span class="tile tile-lg"><AppIcon :name="icon" :size="30" /></span>
    </span>
    <span v-if="label" class="section-label">{{ label }}</span>
    <component :is="as" class="empty-title">{{ title }}</component>
    <p v-if="text" class="lead-text">{{ text }}</p>
    <div class="d-flex flex-column gap-3 w-100 acts-col"><slot /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 30rem; margin: 0 auto; padding: 24px 0; text-align: center; }
.art { position: relative; width: 220px; height: 170px; }
.art svg { display: block; }
.blob { fill: var(--color-tint); }
.sheet rect { fill: var(--color-card); stroke: var(--color-border-strong); stroke-width: 1.5; }
.sheet path { stroke: var(--color-border-strong); stroke-width: 4; stroke-linecap: round; }
.dot { fill: var(--color-accent); }
.dot.soft { fill: var(--color-tint-strong); }
.spark { stroke: var(--color-accent); stroke-width: 2.5; stroke-linecap: round; }
.art .tile { position: absolute; right: 30px; bottom: 6px; width: 76px; height: 76px; border-radius: var(--r-card); box-shadow: var(--shadow-glow); animation: float 4s ease-in-out infinite; }
@keyframes float { 50% { transform: translateY(-6px); } }
.acts-col { max-width: 360px; }
h1.empty-title { font-size: var(--fs-h1); }
</style>
