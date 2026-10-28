<!-- Owner: Lokesh. Google Calendar on the Schedule page: Connect, Disconnect, and keeping the calendar in step with the schedule.
     Every dose becomes a repeating event with an alert, so the phone rings even when the app is closed. Contract: docs/google-contract.md
     Any change to the schedule (Edit, Remove, Undo, a re-scanned label, the language) sends the WHOLE schedule once, 1.5 seconds
     after the last change. One sync at a time. Hidden when the server has no Google set up (503 GOOGLE_UNAVAILABLE). -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { googleStatus, googleConnect, googleSync, googleDisconnect } from '../../api/client'
import { syncEntries, todayInSingapore } from '../../rules/schedule'
import { authStore } from '../../stores/auth'
import AppIcon from '../layout/AppIcon.vue'

const props = defineProps({
  entries: { type: Array, required: true }, // every ScheduleEntry, flagged ones included
})
const emit = defineEmits(['notify']) // (text, bad): the page's short message at the bottom

const WAIT_MS = 1500
const RESULTS = ['connected', 'cancelled', 'failed'] // ?google= after Google's permission page

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const state = ref('loading') // 'loading' | 'off' | 'connected' | 'reconnect' | 'hidden'
const events = ref(0)
const busy = ref(false)
const askRemove = ref(false)
const skippedIds = ref([]) // medicines the last sync left out for having no number of days

const today = todayInSingapore()
const payload = computed(() => JSON.stringify({ entries: syncEntries(props.entries, today), lang: locale.value }))
// Only those still without a number of days: adding it hides the note at once, before the next sync answers.
const missing = computed(() => props.entries.filter((e) => skippedIds.value.includes(e.medicineId) && !e.endDate).map((e) => e.label))

// What was last sent from this device, so opening the page only syncs when the schedule changed since (e.g. a re-scanned label).
const sentKey = () => `calendarSynced:${authStore.user?.email ?? ''}`
function lastSent() {
  try {
    return localStorage.getItem(sentKey())
  } catch {
    return null
  }
}
function remember(body) {
  try {
    body === null ? localStorage.removeItem(sentKey()) : localStorage.setItem(sentKey(), body)
  } catch {
    // Storage blocked: the next visit just syncs again, which changes nothing in Google.
  }
}

// A sync that fails for a known reason changes what the card shows; anything else is a short "not updated" message.
function onError(code) {
  if (code === 'GOOGLE_UNAVAILABLE') state.value = 'hidden'
  else if (code === 'GOOGLE_NOT_CONNECTED') state.value = 'off'
  else if (code === 'GOOGLE_DISCONNECTED') state.value = 'reconnect'
  else return false
  return true
}

let timer = 0
let running = false
let again = false
async function sync(force = false) {
  if (state.value !== 'connected') return
  if (running) return (again = true) // runs once more when this one is done
  const body = payload.value
  if (!force && body === lastSent()) return
  running = true
  const { entries, lang } = JSON.parse(body)
  const res = await googleSync(entries, lang)
  running = false
  if (res.ok) {
    remember(body)
    events.value = Math.max(0, events.value + res.data.created - res.data.removed)
    skippedIds.value = res.data.skipped.filter((s) => s.reason === 'noEndDate').map((s) => s.medicineId)
    emit('notify', t('schedule.calendar.updated'))
  } else if (!onError(res.error.code)) {
    emit('notify', t('schedule.calendar.failed'), true)
  }
  if (again) {
    again = false
    sync()
  }
}
watch(payload, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = 0
    sync()
  }, WAIT_MS)
})

async function connect() {
  busy.value = true
  const res = await googleConnect('/schedule')
  if (res.ok) return window.location.assign(res.data.url) // Google's permission page; it sends them back here
  busy.value = false
  if (!onError(res.error.code)) emit('notify', t(`errors.${res.error.code}`), true)
}

async function disconnect(removeEvents) {
  busy.value = true
  const res = await googleDisconnect(removeEvents)
  busy.value = false
  askRemove.value = false
  if (!res.ok) return emit('notify', t(`errors.${res.error.code}`), true)
  state.value = 'off'
  events.value = 0
  skippedIds.value = []
  remember(null)
  emit('notify', t('schedule.calendar.disconnected'))
}

