<!-- Owner: Isaac. Page title with an optional round Back button and a lead sentence (same look as ScanView). -->
<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  title: { type: String, required: true },
  back: { type: [String, Object], default: null }, // route to go back to; omit for no back button
})

const { t } = useI18n()
</script>

<template>
  <div class="d-flex align-items-start gap-3">
    <RouterLink v-if="back" :to="back" class="back" :aria-label="t('nav.back')">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5 M11 6l-6 6 6 6" /></svg>
    </RouterLink>
    <div class="d-flex flex-column gap-2">
      <h1 class="h-page">{{ title }}</h1>
      <p v-if="$slots.default" class="lead-lg"><slot /></p>
    </div>
  </div>
</template>