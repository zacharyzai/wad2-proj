<!-- Owner: Isaac -->
<!-- Owner: Isaac. Calls Sheen Hern's POST /api/auth/login. -->
<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { login } from '../stores/auth'
import PageHeader from '../components/layout/PageHeader.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const busy = ref(false)
const errorCode = ref(null)

// Only follow ?next= if it is a path on our own site, so a crafted link cannot send people to another website.
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
  <div class="auth d-flex flex-column gap-4">
    <PageHeader :title="t('pages.login')">{{ t('auth.loginLead') }}</PageHeader>

    <form class="box d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="login-error" />
      <div class="d-flex flex-column gap-1">
        <label for="login-email" class="fw-bold">{{ t('auth.email') }}</label>
        <input id="login-email" v-model="email" class="inp" type="email" autocomplete="email" required data-testid="login-email" />
      </div>
      <div class="d-flex flex-column gap-1">
        <label for="login-password" class="fw-bold">{{ t('auth.password') }}</label>
        <input id="login-password" v-model="password" class="inp" type="password" autocomplete="current-password" required data-testid="login-password" />
      </div>
      <BigButton type="submit" :busy="busy" data-testid="login-submit">{{ busy ? t('auth.working') : t('auth.login') }}</BigButton>
    </form>

    <p>
      {{ t('auth.noAccount') }}
      <RouterLink :to="{ name: 'signup', query: route.query }" class="fw-bold">{{ t('auth.signup') }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.auth { max-width: 520px; margin: 0 auto; }
</style>