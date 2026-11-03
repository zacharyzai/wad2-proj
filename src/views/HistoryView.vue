<!-- Owner: Isaac (tidied by Asher: grouped, searchable, two lists). Saved scans, arranged so a medicine or bill is found
     without scrolling (our own rules: src/rules/history.js), all loaded at once (GET /api/history/all):
       Medicines  one short row per medicine with all its scans inside, so monthly refills don't pile up. "Taking now"
                  (still on the timetable) first; "No longer taking" folded away. A search box, and one-tap chips with
                  the person's own medicines.
       Bills      one short row per visit under its month ("This month", "October 2026"), chips to jump to a month, and
                  what was paid at each clinic this year.
     A row opens that medicine or bill (?open=), where Listen again, Share and Delete live (HistoryItem.vue): the list stays
     short and nothing is deleted by a stray tap. The list and the open item are in the address, so Back works.
     API: docs/history-contract.md. -->
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listAllScans, getScan } from '../api/client'
import { useScanStore } from '../stores/scan'
import { useMedicinesStore, isFinished } from '../stores/medicines'
import { billMonths, clinicTotals, matches, medicineGroups, medicineKey } from '../rules/history'
import { todayInSingapore } from '../rules/schedule'
import { money } from '../components/bill/lines'
import HistoryItem from '../components/history/HistoryItem.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
const scanStore = useScanStore()
const { medicines } = useMedicinesStore()

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const items = ref([])
const capped = ref(false)
const loading = ref(true)
const errorCode = ref(null)
const notice = ref('')

async function load() {
  loading.value = true
  errorCode.value = null
  const res = await listAllScans()
  loading.value = false
  if (!res.ok) return void (errorCode.value = res.error.code)
  items.value = res.data.items
  capped.value = res.data.capped
}
onMounted(load)

// --- Which list: Medicines or Bills, in the address (?tab=bill). With only bills saved, Bills first. -------------------
const TABS = [
  { key: 'medication', label: 'history.filterMed' },
  { key: 'bill', label: 'history.filterBill' },
]
const hasMeds = computed(() => items.value.some((i) => i.type === 'medication'))
const tab = computed(() => (TABS.some((x) => x.key === route.query.tab) ? route.query.tab : hasMeds.value || !items.value.length ? 'medication' : 'bill'))
const setTab = (key) => router.replace({ query: { tab: key } })

const query = ref('')
watch(tab, () => (query.value = ''))
const searching = computed(() => Boolean(query.value.trim()))

// --- Medicines: one group each; the ones still on the person's list (and not finished) are "Taking now". ---------------
const nameOf = (m) => [m.medication.name, m.medication.strength].filter(Boolean).join(' ')
const takingKeys = computed(() => new Set(medicines.filter((m) => !isFinished(m)).map((m) => medicineKey(nameOf(m)))))
const groups = computed(() => medicineGroups(items.value, takingKeys.value))
const foundGroups = computed(() => groups.value.filter((g) => matches(g.title, query.value)))
const taking = computed(() => foundGroups.value.filter((g) => g.taking))
const notTaking = computed(() => foundGroups.value.filter((g) => !g.taking))
// Two sections only when the person has a timetable to go by; otherwise one plain list, most recent first.
const sorted = computed(() => groups.value.some((g) => g.taking))
const showOld = ref(false)
// One tap finds a medicine: chips with the ones they take (or, without a timetable, the most recent), once the list is long.
const quick = computed(() => (groups.value.length > 3 ? (sorted.value ? groups.value.filter((g) => g.taking) : groups.value).slice(0, 8) : []))
const pickQuick = (title) => (query.value = query.value === title ? '' : title)

// --- Bills: under the month of the visit; what was paid at each clinic this year. --------------------------------------
const today = todayInSingapore()
const thisMonth = today.slice(0, 7)
const thisYear = today.slice(0, 4)
const billTitle = (item) => item.title || t('explain.tag.bill')
const months = computed(() => billMonths(items.value.filter((i) => i.type === 'bill' && matches(billTitle(i), query.value))))
const totals = computed(() => clinicTotals(items.value, thisYear))
const monthDate = (m, options) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', ...options })
const monthName = (m) => (m === thisMonth ? t('history.thisMonth') : monthDate(m, { month: 'long', year: 'numeric' }))
const monthChip = (m) => (m === thisMonth ? t('history.thisMonth') : monthDate(m, m.startsWith(thisYear) ? { month: 'short' } : { month: 'short', year: 'numeric' }))
const monthHeadings = ref([]) // template refs in v-for (Week 4): one per month heading
function jumpTo(m) {
  const heading = monthHeadings.value.find((h) => h.id === `month-${m}`)
  heading?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  heading?.focus({ preventScroll: true })
}

// --- Short dates: "3 Nov", with the year when it isn't this year. ------------------------------------------------------
const shortDate = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', day: 'numeric', month: 'short', ...(ymd.startsWith(thisYear) ? {} : { year: 'numeric' }) })
const savedDay = (iso) => shortDate(todayInSingapore(new Date(iso)))

