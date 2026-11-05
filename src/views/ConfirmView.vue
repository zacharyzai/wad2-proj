<!-- From the Claude Design Confirm screen: the user checks and corrects what was read before anything uses it. -->
<script setup>
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useScanStore } from '../stores/scan'
import { useAuthStore } from '../stores/auth'
import { saveScan } from '../api/client'
import { useMedicinesStore } from '../stores/medicines'
import ConfirmField from '../components/scan/ConfirmField.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
import {
  DOSE_UNITS,
  TIMINGS,
  WITH_FOOD,
  FREQUENCY_TYPES,
  PURPOSES,
} from '../../server/services/normalizeScan.js'
import { billGap, linesTotal, sectionsOff } from '../rules/billCheck'
import { money } from '../components/bill/lines'
const scanStore = useScanStore()
const authStore = useAuthStore()
const { rememberMedicine, replaceMedicine, savedMedicine } = useMedicinesStore()

const { t } = useI18n()
const router = useRouter()

const scan = scanStore.current
if (!scan) router.replace({ name: 'scan' })
// Edit a copy so "Retake" leaves the store untouched.
const draft = reactive(scan ? structuredClone(toRaw(scan)) : {})
// The covered photo, or each page of a long bill; the first stands for them all where there is room for one.
const photos = scanStore.photos
const photo = photos[0] ?? null
// Alt text for a photo, numbered when the bill has several pages.
const pageAlt = (i) =>
  photos.length > 1
    ? t('confirm.pageAlt', { n: i + 1, total: photos.length })
    : t('confirm.yourPhoto')
const showPhoto = ref(false)
// Lokesh: "Fix what we read" on Schedule opens a saved medicine here (no photo). Looks correct replaces that medicine and
// goes back to Schedule, keeping its days, ticks and calendar reminders. `savedId` lives on the scan, so a new scan clears it.
const fixing = Boolean(scan?.savedId)

// Cents as a dollar amount for a form field.
// toCents is the way back; get reads a value by dotted path and isEmpty tells whether a field is blank.
const dollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2))
const toCents = (value) => (value === '' ? null : Math.round(Number(value) * 100))
const get = (path) => path.split('.').reduce((obj, key) => obj?.[key], draft)
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

