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
    <RouterLink v-if="back" :to="back" class="back" :aria-label="t('nav.back')"></RouterLink>
    <div class="page-head">
      <h1>{{ title }}</h1>
      <p v-if="$slots.default" class="lead-text"><slot /></p>
    </div>
  </div>
</template>
