<!-- Owner: Isaac (redesigned by Asher). Caregivers only. The seniors who invited you, each with today at a glance.
     At the top, the whole picture in three tiles: how many people, whether anyone may need a call, and the doses taken today
     across them all. Then one card per senior: their picture and name, how today is going in words (Needs a check / On
     track / All taken today), a bar of today's doses (taken, not ticked, to come) with the counts, and the details a
     caregiver asks about: the next dose, how many medicines, and since when they have been linked. Cards rise in one by
     one and lift under the mouse. API: docs/care-contract.md. Reduced motion: nothing moves. -->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { careSeniors } from '../api/client'
import { useScheduleText } from '../composables/useScheduleText'
import { dayParts, dayState } from '../rules/care'
import PageHeader from '../components/layout/PageHeader.vue'
import LoadingState from '../components/layout/LoadingState.vue'
import EmptyState from '../components/layout/EmptyState.vue'
import ErrorBanner from '../components/layout/ErrorBanner.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import CareAvatar from '../components/care/CareAvatar.vue'

const { t, locale } = useI18n()
const { timeText } = useScheduleText()
const seniors = ref([])
const loading = ref(true)
const errorCode = ref(null)

async function load() {
  loading.value = true
  errorCode.value = null
  const res = await careSeniors()
  loading.value = false
  if (!res.ok) return void (errorCode.value = res.error.code)
  seniors.value = res.data.seniors
}
onMounted(load)

const STATE_ICON = { missed: 'alert', done: 'checkCircle', onTrack: 'clock', none: 'calendar', notShared: 'info' }
const rows = computed(() =>
  seniors.value.map((s) => ({ ...s, state: s.today ? dayState(s.today) : 'notShared', parts: s.today ? dayParts(s.today) : null })),
)
// The whole picture: people, who may need a call, doses taken across everyone.
const overview = computed(() => {
  const shared = rows.value.filter((r) => r.today)
  return {
    people: rows.value.length,
    needCall: rows.value.filter((r) => r.state === 'missed').length,
    taken: shared.reduce((n, r) => n + r.today.taken, 0),
    total: shared.reduce((n, r) => n + r.parts.total, 0),
  }
})
const sinceText = (iso) => new Date(iso).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
</script>

<template>
  <div class="page">
    <PageHeader :title="t('pages.care')">{{ t('care.lead') }}</PageHeader>

    <LoadingState v-if="loading" />
    <ErrorBanner v-else-if="errorCode" :code="errorCode" retryable @retry="load" />
    <EmptyState v-else-if="!seniors.length" :title="t('care.emptyTitle')" :text="t('care.emptyText')" icon="users" />

    <template v-else>
      <!-- The whole picture, in three tiles. -->
      <section class="cv-overview" :aria-label="t('care.overview.label')" data-testid="care-overview">
        <div class="cv-tile">
          <span class="cv-tile-icon" aria-hidden="true"><AppIcon name="users" :size="24" /></span>
          <span class="cv-tile-num">{{ overview.people }}</span>
          <span class="cv-tile-words">{{ t('care.overview.people', { n: overview.people }, overview.people) }}</span>
        </div>
        <div class="cv-tile" :class="overview.needCall ? 'is-warn' : 'is-ok'" data-testid="care-overview-call">
          <span class="cv-tile-icon" aria-hidden="true"><AppIcon :name="overview.needCall ? 'phone' : 'checkCircle'" :size="24" /></span>
          <span class="cv-tile-num">{{ overview.needCall }}</span>
          <span class="cv-tile-words">{{ overview.needCall ? t('care.overview.needCall', { n: overview.needCall }, overview.needCall) : t('care.overview.allGood') }}</span>
        </div>
        <div class="cv-tile">
          <span class="cv-tile-icon" aria-hidden="true"><AppIcon name="pill" :size="24" /></span>
          <span class="cv-tile-num">{{ overview.taken }}<small>/{{ overview.total }}</small></span>
          <span class="cv-tile-words">{{ t('care.overview.doses') }}</span>
        </div>
      </section>

      <ul class="cv-list list-unstyled m-0" data-testid="care-list">
        <li v-for="(s, i) in rows" :key="s.id" :style="{ '--n': i }">
          <RouterLink :to="{ name: 'care-senior', params: { seniorId: s.id } }" class="cv-card" :class="`is-${s.state}`" data-testid="care-senior" :data-state="s.state">
            <span class="cv-head">
              <CareAvatar :name="s.name" :state="s.today ? s.state : null" />
              <span class="cv-who">
                <span class="cv-name">{{ s.name }}</span>
                <!-- How today is going, in words and an icon (never colour alone). -->
                <span class="cv-state"><AppIcon :name="STATE_ICON[s.state]" :size="18" />{{ t(`care.state.${s.state}`) }}</span>
              </span>
            </span>

            <template v-if="s.today">
              <span class="cv-progress">
                <span class="cv-progress-words">{{ t('care.progress', { taken: s.today.taken, total: s.parts.total }) }}</span>
                <span class="cv-bar" aria-hidden="true">
                  <span class="cv-seg seg-taken" :style="{ width: `${s.parts.taken}%` }"></span>
                  <span class="cv-seg seg-missed" :style="{ width: `${s.parts.missed}%` }"></span>
                </span>
                <span class="cv-counts">
                  <span class="cv-count c-taken"><AppIcon name="checkCircle" :size="18" />{{ t('care.nTaken', { n: s.today.taken }) }}</span>
                  <span v-if="s.today.missed" class="cv-count c-missed"><AppIcon name="alert" :size="18" />{{ t('care.nMissed', { n: s.today.missed }) }}</span>
                  <span class="cv-count c-upcoming"><AppIcon name="clock" :size="18" />{{ t('care.nUpcoming', { n: s.today.upcoming }) }}</span>
                </span>
              </span>
            </template>
            <span v-else class="cv-unshared">{{ t('care.notSharedText', { name: s.name }) }}</span>

            <!-- What a caregiver asks about, in one organised list. -->
            <dl class="cv-details m-0">
              <div v-if="s.today">
                <dt><AppIcon name="clock" :size="18" />{{ t('care.next') }}</dt>
                <dd data-testid="care-next">{{ s.next ? `${timeText(s.next.time)} · ${s.next.label}` : t('care.nextNone') }}</dd>
              </div>
              <div v-if="s.medicines != null">
                <dt><AppIcon name="pill" :size="18" />{{ t('care.meds') }}</dt>
                <dd>{{ t('care.medsCount', { n: s.medicines }, s.medicines) }}</dd>
              </div>
              <div v-if="s.since">
                <dt><AppIcon name="heart" :size="18" />{{ t('care.since') }}</dt>
                <dd>{{ sinceText(s.since) }}</dd>
              </div>
            </dl>

            <span class="cv-go">{{ t('care.open') }}<AppIcon name="right" :size="20" :stroke="2.5" /></span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped src="../styles/views/CareView.css"></style>
