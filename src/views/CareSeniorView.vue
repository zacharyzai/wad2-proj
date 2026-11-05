<!-- Caregiver view of one senior's day: a summary card, then today's doses and their medicine details. -->
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { careToday } from '../api/client'
import { useScheduleText } from '../composables/useScheduleText'
import PageHeader from '../components/layout/PageHeader.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import KindIcon from '../components/layout/KindIcon.vue'
import CareHero from '../components/care/CareHero.vue'

const { t, locale } = useI18n()
const route = useRoute()
const { doseText, timesText } = useScheduleText()

const senior = ref(null)
const doses = ref([])
const medicines = ref([]) // { id, entry, purpose, rawInstruction, warnings }
// Tapping a card turns it over to the medicine's details. Focus goes with it, because the side turned away can't be reached (inert).
const flipped = reactive(new Set())
// Flips a dose card between its time/status and its medicine details.
async function flip(key, event) {
  const card = event.currentTarget.closest('.flip')
  flipped.has(key) ? flipped.delete(key) : flipped.add(key)
  await nextTick()
  card
    .querySelector(flipped.has(key) ? '.flip-back button' : '.flip-front')
    .focus({ preventScroll: true })
}
const shared = ref(true) // false: the senior's app has never saved a timetable to their account
const loading = ref(true)
const errorCode = ref(null)
const updated = ref(null)
// The link was removed (or never existed): both answer 404, so nothing is revealed about who has an account.
const gone = computed(() => errorCode.value === 'NOT_FOUND')

const STATUS = {
  taken: { icon: 'checkCircle', badge: 'badge-success' },
  missed: { icon: 'alert', badge: 'badge-warning' }, // "Not ticked": maybe forgotten, so amber, not red
  upcoming: { icon: 'clock', badge: 'badge-teal' },
}
// How many of today's doses have this status.
const count = (status) => doses.value.filter((d) => d.status === status).length
const missed = computed(() => doses.value.filter((d) => d.status === 'missed'))
const sorted = computed(() => [...doses.value].sort((a, b) => a.time.localeCompare(b.time)))
// One card per dose today, each with its medicine's details on the back; then any medicine with no dose today ("when necessary").
const medicineOf = (dose) =>
  medicines.value.find((m) => m.entry.doses.some((d) => d.id === dose.doseId))
const cards = computed(() => [
  ...sorted.value.map((d) => ({ ...d, key: d.doseId, medicine: medicineOf(d) })),
  ...medicines.value
    .filter((m) => !doses.value.some((d) => medicineOf(d) === m))
    .map((m) => ({ key: m.id, label: m.entry.label, medicine: m })),
])
const updatedText = computed(() =>
  updated.value
    ? updated.value.toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' })
    : '',
)

// quiet = background refresh: no spinner, and an old list stays on screen if the network blips.
async function load(quiet = false) {
  if (!quiet) loading.value = true
  const res = await careToday(String(route.params.seniorId))
  loading.value = false
  if (res.ok) {
    errorCode.value = null
    senior.value = res.data.senior
    doses.value = res.data.doses
    medicines.value = res.data.medicines ?? []
    shared.value = res.data.shared !== false
    updated.value = new Date()
  } else if (!quiet || res.error.code === 'NOT_FOUND') errorCode.value = res.error.code
}

