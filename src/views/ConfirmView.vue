<!-- Owner: Asher. From the Claude Design Confirm screen: the user checks and corrects what was read before anything uses it. -->
<script setup>
import { computed, reactive, ref, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import { rememberMedicine } from '../stores/medicines'
import ConfirmField from '../components/scan/ConfirmField.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { DOSE_UNITS, TIMINGS, WITH_FOOD, FREQUENCY_TYPES } from '../../server/services/normalizeScan.js'

const { t } = useI18n()
const router = useRouter()

const scan = scanStore.current
if (!scan) router.replace({ name: 'scan' })
// Edit a copy so "Retake" leaves the store untouched.
const draft = reactive(scan ? structuredClone(toRaw(scan)) : {})
const photo = scanStore.photo
const showPhoto = ref(false)

const sum = (xs) => xs.reduce((total, x) => total + (x.amountCents ?? 0), 0)
const dollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2))
const toCents = (value) => (value === '' ? null : Math.round(Number(value) * 100))
const get = (path) => path.split('.').reduce((obj, key) => obj?.[key], draft)
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

// Same required fields as server/services/normalizeScan.js, so a field the user clears is flagged again.
const required = computed(() => {
  if (draft.type === 'medication') {
    const m = draft.medication
    return ['medication.name', 'medication.doseAmount', 'medication.frequencyType', ...(m.frequencyType === 'daily' ? ['medication.timesPerDay'] : [])]
  }
  const b = draft.bill
  return [
    ...b.items.flatMap((_, i) => [`bill.items.${i}.description`, `bill.items.${i}.amountCents`]),
    ...b.subsidies.map((_, i) => `bill.subsidies.${i}.amountCents`),
    'bill.medisaveCents',
    'bill.totalPayableCents',
  ]
})

// Contract invariant: items − subsidies − MediSave = total. If it doesn't add up, the total needs checking.
const totalMismatch = computed(
  () => draft.type === 'bill' && sum(draft.bill.items) - sum(draft.bill.subsidies) - (draft.bill.medisaveCents ?? 0) !== draft.bill.totalPayableCents,
)

const flagged = computed(() => {
  if (!scan) return []
  const empty = [...new Set([...draft.unclear, ...required.value])].filter((path) => isEmpty(get(path)))
  if (totalMismatch.value && !empty.includes('bill.totalPayableCents')) empty.push('bill.totalPayableCents')
  return empty
})
const needs = (path) => flagged.value.includes(path)

function toggleTiming(key) {
  const current = draft.medication.timing ?? []
  draft.medication.timing = TIMINGS.filter((k) => (k === key ? !current.includes(k) : current.includes(k)))
}

const warnings = computed({
  get: () => draft.medication.warnings.join('\n'),
  set: (text) => (draft.medication.warnings = text.split('\n').map((s) => s.trim()).filter(Boolean)),
})

function confirm() {
  if (draft.type === 'medication') {
    // Number inputs give '' when cleared; the contract uses null.
    for (const key of Object.keys(draft.medication)) if (draft.medication[key] === '') draft.medication[key] = null
    // Ask (the chatbot) answers about the medicines the user has checked.
    rememberMedicine(draft.medication, 'label', draft.source === 'sample')
  }
  scanStore.current = draft
  scanStore.confirmed = true
  router.push({ name: 'explain' })
}

const scanAgain = () => router.push({ name: 'scan', query: { type: draft.type } })
</script>

