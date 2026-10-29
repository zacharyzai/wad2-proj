<!-- Owner: Isaac. Calls POST /api/auth/signup (docs/auth-contract.md). We never ask for an NRIC number.
     Date of birth and citizenship fill in the Bill page's subsidy questions, so they use the same choices. -->
<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { signup } from '../stores/auth'
import AuthShell from '../components/layout/AuthShell.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { INCOMES, isCitizen } from '../utils/account'

const MIN_PASSWORD = 8
// Same values as the subsidy rules (src/rules/subsidies.js, via BillView) and the server (server/models/User.js).
const CITIZENSHIPS = ['birth', 'became', 'pr', 'other']
const today = new Date().toISOString().slice(0, 10) // a birth date cannot be in the future
const thisYear = new Date().getFullYear()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const form = reactive({role: route.query.role === 'caregiver' ? 'caregiver' : 'senior', name: '', email: '', password: '', dob: '', citizenship: '', citizenSince: '', income: '' })
const remember = ref(true)
const showPw = ref(false)
const busy = ref(false)
const errorCode = ref(null)
const tried = ref(false) // show problems only after the first press of Create account

// Every problem at once, each under its own box (not one at a time).
const problems = computed(() => {
  const p = {}
  if (!form.name.trim()) p.name = t('auth.need.name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) p.email = t('auth.need.email')
  if (form.password.length < MIN_PASSWORD) p.password = t('auth.passwordShort')
  if (!form.dob || form.dob > today) p.dob = t('auth.need.dob')
  if (!form.citizenship) p.citizenship = t('auth.need.citizenship')
  const year = Number(form.citizenSince)
  const born = Number(form.dob.slice(0, 4)) || 1900
  if (form.citizenship === 'became' && !(Number.isInteger(year) && year >= born && year <= thisYear)) p.citizenSince = t('auth.need.citizenSince', { max: thisYear })
  if (isCitizen(form.citizenship) && !form.income) p.income = t('auth.need.citizenship')
  return p
})
const show = (field) => tried.value && problems.value[field]

function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

async function submit() {
  if (busy.value) return
  tried.value = true
  const first = Object.keys(problems.value)[0]
  if (first) {
    await nextTick()
    document.getElementById(`signup-${{ citizenSince: 'citizen-year' }[first] ?? first}`)?.focus()
    return
  }
  busy.value = true
  errorCode.value = null
  const res = await signup(
    form.email.trim(),
    form.password,
    {role: form.role, name: form.name.trim(), dob: form.dob, citizenship: form.citizenship, citizenSince: form.citizenship === 'became' ? Number(form.citizenSince) : null, income: isCitizen(form.citizenship) ? form.income : null },
    remember.value,
  )
  busy.value = false
  if (res.ok) router.push(destination())
  else errorCode.value = res.error.code
}
</script>

<template>
  <AuthShell active="signup">
    <form class="d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="signup-error" />
      <p v-if="tried && Object.keys(problems).length" class="auth-warn m-0" role="alert" data-testid="signup-missing">
        <AppIcon name="alert" :size="20" />{{ t('auth.missingFields') }}
      </p>
      <!-- Who is this account for? Chosen once: a person who is both makes two accounts. -->
      <fieldset class="auth-roles">
        <legend class="auth-label">{{ t('auth.role') }}</legend>
        <label v-for="r in ['senior', 'caregiver']" :key="r" class="auth-role" :class="{ on: form.role === r }">
          <input v-model="form.role" type="radio" name="role" :value="r" :data-testid="`signup-role-${r}`" />
          <span><strong>{{ t(`auth.roles.${r}`) }}</strong><span class="auth-help d-block mt-1">{{ t(`auth.roleHelp.${r}`) }}</span></span>
        </label>
      </fieldset>

      <div>
        <label for="signup-name" class="auth-label">{{ t('auth.name') }}</label>
        <div class="auth-field" :class="{ bad: show('name') }">
          <AppIcon name="user" :size="22" />
          <input id="signup-name" v-model="form.name" type="text" autocomplete="name" maxlength="80" required :aria-invalid="!!show('name')" aria-describedby="signup-name-err" data-testid="signup-name" />
        </div>
        <span v-if="show('name')" id="signup-name-err" class="auth-warn">{{ problems.name }}</span>
      </div>

      <div>
        <label for="signup-email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="auth-field" :class="{ bad: show('email') }">
          <AppIcon name="mail" :size="22" />
          <input id="signup-email" v-model="form.email" type="email" autocomplete="email" required :aria-invalid="!!show('email')" aria-describedby="signup-email-err" data-testid="signup-email" />
        </div>
        <span v-if="show('email')" id="signup-email-err" class="auth-warn">{{ problems.email }}</span>
      </div>

      <div>
        <label for="signup-password" class="auth-label">{{ t('auth.password') }}</label>
        <div class="auth-field" :class="{ bad: show('password') }">
          <AppIcon name="lock" :size="22" />
          <input
            id="signup-password" v-model="form.password" :type="showPw ? 'text' : 'password'"
            autocomplete="new-password" aria-describedby="signup-hint" :aria-invalid="!!show('password')" required data-testid="signup-password"
          />
          <button type="button" class="auth-eye" :aria-pressed="showPw" :aria-label="showPw ? t('auth.hide') : t('auth.show')" data-testid="signup-toggle" @click="showPw = !showPw">
            <AppIcon :name="showPw ? 'blur' : 'eye'" :size="22" />
          </button>
        </div>
        <!-- Colour never carries meaning alone: the hint turns into a warning with words and an icon. -->
        <span v-if="show('password')" id="signup-hint" class="auth-warn" data-testid="signup-hint"><AppIcon name="alert" :size="18" />{{ problems.password }}</span>
        <span v-else id="signup-hint" class="auth-help" data-testid="signup-hint">{{ t('auth.passwordHint') }}</span>
      </div>

      <div>
        <label for="signup-dob" class="auth-label">{{ t('auth.dob') }}</label>
        <div class="auth-field" :class="{ bad: show('dob') }">
          <AppIcon name="calendar" :size="22" />
          <input id="signup-dob" v-model="form.dob" type="date" min="1900-01-01" :max="today" autocomplete="bday" required :aria-invalid="!!show('dob')" aria-describedby="signup-dob-help" data-testid="signup-dob" />
        </div>
        <span v-if="show('dob')" id="signup-dob-help" class="auth-warn">{{ problems.dob }}</span>
        <span v-else id="signup-dob-help" class="auth-help">{{ t('auth.dobHelp') }}</span>
      </div>

      <div>
        <label for="signup-citizenship" class="auth-label">{{ t('bill.q.citizen') }}</label>
        <div class="auth-field" :class="{ bad: show('citizenship') }">
          <AppIcon name="globe" :size="22" />
          <select id="signup-citizenship" v-model="form.citizenship" required :aria-invalid="!!show('citizenship')" aria-describedby="signup-citizenship-err" data-testid="signup-citizenship">
            <option value="" disabled>{{ t('auth.citizenshipPick') }}</option>
            <option v-for="c in CITIZENSHIPS" :key="c" :value="c">{{ t(`bill.q.status.${c}`) }}</option>
          </select>
        </div>
        <span v-if="show('citizenship')" id="signup-citizenship-err" class="auth-warn">{{ problems.citizenship }}</span>
      </div>

      <div v-if="form.citizenship === 'became'">
        <label for="signup-citizen-year" class="auth-label">{{ t('bill.q.citizenYear') }}</label>
        <div class="auth-field" :class="{ bad: show('citizenSince') }">
          <AppIcon name="calendar" :size="22" />
          <input id="signup-citizen-year" v-model="form.citizenSince" inputmode="numeric" maxlength="4" :placeholder="t('bill.q.yearExample')" required :aria-invalid="!!show('citizenSince')" aria-describedby="signup-year-err" data-testid="signup-citizen-year" />
        </div>
        <span v-if="show('citizenSince')" id="signup-year-err" class="auth-warn">{{ problems.citizenSince }}</span>
      </div>

      <!-- CHAS is for citizens: their income band sets the card colour shown on the Bill page. -->
      <div v-if="isCitizen(form.citizenship)">
        <label for="signup-income" class="auth-label">{{ t('bill.q.income') }}</label>
        <div class="auth-field" :class="{ bad: show('income') }">
          <AppIcon name="wallet" :size="22" />
          <select id="signup-income" v-model="form.income" required :aria-invalid="!!show('income')" aria-describedby="signup-income-help" data-testid="signup-income">
            <option value="" disabled>{{ t('auth.citizenshipPick') }}</option>
            <option v-for="(key, value) in INCOMES" :key="value" :value="value">{{ t(`bill.q.incomes.${key}`) }}</option>
          </select>
        </div>
        <span v-if="show('income')" id="signup-income-help" class="auth-warn">{{ problems.income }}</span>
        <span v-else id="signup-income-help" class="auth-help">{{ t('bill.q.incomeHelp') }}</span>
      </div>

      <label class="auth-check">
        <input v-model="remember" type="checkbox" aria-describedby="signup-remember-help" data-testid="signup-remember" />
        {{ t('auth.remember') }}
      </label>
      <span id="signup-remember-help" class="auth-help mt-0">{{ t('auth.rememberHelp') }}</span>

      <BigButton type="submit" :busy="busy" data-testid="signup-submit">{{ busy ? t('auth.working') : t('auth.signup') }}</BigButton>
    </form>
  </AuthShell>
</template>