let timer
onMounted(() => {
  load()
  timer = setInterval(() => load(true), 60_000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <CareHero
      v-if="senior && !gone"
      :name="senior.name"
      :shared="shared"
      :doses="doses"
      :medicines="medicines.length"
      :updated="updatedText"
      @refresh="load()"
    />
    <PageHeader v-else :title="t('pages.careSenior')" :back="{ name: 'care' }" />

    <LoadingState v-if="loading" />
    <EmptyState
      v-else-if="gone"
      :title="t('care.goneTitle')"
      :text="t('care.goneText')"
      icon="users"
    >
      <RouterLink :to="{ name: 'care' }" class="btn btn-primary">{{ t('pages.care') }}</RouterLink>
    </EmptyState>
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load()" />

    <EmptyState
      v-else-if="!shared"
      :title="t('care.notShared')"
      :text="t('care.notSharedText', { name: senior.name })"
      icon="calendar"
    />

    <template v-else>
      <!-- The one thing a caregiver wants to know: has anything been missed? -->
      <div v-if="missed.length" class="alert alert-warning" role="status" data-testid="care-missed">
        <AppIcon name="alert" />
        <span>{{
          t('care.missedBanner', { name: senior.name, n: missed.length }, missed.length)
        }}</span>
      </div>
      <div
        v-else-if="doses.length && !count('upcoming')"
        class="alert alert-success"
        role="status"
        data-testid="care-all-taken"
      >
        <AppIcon name="checkCircle" /><span>{{ t('care.allTaken', { name: senior.name }) }}</span>
      </div>

      <EmptyState
        v-if="!cards.length"
        :title="t('care.noDoses')"
        :text="t('care.noDosesText', { name: senior.name })"
        icon="calendar"
      />
      <!-- Each card turns over to its medicine's details, to read only: the way back is the only button there. -->
      <ul v-if="cards.length" class="flip-grid list-unstyled m-0" data-testid="care-doses">
        <li
          v-for="c in cards"
          :key="c.key"
          class="flip"
          :data-status="c.status"
          :data-testid="c.status ? 'care-dose' : 'care-other'"
        >
          <div class="flip-inner" :class="{ over: flipped.has(c.key) }">
            <component
              :is="c.medicine ? 'button' : 'div'"
              :type="c.medicine ? 'button' : null"
              class="card flip-face flip-front"
              :class="{ 'card-interactive': c.medicine }"
              :inert="flipped.has(c.key)"
              data-testid="care-medicine-open"
              @click="c.medicine && flip(c.key, $event)"
            >
              <span class="flip-top">
                <span v-if="c.time" class="dose-time">{{ c.time }}</span>
                <span v-if="c.status" class="badge" :class="STATUS[c.status]?.badge"
                  ><AppIcon :name="STATUS[c.status]?.icon ?? 'info'" :size="18" />{{
                    t(`care.status.${c.status}`)
                  }}</span
                >
              </span>
              <span class="dose-label">{{ c.label }}</span>
              <span v-if="c.medicine?.purpose" class="text-body-secondary"
                >{{ t('purpose.lead') }} {{ t(`purpose.${c.medicine.purpose}`) }}</span
              >
              <span v-if="c.medicine" class="flip-hint"
                >{{ t('care.medSee') }}<AppIcon name="right" :size="18"
              /></span>
            </component>
            <div
              v-if="c.medicine"
              class="card flip-face flip-back"
              :inert="!flipped.has(c.key)"
              data-testid="care-medicine-details"
            >
              <span class="dose-label">{{ c.label }}</span>
              <span v-if="doseText(c.medicine.entry.instruction)" class="fw-semibold">{{
                doseText(c.medicine.entry.instruction)
              }}</span>
              <span v-if="c.medicine.entry.doses.length" class="d-flex align-items-center gap-2"
                ><AppIcon name="clock" :size="18" />{{ timesText(c.medicine.entry) }}</span
              >
              <span v-if="c.medicine.rawInstruction" class="text-body-secondary" lang="en"
                >“{{ c.medicine.rawInstruction }}”</span
              >
              <ul v-if="c.medicine.warnings.length" class="m-0 ps-4" lang="en">
                <li v-for="w in c.medicine.warnings" :key="w">{{ w }}</li>
              </ul>
              <button
                type="button"
                class="btn btn-outline btn-sm align-self-start mt-auto"
                :aria-label="`${t('nav.back')}: ${c.label}`"
                data-testid="care-medicine-close"
                @click="flip(c.key, $event)"
              >
                <AppIcon name="left" :size="20" />{{ t('nav.back') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.dose-time {
  font-size: var(--fs-h2);
  font-weight: 800;
  min-width: 4.5ch;
}
.dose-label {
  font-size: var(--fs-h3);
  font-weight: 600;
  overflow-wrap: anywhere;
}
/* Turning a medicine over: both sides share one grid cell, so the card is as tall as its longer side and never jumps. */
.flip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: var(--s-4);
}
.flip {
  perspective: 1200px;
}
.flip-inner {
  display: grid;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 520ms cubic-bezier(0.4, 0, 0.2, 1);
}
.flip-inner.over {
  transform: rotateY(180deg);
}
.flip-face {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  text-align: left;
}
.flip-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  width: 100%;
}
.flip-front {
  width: 100%;
  font: inherit;
  color: inherit;
}
button.flip-front {
  cursor: pointer;
}
.flip-back {
  transform: rotateY(180deg);
}
.flip-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: var(--s-2);
  font-weight: 700;
  color: var(--color-link);
}
/* Reduced motion: the side changes at once. */
@media (prefers-reduced-motion: reduce) {
  .flip-inner {
    transition: none;
  }
}
</style>
