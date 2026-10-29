<!-- Owner: Isaac. One saved scan in the History list: replay, share (with a "what will be shared" step first) and delete (with a confirm step).
     Share and delete are inline panels, not pop-ups, so keyboard and screen-reader users never get trapped. -->
<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'
import { createShare, revokeShare, deleteScan } from '../../api/client'

const props = defineProps({ item: { type: Object, required: true } })
const emit = defineEmits(['replay', 'deleted', 'changed'])
const { t, locale } = useI18n()

const panel = ref(null) // null | 'share' | 'delete'
const busy = ref(false)
const createButton = ref(null)
const errorCode = ref(null)
const copied = ref(false)

const isMed = computed(() => props.item.type === 'medication')
const fmt = (iso, opts) => (iso ? new Date(iso).toLocaleDateString(locale.value, opts) : '')
const savedText = computed(() => t('history.saved', { date: fmt(props.item.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }) }))
const subtitle = computed(() =>
  isMed.value ? props.item.subtitle : props.item.totalPayableCents == null ? '' : t('history.youPaid', { amount: '$' + (props.item.totalPayableCents / 100).toFixed(2) }),
)
const link = computed(() => (props.item.shareToken ? `${location.origin}/shared/scan/${props.item.shareToken}` : ''))
const whatsapp = computed(() => `https://wa.me/?text=${encodeURIComponent(`${t('history.shareMessage')} ${link.value}`)}`)
const expiryText = computed(() => t('history.expires', { date: fmt(props.item.shareExpiresAt, { day: 'numeric', month: 'long', year: 'numeric' }) }))

function toggle(name) {
  panel.value = panel.value === name ? null : name
  errorCode.value = null
}

// One helper for the three server calls: ignore double taps, show the error code, run onOk when it worked.
async function run(call, onOk) {
  if (busy.value) return
  busy.value = true
  errorCode.value = null
  const res = await call()
  busy.value = false
  if (res.ok) onOk(res.data)
  else errorCode.value = res.error.code
}
const makeLink = () => run(() => createShare(props.item.id), (d) => emit('changed', { shareToken: d.token, shareExpiresAt: d.expiresAt }))
// The panel stays open on "Create a link": it shows sharing has stopped, and focus lands there instead of being lost with
// the Stop sharing button.
const stopSharing = () => run(() => revokeShare(props.item.shareToken), async () => {
  emit('changed', { shareToken: null, shareExpiresAt: null })
  await nextTick()
  createButton.value?.focus()
})
const remove = () => run(() => deleteScan(props.item.id), () => emit('deleted', props.item.id))

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2500)
  } catch {
    // Clipboard blocked: the link is still on screen to select by hand.
  }
}
</script>

<template>
  <li class="card hist" data-testid="history-item">
    <div class="d-flex gap-3 align-items-start">
      <span class="hist-icon" aria-hidden="true"><AppIcon :name="isMed ? 'pill' : 'receipt'" :size="28" /></span>
      <div class="flex-grow-1 min-w-0">
        <span class="badge" :class="isMed ? 'badge-teal' : 'badge-navy'">{{ t(isMed ? 'explain.tag.medication' : 'explain.tag.bill') }}</span>
        <h2 class="hist-title">{{ item.title || t(isMed ? 'explain.tag.medication' : 'explain.tag.bill') }}</h2>
        <p v-if="subtitle" class="m-0">{{ subtitle }}</p>
        <p class="m-0 text-body-secondary">{{ savedText }}</p>
        <span v-if="item.shareToken" class="badge badge-success mt-2"><AppIcon name="share" :size="16" />{{ t('history.sharing') }}</span>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-2 mt-3">
      <button type="button" class="btn btn-primary btn-sm" data-testid="history-replay" @click="emit('replay', item)"><AppIcon name="volume" :size="20" />{{ t('history.replay') }}</button>
      <button type="button" class="btn btn-secondary btn-sm" :aria-expanded="panel === 'share'" data-testid="history-share" @click="toggle('share')"><AppIcon name="share" :size="20" />{{ t('history.share') }}</button>
      <button type="button" class="btn btn-outline btn-sm" :aria-expanded="panel === 'delete'" data-testid="history-delete" @click="toggle('delete')"><AppIcon name="x" :size="20" />{{ t('history.delete') }}</button>
    </div>

    <ErrorBanner v-if="errorCode" :code="errorCode" class="mt-3" />

    <!-- Share: say what will be shared BEFORE the link exists (heuristic audit), then show the link actions. -->
    <section v-if="panel === 'share'" class="hist-panel" :aria-label="t('history.share')">
      <template v-if="!item.shareToken">
        <h3>{{ t('history.shareTitle') }}</h3>
        <p class="m-0">{{ t(isMed ? 'history.shareMed' : 'history.shareBill') }}</p>
        <p class="m-0">{{ t('history.shareNever') }}</p>
        <p class="m-0 text-body-secondary">{{ t('history.shareExpiry') }}</p>
        <button ref="createButton" type="button" class="btn btn-primary" :disabled="busy" data-testid="history-share-create" @click="makeLink">{{ busy ? t('auth.working') : t('history.shareCreate') }}</button>
      </template>
      <template v-else>
        <h3>{{ t('history.linkReady') }}</h3>
        <input class="form-control" :value="link" readonly :aria-label="t('history.linkLabel')" data-testid="history-link" @focus="$event.target.select()" />
        <p class="m-0 text-body-secondary">{{ expiryText }}</p>
        <div class="d-flex flex-wrap gap-2">
          <a :href="whatsapp" target="_blank" rel="noopener" class="btn btn-primary btn-sm" data-testid="history-whatsapp"><AppIcon name="send" :size="20" />{{ t('history.whatsapp') }}</a>
          <button type="button" class="btn btn-secondary btn-sm" data-testid="history-copy" @click="copy"><AppIcon :name="copied ? 'check' : 'file'" :size="20" />{{ copied ? t('history.copied') : t('history.copy') }}</button>
          <button type="button" class="btn btn-outline btn-sm" :disabled="busy" data-testid="history-unshare" @click="stopSharing">{{ t('history.unshare') }}</button>
        </div>
        <span class="visually-hidden" role="status">{{ copied ? t('history.copied') : '' }}</span>
      </template>
    </section>

    <section v-if="panel === 'delete'" class="hist-panel" role="alertdialog" :aria-label="t('history.deleteTitle')">
      <h3>{{ t('history.deleteTitle') }}</h3>
      <p class="m-0">{{ t('history.deleteText') }}</p>
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-danger btn-sm" :disabled="busy" data-testid="history-delete-confirm" @click="remove">{{ t('history.deleteYes') }}</button>
        <button type="button" class="btn btn-secondary btn-sm" @click="panel = null">{{ t('history.keep') }}</button>
      </div>
    </section>
  </li>
</template>

<style scoped>
.hist-icon { flex: none; width: var(--tile-lg); height: var(--tile-lg); display: grid; place-items: center; border-radius: var(--r-field); background: var(--color-tint); color: var(--color-primary-text); }
.hist-title { font-size: var(--fs-h3); margin: var(--s-2) 0 var(--s-1); overflow-wrap: anywhere; }
.hist-panel { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-4); padding: var(--s-4); border: 1px solid var(--color-border); border-radius: var(--r-field); background: var(--color-surface-2); }
.hist-panel h3 { font-size: var(--fs-body); font-weight: 700; margin: 0; }
.min-w-0 { min-width: 0; }
</style>