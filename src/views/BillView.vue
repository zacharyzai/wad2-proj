<!-- Owner: Lokesh. Bill breakdown: every line of a Singapore polyclinic or GP clinic bill with its category, and a tap-to-open plain explanation. -->
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import { authStore } from '../stores/auth'
import { scanSample } from '../api/client'
import BillLine from '../components/bill/BillLine.vue'
import SubsidyQuestionnaire from '../components/bill/SubsidyQuestionnaire.vue'
import SubsidyResults from '../components/bill/SubsidyResults.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { CATEGORY_STYLE, SUBSIDY_STYLE, MEDISAVE_STYLE, money, sumCents } from '../components/bill/lines'

const { t, locale } = useI18n()

const SAMPLES = [
  { id: 'bill-1', key: 'bill1' },
  { id: 'bill-2', key: 'bill2' },
  { id: 'bill-3', key: 'bill3' },
]

// Only a bill the user has checked on Confirm (or a built-in sample) is broken down.
const scan = computed(() => (scanStore.confirmed && scanStore.current?.type === 'bill' ? scanStore.current : null))
const bill = computed(() => scan.value?.bill)
const unchecked = computed(() => !scanStore.confirmed && scanStore.current?.type === 'bill')

const loading = ref(false)
const errorCode = ref(null)
let lastSample = null

async function openSample(id) {
  lastSample = id
  loading.value = true
  errorCode.value = null
  const res = await scanSample(id)
  loading.value = false
  if (!res.ok) return (errorCode.value = res.error.code)
  // Samples are fixed, known-good data, so they don't need checking on Confirm.
  scanStore.current = res.data
  scanStore.photo = null
  scanStore.confirmed = true
}

// One line open at a time, so there is only ever one read-aloud player.
const openId = ref(null)
watch(bill, () => (openId.value = null))
const toggle = (id) => (openId.value = openId.value === id ? null : id)

const date = computed(
  () => bill.value?.visitDate && new Date(`${bill.value.visitDate}T00:00`).toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }),
)

const charged = computed(() =>
  (bill.value?.items ?? []).map((item, i) => {
    const category = Object.hasOwn(CATEGORY_STYLE, item.category) ? item.category : 'other'
    return {
      id: `item-${i}`,
      ...CATEGORY_STYLE[category],
      // Descriptions are copied from the bill, which is printed in English.
      name: item.description || t(`bill.category.${category}`),
      nameLang: item.description ? 'en' : null,
      tag: t(`bill.category.${category}`),
      amountCents: item.amountCents,
      text: t(`bill.explain.${category}`),
    }
  }),
)

const takenOff = computed(() => {
  const b = bill.value
  if (!b) return []
  return [
    ...b.subsidies.map((s, i) => ({
      id: `subsidy-${i}`,
      ...SUBSIDY_STYLE,
      name: t(`scheme.${s.scheme}`),
      tag: t('bill.tag.subsidy'),
      amountCents: s.amountCents,
      minus: true,
      text: t(`bill.explain.scheme.${s.scheme}`),
    })),
    {
      id: 'medisave',
      ...MEDISAVE_STYLE,
      name: t('bill.medisave'),
      tag: t('bill.tag.medisave'),
      amountCents: b.medisaveCents,
      minus: true,
      text: b.medisaveCents ? t('bill.explain.medisave') : `${t('bill.explain.medisave')} ${t('bill.explain.medisaveNone')}`,
    },
  ]
})

// Questionnaire answers: only in this page's memory, never sent to the server or saved.
// Results follow a moment after the last change, so "Updating…" shows while the person is still typing.
const answers = ref({ birthYear: null, residency: null, citizenSince: null, income: null })
const settledAnswers = ref(answers.value)
const updating = ref(false)
let settleTimer = null
watch(answers, (next) => {
  updating.value = true
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settledAnswers.value = next
    updating.value = false
  }, 500)
})
onBeforeUnmount(() => clearTimeout(settleTimer))

// The big amount counts up when a bill opens (a quick, visible "this is the number that matters"). Screen readers get the real amount.
const shownPay = ref(0)
let countFrame = 0
watch(
  () => bill.value?.totalPayableCents,
  (to) => {
    cancelAnimationFrame(countFrame)
    if (to == null) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return (shownPay.value = to)
    const start = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - start) / 700)
      shownPay.value = Math.round(to * (1 - (1 - p) ** 3))
      if (p < 1) countFrame = requestAnimationFrame(step)
    }
    countFrame = requestAnimationFrame(step)
  },
  { immediate: true },
)
onBeforeUnmount(() => cancelAnimationFrame(countFrame))

// How the charges split: what you pay, what subsidies took off, what MediSave paid. Shares of the full charges, for the bar.
const split = computed(() => {
  const b = bill.value
  const charges = sumCents(b.items) || 1
  return [
    { key: 'pay', cents: b.totalPayableCents },
    { key: 'subsidy', cents: sumCents(b.subsidies) },
    { key: 'medisave', cents: b.medisaveCents },
  ].filter((part) => part.cents > 0).map((part) => ({ ...part, pct: (part.cents / charges) * 100 }))
})

