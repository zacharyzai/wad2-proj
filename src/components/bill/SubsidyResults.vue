<!-- Owner: Lokesh. Subsidy results: what is already on the bill, and what the user may also qualify for. Estimates only; every scheme links its official page. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import { RULES, compareWithBill } from '../../rules/subsidies'
import { money } from './lines'

const props = defineProps({
  bill: { type: Object, required: true },
  answers: { type: Object, required: true },
  // True while the answers are still changing (BillView waits a moment before showing new results).
  updating: { type: Boolean, default: false },
})
const { t, locale } = useI18n()

// Runs the rules again whenever the answers or the bill change. All amounts are integer cents.
const result = computed(() => compareWithBill(props.bill, props.answers))
const answered = computed(() => Object.values(props.answers).some((value) => value !== null))
const checkedOn = (iso) => new Date(`${iso}T00:00`).toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
</script>

<template>
  <section class="card d-flex flex-column gap-4" aria-labelledby="r-title" :aria-busy="updating">
    <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap">
      <h2 id="r-title">{{ t('bill.r.title') }}</h2>
      <span class="r-status" role="status">
        <template v-if="updating"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>{{ t('bill.r.updating') }}</template>
        <template v-else-if="answered"><AppIcon name="checkCircle" :size="20" />{{ t('bill.r.updated') }}</template>
      </span>
    </div>

    <div class="alert alert-warning" data-testid="estimate-notice">
      <AppIcon name="alert" />
      <div class="d-flex flex-column gap-2">
        <strong>{{ t('bill.r.estimateTitle') }}</strong>
        <span>{{ t('bill.r.estimateText') }}</span>
        <ul class="official mb-0">
          <li v-for="rule in RULES" :key="rule.id">
            <a :href="rule.sourceUrl" target="_blank" rel="noopener noreferrer">{{ t('bill.r.official', { name: t(rule.labelKey) }) }}<span class="visually-hidden"> {{ t('bill.r.newTab') }}</span></a>
          </li>
        </ul>
      </div>
    </div>

    <div class="d-flex flex-column gap-3" :class="{ stale: updating }">
      <h3 class="section-label">{{ t('bill.r.onBill') }}</h3>
      <p v-if="!result.onBill.length" class="text-muted-a11y">{{ t('bill.r.noneOnBill') }}</p>
      <ul v-else class="results">
        <li v-for="(item, i) in result.onBill" :key="`${item.scheme}-${i}`" class="result">
          <div class="result-head">
            <span class="result-name">{{ t(`scheme.${item.scheme}`) }}</span>
            <span class="result-amount">−{{ money(item.amountCents) }}</span>
          </div>
          <span v-if="item.result === true" class="badge badge-success align-self-start"><AppIcon name="checkCircle" :size="18" />{{ t('bill.r.matches') }}</span>
          <p v-if="item.rule" class="source">
            <a :href="item.rule.sourceUrl" target="_blank" rel="noopener noreferrer"><AppIcon name="external" :size="18" />{{ t('bill.r.official', { name: t(item.rule.labelKey) }) }}<span class="visually-hidden"> {{ t('bill.r.newTab') }}</span></a>
            <span class="text-muted-a11y">{{ t('bill.r.checked', { date: checkedOn(item.rule.checkedOn) }) }}</span>
          </p>
        </li>
      </ul>
    </div>

    <div class="d-flex flex-column gap-3" :class="{ stale: updating }">
      <h3 class="section-label">{{ t('bill.r.mayQualify') }}</h3>
      <p v-if="!answered" class="text-muted-a11y">{{ t('bill.r.answerFirst') }}</p>
      <p v-else-if="!result.mayQualify.length" class="text-muted-a11y">{{ t('bill.r.noneMore') }}</p>
      <ul v-else class="results">
        <li v-for="item in result.mayQualify" :key="item.rule.id" class="result" :data-rule="item.rule.id">
          <div class="result-head">
            <span class="result-name">{{ t(item.rule.labelKey) }}</span>
            <span v-if="item.amountCents !== null" class="result-amount">−{{ money(item.amountCents) }}</span>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <span v-if="item.result === true" class="badge badge-success"><AppIcon name="checkCircle" :size="18" />{{ t('bill.r.likely') }}</span>
            <span v-else class="badge badge-warning"><AppIcon name="info" :size="18" />{{ t('bill.r.needMore') }}</span>
            <span v-if="!item.here" class="badge badge-navy"><AppIcon name="info" :size="18" />{{ t(`bill.r.notHere.${result.place}`) }}</span>
          </div>
          <p>{{ t(item.rule.explainKey) }}</p>
          <p v-if="item.amountCents !== null" class="fw-bold">{{ t('bill.r.saving', { amount: money(item.amountCents), percent: item.rule.discount }) }}</p>
          <p v-else-if="item.here && item.result === true" class="fw-bold">{{ t('bill.r.checkClinic') }}</p>
          <p class="source">
            <a :href="item.rule.sourceUrl" target="_blank" rel="noopener noreferrer"><AppIcon name="external" :size="18" />{{ t('bill.r.official', { name: t(item.rule.labelKey) }) }}<span class="visually-hidden"> {{ t('bill.r.newTab') }}</span></a>
            <span class="text-muted-a11y">{{ t('bill.r.checked', { date: checkedOn(item.rule.checkedOn) }) }}</span>
          </p>
        </li>
      </ul>

      <p v-if="result.estimateCents !== null" class="estimate" data-testid="estimate">
        <span>{{ t('bill.r.estimate') }}</span>
        <strong>{{ money(result.estimateCents) }}</strong>
        <span>{{ t('bill.r.insteadOf', { amount: money(result.remainingCents) }) }}</span>
        <span v-if="bill.medisaveCents" class="w-100">{{ t('bill.r.medisaveNote') }}</span>
      </p>
    </div>
  </section>
</template>

<style scoped src="../../styles/components/SubsidyResults.css"></style>
