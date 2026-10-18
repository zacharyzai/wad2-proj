<!-- Owner: Lokesh. Placeholder in the new design until the feature is built; the full screen is in the Claude Design project (Bill.dc.html). -->
<script setup>
import { useI18n } from 'vue-i18n'
import EmptyState from '../components/layout/EmptyState.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.bill') }}</h1>
    </div>
    <EmptyState :title="t('soon.title')" :text="t('soon.bill')" icon="receipt">
      <RouterLink :to="{ name: 'scan', query: { type: 'bill' } }" class="btn btn-primary"><AppIcon name="scan" />{{ t('soon.scanBill') }}</RouterLink>
    </EmptyState>
  </div>
</template>
