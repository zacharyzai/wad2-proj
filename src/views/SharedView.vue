<!-- Owner: Isaac. A senior sends this link on WhatsApp ("Invite a caregiver" on their Account page). The caregiver opens it, logs in
     as a caregiver and taps Accept. Opening the link needs no login; accepting does. API: docs/care-contract.md (assumed until Sheen Hern's /api/care exists). -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authStore } from '../stores/auth'
import { getInvite, acceptInvite } from '../api/client'
import Card from '../components/layout/Card.vue'
import BigButton from '../components/layout/BigButton.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const token = String(route.params.token)

const invite = ref(null) // { senior: { name }, expiresAt }
const loading = ref(true)
const errorCode = ref(null)
const accepting = ref(false)
const acceptCode = ref(null)

// null = logged out. Accounts from before roles existed count as seniors.
const role = computed(() => (authStore.user ? (authStore.user.role ?? 'senior') : null))
// Expired, used, revoked and unknown invites all look the same on purpose.
const gone = computed(() => ['NOT_FOUND', 'EXPIRED', 'GONE'].includes(errorCode.value))
// After logging in or signing up, come straight back to this page.
const back = computed(() => ({ next: route.fullPath }))

async function load() {
  loading.value = true
  errorCode.value = null
  const res = await getInvite(token)
  loading.value = false
  if (res.ok) invite.value = res.data
  else errorCode.value = res.error.code
}
onMounted(load)

async function accept() {
  if (accepting.value) return
  accepting.value = true
  acceptCode.value = null
  const res = await acceptInvite(token)
  accepting.value = false
  if (res.ok) router.push({ name: 'care-senior', params: { seniorId: res.data.seniorId } })
  else acceptCode.value = res.error.code
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>{{ t('pages.shared') }}</h1>
    </div>

    <LoadingState v-if="loading" />
    <EmptyState v-else-if="gone" :title="t('invite.goneTitle')" :text="t('invite.goneText')" icon="users">
      <RouterLink to="/" class="btn btn-primary"><AppIcon name="home" />{{ t('shared.open') }}</RouterLink>
    </EmptyState>
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load" />

    <Card v-else-if="invite" data-testid="invite-card">
      <h2 data-testid="invite-title">{{ t('invite.title', { name: invite.senior.name }) }}</h2>

      <div>
        <h3 class="invite-h">{{ t('invite.seeTitle') }}</h3>
        <ul class="invite-list"><li>{{ t('invite.see1') }}</li><li>{{ t('invite.see2') }}</li></ul>
      </div>
      <div>
        <h3 class="invite-h">{{ t('invite.notTitle') }}</h3>
        <ul class="invite-list"><li>{{ t('invite.not1') }}</li></ul>
      </div>
      <p class="m-0 fw-bold">{{ t('invite.removeAnytime', { name: invite.senior.name }) }}</p>

      <!-- Three situations: logged out, a senior account, a caregiver account. -->
      <div v-if="!role" class="d-flex flex-column gap-3">
        <p class="m-0">{{ t('invite.needAccount') }}</p>
        <BigButton :to="{ name: 'login', query: back }" data-testid="invite-login">{{ t('invite.login') }}</BigButton>
        <BigButton :to="{ name: 'signup', query: { ...back, role: 'caregiver' } }" variant="alt" data-testid="invite-signup">{{ t('invite.signup') }}</BigButton>
      </div>
      <div v-else-if="role !== 'caregiver'" class="alert alert-warning" role="status" data-testid="invite-wrong-role">
        <AppIcon name="alert" /><span>{{ t('invite.seniorAccount') }}</span>
      </div>
      <div v-else class="d-flex flex-column gap-3">
        <ErrorBanner v-if="acceptCode && acceptCode !== 'WRONG_ROLE'" :code="acceptCode" />
        <div v-else-if="acceptCode" class="alert alert-warning" role="alert"><AppIcon name="alert" /><span>{{ t('invite.seniorAccount') }}</span></div>
        <BigButton :busy="accepting" data-testid="invite-accept" @click="accept">{{ accepting ? t('auth.working') : t('invite.accept', { name: invite.senior.name }) }}</BigButton>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.invite-h { font-size: var(--fs-body); font-weight: 700; margin: 0 0 var(--s-2); }
.invite-list { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--s-1); }
</style>