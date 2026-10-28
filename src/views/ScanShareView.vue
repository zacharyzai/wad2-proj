<!-- Owner: Isaac. What someone opens from a WhatsApp link: a read-only summary of ONE scan. No login, no account details, nothing from any other scan.
     The server decides what is included (docs/history-contract.md); this page only shows what it is given. -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getShared } from '../api/client.js'
import ReadAloud from '../components/explain/ReadAloud.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()

const scan = ref(null)
const loading = ref(true)
const errorCode = ref(null)
// An expired, revoked or unknown link all look the same on purpose: nothing is revealed about which it was.
const gone = computed(() => ['NOT_FOUND', 'EXPIRED', 'GONE'].includes(errorCode.value))

async function load() {
  loading.value = true
  errorCode.value = null
  const res = await getShared(String(route.params.token))
  loading.value = false
  if (res.ok) scan.value = res.data.scan
  else errorCode.value = res.error.code
}
onMounted(load)

const money = (cents) => '$' + (cents / 100).toFixed(2)
// Dose numbers stay as digits in every language.
const view = computed(() => {
  const s = scan.value
  if (!s) return null
  if (s.type === 'medication') {
    const m = s.medication
    const unit = t(`unit.${m.doseUnit ?? 'other'}`, m.doseAmount ?? 1)
    const dose = m.doseAmount != null ? `${m.doseAmount} ${unit}` : ''
    const perDay = m.timesPerDay != null ? `${m.timesPerDay}× ${t('explain.stat.perDay')}` : ''
    const when = m.timing?.length ? m.timing.map((k) => t(`timing.${k}`)).join(t('explain.sep')) : ''
    const food = m.withFood ? t(`food.${m.withFood}`) : ''
    const facts = [dose && { icon: 'pill', text: dose }, perDay && { icon: 'clock', text: perDay }, when && { icon: 'sun', text: when }, food && { icon: 'food', text: food }].filter(Boolean)
    return { tag: t('explain.tag.medication'), icon: 'pill', name: m.name, sub: m.strength, facts, warnings: m.warnings ?? [], speech: [m.name, ...facts.map((f) => f.text), ...(m.warnings ?? [])].filter(Boolean).join('. ') }
  }
  const b = s.bill
  const pay = b.totalPayableCents != null ? money(b.totalPayableCents) : ''
  const lines = (b.items ?? []).map((i) => ({ text: i.description, amount: i.amountCents != null ? money(i.amountCents) : '' }))
  return { tag: t('explain.tag.bill'), icon: 'receipt', name: b.clinic || t('explain.tag.bill'), sub: b.visitDate, facts: [], pay, lines, warnings: [], speech: pay ? t('explain.bill.title', { amount: pay }) : '' }
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.sharedScan') }}</h1>
      <p class="lead-text m-0">{{ t('shared.lead') }}</p>
    </div>

    <LoadingState v-if="loading" />
    <EmptyState v-else-if="gone" :title="t('shared.goneTitle')" :text="t('shared.goneText')" icon="share">
      <RouterLink to="/" class="btn btn-primary"><AppIcon name="home" />{{ t('shared.open') }}</RouterLink>
    </EmptyState>
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load" />

    <template v-else-if="view">
      <section class="card shared-card" data-testid="shared-card">
        <span class="badge badge-teal"><AppIcon :name="view.icon" :size="18" />{{ view.tag }}</span>
        <h2 class="shared-name" data-testid="shared-name">{{ view.name }}</h2>
        <p v-if="view.sub" class="m-0 text-body-secondary">{{ view.sub }}</p>

        <ul v-if="view.facts.length" class="list-unstyled m-0 d-flex flex-column gap-2">
          <li v-for="f in view.facts" :key="f.text" class="d-flex gap-2 align-items-center fw-bold"><AppIcon :name="f.icon" :size="24" />{{ f.text }}</li>
        </ul>

        <template v-if="view.pay">
          <p class="shared-pay m-0" data-testid="shared-pay">{{ view.pay }}</p>
          <ul class="list-unstyled m-0 d-flex flex-column gap-1">
            <li v-for="(l, i) in view.lines" :key="i" class="d-flex justify-content-between gap-3"><span>{{ l.text }}</span><span>{{ l.amount }}</span></li>
          </ul>
        </template>

        <div v-if="view.warnings.length" class="alert alert-warning">
          <AppIcon name="alert" />
          <ul class="m-0 ps-3"><li v-for="w in view.warnings" :key="w">{{ w }}</li></ul>
        </div>
      </section>

      <ReadAloud v-if="view.speech" :text="view.speech" />
      <p class="text-body-secondary">{{ t('shared.note') }}</p>
      <RouterLink to="/" class="btn btn-secondary align-self-start"><AppIcon name="home" />{{ t('shared.open') }}</RouterLink>
    </template>
  </div>
</template>

<style scoped>
.shared-card { display: flex; flex-direction: column; gap: var(--s-3); }
.shared-name { font-size: var(--fs-h1); margin: 0; overflow-wrap: anywhere; }
.shared-pay { font-size: var(--fs-display); font-weight: 800; color: var(--color-primary-text); }
</style>