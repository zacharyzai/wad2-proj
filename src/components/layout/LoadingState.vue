<!-- Owner: Isaac. The "loading" state every data page needs (loading / empty / error). -->
<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="d-flex align-items-center gap-3" role="status">
    <div class="spinner-border" style="color: var(--teal)" aria-hidden="true"></div>
    <span class="lead-lg">{{ t('common.loading') }}</span>
  </div>
</template>