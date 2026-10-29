<!-- Owner: Isaac. "Forgot your password?": asks for the email and sends a reset link (POST /api/auth/forgot,
     docs/auth-contract.md). The answer is the same whether or not an account uses the email, so the page always says
     "if an account uses it". People without email keep the old advice: ask the family member who set it up. -->
<script setup>
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { requestReset } from '../stores/auth'
import AuthShell from '../components/layout/AuthShell.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The email typed on Log in comes along in the history state (never in the address).
const email = ref(typeof history.state?.email === 'string' ? history.state.email : '')
const sentTo = ref('') // set once sent: the "Check your email" panel shows instead of the form
const busy = ref(false)
const bad = ref(false) // not an email address
const errorCode = ref(null)
const again = ref(false) // "Sent again" note
const panel = ref(null)

// RATE_LIMITED here means "this email has had 3 links this hour": its own words, not the scan-quota message.
const errorText = (code) => (code === 'RATE_LIMITED' ? t('auth.forgot.tooMany') : null)

async function send(resend = false) {
  if (busy.value) return
  const address = (resend ? sentTo.value : email.value).trim()
  bad.value = !EMAIL.test(address)
  if (bad.value) return
  busy.value = true
  errorCode.value = null
  again.value = false
  const res = await requestReset(address)
  busy.value = false
  if (!res.ok) return (errorCode.value = res.error.code)
  if (resend) return (again.value = true)
  sentTo.value = address
  await nextTick()
  panel.value?.focus() // screen readers hear "Check your email" next
}
</script>

<template>
  <AuthShell active="forgot">
    <div v-if="sentTo" ref="panel" class="auth-panel" tabindex="-1" role="status" data-testid="forgot-sent">
      <h2><span class="tile tile-soft"><AppIcon name="mail" :size="26" /></span>{{ t('auth.forgot.sentTitle') }}</h2>
      <p>{{ t('auth.forgot.sentText', { email: sentTo }) }}</p>
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="forgot-error" />
      <p v-if="errorCode && errorText(errorCode)" class="auth-warn m-0">{{ errorText(errorCode) }}</p>
      <p v-if="again" class="auth-help m-0" data-testid="forgot-again-done">{{ t('auth.forgot.againDone') }}</p>
      <div class="auth-panel-acts">
        <button type="button" class="btn btn-secondary" :disabled="busy" data-testid="forgot-again" @click="send(true)"><AppIcon name="mail" />{{ busy ? t('auth.working') : t('auth.forgot.again') }}</button>
        <RouterLink :to="{ name: 'login' }" class="btn btn-ghost" data-testid="forgot-back">{{ t('auth.forgot.back') }}</RouterLink>
      </div>
    </div>

    <form v-else class="d-flex flex-column gap-3" novalidate @submit.prevent="send()">
      <p class="auth-intro m-0">{{ t('auth.forgot.intro') }}</p>
      <ErrorBanner v-if="errorCode && !errorText(errorCode)" :code="errorCode" data-testid="forgot-error" />
      <p v-if="errorCode && errorText(errorCode)" class="auth-warn m-0" role="alert" data-testid="forgot-error">{{ errorText(errorCode) }}</p>
      <div>
        <label for="forgot-email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="auth-field" :class="{ bad }">
          <AppIcon name="mail" :size="22" />
          <input id="forgot-email" v-model="email" type="email" autocomplete="email" required :aria-invalid="bad" aria-describedby="forgot-email-err" data-testid="forgot-email" />
        </div>
        <span v-if="bad" id="forgot-email-err" class="auth-warn">{{ t('auth.need.email') }}</span>
      </div>
      <BigButton type="submit" :busy="busy" data-testid="forgot-submit"><AppIcon name="mail" />{{ busy ? t('auth.working') : t('auth.forgot.send') }}</BigButton>
      <RouterLink :to="{ name: 'login' }" class="btn btn-ghost" data-testid="forgot-back">{{ t('auth.forgot.back') }}</RouterLink>
    </form>

    <p class="auth-help family m-0" data-testid="forgot-family"><AppIcon name="users" :size="20" />{{ t('auth.forgot.family') }}</p>
  </AuthShell>
</template>

<style scoped>
.auth-intro { font-size: var(--fs-lead); line-height: 1.55; }
.auth-panel:focus { outline: none; }
.family { display: flex; align-items: flex-start; gap: 10px; }
.family .icon { flex: none; margin-top: 2px; }
</style>