const summary = computed(() => [
  [t('bill.summary.charges'), money(sumCents(bill.value.items))],
  [t('bill.summary.subsidies'), '−' + money(sumCents(bill.value.subsidies))],
  [t('bill.summary.medisave'), '−' + money(bill.value.medisaveCents)],
])
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.bill') }}</h1>
      <p v-if="bill" class="lead-text">{{ t('bill.lead') }}</p>
    </div>

    <p class="alert alert-note"><AppIcon name="info" />{{ t('bill.scope') }}</p>

    <div v-if="bill" class="cols">
      <div>
        <section class="card card-result main-card rise" :aria-label="t('bill.summary.label')">
          <span class="ring" aria-hidden="true"></span>
          <div class="d-flex align-items-center gap-3">
            <span class="tile tile-lg glow"><AppIcon name="receipt" :size="28" /></span>
            <div class="d-flex flex-column min-w-0">
              <span class="clinic">{{ bill.clinic || t('pages.bill') }}</span>
              <span v-if="date" class="text-muted-a11y">{{ date }}</span>
            </div>
          </div>
          <i18n-t keypath="bill.pay" tag="h2" class="pay-title">
            <template #amount><span class="hero-number"><span aria-hidden="true">{{ money(shownPay) }}</span><span class="visually-hidden">{{ money(bill.totalPayableCents) }}</span></span></template>
          </i18n-t>
          <!-- Picture of the list below it (which has the words), so hidden from screen readers. -->
          <div class="split" aria-hidden="true">
            <span v-for="part in split" :key="part.key" class="seg" :class="`seg-${part.key}`" :style="{ flexGrow: part.pct }"></span>
          </div>
          <dl class="summary-row">
            <div v-for="([label, amount], i) in summary" :key="label">
              <dt><span v-if="i" class="swatch" :class="i === 1 ? 'seg-subsidy' : 'seg-medisave'" aria-hidden="true"></span>{{ label }}</dt>
              <dd>{{ amount }}</dd>
            </div>
          </dl>
          <span v-if="scan.source === 'sample'" class="badge badge-navy align-self-start"><AppIcon name="file" :size="18" />{{ t('bill.sampleTag') }}</span>
        </section>      </div>

      <div>
        <section class="d-flex flex-column gap-3" aria-labelledby="bill-charged">
          <h2 id="bill-charged" class="section-label">{{ t('bill.charged') }}</h2>
          <ul class="lines">
            <BillLine v-for="line in charged" :key="line.id" :line="line" :open="openId === line.id" @toggle="toggle(line.id)" />
          </ul>
        </section>
        <section class="d-flex flex-column gap-3" aria-labelledby="bill-off">
          <h2 id="bill-off" class="section-label">{{ t('bill.takenOff') }}</h2>
          <ul class="lines">
            <BillLine v-for="line in takenOff" :key="line.id" :line="line" :open="openId === line.id" @toggle="toggle(line.id)" />
          </ul>
        </section>
        <p class="total" data-testid="bill-total">
          <span>{{ t('bill.total') }}</span>
          <strong>{{ money(bill.totalPayableCents) }}</strong>
        </p>
        <RouterLink :to="{ name: 'bill-scan' }" class="btn btn-secondary"><AppIcon name="scan" />{{ t('bill.another') }}</RouterLink>
      </div>
    </div>

    <div v-if="bill" class="cols">
      <div><SubsidyQuestionnaire v-model="answers" :account="authStore.user" /></div>
      <div><SubsidyResults :bill="bill" :answers="settledAnswers" :updating="updating" /></div>
    </div>

    <div v-else-if="unchecked" class="alert alert-warning">
      <AppIcon name="alert" />
      <div class="d-flex flex-column gap-3">
        <span>{{ t('bill.unchecked.text') }}</span>
        <RouterLink :to="{ name: 'confirm' }" class="btn btn-primary btn-sm align-self-start">{{ t('bill.unchecked.action') }}</RouterLink>
      </div>
    </div>

    <EmptyState v-else :title="t('bill.none.title')" :text="t('bill.none.text')" icon="receipt">
      <RouterLink :to="{ name: 'bill-scan' }" class="btn btn-primary"><AppIcon name="scan" />{{ t('bill.scan') }}</RouterLink>
    </EmptyState>

    <!-- Samples: always offered when there's no real bill, and as "try another" while looking at a sample. -->
    <section v-if="!bill || scan.source === 'sample'" class="d-flex flex-column gap-3" aria-labelledby="bill-samples">
      <h2 id="bill-samples" class="section-label">{{ bill ? t('bill.moreSamples') : t('bill.samplesTitle') }}</h2>
      <div class="samples">
        <button v-for="sample in SAMPLES" :key="sample.id" type="button" class="card card-interactive sample" :disabled="loading" @click="openSample(sample.id)">
          <img :src="`/samples/${sample.id}.svg`" alt="" class="sample-thumb" />
          <span class="d-flex flex-column flex-grow-1">
            <span class="sample-name">{{ t(`bill.samples.${sample.key}`) }}</span>
            <span class="text-muted-a11y sample-kind">{{ t('bill.sampleTag') }}</span>
          </span>
          <AppIcon name="right" :size="22" />
        </button>
      </div>
      <LoadingState v-if="loading" />
      <ErrorBanner v-if="errorCode" :code="errorCode" retryable @retry="openSample(lastSample)" />
    </section>
  </div>
</template>

<style scoped src="../styles/views/BillView.css"></style>
