<!-- Owner: Isaac. The details the person gave when they signed up, with Edit and Log out. The password is never shown.
     Date of birth and citizenship fill in the Bill page's subsidy questions, so a mistake here changes the estimate there. -->
<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authStore, logout, saveLanguage, saveTheme, updateProfile } from '../stores/auth'
import { LOCALES, setLocale } from '../i18n'
import { THEME_ICONS, THEMES, setTheme, themeChoice } from '../theme'
import { openGuide } from '../stores/guide'
import { INCOMES, citizenshipText, incomeText, isCitizen } from '../utils/account'
import PageHeader from '../components/layout/PageHeader.vue'
import Card from '../components/layout/Card.vue'
import BigButton from '../components/layout/BigButton.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import CaregiverCard from '../components/care/CaregiverCard.vue'

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
  { key: 'role', label: t('auth.role'), value: t(`auth.roles.${user.value.role ?? 'senior'}`) },
  { key: 'dob', label: t('auth.dob'), value: dobText.value },
  { key: 'citizenship', label: t('auth.citizenship'), value: citizenshipText(t, user.value) },
  ...(isCitizen(user.value.citizenship) ? [{ key: 'income', label: t('bill.q.income'), value: incomeText(t, user.value) }] : []),
])

// Editing: a copy of the details, saved with PATCH /api/auth/me. Email and password stay as they are.
const editing = ref(false)
const form = reactive({ name: '', dob: '', citizenship: '', citizenSince: '', income: '' })
const busy = ref(false)
const errorCode = ref(null)
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
  notify(t('account.toast'))
}

// Language: the page switches at once; the account remembers it for every device they log in on.
async function chooseLanguage(code) {
  if (code === locale.value) return
  const saving = saveLanguage(code) // first, so the store's own language watcher doesn't save it twice
  setLocale(code)
  const res = await saving
  notify(res?.ok ? t('account.toast') : t(`errors.${res?.error.code ?? 'SERVER_ERROR'}`), !res?.ok)
}

// Day, night or the same as this device: the page changes at once; the account remembers it for every device.
async function chooseTheme(choice) {
  if (choice === themeChoice.value) return
  setTheme(choice)
  const res = await saveTheme(choice)
  notify(res?.ok ? t('account.toast') : t(`errors.${res?.error.code ?? 'SERVER_ERROR'}`), !res?.ok)
}

// "Settings saved": a small message at the bottom that fades after 3 seconds. Polite, so screen readers hear it too.
const toast = ref(null)
let toastTimer = 0
function notify(text, bad = false) {
  clearTimeout(toastTimer)
  toast.value = { text, bad }
  toastTimer = setTimeout(() => (toast.value = null), 3000)
}
onBeforeUnmount(() => clearTimeout(toastTimer))

// H5: one stray tap must not log a senior out (logging back in needs the password, and there is no reset yet), so ask first.
const askLeave = ref(false)
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
    
    <!-- Seniors only: who can see my doses, and Invite a caregiver. -->
    <CaregiverCard v-if="(user.role ?? 'senior') !== 'caregiver'" />

    <Card :title="t('nav.language')">
      <p class="text-muted-a11y m-0">{{ t('account.languageNote') }}</p>
      <div class="segmented langs" role="group" :aria-label="t('nav.language')" data-testid="account-language">
        <button v-for="(label, code) in LOCALES" :key="code" type="button" :lang="code" :aria-pressed="locale === code" @click="chooseLanguage(code)">{{ label }}</button>
      </div>
    </Card>

    <Card :title="t('account.theme.title')">
      <p class="text-muted-a11y m-0">{{ t('account.theme.note') }}</p>
      <div class="segmented theme-choices" role="group" :aria-label="t('account.theme.title')" data-testid="account-theme">
        <button v-for="c in THEMES" :key="c" type="button" :aria-pressed="themeChoice === c" :data-theme-choice="c" @click="chooseTheme(c)">
          <AppIcon :name="THEME_ICONS[c]" :size="22" />{{ t(`account.theme.${c}`) }}
        </button>
      </div>
    </Card>

    <!-- The Beginner's guide again (on phones this is the only way back to it; desktop also has it in the sidebar). -->
    <button type="button" class="btn btn-outline" data-testid="account-guide" @click="openGuide"><AppIcon name="compass" />{{ t('guide.open') }}</button>
    <BigButton v-if="!askLeave" variant="alt" data-testid="account-logout" @click="askLeave = true"><AppIcon name="logout" />{{ t('account.logout') }}</BigButton>
    <div v-else class="alert alert-warning flex-column" role="alertdialog" aria-labelledby="leave-q" data-testid="account-logout-ask">
      <strong id="leave-q">{{ t('account.logoutAsk') }}</strong>
      <span>{{ t('account.logoutNote') }}</span>
      <div class="d-flex flex-column flex-sm-row gap-3">
        <button type="button" class="btn btn-primary" data-testid="account-logout-yes" @click="leave"><AppIcon name="logout" />{{ t('account.logout') }}</button>
        <button type="button" class="btn btn-secondary" @click="askLeave = false">{{ t('account.cancel') }}</button>
      </div>
    </div>

    <!-- Always in the page, so screen readers announce what appears in it. -->
    <div class="toast-slot" role="status" aria-live="polite">
      <Transition name="toast">
        <p v-if="toast" class="toast-ahma m-0" :class="{ bad: toast.bad }" data-testid="account-toast">
          <AppIcon :name="toast.bad ? 'alert' : 'checkCircle'" :size="22" />{{ toast.text }}
        </p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.account { max-width: 620px; margin: 0 auto; }
.row-item { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-3) 0; border-bottom: 1px solid var(--color-border); }
.row-item:last-child { border-bottom: 0; }
dt { font-size: var(--fs-small); color: var(--color-text-muted); font-weight: 600; }
dd { margin: 0; font-size: var(--fs-h3); font-weight: 700; overflow-wrap: anywhere; }
.langs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 576px) { .langs { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
/* Above the phone tab bar; bottom-centre on desktop. */
.toast-slot { position: fixed; left: 16px; right: 16px; bottom: calc(96px + env(safe-area-inset-bottom)); z-index: 30; display: flex; justify-content: center; pointer-events: none; }
@media (min-width: 992px) { .toast-slot { bottom: 32px; left: 248px; } } /* centred in the page area, beside the sidebar */
.toast-ahma { padding: 14px 20px; }
.toast-ahma.bad { background: #a31f2a; } /* fixed dark red: white text stays readable in night mode too */
.toast-enter-active { transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out); }
.toast-leave-active { transition: opacity 160ms ease-in, transform 160ms ease-in; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }
.field-error { display: flex; gap: 8px; margin: 0; color: var(--color-danger-text); font-size: 16px; font-weight: 600; }
</style>