const disconnectButton = ref(null)
const removeDialog = ref(null)
// The question is an alertdialog, so focus goes into it (its first answer), and back to Disconnect on Cancel.
async function askDisconnect() {
  askRemove.value = true
  await nextTick()
  removeDialog.value?.querySelector('button')?.focus()
}
async function cancelDisconnect() {
  askRemove.value = false
  await nextTick()
  disconnectButton.value?.focus()
}

onMounted(async () => {
  // Back from Google's permission page: say how it went, then tidy the address so a reload doesn't say it again.
  const result = RESULTS.includes(route.query.google) ? route.query.google : null
  // Back from Google: tidy the address, staying on Reminders (where this card is shown).
  if (route.query.google !== undefined) router.replace({ query: { ...route.query, google: undefined, view: 'reminders' } })
  if (result) emit('notify', t(`schedule.calendar.result.${result}`), result !== 'connected')

  const res = await googleStatus()
  if (!res.ok) return (state.value = 'hidden') // not set up on this server, or can't tell: nothing to offer
  state.value = res.data.connected ? 'connected' : 'off'
  events.value = res.data.events
  sync(result === 'connected') // just connected: put everything in; otherwise only if the schedule changed since last time
})

// Leaving the page within the 1.5 seconds after a change: send it now rather than lose it.
onBeforeUnmount(() => {
  if (!timer) return
  clearTimeout(timer)
  sync()
})
</script>

<template>
  <!-- With no medicines, a Connect button has nothing to put in the calendar; once connected it stays, so Disconnect is reachable. -->
  <section v-if="state !== 'hidden' && state !== 'loading' && (entries.length || state !== 'off')" class="card gap-3" aria-labelledby="calendar-title" data-testid="schedule-calendar">
    <h2 id="calendar-title" class="d-flex align-items-center gap-3"><span class="tile tile-soft"><AppIcon name="calendar" :size="22" /></span>{{ t('schedule.calendar.title') }}</h2>

    <template v-if="state === 'off'">
      <p class="m-0">{{ t('schedule.calendar.text') }}</p>
      <button type="button" class="btn btn-primary" :disabled="busy" data-testid="calendar-connect" @click="connect"><AppIcon name="calendar" />{{ t('schedule.calendar.connect') }}</button>
    </template>

    <!-- They removed our access in their Google account: offer to connect again, not an error page. -->
    <template v-else-if="state === 'reconnect'">
      <div class="alert alert-warning"><AppIcon name="alert" /><span>{{ t('errors.GOOGLE_DISCONNECTED') }}</span></div>
      <button type="button" class="btn btn-primary" :disabled="busy" data-testid="calendar-reconnect" @click="connect"><AppIcon name="replay" />{{ t('schedule.calendar.reconnect') }}</button>
    </template>

    <template v-else>
      <span class="badge badge-success align-self-start" data-testid="calendar-connected"><AppIcon name="checkCircle" :size="18" />{{ t('schedule.calendar.connected') }}</span>
      <p class="m-0">{{ t('schedule.calendar.events', events) }}</p>
      <p class="alert alert-info m-0"><AppIcon name="info" /><span>{{ t('schedule.calendar.alerts') }}</span></p>
      <div v-if="missing.length" class="alert alert-warning" data-testid="calendar-missing">
        <AppIcon name="alert" /><span>{{ t('schedule.calendar.missing', { names: missing.join(t('explain.sep')) }) }}</span>
      </div>

      <button v-if="!askRemove" ref="disconnectButton" type="button" class="btn btn-outline btn-sm align-self-start" :disabled="busy" @click="askDisconnect">{{ t('schedule.calendar.disconnect') }}</button>
      <div v-else ref="removeDialog" class="alert alert-note flex-column" role="alertdialog" aria-labelledby="remove-q" data-testid="calendar-disconnect-ask">
        <strong id="remove-q">{{ t('schedule.calendar.removeAsk') }}</strong>
        <div class="d-flex flex-column flex-sm-row flex-wrap gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="disconnect(true)">{{ t('schedule.calendar.removeYes') }}</button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="disconnect(false)">{{ t('schedule.calendar.removeNo') }}</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="cancelDisconnect">{{ t('schedule.calendar.cancel') }}</button>
        </div>
      </div>
    </template>
  </section>
</template>
