<!-- Owner: Isaac. First version from wireframe 1a (logged-out); recent scans and next dose come with auth/history. -->
<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="d-flex flex-column gap-4">
    <div class="d-flex flex-column gap-2">
      <h1 class="h-page">{{ t('home.title') }}</h1>
      <p class="lead-lg text-soft">{{ t('home.lead') }}</p>
    </div>

    <div class="row g-3">
      <div class="col-sm-6">
        <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="choice choice-main">
          <span class="choice-title">{{ t('home.med.title') }}</span>
          <span>{{ t('home.med.text') }}</span>
        </RouterLink>
      </div>
      <div class="col-sm-6">
        <RouterLink :to="{ name: 'scan', query: { type: 'bill' } }" class="choice">
          <span class="choice-title">{{ t('home.bill.title') }}</span>
          <span class="text-body">{{ t('home.bill.text') }}</span>
        </RouterLink>
      </div>
    </div>

    <RouterLink :to="{ name: 'scan' }" class="align-self-start lead-lg fw-bold">{{ t('home.sample') }}</RouterLink>

    <div class="box soft d-flex flex-column gap-3">
      <h2 class="h-sec">{{ t('home.keep.title') }}</h2>
      <p>{{ t('home.keep.text') }}</p>
      <RouterLink to="/login" class="btn-small align-self-start">{{ t('home.keep.login') }}</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.choice { height: 100%; display: flex; flex-direction: column; gap: 12px; padding: 24px; min-height: 200px; border: 3px solid var(--teal); border-radius: 16px; background: #fff; color: var(--teal-dark); text-decoration: none; }
.choice-main { background: var(--teal); color: #fff; }
.choice-title { font-size: 26px; font-weight: 700; line-height: 1.2; }
</style>
