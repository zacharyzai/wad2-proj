<!-- Owner: Isaac. Calls POST /api/auth/login (docs/auth-contract.md). Every page needs an account, so this is where logged-out people land. -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { login } from '../stores/auth'
import AuthShell from '../components/layout/AuthShell.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const remember = ref(true) // stay logged in on this device for 30 days, renewed each visit
const showPw = ref(false) // eye button flips the field between dots and letters
const busy = ref(false)
// Sent here because a saved login stopped working: say so (H1) instead of a silent Login page.
const errorCode = ref(route.query.expired ? 'SESSION_ENDED' : null)

// Only follow ?next= if it is a path on our own site, so a crafted link cannot send people to another website.
function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function forgot() {
  router.push({ name: 'forgot', state: { email: email.value.trim() } })
}

async function submit() {
  if (busy.value) return
  if (!email.value.trim() || !password.value) return (errorCode.value = 'WRONG_LOGIN')
  busy.value = true
  errorCode.value = null
  const res = await login(email.value.trim(), password.value, remember.value)
  busy.value = false
  if (res.ok) router.push(destination())
  else errorCode.value = res.error.code
}
</script>

<template>
  <AuthShell active="login">
    <form class="d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="login-error" />

      <div>
        <label for="login-email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="auth-field">
          <AppIcon name="mail" :size="22" />
          <input id="login-email" v-model="email" type="email" autocomplete="email" required data-testid="login-email" />
        </div>
      </div>

      <div>
        <label for="login-password" class="auth-label">{{ t('auth.password') }}</label>
        <div class="auth-field" :class="{ bad: errorCode === 'WRONG_LOGIN' }">
          <AppIcon name="lock" :size="22" />
          <input id="login-password" v-model="password" :type="showPw ? 'text' : 'password'" autocomplete="current-password" required data-testid="login-password" />
          <button type="button" class="auth-eye" :aria-pressed="showPw" :aria-label="showPw ? t('auth.hide') : t('auth.show')" data-testid="login-toggle" @click="showPw = !showPw">
            <AppIcon :name="showPw ? 'blur' : 'eye'" :size="22" />
          </button>
        </div>
      </div>

      <!-- H9/H10: a forgotten password is not a dead end: a reset link by email (ForgotView). The email typed so far goes
           along in the history state, not the address, so it never lands in server logs. -->
      <RouterLink :to="{ name: 'forgot' }" class="auth-forgot-link" data-testid="login-forgot" @click.prevent="forgot">{{ t('auth.forgot.title') }}</RouterLink>

      <label class="auth-check">
        <input v-model="remember" type="checkbox" aria-describedby="login-remember-help" data-testid="login-remember" />
        {{ t('auth.remember') }}
      </label>
      <span id="login-remember-help" class="auth-help mt-0">{{ t('auth.rememberHelp') }}</span>

      <BigButton type="submit" :busy="busy" data-testid="login-submit">{{ busy ? t('auth.working') : t('auth.login') }}</BigButton>
    </form>
  </AuthShell>
</template>
