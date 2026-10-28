<!-- Owner: Isaac. Caregivers only. One senior's doses today: taken, missed or still to come. Refreshes every minute.
     Read-only: no scans, photos, bills or account details ever reach this page. API: docs/care-contract.md (assumed). -->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { careToday } from '../api/client'
import PageHeader from '../components/layout/PageHeader.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t, locale } = useI18n()
const route = useRoute()

const senior = ref(null)
const doses = ref([])
const loading = ref(true)
const errorCode = ref(null)
const updated = ref(null)
// The link was removed (or never existed): both answer 404, so nothing is revealed about who has an account.
const gone = computed(() => errorCode.value === 'NOT_FOUND')

const STATUS = {
  taken: { icon: 'checkCircle', badge: 'badge-success' },
  missed: { icon: 'xCircle', badge: 'badge-danger' },
  upcoming: { icon: 'clock', badge: 'badge-teal' },
}
const count = (status) => doses.value.filter((d) => d.status === status).length
const missed = computed(() => doses.value.filter((d) => d.status === 'missed'))
const sorted = computed(() => [...doses.value].sort((a, b) => a.time.localeCompare(b.time)))
const updatedText = computed(() => (updated.value ? updated.value.toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' }) : ''))

// quiet = background refresh: no spinner, and an old list stays on screen if the network blips.
async function load(quiet = false) {
  if (!quiet) loading.value = true
  const res = await careToday(String(route.params.seniorId))
  loading.value = false
  if (res.ok) {
    errorCode.value = null
    senior.value = res.data.senior
    doses.value = res.data.doses
    updated.value = new Date()
  } else if (!quiet || res.error.code === 'NOT_FOUND') errorCode.value = res.error.code
}

let timer
onMounted(() => {
  load()
  timer = setInterval(() => load(true), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <PageHeader :title="senior ? t('care.todayFor', { name: senior.name }) : t('pages.careSenior')" :back="{ name: 'care' }" />

    <LoadingState v-if="loading" />
    <EmptyState v-else-if="gone" :title="t('care.goneTitle')" :text="t('care.goneText')" icon="users">
      <RouterLink :to="{ name: 'care' }" class="btn btn-primary">{{ t('pages.care') }}</RouterLink>
    </EmptyState>
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load()" />

    <template v-else>
      <!-- The one thing a caregiver wants to know: has anything been missed? -->
      <div v-if="missed.length" class="alert alert-warning" role="status" data-testid="care-missed">
        <AppIcon name="alert" />
        <span>{{ t('care.missedBanner', { name: senior.name, n: missed.length }, missed.length) }}</span>
      </div>
      <div v-else-if="doses.length && !count('upcoming')" class="alert alert-success" role="status" data-testid="care-all-taken">
        <AppIcon name="checkCircle" /><span>{{ t('care.allTaken', { name: senior.name }) }}</span>
      </div>

      <EmptyState v-if="!doses.length" :title="t('care.noDoses')" :text="t('care.noDosesText', { name: senior.name })" icon="calendar" />
      <ul v-else class="list-unstyled d-flex flex-column gap-3 m-0" data-testid="care-doses">
        <li v-for="d in sorted" :key="d.doseId" class="card dose-row" :data-status="d.status" data-testid="care-dose">
          <span class="dose-time">{{ d.time }}</span>
          <span class="flex-grow-1 dose-label">{{ d.label }}</span>
          <span class="badge" :class="STATUS[d.status]?.badge"><AppIcon :name="STATUS[d.status]?.icon ?? 'info'" :size="18" />{{ t(`care.status.${d.status}`) }}</span>
        </li>
      </ul>

      <p class="text-body-secondary m-0 d-flex flex-wrap align-items-center gap-3">
        <span v-if="updatedText" data-testid="care-updated">{{ t('care.updated', { time: updatedText }) }}</span>
        <button type="button" class="btn btn-outline btn-sm" data-testid="care-refresh" @click="load()"><AppIcon name="replay" :size="20" />{{ t('care.refresh') }}</button>
      </p>
    </template>
  </div>
</template>

<style scoped>
.dose-row { display: flex; align-items: center; gap: var(--s-4); flex-wrap: wrap; }
.dose-time { font-size: var(--fs-h2); font-weight: 800; min-width: 4.5ch; }
.dose-label { font-size: var(--fs-h3); font-weight: 600; overflow-wrap: anywhere; }
</style>