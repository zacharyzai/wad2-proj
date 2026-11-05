<!-- Owner: Isaac. One saved scan in the History list: replay and delete (with a confirm step).
     Delete is an inline panel, not a pop-up, so keyboard and screen-reader users never get trapped. -->
<script setup>
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '../layout/AppIcon.vue'
import KindIcon from '../layout/KindIcon.vue'
import ErrorBanner from '../layout/ErrorBanner.vue'
import { deleteScan } from '../../api/client'

const props = defineProps({ item: { type: Object, required: true } })
const emit = defineEmits(['replay', 'deleted'])
const { t, locale } = useI18n()

const panel = ref(null) // null | 'delete'
const busy = ref(false)
const errorCode = ref(null)

const isMed = computed(() => props.item.type === 'medication')
// A date in the current language.
const fmt = (iso, opts) => (iso ? new Date(iso).toLocaleDateString(locale.value, opts) : '')
const savedText = computed(() =>
  t('history.saved', {
    date: fmt(props.item.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
  }),
)
const subtitle = computed(() =>
  isMed.value
    ? props.item.purpose
      ? `${t('purpose.lead')} ${t(`purpose.${props.item.purpose}`)}`
      : props.item.subtitle
    : props.item.totalPayableCents == null
      ? ''
      : t('history.youPaid', { amount: '$' + (props.item.totalPayableCents / 100).toFixed(2) }),
)

const deleteButton = ref(null)
const keepButton = ref(null)

// The delete question is an alertdialog, so focus moves into it (onto "Keep it", the safe answer),
// and goes back to the Delete button when it closes. Esc closes it too.
async function openDelete() {
  errorCode.value = null
  panel.value = 'delete'
  await nextTick()
  keepButton.value?.focus()
}
// Closes the delete question and returns focus to its button.
async function closeDelete() {
  panel.value = null
  errorCode.value = null
  await nextTick()
  deleteButton.value?.focus()
}
// Opens or closes the delete question.
const toggleDelete = () => (panel.value === 'delete' ? closeDelete() : openDelete())

// Ignores double taps, shows the error code, runs onOk when it worked.
async function run(call, onOk) {
  if (busy.value) return
  busy.value = true
  errorCode.value = null
  const res = await call()
  busy.value = false
  if (res.ok) onOk(res.data)
  else errorCode.value = res.error.code
}
// Deletes the saved scan and tells the list.
const remove = () =>
  run(
    () => deleteScan(props.item.id),
    () => emit('deleted', props.item.id),
  )
</script>

<template>
  <li class="card hist" data-testid="history-item">
    <div class="d-flex gap-3 align-items-start">
      <KindIcon :kind="isMed ? 'medication' : 'bill'" />
      <div class="flex-grow-1 min-w-0">
        <span class="badge" :class="isMed ? 'badge-teal' : 'badge-navy'">{{
          t(isMed ? 'explain.tag.medication' : 'explain.tag.bill')
        }}</span>
        <h2 class="hist-title">
          {{ item.title || t(isMed ? 'explain.tag.medication' : 'explain.tag.bill') }}
        </h2>
        <p v-if="subtitle" class="m-0">{{ subtitle }}</p>
        <p class="m-0 text-body-secondary">{{ savedText }}</p>
      </div>
    </div>

    <div class="d-flex flex-wrap gap-2 mt-3">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        data-testid="history-replay"
        @click="emit('replay', item)"
      >
        <AppIcon name="volume" :size="20" />{{ t('history.replay') }}
      </button>
      <button
        ref="deleteButton"
        type="button"
        class="btn btn-outline btn-sm"
        :aria-expanded="panel === 'delete'"
        data-testid="history-delete"
        @click="toggleDelete"
      >
        <AppIcon name="x" :size="20" />{{ t('history.delete') }}
      </button>
    </div>

    <ErrorBanner v-if="errorCode" :code="errorCode" class="mt-3" />

    <section
      v-if="panel === 'delete'"
      class="hist-panel"
      role="alertdialog"
      :aria-label="t('history.deleteTitle')"
      @keydown.esc.stop="closeDelete"
    >
      <h3>{{ t('history.deleteTitle') }}</h3>
      <p class="m-0">{{ t('history.deleteText') }}</p>
      <div class="d-flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-danger btn-sm"
          :disabled="busy"
          data-testid="history-delete-confirm"
          @click="remove"
        >
          {{ t('history.deleteYes') }}
        </button>
        <button
          ref="keepButton"
          type="button"
          class="btn btn-secondary btn-sm"
          data-testid="history-delete-keep"
          @click="closeDelete"
        >
          {{ t('history.keep') }}
        </button>
      </div>
    </section>
  </li>
</template>

<style scoped>
.hist-title {
  font-size: var(--fs-h3);
  margin: var(--s-2) 0 var(--s-1);
  overflow-wrap: anywhere;
}
.hist-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-4);
  padding: var(--s-4);
  border: 1px solid var(--color-border);
  border-radius: var(--r-field);
  background: var(--color-surface-2);
}
.hist-panel h3 {
  font-size: var(--fs-body);
  font-weight: 700;
  margin: 0;
}
.min-w-0 {
  min-width: 0;
}
</style>
