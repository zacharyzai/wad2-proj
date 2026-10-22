<!-- Owner: Isaac. The details the person gave when they signed up, with Edit and Log out. The password is never shown.
     Date of birth and citizenship fill in the Bill page's subsidy questions, so a mistake here changes the estimate there. -->
<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authStore, logout, updateProfile } from '../stores/auth'
import { INCOMES, citizenshipText, incomeText, isCitizen } from '../utils/account'
import PageHeader from '../components/layout/PageHeader.vue'
import Card from '../components/layout/Card.vue'
import BigButton from '../components/layout/BigButton.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const CITIZENSHIPS = ['birth', 'became', 'pr', 'other']
const today = new Date().toISOString().slice(0, 10)
const thisYear = new Date().getFullYear()

const { t, locale } = useI18n()
const router = useRouter()

const user = computed(() => authStore.user ?? {})
// '1950-03-07' becomes "7 March 1950" (or the Chinese / Malay / Tamil form) for the chosen language.
const dobText = computed(() => {
  if (!user.value.dob) return '—'
  const d = new Date(`${user.value.dob}T00:00:00`)
  return Number.isNaN(d.getTime()) ? user.value.dob : d.toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
})

// Each row: label + value. A list, so a screen reader announces "Name: Mei Ling".
const rows = computed(() => [
  { key: 'name', label: t('auth.name'), value: user.value.name || '—' },
  { key: 'email', label: t('auth.email'), value: user.value.email || '—' },
  { key: 'dob', label: t('auth.dob'), value: dobText.value },
  { key: 'citizenship', label: t('auth.citizenship'), value: citizenshipText(t, user.value) },
  ...(isCitizen(user.value.citizenship) ? [{ key: 'income', label: t('bill.q.income'), value: incomeText(t, user.value) }] : []),
])

// Editing: a copy of the details, saved with PATCH /api/auth/me. Email and password stay as they are.
const editing = ref(false)
const form = reactive({ name: '', dob: '', citizenship: '', citizenSince: '', income: '' })
const busy = ref(false)
const errorCode = ref(null)
const saved = ref(false)
const problems = computed(() => {
  const p = {}
  if (!form.name.trim()) p.name = t('auth.need.name')
  if (!form.dob || form.dob > today) p.dob = t('auth.need.dob')
  const year = Number(form.citizenSince)
  if (form.citizenship === 'became' && !(Number.isInteger(year) && year >= Number(form.dob.slice(0, 4)) && year <= thisYear)) p.citizenSince = t('auth.need.citizenSince', { max: thisYear })
  return p
})

function edit() {
  Object.assign(form, { name: user.value.name ?? '', dob: user.value.dob ?? '', citizenship: user.value.citizenship ?? 'birth', citizenSince: user.value.citizenSince ?? '', income: user.value.income ?? 'unsure' })
  errorCode.value = null
  saved.value = false
  editing.value = true
}

async function save() {
  if (busy.value || Object.keys(problems.value).length) return
  busy.value = true
  errorCode.value = null
  const res = await updateProfile({ name: form.name.trim(), dob: form.dob, citizenship: form.citizenship, citizenSince: form.citizenship === 'became' ? Number(form.citizenSince) : null, income: isCitizen(form.citizenship) ? form.income : null })
  busy.value = false
  if (!res.ok) return (errorCode.value = res.error.code)
  editing.value = false
  saved.value = true
}