// --- One medicine or bill opened (?open=): its scans, each with Listen again, Share and Delete. --------------------------
const opened = computed(() => {
  const key = route.query.open
  if (!key) return null
  if (tab.value === 'bill') {
    const bill = items.value.find((i) => i.type === 'bill' && i.id === key)
    return bill && { kind: 'bill', title: billTitle(bill), sub: bill.totalPayableCents == null ? '' : t('history.youPaid', { amount: money(bill.totalPayableCents) }), scans: [bill] }
  }
  const group = groups.value.find((g) => g.key === key)
  return group && { kind: 'medication', title: group.title, sub: t('history.scanned', { n: group.scans.length }, group.scans.length), scans: group.scans }
})
const openTo = (key) => ({ query: { tab: tab.value, open: key } })
function close() {
  if (window.history.state?.back) router.back()
  else router.replace({ query: { tab: tab.value } })
}

// Replay: fetch the whole saved scan, hand it to the Explain page the same way a fresh scan arrives.
const opening = ref(null)
async function replay(item) {
  if (opening.value) return
  opening.value = item.id
  errorCode.value = null
  const res = await getScan(item.id)
  opening.value = null
  if (!res.ok) return void (errorCode.value = res.error.code)
  Object.assign(scanStore, { current: res.data.scan, photos: [], pdfPages: null, confirmed: true }) // saved scans have no photo
  router.push({ name: 'explain' })
}

// Deleting the last scan of what is open goes back to the list, which says so.
async function removed(id) {
  items.value = items.value.filter((i) => i.id !== id)
  notice.value = t('history.deleted')
  if (route.query.open && !opened.value) {
    await router.replace({ query: { tab: tab.value } })
    await nextTick()
    document.querySelector('main h1')?.focus()
  }
}
</script>

