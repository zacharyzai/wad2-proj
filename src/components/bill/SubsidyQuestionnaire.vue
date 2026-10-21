<!-- Owner: Lokesh. Subsidy questions: birth year, citizenship and household income. Answers live only in this page's memory: never sent or saved. -->
<script setup>
import { computed, reactive, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import { validYear } from '../../rules/subsidies'

// The parsed answers for BillView, in the shape src/rules/subsidies.js expects.
const answers = defineModel({ type: Object, required: true })
const { t } = useI18n()
const thisYear = new Date().getFullYear()

const STATUSES = ['birth', 'became', 'pr', 'other']
const RESIDENCY = { birth: 'citizen', became: 'citizen', pr: 'pr', other: 'other' }
// Official CHAS bands (chas.sg); the value is what the rules use, the key is the i18n label.
const INCOMES = [
  { value: 'upTo1500', key: 'low' },
  { value: '1501to2300', key: 'mid' },
  { value: 'above2300', key: 'high' },
  { value: 'unsure', key: 'unsure' },
]

// What the user typed or picked. Years stay as text until they are 4 digits.
const form = reactive({ birth: '', status: '', citizenYear: '', income: '' })
// An error shows once 4 digits are typed, or when the user leaves the field.
const left = reactive({ birth: false, citizenYear: false })
const isCitizen = computed(() => RESIDENCY[form.status] === 'citizen')

const toYear = (text) => (/^\d{4}$/.test(text.trim()) ? Number(text.trim()) : null)
const birthYear = computed(() => toYear(form.birth))
const citizenYear = computed(() => toYear(form.citizenYear))
const ready = (text, leftField) => text.trim() !== '' && (leftField || text.trim().length >= 4)

const birthError = computed(() => {
  if (!ready(form.birth, left.birth)) return null
  return validYear(birthYear.value, thisYear) ? null : t('bill.q.errors.year', { max: thisYear })
})
const citizenError = computed(() => {
  if (form.status !== 'became' || !ready(form.citizenYear, left.citizenYear)) return null
  if (!validYear(citizenYear.value, thisYear)) return t('bill.q.errors.year', { max: thisYear })
  if (birthYear.value !== null && !birthError.value && citizenYear.value < birthYear.value) return t('bill.q.errors.beforeBirth')
  return null
})

// Only answers without an error reach the rules; anything else counts as "not answered yet".
watchEffect(() => {
  const next = {
    birthYear: birthError.value ? null : birthYear.value,
    residency: RESIDENCY[form.status] ?? null,
    citizenSince: form.status === 'birth' ? 'birth' : form.status === 'became' && !citizenError.value ? citizenYear.value : null,
    income: isCitizen.value && form.income ? form.income : null,
  }
  // Only replace the answers when something really changed, so leaving a field doesn't count as an update.
  if (JSON.stringify(next) !== JSON.stringify(answers.value)) answers.value = next
})

function clear() {
  Object.assign(form, { birth: '', status: '', citizenYear: '', income: '' })
  Object.assign(left, { birth: false, citizenYear: false })
}
</script>

<template>
  <section class="card d-flex flex-column gap-4" aria-labelledby="q-title">
    <div class="d-flex flex-column gap-2">
      <h2 id="q-title">{{ t('bill.q.title') }}</h2>
      <p class="q-lead"><AppIcon name="lock" :size="20" />{{ t('bill.q.lead') }}</p>
    </div>

    <!-- autocomplete="off" so the browser doesn't remember the answers either. -->
    <form class="d-flex flex-column gap-4" autocomplete="off" @submit.prevent>
      <div class="field">
        <label for="q-birth" class="field-label">{{ t('bill.q.birth') }}</label>
        <input
          id="q-birth"
          v-model="form.birth"
          class="field-input year"
          :class="{ 'is-error': birthError }"
          inputmode="numeric"
          maxlength="4"
          :placeholder="t('bill.q.yearExample')"
          :aria-invalid="!!birthError"
          :aria-describedby="birthError ? 'q-birth-error' : null"
          @blur="left.birth = true"
        />
        <p v-if="birthError" id="q-birth-error" class="field-error" role="alert"><AppIcon name="alert" :size="20" />{{ birthError }}</p>
      </div>

      <fieldset class="field">
        <legend class="field-label">{{ t('bill.q.citizen') }}</legend>
        <div class="options">
          <label v-for="status in STATUSES" :key="status" class="choice option">
            <input v-model="form.status" type="radio" name="q-status" :value="status" class="visually-hidden" />
            <span class="tick" aria-hidden="true"><AppIcon v-if="form.status === status" name="check" :size="18" :stroke="3" /></span>
            {{ t(`bill.q.status.${status}`) }}
          </label>
        </div>
      </fieldset>

      <div v-if="form.status === 'became'" class="field">
        <label for="q-citizen-year" class="field-label">{{ t('bill.q.citizenYear') }}</label>
        <input
          id="q-citizen-year"
          v-model="form.citizenYear"
          class="field-input year"
          :class="{ 'is-error': citizenError }"
          inputmode="numeric"
          maxlength="4"
          :placeholder="t('bill.q.yearExample')"
          :aria-invalid="!!citizenError"
          :aria-describedby="citizenError ? 'q-citizen-error' : null"
          @blur="left.citizenYear = true"
        />
        <p v-if="citizenError" id="q-citizen-error" class="field-error" role="alert"><AppIcon name="alert" :size="20" />{{ citizenError }}</p>
      </div>

      <fieldset v-if="isCitizen" class="field" aria-describedby="q-income-help">
        <legend class="field-label">{{ t('bill.q.income') }}</legend>
        <p id="q-income-help" class="field-help">{{ t('bill.q.incomeHelp') }}</p>
        <div class="options">
          <label v-for="income in INCOMES" :key="income.value" class="choice option">
            <input v-model="form.income" type="radio" name="q-income" :value="income.value" class="visually-hidden" />
            <span class="tick" aria-hidden="true"><AppIcon v-if="form.income === income.value" name="check" :size="18" :stroke="3" /></span>
            {{ t(`bill.q.incomes.${income.key}`) }}
          </label>
        </div>
      </fieldset>

      <button type="button" class="btn btn-ghost align-self-start" @click="clear"><AppIcon name="x" />{{ t('bill.q.clear') }}</button>
    </form>
  </section>
</template>

<style scoped src="../../styles/components/SubsidyQuestionnaire.css"></style>