function leave() {
  logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="account d-flex flex-column gap-4">
    <PageHeader :title="t('pages.account')" :back="{ name: 'home' }">{{ t('account.lead') }}</PageHeader>

    <Card v-if="!editing" :title="t('account.details')">
      <dl class="rows m-0">
        <div v-for="r in rows" :key="r.key" class="row-item" :data-testid="`account-${r.key}`">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <p v-if="saved" class="saved m-0" role="status"><AppIcon name="checkCircle" :size="20" />{{ t('account.saved') }}</p>
      <p class="text-muted-a11y m-0">{{ t('account.billNote') }}</p>
      <button type="button" class="btn btn-secondary" data-testid="account-edit" @click="edit"><AppIcon name="pencil" />{{ t('account.edit') }}</button>
    </Card>

    <Card v-else :title="t('account.editTitle')">
      <form class="d-flex flex-column gap-3" novalidate @submit.prevent="save">
        <ErrorBanner v-if="errorCode" :code="errorCode" />
        <div class="field">
          <label for="acc-name" class="field-label">{{ t('auth.name') }}</label>
          <input id="acc-name" v-model="form.name" class="field-input" :class="{ 'is-error': problems.name }" autocomplete="name" maxlength="80" data-testid="account-edit-name" />
          <p v-if="problems.name" class="field-error" role="alert">{{ problems.name }}</p>
        </div>
        <div class="field">
          <label for="acc-dob" class="field-label">{{ t('auth.dob') }}</label>
          <input id="acc-dob" v-model="form.dob" type="date" min="1900-01-01" :max="today" class="field-input" :class="{ 'is-error': problems.dob }" data-testid="account-edit-dob" />
          <p v-if="problems.dob" class="field-error" role="alert">{{ problems.dob }}</p>
        </div>
        <div class="field">
          <label for="acc-citizenship" class="field-label">{{ t('bill.q.citizen') }}</label>
          <select id="acc-citizenship" v-model="form.citizenship" class="field-input" data-testid="account-edit-citizenship">
            <option v-for="c in CITIZENSHIPS" :key="c" :value="c">{{ t(`bill.q.status.${c}`) }}</option>
          </select>
        </div>
        <div v-if="form.citizenship === 'became'" class="field">
          <label for="acc-year" class="field-label">{{ t('bill.q.citizenYear') }}</label>
          <input id="acc-year" v-model="form.citizenSince" class="field-input" :class="{ 'is-error': problems.citizenSince }" inputmode="numeric" maxlength="4" :placeholder="t('bill.q.yearExample')" data-testid="account-edit-year" />
          <p v-if="problems.citizenSince" class="field-error" role="alert">{{ problems.citizenSince }}</p>
        </div>
        <div v-if="isCitizen(form.citizenship)" class="field">
          <label for="acc-income" class="field-label">{{ t('bill.q.income') }}</label>
          <p class="field-help m-0">{{ t('bill.q.incomeHelp') }}</p>
          <select id="acc-income" v-model="form.income" class="field-input" data-testid="account-edit-income">
            <option v-for="(key, value) in INCOMES" :key="value" :value="value">{{ t(`bill.q.incomes.${key}`) }}</option>
          </select>
        </div>
        <div class="d-flex flex-column flex-sm-row gap-3">
          <BigButton type="submit" :busy="busy" data-testid="account-save">{{ busy ? t('auth.working') : t('account.save') }}</BigButton>
          <button type="button" class="btn btn-ghost" @click="editing = false">{{ t('account.cancel') }}</button>
        </div>
      </form>
    </Card>

    <BigButton variant="alt" data-testid="account-logout" @click="leave"><AppIcon name="logout" />{{ t('account.logout') }}</BigButton>
  </div>
</template>

<style scoped>
.account { max-width: 620px; margin: 0 auto; }
.row-item { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-3) 0; border-bottom: 1px solid var(--color-border); }
.row-item:last-child { border-bottom: 0; }
dt { font-size: var(--fs-small); color: var(--color-text-muted); font-weight: 600; }
dd { margin: 0; font-size: var(--fs-h3); font-weight: 700; overflow-wrap: anywhere; }
.saved { display: flex; align-items: center; gap: 8px; color: var(--color-success-text); font-weight: 700; }
.field-error { display: flex; gap: 8px; margin: 0; color: var(--color-danger-text); font-size: 16px; font-weight: 600; }
</style>