<template>
  <!-- One medicine or bill: its scans, each with Listen again, Share and Delete. -->
  <div v-if="opened" class="page">
    <button type="button" class="back align-self-start" data-testid="history-back" @click="close">{{ t('history.back') }}</button>
    <div class="detail-head">
      <KindIcon :kind="opened.kind" :size="64" />
      <div class="d-flex flex-column gap-1 min-w-0">
        <h1 class="m-0 detail-title">{{ opened.title }}</h1>
        <p v-if="opened.sub" class="m-0 lead-text">{{ opened.sub }}</p>
      </div>
    </div>
    <p class="visually-hidden" role="status">{{ notice }}</p>
    <ErrorBanner v-if="errorCode" :code="errorCode" />
    <h2 v-if="opened.scans.length > 1" class="section-label">{{ t('history.allScans') }}</h2>
    <ul class="list-unstyled d-flex flex-column gap-3 m-0" data-testid="history-scans">
      <HistoryItem v-for="item in opened.scans" :key="item.id" :item="item" @replay="replay" @deleted="removed" @changed="(patch) => Object.assign(item, patch)" />
    </ul>
  </div>

  <div v-else class="page history">
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
      <p class="visually-hidden" role="status">{{ notice }}</p>
      <ErrorBanner v-if="errorCode" :code="errorCode" retryable @retry="load" />

      <div class="segmented" role="group" :aria-label="t('history.filter')">
        <button v-for="x in TABS" :key="x.key" type="button" :aria-pressed="tab === x.key" :data-testid="`history-tab-${x.key}`" @click="setTab(x.key)">
          <KindIcon :kind="x.key" :size="28" />{{ t(x.label) }}
        </button>
      </div>

      <!-- Find: by name for medicines, by clinic for bills. -->
      <div class="find">
        <label for="history-find" class="find-label">{{ t(tab === 'bill' ? 'history.searchBill' : 'history.searchMed') }}</label>
        <div class="find-box">
          <AppIcon name="search" :size="22" class="find-icon" />
          <input id="history-find" v-model="query" type="search" class="find-input" autocomplete="off" data-testid="history-find" />
          <button v-if="query" type="button" class="find-clear" :aria-label="t('history.clear')" @click="query = ''"><AppIcon name="x" :size="22" /></button>
        </div>
      </div>

      <!-- ===== Medicines ===== -->
      <template v-if="tab === 'medication'">
        <div v-if="quick.length" class="chips" role="group" :aria-label="t('history.quick')">
          <span class="chips-label" aria-hidden="true">{{ t('history.quick') }}</span>
          <button v-for="g in quick" :key="g.key" type="button" class="chip" :aria-pressed="query === g.title" data-testid="history-quick" @click="pickQuick(g.title)">{{ g.title }}</button>
        </div>

        <p v-if="!groups.length" class="text-muted-a11y m-0">{{ t('history.noMeds') }}</p>
        <p v-else-if="!foundGroups.length" class="text-muted-a11y m-0" data-testid="history-no-match">{{ t('history.noMatch', { q: query.trim() }) }}</p>

        <template v-else-if="sorted">
          <section v-if="taking.length" class="rows-block" aria-labelledby="taking-title">
            <h2 id="taking-title" class="section-label">{{ t('history.takingNow') }}</h2>
            <ul class="rows" data-testid="history-taking">
              <li v-for="g in taking" :key="g.key"><RouterLink :to="openTo(g.key)" class="row-link" data-testid="history-row">
                <KindIcon kind="medication" :size="48" />
                <span class="row-words"><span class="row-title">{{ g.title }}</span><span class="row-sub">{{ g.scans.length > 1 ? t('history.scanned', { n: g.scans.length }, g.scans.length) : g.purpose ? `${t('purpose.lead')} ${t(`purpose.${g.purpose}`)}` : '' }}</span></span>
                <span class="row-date">{{ savedDay(g.last) }}</span><AppIcon name="right" :size="22" class="row-chev" />
              </RouterLink></li>
            </ul>
          </section>
          <section v-if="notTaking.length" class="rows-block">
            <button v-if="!searching" type="button" class="fold" :aria-expanded="showOld" aria-controls="not-taking" data-testid="history-not-taking-toggle" @click="showOld = !showOld">
              {{ t('history.notTaking', { n: notTaking.length }) }}<AppIcon :name="showOld ? 'up' : 'down'" :size="22" />
            </button>
            <h2 v-else class="section-label">{{ t('history.notTaking', { n: notTaking.length }) }}</h2>
            <ul v-show="showOld || searching" id="not-taking" class="rows" data-testid="history-not-taking">
              <li v-for="g in notTaking" :key="g.key"><RouterLink :to="openTo(g.key)" class="row-link" data-testid="history-row">
                <KindIcon kind="medication" :size="48" />
                <span class="row-words"><span class="row-title">{{ g.title }}</span><span class="row-sub">{{ g.scans.length > 1 ? t('history.scanned', { n: g.scans.length }, g.scans.length) : '' }}</span></span>
                <span class="row-date">{{ savedDay(g.last) }}</span><AppIcon name="right" :size="22" class="row-chev" />
              </RouterLink></li>
            </ul>
          </section>
        </template>

        <ul v-else class="rows">
          <li v-for="g in foundGroups" :key="g.key"><RouterLink :to="openTo(g.key)" class="row-link" data-testid="history-row">
            <KindIcon kind="medication" :size="48" />
            <span class="row-words"><span class="row-title">{{ g.title }}</span><span class="row-sub">{{ g.scans.length > 1 ? t('history.scanned', { n: g.scans.length }, g.scans.length) : '' }}</span></span>
            <span class="row-date">{{ savedDay(g.last) }}</span><AppIcon name="right" :size="22" class="row-chev" />
          </RouterLink></li>
        </ul>
      </template>

      <!-- ===== Bills ===== -->
      <template v-else>
        <section v-if="totals.length && !searching" class="card year" aria-labelledby="year-title" data-testid="history-year">
          <h2 id="year-title" class="year-title">{{ t('history.yearTitle', { year: thisYear }) }}</h2>
          <ul class="year-list">
            <li v-for="c in totals" :key="c.clinic ?? ''">
              <span class="d-flex flex-column min-w-0"><strong>{{ c.clinic || t('explain.tag.bill') }}</strong><span class="text-muted-a11y">{{ t('history.clinicLine', { n: c.count }, c.count) }}</span></span>
              <span class="year-amount">{{ money(c.cents) }}</span>
            </li>
          </ul>
        </section>

        <div v-if="months.length > 1" class="chips" role="group" :aria-label="t('history.jump')">
          <span class="chips-label" aria-hidden="true">{{ t('history.jump') }}</span>
          <button v-for="m in months" :key="m.month" type="button" class="chip" data-testid="history-month-chip" @click="jumpTo(m.month)">{{ monthChip(m.month) }}</button>
        </div>

        <p v-if="!items.some((i) => i.type === 'bill')" class="text-muted-a11y m-0">{{ t('history.noBills') }}</p>
        <p v-else-if="!months.length" class="text-muted-a11y m-0" data-testid="history-no-match">{{ t('history.noMatch', { q: query.trim() }) }}</p>
        <section v-for="m in months" :key="m.month" class="rows-block" :aria-labelledby="`month-${m.month}`">
          <h2 :id="`month-${m.month}`" ref="monthHeadings" class="section-label month" tabindex="-1">{{ monthName(m.month) }}</h2>
          <ul class="rows" :data-testid="`history-month-${m.month}`">
            <li v-for="b in m.bills" :key="b.id"><RouterLink :to="openTo(b.id)" class="row-link" data-testid="history-row">
              <KindIcon kind="bill" :size="48" />
              <span class="row-words"><span class="row-title">{{ billTitle(b) }}</span><span class="row-sub">{{ b.totalPayableCents == null ? '' : t('history.youPaid', { amount: money(b.totalPayableCents) }) }}</span></span>
              <span class="row-date">{{ shortDate(b.date) }}</span><AppIcon name="right" :size="22" class="row-chev" />
            </RouterLink></li>
          </ul>
        </section>
      </template>

      <p v-if="capped" class="text-muted-a11y m-0">{{ t('history.capped', { n: items.length }) }}</p>
    </template>
  </div>
</template>

<style scoped src="../styles/views/HistoryView.css"></style>
