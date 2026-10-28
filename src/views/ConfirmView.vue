<!-- Owner: Asher. From the Claude Design Confirm screen: the user checks and corrects what was read before anything uses it. -->
<script setup>
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { scanStore } from '../stores/scan'
import { rememberMedicine, replaceMedicine } from '../stores/medicines'
import ConfirmField from '../components/scan/ConfirmField.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { DOSE_UNITS, TIMINGS, WITH_FOOD, FREQUENCY_TYPES } from '../../server/services/normalizeScan.js'
import { billGap, linesTotal, sectionsOff } from '../rules/billCheck'
import { money } from '../components/bill/lines'

const { t } = useI18n()
const router = useRouter()

const scan = scanStore.current
if (!scan) router.replace({ name: 'scan' })
// Edit a copy so "Retake" leaves the store untouched.
const draft = reactive(scan ? structuredClone(toRaw(scan)) : {})
const photo = scanStore.photo
const showPhoto = ref(false)
// Lokesh: "Fix what we read" on Schedule opens a saved medicine here (no photo). Looks correct replaces that medicine and
// goes back to Schedule, keeping its days, ticks and calendar reminders. `savedId` lives on the scan, so a new scan clears it.
const fixing = Boolean(scan?.savedId)

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

// Lines that don't add up to the total (one misread digit is enough) don't stop anyone: the total is copied from the bill.
// A note says how far off they are and which printed subtotal they miss, so a careful reader knows where to look.
const gap = computed(() => (draft.type === 'bill' && !needs('bill.totalPayableCents') ? billGap(draft.bill) : null))
const offSections = computed(() => (gap.value ? sectionsOff(draft.bill) : []))
const offLine = (item) => offSections.value.some((s) => s.section.toLowerCase() === (item.section ?? '').trim().toLowerCase())

// H5: values that can't be right (a dose of 0, 20 times a day, 3 times a day with 1 time ticked) are flagged too.
const invalid = computed(() => {
  const bad = {}
  if (draft.type !== 'medication') return bad
  const m = draft.medication
  if (typeof m.doseAmount === 'number' && !(m.doseAmount > 0 && m.doseAmount <= 100)) bad['medication.doseAmount'] = t('confirm.bad.amount')
  const times = m.timesPerDay
  const timesOk = Number.isInteger(times) && times >= 1 && times <= 6
  if (m.frequencyType === 'daily' && typeof times === 'number' && !timesOk) bad['medication.timesPerDay'] = t('confirm.bad.times')
  const ticked = m.timing?.length ?? 0
  if (m.frequencyType === 'daily' && timesOk && ticked && ticked !== times) bad['medication.timing'] = t('confirm.bad.timing', { ticked, times }, ticked)
  return bad
})

const flagged = computed(() => {
  if (!scan) return []
  const empty = [...new Set([...draft.unclear, ...required.value])].filter((path) => isEmpty(get(path)))
  for (const path of Object.keys(invalid.value)) if (!empty.includes(path)) empty.push(path)
  return empty
})
const needs = (path) => flagged.value.includes(path)
// Why a field is flagged when it isn't simply empty (H5): the message says what to fix. null = the usual "We couldn't read this".
const problem = (path) => invalid.value[path] ?? null

// H6: on phones the photo is folded away; open it when something needs checking against it.
showPhoto.value = flagged.value.length > 0

// H3/H5: leaving with corrections (Back, Retake, a tab, the browser's Back) asks first instead of silently losing them.
const original = JSON.stringify(scan ?? {})
const changed = () => JSON.stringify(toRaw(draft)) !== original
const askDiscard = ref(false)
let leaveTo = null
let done = false
onBeforeRouteLeave((to) => {
  if (done || leaveTo || !changed()) return true
  leaveTo = to
  askDiscard.value = true
  return false
})
// The guard lets `leaveTo` through now that it's set.
const discard = () => router.push(leaveTo)
const discardBox = ref(null)
watch(askDiscard, async (open) => {
  if (!open) return
  await nextTick()
  discardBox.value?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  discardBox.value?.querySelector('button')?.focus({ preventScroll: true })
})
function keepChecking() {
  leaveTo = null
  askDiscard.value = false
}

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
    if (fixing) {
      replaceMedicine(draft.savedId, draft.medication)
      done = true
      return router.push({ name: 'schedule', query: { view: 'meds' }, state: { fixedId: draft.savedId } }) // back to its Change button
    }
    // Ask (the chatbot) answers about the medicines the user has checked.
    rememberMedicine(draft.medication, 'label', draft.source === 'sample')
  }
  scanStore.current = draft
  scanStore.confirmed = true
  done = true
  router.push({ name: 'explain' })
}

