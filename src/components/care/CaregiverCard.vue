<!-- Owner: Isaac. On a senior's Account page: who can see my doses today, and "Invite a caregiver".
     Says what a caregiver will see BEFORE the link is made, and anyone can be removed at any time. API: docs/care-contract.md (assumed). -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createInvite, myCaregivers, removeCareLink } from '../../api/client'
import Card from '../layout/Card.vue'
import AppIcon from '../layout/AppIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'

const { t, locale } = useI18n()

const caregivers = ref([])
const errorCode = ref(null)
const busy = ref(false)
const inviting = ref(false) // the "what they will see" step is open
const invite = ref(null) // { token, expiresAt } once created
const removing = ref(null) // id of the caregiver we are asking about
const copied = ref(false)

const fmt = (iso, opts) => (iso ? new Date(iso).toLocaleDateString(locale.value, opts) : '')
const link = computed(() => (invite.value ? `${location.origin}/shared/${invite.value.token}` : ''))
const whatsapp = computed(() => `https://wa.me/?text=${encodeURIComponent(`${t('careCard.shareMessage')} ${link.value}`)}`)

async function load() {
  const res = await myCaregivers()
  // The API may still be a stub: an empty list, not an error.
  if (res.ok) caregivers.value = res.data.caregivers
  else if (res.error.code !== 'NOT_IMPLEMENTED') errorCode.value = res.error.code
}
onMounted(load)

async function run(call, onOk) {
  if (busy.value) return
  busy.value = true
  errorCode.value = null
  const res = await call()
  busy.value = false
  if (res.ok) onOk(res.data)
  else errorCode.value = res.error.code
}
const makeInvite = () => run(createInvite, (d) => (invite.value = d))
const remove = (c) => run(() => removeCareLink(c.id), () => { caregivers.value = caregivers.value.filter((x) => x.id !== c.id); removing.value = null })

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch {
    // Clipboard blocked: the link is on screen to select by hand.
  }
}
</script>

<template>
  <Card :title="t('careCard.title')" data-testid="care-card">
    <p class="text-muted-a11y m-0">{{ t('careCard.intro') }}</p>
    <ErrorBanner v-if="errorCode" :code="errorCode" />

    <ul v-if="caregivers.length" class="list-unstyled m-0 d-flex flex-column gap-3" data-testid="care-caregivers">
      <li v-for="c in caregivers" :key="c.id" class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <span class="flex-grow-1"><strong>{{ c.name }}</strong><br /><span class="text-body-secondary">{{ t('careCard.since', { date: fmt(c.since, { day: 'numeric', month: 'short', year: 'numeric' }) }) }}</span></span>
          <button type="button" class="btn btn-outline btn-sm" :aria-expanded="removing === c.id" data-testid="care-remove" @click="removing = removing === c.id ? null : c.id">{{ t('careCard.remove') }}</button>
        </div>
        <div v-if="removing === c.id" class="alert alert-warning flex-column" role="alertdialog">
          <strong>{{ t('careCard.removeAsk', { name: c.name }) }}</strong>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-danger btn-sm" :disabled="busy" data-testid="care-remove-yes" @click="remove(c)">{{ t('careCard.removeYes') }}</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="removing = null">{{ t('careCard.keep') }}</button>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="m-0">{{ t('careCard.none') }}</p>

    <button v-if="!inviting" type="button" class="btn btn-primary" data-testid="care-invite" @click="inviting = true"><AppIcon name="users" />{{ t('careCard.invite') }}</button>

    <section v-else class="d-flex flex-column gap-3" :aria-label="t('careCard.invite')">
      <template v-if="!invite">
        <h3 class="care-h">{{ t('careCard.inviteTitle') }}</h3>
        <p class="m-0">{{ t('careCard.inviteSee') }}</p>
        <p class="m-0">{{ t('careCard.inviteNot') }}</p>
        <p class="m-0 text-body-secondary">{{ t('careCard.inviteExpiry') }}</p>
        <button type="button" class="btn btn-primary" :disabled="busy" data-testid="care-invite-create" @click="makeInvite">{{ busy ? t('auth.working') : t('careCard.create') }}</button>
      </template>
      <template v-else>
        <h3 class="care-h">{{ t('careCard.linkReady') }}</h3>
        <input class="form-control" :value="link" readonly :aria-label="t('careCard.linkLabel')" data-testid="care-invite-link" @focus="$event.target.select()" />
        <p class="m-0 text-body-secondary">{{ t('history.expires', { date: fmt(invite.expiresAt, { day: 'numeric', month: 'long', year: 'numeric' }) }) }}</p>
        <div class="d-flex flex-wrap gap-2">
          <a :href="whatsapp" target="_blank" rel="noopener" class="btn btn-primary btn-sm" data-testid="care-invite-whatsapp"><AppIcon name="send" :size="20" />{{ t('history.whatsapp') }}</a>
          <button type="button" class="btn btn-secondary btn-sm" @click="copy"><AppIcon :name="copied ? 'check' : 'file'" :size="20" />{{ copied ? t('history.copied') : t('history.copy') }}</button>
        </div>
        <span class="visually-hidden" role="status">{{ copied ? t('history.copied') : '' }}</span>
      </template>
    </section>
  </Card>
</template>

<style scoped>
.care-h { font-size: var(--fs-body); font-weight: 700; margin: 0; }
</style>