// Same required fields as server/services/normalizeScan.js, so a field the user clears is flagged again.
const required = computed(() => {
  if (draft.type === 'medication') {
    const m = draft.medication
    return [
      'medication.name',
      'medication.doseAmount',
      'medication.frequencyType',
      ...(m.frequencyType === 'daily' ? ['medication.timesPerDay'] : []),
    ]
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
const gap = computed(() =>
  draft.type === 'bill' && !needs('bill.totalPayableCents') ? billGap(draft.bill) : null,
)
const offSections = computed(() => (gap.value ? sectionsOff(draft.bill) : []))
// True when a bill line sits under a printed subtotal that the lines do not add up to.
const offLine = (item) =>
  offSections.value.some(
    (s) => s.section.toLowerCase() === (item.section ?? '').trim().toLowerCase(),
  )

// H5: values that can't be right (a dose of 0, 20 times a day, 3 times a day with 1 time ticked) are flagged too.
const invalid = computed(() => {
  const bad = {}
  if (draft.type !== 'medication') return bad
  const m = draft.medication
  if (typeof m.doseAmount === 'number' && !(m.doseAmount > 0 && m.doseAmount <= 100))
    bad['medication.doseAmount'] = t('confirm.bad.amount')
  const times = m.timesPerDay
  const timesOk = Number.isInteger(times) && times >= 1 && times <= 6
  if (m.frequencyType === 'daily' && typeof times === 'number' && !timesOk)
    bad['medication.timesPerDay'] = t('confirm.bad.times')
  const ticked = m.timing?.length ?? 0
  if (m.frequencyType === 'daily' && timesOk && ticked && ticked !== times)
    bad['medication.timing'] = t('confirm.bad.timing', { ticked, times }, ticked)
  return bad
})

const flagged = computed(() => {
  if (!scan) return []
  const empty = [...new Set([...draft.unclear, ...required.value])].filter((path) =>
    isEmpty(get(path)),
  )
  for (const path of Object.keys(invalid.value)) if (!empty.includes(path)) empty.push(path)
  return empty
})
// True when the scan flagged this field as unclear or missing.
const needs = (path) => flagged.value.includes(path)

// A long bill (more than FOLD_AT items, often 30+ over several pages): only the lines that need checking are open, i.e.
// hard to read, or under a printed subtotal they don't add up to. The rest sit behind one button and are still saved.
// Decided when the page opens, so a line never folds away under the person's finger. Lines that don't add up with no
// subtotal to point at: every line opens, since the misread amount could be any of them.
const FOLD_AT = 6
const billItems = draft.type === 'bill' ? draft.bill.items : []
// True when a bill line is hard to read or does not add up with its subtotal.
const lineNeeds = (i) =>
  needs(`bill.items.${i}.description`) ||
  needs(`bill.items.${i}.amountCents`) ||
  offLine(billItems[i])
const checkAtStart = new Set(billItems.flatMap((_, i) => (lineNeeds(i) ? [i] : [])))
// A line with no amount yet also makes it not add up (it counts as 0), but that line is open already: not a blind gap.
const blindGap = computed(
  () =>
    Boolean(gap.value) &&
    !offSections.value.length &&
    !billItems.some((item) => item.amountCents == null),
)
const allLines = ref(billItems.length <= FOLD_AT || blindGap.value)
watch(blindGap, (blind) => blind && (allLines.value = true)) // a gap that appears while typing: open them all, never fold
// Whether a bill line is open: needs checking, or the user opened them all.
const lineShown = (i) => allLines.value || checkAtStart.has(i) || lineNeeds(i)
const fineLines = computed(
  () => billItems.filter((_, i) => !checkAtStart.has(i) && !lineNeeds(i)).length,
)

// Keep the form short: purpose, quantity, when, food and notes only show when the label gave something for them (or one
// needs checking). "Add more details" shows the rest, so nothing can't be added by hand. Decided once, when the page opens,
// so clearing a field doesn't make it vanish under the person's finger.
const more = ref(false)
const OPTIONAL = [
  'medication.purpose',
  'medication.quantity',
  'medication.timing',
  'medication.withFood',
  'medication.warnings',
]
const filledAtStart =
  draft.type === 'medication' ? new Set(OPTIONAL.filter((path) => !isEmpty(get(path)))) : new Set()
// A field the person typed into stays when they tap "Show fewer details"; only empty ones fold away.
const showOptional = (path) =>
  more.value || filledAtStart.has(path) || needs(path) || !isEmpty(get(path))
// Anything that is empty and was not on the label: the button has something to show or fold away.
const foldable = computed(
  () =>
    draft.type === 'medication' &&
    OPTIONAL.some(
      (path) =>
        !filledAtStart.has(path) &&
        !needs(path) &&
        (more.value || isEmpty(get(path))) &&
        (path !== 'medication.timing' || draft.medication.frequencyType === 'daily'),
    ),
)
// Why a field is flagged when it isn't simply empty (H5): the message says what to fix. null = the usual "We couldn't read this".
const problem = (path) => invalid.value[path] ?? null

// H6: on phones the photo is folded away; open it when something needs checking against it.
showPhoto.value = flagged.value.length > 0

// H3/H5: leaving with corrections (Back, Retake, a tab, the browser's Back) asks first instead of silently losing them.
const original = JSON.stringify(scan ?? {})
// True when the user has edited anything since the page opened.
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
// Scrolls a box into the middle of the screen once it appears.
async function showBox(box) {
  await nextTick()
  box.value?.scrollIntoView({
    block: 'center',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
  box.value?.querySelector('button')?.focus({ preventScroll: true })
}
watch(askDiscard, (open) => open && showBox(discardBox))
// The same medicine is already on the list: ask before this label replaces it.
const duplicate = ref(null)
const duplicateBox = ref(null)
watch(duplicate, (entry) => entry && showBox(duplicateBox))
// Cancels leaving the page, so the user can carry on checking.
function keepChecking() {
  leaveTo = null
  askDiscard.value = false
}

// Adds or removes one time of day (morning, noon…) from the medicine's timing.
function toggleTiming(key) {
  const current = draft.medication.timing ?? []
  draft.medication.timing = TIMINGS.filter((k) =>
    k === key ? !current.includes(k) : current.includes(k),
  )
}

const warnings = computed({
  get: () => draft.medication.warnings.join('\n'),
  set: (text) =>
    (draft.medication.warnings = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)),
})

// Confirms the checked scan: adds the medicine to the user's list (or updates it on a re-check, asking first about a duplicate),
// saves the scan to History when logged in, then goes on to Explain.
function confirm(sure = false) {
  if (draft.type === 'medication') {
    // Number inputs give '' when cleared; the contract uses null.
    for (const key of Object.keys(draft.medication))
      if (draft.medication[key] === '') draft.medication[key] = null
    if (fixing) {
      replaceMedicine(draft.savedId, draft.medication)
      done = true
      return router.push({
        name: 'schedule',
        query: { view: 'meds' },
        state: { fixedId: draft.savedId },
      }) // back to its Change button
    }
    // Back from Explain: this scan's own medicine, not a second one. `addedId` lives on the scan, so a new scan clears it.
    if (draft.addedId) replaceMedicine(draft.addedId, draft.medication)
    else {
      if (!sure && (duplicate.value = savedMedicine(draft.medication) ?? null)) return
      // Ask (the chatbot) answers about the medicines the user has checked.
      draft.addedId = rememberMedicine(draft.medication, 'label', draft.source === 'sample')
    }
  }
  // Logged in: the checked scan goes to History too (contract fields only, never the photo), once unless it was changed. Not
  // waited for: a failed save must not stop the explanation, and History simply won't list this one.
  const checked = JSON.stringify(draft[draft.type])
  if (authStore.user && draft.savedCopy !== checked) {
    draft.savedCopy = checked
    saveScan({
      type: draft.type,
      source: draft.source,
      unclear: [],
      [draft.type]: draft[draft.type],
    })
  }
  scanStore.current = draft
  scanStore.confirmed = true
  done = true
  router.push({ name: 'explain' })
}

// Cancelling a fix returns to My medicines, where it was opened from.
const scanAgain = () =>
  router.push(
    fixing
      ? { name: 'schedule', query: { view: 'meds' } }
      : draft.type === 'bill'
        ? { name: 'scan', hash: '#bill' }
        : { name: 'scan', query: { type: 'medication' } },
  )
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
        <p class="lead-text">
          {{ fixing ? t('schedule.fix.lead') : t(`confirm.lead.${draft.type}`) }}
        </p>
      </div>
    </div>

    <div
      v-if="askDiscard"
      ref="discardBox"
      class="alert alert-warning flex-column"
      role="alertdialog"
      aria-labelledby="discard-q"
      aria-describedby="discard-text"
      data-testid="confirm-discard"
    >
      <strong id="discard-q">{{ t('confirm.discard.title') }}</strong>
      <span id="discard-text">{{ t('confirm.discard.text') }}</span>
      <div class="d-flex flex-column flex-sm-row gap-3">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="confirm-keep"
          @click="keepChecking"
        >
          {{ t('confirm.discard.keep') }}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="confirm-discard-yes"
          @click="discard"
        >
          {{ t('confirm.discard.yes') }}
        </button>
      </div>
    </div>

    <div class="row g-4">
      <div v-if="photo" class="col-lg-5">
        <p v-if="scanStore.pdfPages?.total > 1" class="small mb-2" data-testid="pdf-pages">
          {{
            t(
              scanStore.pdfPages.read < scanStore.pdfPages.total
                ? 'confirm.pagesSome'
                : 'confirm.pagesAll',
              scanStore.pdfPages,
            )
          }}
        </p>
        <div class="d-lg-none card d-flex flex-column gap-3">
          <div class="d-flex align-items-center gap-3">
            <img :src="photo" alt="" class="thumb" />
            <span class="fw-bold flex-grow-1">{{
              photos.length > 1
                ? t('confirm.yourPages', { n: photos.length })
                : t('confirm.yourPhoto')
            }}</span>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :aria-expanded="showPhoto"
              @click="showPhoto = !showPhoto"
            >
              {{ showPhoto ? t('confirm.hidePhoto') : t('confirm.showPhoto') }}
            </button>
          </div>
          <template v-if="showPhoto"
            ><img v-for="(src, i) in photos" :key="i" :src="src" :alt="pageAlt(i)" class="photo"
          /></template>
        </div>
        <img
          v-if="photos.length === 1"
          :src="photo"
          :alt="t('confirm.yourPhoto')"
          class="photo stick d-none d-lg-block"
        />
        <!-- Several pages scroll on their own beside the fields, so every page can be checked against them. -->
        <div v-else class="pages stick d-none d-lg-flex" data-testid="confirm-pages">
          <img v-for="(src, i) in photos" :key="i" :src="src" :alt="pageAlt(i)" class="photo" />
        </div>
      </div>

      <div :class="photo ? 'col-lg-7' : 'col-lg-9'" class="d-flex flex-column gap-4">
        <!-- Always rendered so screen readers announce the switch to green when the last field is fixed. -->
        <div role="status">
          <div v-if="flagged.length" class="alert alert-warning">
            <AppIcon name="alert" />{{ t('confirm.needsCheck', flagged.length) }}
          </div>
          <div v-else class="alert alert-success" data-testid="all-filled">
            <AppIcon name="checkCircle" />{{ t('confirm.allFilled', { ok: t('confirm.ok') }) }}
          </div>
        </div>

        <!-- Fixing a saved medicine: the label's own words stay in view, so "How to take it" is changed against the label,
             never just to get reminders for a "when needed" medicine. -->
        <p
          v-if="fixing && draft.medication.rawInstruction"
          class="alert alert-note m-0"
          data-testid="confirm-label-says"
        >
          <AppIcon name="info" /><span :lang="draft.source === 'typed' ? null : 'en'">{{
            t('explain.med.labelSays', { text: draft.medication.rawInstruction })
          }}</span>
        </p>

        <!-- Medication -->
        <div v-if="draft.type === 'medication'" class="card fgrid">
          <ConfirmField
            class="span2"
            :label="t('confirm.med.name')"
            for="f-name"
            :flagged="needs('medication.name')"
          >
            <input
              id="f-name"
              v-model.trim="draft.medication.name"
              class="field-input"
              :class="{ 'is-flagged': needs('medication.name') }"
            />
          </ConfirmField>
          <!-- What it is usually for: the AI only picks from our list, and only when sure. Shown to the senior as our own words. -->
          <ConfirmField
            v-if="showOptional('medication.purpose')"
            class="span2"
            :label="t('confirm.med.purpose')"
            for="f-purpose"
          >
            <select
              id="f-purpose"
              v-model="draft.medication.purpose"
              class="field-input"
              data-testid="confirm-purpose"
            >
              <option :value="null">–</option>
              <option v-for="p in PURPOSES" :key="p" :value="p">{{ t(`purpose.${p}`) }}</option>
            </select>
          </ConfirmField>

          <ConfirmField
            class="span2"
            :label="t('confirm.med.amount')"
            for="f-amount"
            :flagged="needs('medication.doseAmount')"
            :note="problem('medication.doseAmount')"
          >
            <div class="d-flex gap-2">
              <input
                id="f-amount"
                v-model.number="draft.medication.doseAmount"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.5"
                class="field-input amount"
                :class="{ 'is-flagged': needs('medication.doseAmount') }"
              />
              <select
                v-model="draft.medication.doseUnit"
                class="field-input"
                :aria-label="t('confirm.med.unit')"
              >
                <option :value="null">–</option>
                <option v-for="unit in DOSE_UNITS" :key="unit" :value="unit">
                  {{ t(`unit.${unit}`, 2) }}
                </option>
              </select>
            </div>
          </ConfirmField>
          <!-- Optional: how much was given. With the dose and times a day, Schedule works out how many days it lasts. -->
          <ConfirmField
            v-if="showOptional('medication.quantity')"
            :label="t('confirm.med.quantity')"
            for="f-qty"
            :help="t('confirm.med.quantityHelp')"
          >
            <div class="d-flex align-items-center gap-2">
              <input
                id="f-qty"
                type="number"
                inputmode="decimal"
                min="0"
                step="1"
                class="field-input amount"
                :value="draft.medication.quantity ?? ''"
                aria-describedby="f-qty-help"
                @change="
                  draft.medication.quantity =
                    Number($event.target.value) > 0 ? Number($event.target.value) : null
                "
              />
              <span class="fw-semibold">{{
                t(`unit.${draft.medication.doseUnit ?? 'other'}`, 2)
              }}</span>
            </div>
          </ConfirmField>
          <ConfirmField
            :label="t('confirm.med.howOften')"
            for="f-freq"
            :flagged="needs('medication.frequencyType')"
          >
            <select
              id="f-freq"
              v-model="draft.medication.frequencyType"
              class="field-input"
              :class="{ 'is-flagged': needs('medication.frequencyType') }"
            >
              <option :value="null">–</option>
              <option v-for="freq in FREQUENCY_TYPES" :key="freq" :value="freq">
                {{ t(`freq.${freq}`) }}
              </option>
            </select>
          </ConfirmField>

          <template v-if="draft.medication.frequencyType === 'daily'">
            <ConfirmField
              class="span2"
              :label="t('confirm.med.times')"
              for="f-times"
              :flagged="needs('medication.timesPerDay')"
              :note="problem('medication.timesPerDay')"
            >
              <input
                id="f-times"
                v-model.number="draft.medication.timesPerDay"
                type="number"
                inputmode="numeric"
                min="1"
                max="6"
                class="field-input amount"
                :class="{ 'is-flagged': needs('medication.timesPerDay') }"
              />
            </ConfirmField>
            <ConfirmField
              v-if="showOptional('medication.timing')"
              class="span2"
              :label="t('confirm.med.when')"
              :flagged="needs('medication.timing')"
              :note="problem('medication.timing')"
            >
              <div class="d-flex flex-wrap gap-2">
                <button
                  v-for="key in TIMINGS"
                  :key="key"
                  type="button"
                  class="choice"
                  :aria-pressed="draft.medication.timing?.includes(key) ?? false"
                  @click="toggleTiming(key)"
                >
                  <AppIcon
                    v-if="draft.medication.timing?.includes(key)"
                    name="check"
                    :size="18"
                    :stroke="2.5"
                  />{{ t(`timing.${key}`) }}
                </button>
              </div>
            </ConfirmField>
          </template>

          <ConfirmField
            v-if="showOptional('medication.withFood')"
            class="span2"
            :label="t('confirm.med.food')"
            :flagged="needs('medication.withFood')"
          >
            <div class="food-choices" data-testid="confirm-food">
              <button
                v-for="key in WITH_FOOD"
                :key="key"
                type="button"
                class="choice"
                :aria-pressed="draft.medication.withFood === key"
                @click="draft.medication.withFood = key"
              >
                {{ t(`food.${key}`) }}
              </button>
            </div>
          </ConfirmField>

          <ConfirmField
            v-if="showOptional('medication.warnings')"
            class="span2"
            :label="t('confirm.med.other')"
            for="f-other"
          >
            <textarea id="f-other" v-model.lazy="warnings" rows="2" class="field-input"></textarea>
          </ConfirmField>
          <button
            v-if="foldable"
            type="button"
            class="btn btn-ghost btn-sm span2 align-self-start"
            data-testid="confirm-more"
            :aria-expanded="more"
            @click="more = !more"
          >
            <AppIcon :name="more ? 'up' : 'down'" :size="20" />{{
              t(more ? 'confirm.med.fewer' : 'confirm.med.more')
            }}
          </button>
        </div>

        <!-- Bill -->
        <div v-else class="card d-flex flex-column gap-3">
          <div v-if="draft.bill.clinic" class="d-flex align-items-center gap-3">
            <KindIcon kind="bill" size="var(--tile)" /><strong>{{ draft.bill.clinic }}</strong>
          </div>
          <div id="bill-lines" class="bill-grid">
            <span class="fw-bold">{{ t('confirm.bill.item') }}</span>
            <span class="fw-bold">{{ t('confirm.bill.amount') }}</span>
            <template v-for="(item, i) in draft.bill.items" :key="`i${i}`">
              <template v-if="lineShown(i)">
                <input
                  v-model.trim="item.description"
                  class="field-input"
                  :class="{ 'is-flagged': needs(`bill.items.${i}.description`) }"
                  :aria-label="t('confirm.bill.itemN', { n: i + 1 })"
                />
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="0.01"
                  class="field-input"
                  :class="{
                    'is-flagged': needs(`bill.items.${i}.amountCents`),
                    'is-check': offLine(item),
                  }"
                  :value="dollars(item.amountCents)"
                  :aria-label="t('confirm.bill.amountOf', { item: item.description ?? i + 1 })"
                  @change="item.amountCents = toCents($event.target.value)"
                />
                <span
                  v-if="
                    needs(`bill.items.${i}.description`) || needs(`bill.items.${i}.amountCents`)
                  "
                  class="span2 note"
                  >{{ t('confirm.bill.smudged') }}</span
                >
              </template>
            </template>
            <button
              v-if="draft.bill.items.length > FOLD_AT && fineLines"
              type="button"
              class="btn btn-outline btn-sm span2 fine-toggle"
              :aria-expanded="allLines"
              aria-controls="bill-lines"
              data-testid="confirm-fine-toggle"
              @click="allLines = !allLines"
            >
              <AppIcon :name="allLines ? 'up' : 'checkCircle'" :size="22" />{{
                allLines
                  ? t('confirm.bill.hideFine')
                  : t('confirm.bill.fine', { n: fineLines }, fineLines)
              }}
            </button>

            <template v-for="(subsidy, i) in draft.bill.subsidies" :key="`s${i}`">
              <span class="row-label"
                >{{ t(`scheme.${subsidy.scheme}`)
                }}<small v-if="subsidy.includedInItems" class="d-block text-muted-a11y">{{
                  t('bill.inLines')
                }}</small></span
              >
              <input
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                class="field-input"
                :class="{ 'is-flagged': needs(`bill.subsidies.${i}.amountCents`) }"
                :value="dollars(subsidy.amountCents)"
                :aria-label="t(`scheme.${subsidy.scheme}`)"
                @change="subsidy.amountCents = toCents($event.target.value)"
              />
            </template>

            <span class="row-label">{{ t('confirm.bill.medisave') }}</span>
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              class="field-input"
              :class="{ 'is-flagged': needs('bill.medisaveCents') }"
              :value="dollars(draft.bill.medisaveCents)"
              :aria-label="t('confirm.bill.medisave')"
              @change="draft.bill.medisaveCents = toCents($event.target.value)"
            />

            <label for="f-total" class="row-label total">{{ t('confirm.bill.total') }}</label>
            <input
              id="f-total"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              class="field-input total"
              :class="{ 'is-flagged': needs('bill.totalPayableCents') }"
              :value="dollars(draft.bill.totalPayableCents)"
              @change="draft.bill.totalPayableCents = toCents($event.target.value)"
            />
            <span v-if="needs('bill.totalPayableCents')" class="span2 note">{{
              t('confirm.bill.smudged')
            }}</span>
            <p v-else-if="gap" class="span2 gap-note m-0" data-testid="confirm-gap">
              <AppIcon name="info" :size="22" />
              <span>
                {{
                  t('confirm.bill.gap', {
                    lines: money(linesTotal(draft.bill)),
                    total: money(draft.bill.totalPayableCents),
                  })
                }}
                <template v-for="s in offSections" :key="s.section">
                  {{
                    t('confirm.bill.gapWhere', {
                      section: s.section,
                      printed: money(s.printedCents),
                    })
                  }}</template
                >
              </span>
            </p>
          </div>
        </div>

        <div class="d-flex flex-column gap-2">
          <div
            v-if="duplicate"
            ref="duplicateBox"
            class="alert alert-warning flex-column"
            role="alertdialog"
            aria-labelledby="duplicate-q"
            aria-describedby="duplicate-text"
            data-testid="confirm-duplicate"
          >
            <strong id="duplicate-q">{{
              t('confirm.duplicate.title', { name: duplicate.medication.name })
            }}</strong>
            <span id="duplicate-text">{{ t('confirm.duplicate.text') }}</span>
            <div class="d-flex flex-column flex-sm-row gap-3">
              <button
                type="button"
                class="btn btn-primary"
                data-testid="confirm-duplicate-yes"
                @click="confirm(true)"
              >
                {{ t('confirm.duplicate.yes') }}
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                data-testid="confirm-duplicate-no"
                @click="duplicate = null"
              >
                {{ t('confirm.duplicate.no') }}
              </button>
            </div>
          </div>
          <div class="acts">
            <button
              type="button"
              class="btn btn-primary ok"
              :disabled="flagged.length > 0"
              :aria-describedby="flagged.length ? 'ok-reason' : null"
              @click="confirm()"
            >
              {{ t('confirm.ok') }}<AppIcon name="right" />
            </button>
            <button v-if="fixing" type="button" class="btn btn-ghost" @click="scanAgain">
              {{ t('schedule.fix.cancel') }}
            </button>
            <button v-else type="button" class="btn btn-ghost" @click="scanAgain">
              <AppIcon name="camera" :size="22" />{{
                photo ? t('confirm.retake') : t('confirm.scanOther')
              }}
            </button>
          </div>
          <span v-if="flagged.length" id="ok-reason" class="text-muted-a11y">{{
            t('confirm.okDisabled')
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/views/ConfirmView.css"></style>
