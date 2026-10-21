<!-- Owner: Isaac. Calls Sheen Hern's POST /api/auth/signup. We never ask for an NRIC number. -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { signup } from '../stores/auth'
import AuthShell from '../components/layout/AuthShell.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const MIN_PASSWORD = 8
// The values the server stores. The words people see come from the locale files.
const CITIZENSHIPS = ['SG_CITIZEN', 'SG_PR', 'OTHER']
const today = new Date().toISOString().slice(0, 10) // a birth date cannot be in the future

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const dob = ref('') // 'YYYY-MM-DD', which is what <input type="date"> gives us
const citizenship = ref('')
const showPw = ref(false)
const busy = ref(false)
const errorCode = ref(null)
const tooShort = ref(false)
const missing = ref(false)

function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/history'
}

async function submit() {
  if (busy.value) return
  tooShort.value = password.value.length < MIN_PASSWORD
  if (tooShort.value) return // the server checks too; this just saves a round trip
  missing.value = !name.value.trim() || !email.value.trim() || !dob.value || !citizenship.value
  if (missing.value) return
  busy.value = true
  errorCode.value = null
  const res = await signup(email.value.trim(), password.value, {
    name: name.value.trim(),
    dob: dob.value,
    citizenship: citizenship.value,
  })
  busy.value = false
  if (res.ok) router.push(destination())
  else errorCode.value = res.error.code
}
</script>

<template>
  <AuthShell active="signup">
    <form class="d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="signup-error" />

      <div>
        <label for="signup-name" class="auth-label">{{ t('auth.name') }}</label>
        <div class="auth-field">
          <AppIcon name="user" :size="22" />
          <input id="signup-name" v-model="name" type="text" autocomplete="name" required data-testid="signup-name" />
        </div>
      </div>

      <div>
        <label for="signup-email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="auth-field">
          <AppIcon name="mail" :size="22" />
          <input id="signup-email" v-model="email" type="email" autocomplete="email" required data-testid="signup-email" />
        </div>
      </div>

      <div>
        <label for="signup-password" class="auth-label">{{ t('auth.password') }}</label>
        <div class="auth-field" :class="{ bad: tooShort }">
          <AppIcon name="lock" :size="22" />
          <input
            id="signup-password" v-model="password" :type="showPw ? 'text' : 'password'"
            autocomplete="new-password" aria-describedby="signup-hint" :aria-invalid="tooShort" required data-testid="signup-password"
          />
          <button type="button" class="auth-eye" :aria-pressed="showPw" :aria-label="showPw ? t('auth.hide') : t('auth.show')" data-testid="signup-toggle" @click="showPw = !showPw">
            <AppIcon :name="showPw ? 'blur' : 'eye'" :size="22" />
          </button>
        </div>
        <span id="signup-hint" class="mt-2 d-block" :class="tooShort ? 'banner-amber' : 'text-soft'" :role="tooShort ? 'alert' : null" data-testid="signup-hint">
          {{ tooShort ? t('auth.passwordShort') : t('auth.passwordHint') }}
        </span>
      </div>

      <div>
        <label for="signup-dob" class="auth-label">{{ t('auth.dob') }}</label>
        <div class="auth-field">
          <AppIcon name="calendar" :size="22" />
          <input id="signup-dob" v-model="dob" type="date" :max="today" autocomplete="bday" required data-testid="signup-dob" />
        </div>
      </div>

      <div>
        <label for="signup-citizenship" class="auth-label">{{ t('auth.citizenship') }}</label>
        <div class="auth-field">
          <AppIcon name="globe" :size="22" />
          <select id="signup-citizenship" v-model="citizenship" required data-testid="signup-citizenship">
            <option value="" disabled>{{ t('auth.citizenshipPick') }}</option>
            <option v-for="c in CITIZENSHIPS" :key="c" :value="c">{{ t(`auth.citizenships.${c}`) }}</option>
          </select>
        </div>
      </div>

      <p v-if="missing" class="banner-amber m-0" role="alert" data-testid="signup-missing">{{ t('auth.missingFields') }}</p>

      <BigButton type="submit" :busy="busy" data-testid="signup-submit">{{ busy ? t('auth.working') : t('auth.signup') }}</BigButton>
    </form>
  </AuthShell>
</template>