<template>
  <div v-if="scan" class="page">
    <ol class="steps" :aria-label="t('confirm.steps.label')">
      <li class="done"><AppIcon name="checkCircle" :size="18" />{{ t('confirm.steps.photo') }}</li>
      <li class="now" aria-current="step">{{ t('confirm.steps.check') }}</li>
      <li>{{ t('confirm.steps.explain') }}</li>
    </ol>
    <div class="d-flex align-items-start gap-3">
      <button type="button" class="back" :aria-label="t('nav.back')" @click="scanAgain"></button>
      <div class="page-head">
        <h1>{{ t(`confirm.title.${draft.type}`) }}</h1>
        <p class="lead-text">{{ t(`confirm.lead.${draft.type}`) }}</p>
      </div>
    </div>

    <div class="row g-4">
      <div v-if="photo" class="col-lg-5">
        <div class="d-lg-none card d-flex flex-column gap-3">
          <div class="d-flex align-items-center gap-3">
            <img :src="photo" alt="" class="thumb" />
            <span class="fw-bold flex-grow-1">{{ t('confirm.yourPhoto') }}</span>
            <button type="button" class="btn btn-outline btn-sm" :aria-expanded="showPhoto" @click="showPhoto = !showPhoto">
              {{ showPhoto ? t('confirm.hidePhoto') : t('confirm.showPhoto') }}
            </button>
          </div>
          <img v-if="showPhoto" :src="photo" :alt="t('confirm.yourPhoto')" class="photo" />
        </div>
        <img :src="photo" :alt="t('confirm.yourPhoto')" class="photo stick d-none d-lg-block" />
      </div>

      <div :class="photo ? 'col-lg-7' : 'col-lg-9'" class="d-flex flex-column gap-4">
        <!-- Always rendered so screen readers announce the switch to green when the last field is fixed. -->
        <div role="status">
          <div v-if="flagged.length" class="alert alert-warning"><AppIcon name="alert" />{{ t('confirm.needsCheck', flagged.length) }}</div>
          <div v-else class="alert alert-success" data-testid="all-filled"><AppIcon name="checkCircle" />{{ t('confirm.allFilled', { ok: t('confirm.ok') }) }}</div>
        </div>

        <!-- Medication -->
        <div v-if="draft.type === 'medication'" class="card fgrid">
          <ConfirmField :label="t('confirm.med.name')" for="f-name" :flagged="needs('medication.name')">
            <input id="f-name" v-model.trim="draft.medication.name" class="field-input" :class="{ 'is-flagged': needs('medication.name') }" />
          </ConfirmField>
          <ConfirmField :label="t('confirm.med.strength')" for="f-strength">
            <input id="f-strength" v-model.trim="draft.medication.strength" class="field-input" />
          </ConfirmField>

          <ConfirmField :label="t('confirm.med.amount')" for="f-amount" :flagged="needs('medication.doseAmount')">
            <div class="d-flex gap-2">
              <input id="f-amount" v-model.number="draft.medication.doseAmount" type="number" inputmode="decimal" min="0" step="0.5" class="field-input amount" :class="{ 'is-flagged': needs('medication.doseAmount') }" />
              <select v-model="draft.medication.doseUnit" class="field-input" :aria-label="t('confirm.med.unit')">
                <option :value="null">–</option>
                <option v-for="unit in DOSE_UNITS" :key="unit" :value="unit">{{ t(`unit.${unit}`, 2) }}</option>
              </select>
            </div>
          </ConfirmField>
          <ConfirmField :label="t('confirm.med.howOften')" for="f-freq" :flagged="needs('medication.frequencyType')">
            <select id="f-freq" v-model="draft.medication.frequencyType" class="field-input" :class="{ 'is-flagged': needs('medication.frequencyType') }">
              <option :value="null">–</option>
              <option v-for="freq in FREQUENCY_TYPES" :key="freq" :value="freq">{{ t(`freq.${freq}`) }}</option>
            </select>
          </ConfirmField>

          <template v-if="draft.medication.frequencyType === 'daily'">
            <ConfirmField class="span2" :label="t('confirm.med.times')" for="f-times" :flagged="needs('medication.timesPerDay')">
              <input id="f-times" v-model.number="draft.medication.timesPerDay" type="number" inputmode="numeric" min="1" max="6" class="field-input amount" :class="{ 'is-flagged': needs('medication.timesPerDay') }" />
            </ConfirmField>
            <ConfirmField class="span2" :label="t('confirm.med.when')" :flagged="needs('medication.timing')">
              <div class="d-flex flex-wrap gap-2">
                <button v-for="key in TIMINGS" :key="key" type="button" class="choice" :aria-pressed="draft.medication.timing?.includes(key) ?? false" @click="toggleTiming(key)">
                  <AppIcon v-if="draft.medication.timing?.includes(key)" name="check" :size="18" :stroke="2.5" />{{ t(`timing.${key}`) }}
                </button>
              </div>
            </ConfirmField>
          </template>

          <ConfirmField class="span2" :label="t('confirm.med.food')" :flagged="needs('medication.withFood')">
            <div class="d-flex flex-wrap gap-2">
              <button v-for="key in WITH_FOOD" :key="key" type="button" class="choice" :aria-pressed="draft.medication.withFood === key" @click="draft.medication.withFood = key">
                {{ t(`food.${key}`) }}
              </button>
            </div>
          </ConfirmField>

          <ConfirmField class="span2" :label="t('confirm.med.other')" for="f-other">
            <textarea id="f-other" v-model.lazy="warnings" rows="2" class="field-input"></textarea>
          </ConfirmField>
        </div>

        <!-- Bill -->
        <div v-else class="card d-flex flex-column gap-3">
          <div v-if="draft.bill.clinic" class="d-flex align-items-center gap-3"><span class="tile tile-soft"><AppIcon name="receipt" :size="22" /></span><strong>{{ draft.bill.clinic }}</strong></div>
          <div class="bill-grid">
            <span class="fw-bold">{{ t('confirm.bill.item') }}</span>
            <span class="fw-bold">{{ t('confirm.bill.amount') }}</span>
            <template v-for="(item, i) in draft.bill.items" :key="`i${i}`">
              <input v-model.trim="item.description" class="field-input" :class="{ 'is-flagged': needs(`bill.items.${i}.description`) }" :aria-label="t('confirm.bill.itemN', { n: i + 1 })" />
              <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs(`bill.items.${i}.amountCents`) }" :value="dollars(item.amountCents)" :aria-label="t('confirm.bill.amountOf', { item: item.description ?? i + 1 })" @change="item.amountCents = toCents($event.target.value)" />
              <span v-if="needs(`bill.items.${i}.description`) || needs(`bill.items.${i}.amountCents`)" class="span2 note">{{ t('confirm.bill.smudged') }}</span>
            </template>

            <template v-for="(subsidy, i) in draft.bill.subsidies" :key="`s${i}`">
              <span class="row-label">{{ t(`scheme.${subsidy.scheme}`) }}</span>
              <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs(`bill.subsidies.${i}.amountCents`) }" :value="dollars(subsidy.amountCents)" :aria-label="t(`scheme.${subsidy.scheme}`)" @change="subsidy.amountCents = toCents($event.target.value)" />
            </template>

            <span class="row-label">{{ t('confirm.bill.medisave') }}</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs('bill.medisaveCents') }" :value="dollars(draft.bill.medisaveCents)" :aria-label="t('confirm.bill.medisave')" @change="draft.bill.medisaveCents = toCents($event.target.value)" />

            <label for="f-total" class="row-label total">{{ t('confirm.bill.total') }}</label>
            <input id="f-total" type="number" inputmode="decimal" min="0" step="0.01" class="field-input total" :class="{ 'is-flagged': needs('bill.totalPayableCents') }" :value="dollars(draft.bill.totalPayableCents)" @change="draft.bill.totalPayableCents = toCents($event.target.value)" />
            <span v-if="needs('bill.totalPayableCents')" class="span2 note">{{ totalMismatch ? t('confirm.bill.mismatch') : t('confirm.bill.smudged') }}</span>
          </div>
        </div>

        <div class="d-flex flex-column gap-2">
          <div class="acts">
            <button type="button" class="btn btn-primary ok" :disabled="flagged.length > 0" :aria-describedby="flagged.length ? 'ok-reason' : null" @click="confirm">{{ t('confirm.ok') }}<AppIcon name="right" /></button>
            <button type="button" class="btn btn-ghost" @click="scanAgain"><AppIcon name="camera" :size="22" />{{ photo ? t('confirm.retake') : t('confirm.scanOther') }}</button>
          </div>
          <span v-if="flagged.length" id="ok-reason" class="text-muted-a11y">{{ t('confirm.okDisabled') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ConfirmView.css"></style>
