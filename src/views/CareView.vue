<!-- Owner: Isaac. Caregivers only. The seniors who invited you, each with today's doses at a glance. API: docs/care-contract.md (assumed). -->
<script setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { careSeniors } from '../api/client'
import PageHeader from '../components/layout/PageHeader.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const seniors = ref([])
const loading = ref(true)
const errorCode = ref(null)

async function load() {
  loading.value = true
  errorCode.value = null
  const res = await careSeniors()
  loading.value = false
  if (!res.ok) return void (errorCode.value = res.error.code)
  seniors.value = res.data.seniors
}
onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader :title="t('pages.care')">{{ t('care.lead') }}</PageHeader>

    <LoadingState v-if="loading" />
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load" />
    <EmptyState v-else-if="!seniors.length" :title="t('care.emptyTitle')" :text="t('care.emptyText')" icon="users" />

    <ul v-else class="list-unstyled d-flex flex-column gap-3 m-0" data-testid="care-list">
      <li v-for="s in seniors" :key="s.id">
        <RouterLink :to="{ name: 'care-senior', params: { seniorId: s.id } }" class="card care-row" data-testid="care-senior">
          <span class="care-icon" aria-hidden="true"><AppIcon name="user" :size="28" /></span>
          <span class="flex-grow-1">
            <span class="care-name">{{ s.name }}</span>
            <!-- Words and icons, never colour alone. -->
            <span v-if="!s.today" class="d-flex mt-2"><span class="badge badge-teal"><AppIcon name="clock" :size="18" />{{ t('care.notShared') }}</span></span>
            <span v-else class="d-flex flex-wrap gap-2 mt-2">
              <span class="badge badge-success"><AppIcon name="checkCircle" :size="18" />{{ t('care.nTaken', { n: s.today.taken }) }}</span>
              <span v-if="s.today.missed" class="badge badge-danger"><AppIcon name="xCircle" :size="18" />{{ t('care.nMissed', { n: s.today.missed }) }}</span>
              <span class="badge badge-teal"><AppIcon name="clock" :size="18" />{{ t('care.nUpcoming', { n: s.today.upcoming }) }}</span>
            </span>
          </span>
          <AppIcon name="right" :size="24" />
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.care-row { display: flex; align-items: center; gap: var(--s-4); text-decoration: none; color: inherit; }
.care-icon { flex: none; width: var(--tile-lg); height: var(--tile-lg); display: grid; place-items: center; border-radius: var(--r-field); background: var(--color-tint); color: var(--color-primary-text); }
.care-name { display: block; font-size: var(--fs-h3); font-weight: 700; overflow-wrap: anywhere; }
</style>