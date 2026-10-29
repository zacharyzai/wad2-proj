<!-- Owner: Isaac. Saved scans (medicines and bills), newest first, 10 at a time. Replay opens the Explain page with that scan; share and delete live on each item.
     API: docs/history-contract.md. -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listScans, getScan } from '../api/client'
import { scanStore } from '../stores/scan'
import HistoryItem from '../components/history/HistoryItem.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const router = useRouter()

const items = ref([])
const page = ref(0) // last page loaded
const pages = ref(1) // total pages, from the server
const loading = ref(true) // first load
const loadingMore = ref(false)
const errorCode = ref(null)
const filter = ref('all') // all | medication | bill
const notice = ref('')

const FILTERS = [
  { key: 'all', label: 'history.filterAll' },
  { key: 'medication', label: 'history.filterMed' },
  { key: 'bill', label: 'history.filterBill' },
]
const shown = computed(() => (filter.value === 'all' ? items.value : items.value.filter((i) => i.type === filter.value)))

async function load() {
  const first = page.value === 0
  if (first) loading.value = true
  else loadingMore.value = true
  errorCode.value = null
  const res = await listScans(page.value + 1)
  loading.value = false
  loadingMore.value = false
  if (!res.ok) return void (errorCode.value = res.error.code)
  items.value.push(...res.data.items)
  page.value = res.data.page
  pages.value = res.data.pages
}
onMounted(load)

// Replay: fetch the whole saved scan, hand it to the Explain page the same way a fresh scan arrives.
const opening = ref(null)
async function replay(item) {
  if (opening.value) return
  opening.value = item.id
  errorCode.value = null
  const res = await getScan(item.id)
  opening.value = null
  if (!res.ok) return void (errorCode.value = res.error.code)
  Object.assign(scanStore, { current: res.data.scan, photo: null, confirmed: true })
  router.push({ name: 'explain' })
}

function removed(id) {
  items.value = items.value.filter((i) => i.id !== id)
  notice.value = t('history.deleted')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.history') }}</h1>
        <p v-if="items.length" class="lead-text m-0">{{ t('history.lead') }}</p>
    </div>

    <LoadingState v-if="loading" />
    <ErrorBanner v-else-if="errorCode && !items.length" :code="errorCode" retryable @retry="load" />

    <EmptyState v-else-if="!items.length" :title="t('history.emptyTitle')" :text="t('history.emptyText')" icon="history">
      <RouterLink :to="{ name: 'scan' }" class="btn btn-primary" data-testid="history-empty-scan"><AppIcon name="scan" />{{ t('nav.scanDoc') }}</RouterLink>
    </EmptyState>

    <template v-else>
      <div class="segmented" role="group" :aria-label="t('history.filter')">
        <button v-for="f in FILTERS" :key="f.key" type="button" :aria-pressed="filter === f.key" :data-testid="`history-filter-${f.key}`" @click="filter = f.key">{{ t(f.label) }}</button>
      </div>

      <p class="visually-hidden" role="status">{{ notice }}</p>
      <ErrorBanner v-if="errorCode" :code="errorCode" retryable @retry="load" />

      <ul class="list-unstyled d-flex flex-column gap-3 m-0" data-testid="history-list">
        <HistoryItem v-for="item in shown" :key="item.id" :item="item" @replay="replay" @deleted="removed" @changed="(patch) => Object.assign(item, patch)" />
      </ul>
      <p v-if="!shown.length" class="text-body-secondary">{{ t('history.noneOfType') }}</p>

      <button v-if="page < pages" type="button" class="btn btn-secondary align-self-center" :disabled="loadingMore" data-testid="history-more" @click="load">
        {{ loadingMore ? t('common.loading') : t('history.loadMore') }}
      </button>
    </template>
  </div>
</template>