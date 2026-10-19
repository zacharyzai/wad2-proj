
<!-- Owner: Isaac. Calls Sheen Hern's POST /api/auth/signup. Email + password only: we never ask for an NRIC number. -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { signup } from '../stores/auth'
import PageHeader from '../components/layout/PageHeader.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'

const MIN_PASSWORD = 8

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const busy = ref(false)
const errorCode = ref(null)
const tooShort = ref(false)

function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/history'
}

async function submit() {
  if (busy.value) return
  tooShort.value = password.value.length < MIN_PASSWORD
  if (tooShort.value) return // the server checks too; this just saves a round trip
  busy.value = true
  errorCode.value = null
  const res = await signup(email.value.trim(), password.value)
  busy.value = false
  if (res.ok) router.push(destination())
  else errorCode.value = res.error.code
}
</script>

<template>
  <div class="auth d-flex flex-column gap-4">
    <PageHeader :title="t('pages.signup')">{{ t('auth.signupLead') }}</PageHeader>

    <form class="box d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="signup-error" />
      <div class="d-flex flex-column gap-1">
        <label for="signup-email" class="fw-bold">{{ t('auth.email') }}</label>
        <input id="signup-email" v-model="email" class="inp" type="email" autocomplete="email" required data-testid="signup-email" />
      </div>
      <div class="d-flex flex-column gap-1">
        <label for="signup-password" class="fw-bold">{{ t('auth.password') }}</label>
        <input
          id="signup-password" v-model="password" class="inp" :class="{ flagged: tooShort }" type="password"
          autocomplete="new-password" aria-describedby="signup-hint" :aria-invalid="tooShort" required data-testid="signup-password"
        />
        <!-- Colour never carries meaning alone: the hint turns into a words-and-border warning. -->
        <span id="signup-hint" :class="tooShort ? 'banner-amber' : 'text-soft'" :role="tooShort ? 'alert' : null" data-testid="signup-hint">
          {{ tooShort ? t('auth.passwordShort') : t('auth.passwordHint') }}
        </span>
      </div>
      <BigButton type="submit" :busy="busy" data-testid="signup-submit">{{ busy ? t('auth.working') : t('auth.signup') }}</BigButton>
    </form>

    <p>
      {{ t('auth.haveAccount') }}
      <RouterLink :to="{ name: 'login', query: route.query }" class="fw-bold">{{ t('auth.login') }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.auth { max-width: 520px; margin: 0 auto; }
</style>