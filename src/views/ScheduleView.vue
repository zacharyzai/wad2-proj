<!-- Owner: Lokesh. Placeholder in the new design until the feature is built; the full screen is in the Claude Design project (Schedule.dc.html). -->
<script setup>
import { useI18n } from 'vue-i18n'
import EmptyState from '../components/layout/EmptyState.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.schedule') }}</h1>
    </div>
    <EmptyState :title="t('soon.title')" :text="t('soon.schedule')" icon="calendar">
      <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-primary"><AppIcon name="scan" />{{ t('soon.scanMed') }}</RouterLink>
    </EmptyState>
  </div>
</template>
