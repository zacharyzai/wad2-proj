<!-- Owner: Isaac. Choose a new password from the emailed link (POST /api/auth/reset, docs/auth-contract.md).
     The link's token is after # (never sent to any server); it is read once, then taken out of the address so it doesn't
     stay in the browser's history. Saving logs this device in and every other device out. -->
<script setup>
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enterApp, resetPassword } from '../stores/auth'
import AuthShell from '../components/layout/AuthShell.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import BigButton from '../components/layout/BigButton.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const router = useRouter()
const MIN_PASSWORD = 8

const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? ''
if (location.hash) history.replaceState(history.state, '', location.pathname) // the link is single-use: don't keep it around

const password = ref('')
const remember = ref(true)
const showPw = ref(false)
const busy = ref(false)
const short = ref(false)
const errorCode = ref(null)
const state = ref(token ? 'form' : 'bad') // form → done, or bad (no link, expired, already used)
const panel = ref(null)

async function show(next) {
  state.value = next
  await nextTick()
  panel.value?.focus() // screen readers hear what happened
}

async function submit() {
  if (busy.value) return
  short.value = password.value.length < MIN_PASSWORD
  if (short.value) return
  busy.value = true
  errorCode.value = null
  const res = await resetPassword(token, password.value, remember.value)
  busy.value = false
  if (res.ok) return show('done')
  if (res.error.code === 'RESET_LINK_INVALID') return show('bad')
  errorCode.value = res.error.code
}
</script>

<template>
  <AuthShell active="reset">
    <div v-if="state === 'done'" ref="panel" class="auth-panel" tabindex="-1" role="status" data-testid="reset-done">
      <h2><span class="tile tile-soft"><AppIcon name="checkCircle" :size="26" /></span>{{ t('auth.reset.doneTitle') }}</h2>
      <p>{{ t('auth.reset.doneText') }}</p>
      <BigButton data-testid="reset-continue" @click="enterApp(router, '/')">{{ t('auth.reset.continue') }}<AppIcon name="right" /></BigButton>
    </div>

    <div v-else-if="state === 'bad'" ref="panel" class="auth-panel" tabindex="-1" role="alert" data-testid="reset-bad">
      <h2><span class="tile tile-warning"><AppIcon name="alert" :size="26" /></span>{{ t('auth.reset.badTitle') }}</h2>
      <p>{{ t('auth.reset.badText') }}</p>
      <div class="auth-panel-acts">
        <BigButton :to="{ name: 'forgot' }" data-testid="reset-new-link"><AppIcon name="mail" />{{ t('auth.reset.newLink') }}</BigButton>
        <RouterLink :to="{ name: 'login' }" class="btn btn-ghost">{{ t('auth.forgot.back') }}</RouterLink>
      </div>
    </div>

    <form v-else class="d-flex flex-column gap-3" novalidate @submit.prevent="submit">
      <ErrorBanner v-if="errorCode" :code="errorCode" data-testid="reset-error" />
      <div>
        <label for="reset-password" class="auth-label">{{ t('auth.reset.newPassword') }}</label>
        <div class="auth-field" :class="{ bad: short }">
          <AppIcon name="lock" :size="22" />
          <input id="reset-password" v-model="password" :type="showPw ? 'text' : 'password'" autocomplete="new-password" required :aria-invalid="short" aria-describedby="reset-password-help" data-testid="reset-password" />
          <button type="button" class="auth-eye" :aria-pressed="showPw" :aria-label="showPw ? t('auth.hide') : t('auth.show')" data-testid="reset-toggle" @click="showPw = !showPw">
            <AppIcon :name="showPw ? 'blur' : 'eye'" :size="22" />
          </button>
        </div>
        <span id="reset-password-help" :class="short ? 'auth-warn' : 'auth-help'">{{ short ? t('auth.passwordShort') : t('auth.passwordHint') }}</span>
      </div>

      <label class="auth-check">
        <input v-model="remember" type="checkbox" aria-describedby="reset-remember-help" data-testid="reset-remember" />
        {{ t('auth.remember') }}
      </label>
      <span id="reset-remember-help" class="auth-help mt-0">{{ t('auth.rememberHelp') }}</span>

      <BigButton type="submit" :busy="busy" data-testid="reset-submit">{{ busy ? t('auth.working') : t('auth.reset.save') }}</BigButton>
    </form>
  </AuthShell>
</template>

<style scoped>
.auth-panel:focus { outline: none; }
</style>