// Cancelling a fix returns to My medicines, where it was opened from.
const scanAgain = () => router.push(fixing ? { name: 'schedule', query: { view: 'meds' } } : { name: draft.type === 'bill' ? 'bill-scan' : 'scan' })
</script>

<template>
  <div v-if="scan" class="page">
    <ol v-if="!fixing" class="steps" :aria-label="t('confirm.steps.label')">
      <li class="done"><AppIcon name="checkCircle" :size="18" />{{ t('confirm.steps.photo') }}</li>
      <li class="now" aria-current="step">{{ t('confirm.steps.check') }}</li>
      <li>{{ t('confirm.steps.explain') }}</li>
    </ol>
    <div class="d-flex align-items-start gap-3">
      <button type="button" class="back" :aria-label="t('nav.back')" @click="scanAgain"></button>
      <div class="page-head">
        <h1>{{ t(`confirm.title.${draft.type}`) }}</h1>
        <p class="lead-text">{{ fixing ? t('schedule.fix.lead') : t(`confirm.lead.${draft.type}`) }}</p>
      </div>
    </div>

    <div v-if="askDiscard" ref="discardBox" class="alert alert-warning flex-column" role="alertdialog" aria-labelledby="discard-q" aria-describedby="discard-text" data-testid="confirm-discard">
      <strong id="discard-q">{{ t('confirm.discard.title') }}</strong>
      <span id="discard-text">{{ t('confirm.discard.text') }}</span>
      <div class="d-flex flex-column flex-sm-row gap-3">
        <button type="button" class="btn btn-primary" data-testid="confirm-keep" @click="keepChecking">{{ t('confirm.discard.keep') }}</button>
        <button type="button" class="btn btn-secondary" data-testid="confirm-discard-yes" @click="discard">{{ t('confirm.discard.yes') }}</button>
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

        <!-- Fixing a saved medicine: the label's own words stay in view, so "How to take it" is changed against the label,
             never just to get reminders for a "when needed" medicine. -->
        <p v-if="fixing && draft.medication.rawInstruction" class="alert alert-note m-0" data-testid="confirm-label-says">
          <AppIcon name="info" /><span :lang="draft.source === 'typed' ? null : 'en'">{{ t('explain.med.labelSays', { text: draft.medication.rawInstruction }) }}</span>
        </p>

        <!-- Medication -->
        <div v-if="draft.type === 'medication'" class="card fgrid">
          <ConfirmField :label="t('confirm.med.name')" for="f-name" :flagged="needs('medication.name')">
            <input id="f-name" v-model.trim="draft.medication.name" class="field-input" :class="{ 'is-flagged': needs('medication.name') }" />
          </ConfirmField>
          <ConfirmField :label="t('confirm.med.strength')" for="f-strength">
            <input id="f-strength" v-model.trim="draft.medication.strength" class="field-input" />
          </ConfirmField>

          <ConfirmField :label="t('confirm.med.amount')" for="f-amount" :flagged="needs('medication.doseAmount')" :note="problem('medication.doseAmount')">
            <div class="d-flex gap-2">
              <input id="f-amount" v-model.number="draft.medication.doseAmount" type="number" inputmode="decimal" min="0" step="0.5" class="field-input amount" :class="{ 'is-flagged': needs('medication.doseAmount') }" />
              <select v-model="draft.medication.doseUnit" class="field-input" :aria-label="t('confirm.med.unit')">
                <option :value="null">–</option>
                <option v-for="unit in DOSE_UNITS" :key="unit" :value="unit">{{ t(`unit.${unit}`, 2) }}</option>
              </select>
            </div>
          </ConfirmField>
          <!-- Optional: how much was given. With the dose and times a day, Schedule works out how many days it lasts. -->
          <ConfirmField :label="t('confirm.med.quantity')" for="f-qty">
            <div class="d-flex align-items-center gap-2">
              <input id="f-qty" type="number" inputmode="decimal" min="0" step="1" class="field-input amount" :value="draft.medication.quantity ?? ''" aria-describedby="f-qty-help" @change="draft.medication.quantity = Number($event.target.value) > 0 ? Number($event.target.value) : null" />
              <span class="fw-semibold">{{ t(`unit.${draft.medication.doseUnit ?? 'other'}`, 2) }}</span>
            </div>
            <span id="f-qty-help" class="field-help">{{ t('confirm.med.quantityHelp') }}</span>
          </ConfirmField>
          <ConfirmField :label="t('confirm.med.howOften')" for="f-freq" :flagged="needs('medication.frequencyType')">
            <select id="f-freq" v-model="draft.medication.frequencyType" class="field-input" :class="{ 'is-flagged': needs('medication.frequencyType') }">
              <option :value="null">–</option>
              <option v-for="freq in FREQUENCY_TYPES" :key="freq" :value="freq">{{ t(`freq.${freq}`) }}</option>
            </select>
          </ConfirmField>

          <template v-if="draft.medication.frequencyType === 'daily'">
            <ConfirmField class="span2" :label="t('confirm.med.times')" for="f-times" :flagged="needs('medication.timesPerDay')" :note="problem('medication.timesPerDay')">
              <input id="f-times" v-model.number="draft.medication.timesPerDay" type="number" inputmode="numeric" min="1" max="6" class="field-input amount" :class="{ 'is-flagged': needs('medication.timesPerDay') }" />
            </ConfirmField>
            <ConfirmField class="span2" :label="t('confirm.med.when')" :flagged="needs('medication.timing')" :note="problem('medication.timing')">
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
              <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs(`bill.items.${i}.amountCents`), 'is-check': offLine(item) }" :value="dollars(item.amountCents)" :aria-label="t('confirm.bill.amountOf', { item: item.description ?? i + 1 })" @change="item.amountCents = toCents($event.target.value)" />
              <span v-if="needs(`bill.items.${i}.description`) || needs(`bill.items.${i}.amountCents`)" class="span2 note">{{ t('confirm.bill.smudged') }}</span>
            </template>

            <template v-for="(subsidy, i) in draft.bill.subsidies" :key="`s${i}`">
              <span class="row-label">{{ t(`scheme.${subsidy.scheme}`) }}<small v-if="subsidy.includedInItems" class="d-block text-muted-a11y">{{ t('bill.inLines') }}</small></span>
              <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs(`bill.subsidies.${i}.amountCents`) }" :value="dollars(subsidy.amountCents)" :aria-label="t(`scheme.${subsidy.scheme}`)" @change="subsidy.amountCents = toCents($event.target.value)" />
            </template>

            <span class="row-label">{{ t('confirm.bill.medisave') }}</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" class="field-input" :class="{ 'is-flagged': needs('bill.medisaveCents') }" :value="dollars(draft.bill.medisaveCents)" :aria-label="t('confirm.bill.medisave')" @change="draft.bill.medisaveCents = toCents($event.target.value)" />

            <label for="f-total" class="row-label total">{{ t('confirm.bill.total') }}</label>
            <input id="f-total" type="number" inputmode="decimal" min="0" step="0.01" class="field-input total" :class="{ 'is-flagged': needs('bill.totalPayableCents') }" :value="dollars(draft.bill.totalPayableCents)" @change="draft.bill.totalPayableCents = toCents($event.target.value)" />
            <span v-if="needs('bill.totalPayableCents')" class="span2 note">{{ t('confirm.bill.smudged') }}</span>
            <p v-else-if="gap" class="span2 gap-note m-0" data-testid="confirm-gap">
              <AppIcon name="info" :size="22" />
              <span>
                {{ t('confirm.bill.gap', { lines: money(linesTotal(draft.bill)), total: money(draft.bill.totalPayableCents) }) }}
                <template v-for="s in offSections" :key="s.section"> {{ t('confirm.bill.gapWhere', { section: s.section, printed: money(s.printedCents) }) }}</template>
              </span>
            </p>
          </div>
        </div>

        <div class="d-flex flex-column gap-2">
          <div class="acts">
            <button type="button" class="btn btn-primary ok" :disabled="flagged.length > 0" :aria-describedby="flagged.length ? 'ok-reason' : null" @click="confirm">{{ t('confirm.ok') }}<AppIcon name="right" /></button>
            <button v-if="fixing" type="button" class="btn btn-ghost" @click="scanAgain">{{ t('schedule.fix.cancel') }}</button>
            <button v-else type="button" class="btn btn-ghost" @click="scanAgain"><AppIcon name="camera" :size="22" />{{ photo ? t('confirm.retake') : t('confirm.scanOther') }}</button>
          </div>
          <span v-if="flagged.length" id="ok-reason" class="text-muted-a11y">{{ t('confirm.okDisabled') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ConfirmView.css"></style>
