<!-- Owner: Isaac. Calls Sheen Hern's POST /api/auth/login. -->
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
const showPw = ref(false) // eye button flips the field between dots and letters
const busy = ref(false)
const errorCode = ref(null)

function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/history'
}

async function submit() {
  if (busy.value) return
  busy.value = true
  errorCode.value = null
  const res = await login(email.value.trim(), password.value)
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

      <BigButton type="submit" :busy="busy" data-testid="login-submit">{{ busy ? t('auth.working') : t('auth.login') }}</BigButton>
    </form>
  </AuthShell>
</template>