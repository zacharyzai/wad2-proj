<!-- Owner: Isaac. The "empty" state: an icon, what is missing, and what to do next. Put the action button in the slot. -->
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
    <span class="halo"><span class="tile tile-lg"><AppIcon :name="icon" :size="30" /></span></span>
    <span v-if="label" class="section-label">{{ label }}</span>
    <component :is="as" class="empty-title">{{ title }}</component>
    <p v-if="text" class="lead-text">{{ text }}</p>
    <div class="d-flex flex-column gap-3 w-100 acts-col"><slot /></div>
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 30rem; margin: 0 auto; padding: 24px 0; text-align: center; }
.halo { width: 148px; height: 148px; display: grid; place-items: center; border-radius: 50%; background: var(--color-tint); box-shadow: inset 0 0 0 22px color-mix(in srgb, var(--color-tint-strong) 45%, transparent); }
.halo .tile { width: 76px; height: 76px; border-radius: 22px; box-shadow: var(--shadow-glow); }
.acts-col { max-width: 360px; }
h1.empty-title { font-size: var(--fs-h1); }
</style>
