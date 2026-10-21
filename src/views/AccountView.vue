<!-- Owner: Isaac. Shows the details the person gave when they signed up. The password is never shown. -->
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authStore, logout } from '../stores/auth'
import PageHeader from '../components/layout/PageHeader.vue'
import Card from '../components/layout/Card.vue'
import BigButton from '../components/layout/BigButton.vue'

const { t, locale } = useI18n()
const router = useRouter()

const user = computed(() => authStore.user ?? {})
// '1950-03-07' becomes "7 March 1950" (or the Chinese / Malay / Tamil form) for the chosen language.
const dobText = computed(() => {
  if (!user.value.dob) return '—'
  const d = new Date(`${user.value.dob}T00:00:00`)
  return Number.isNaN(d.getTime()) ? user.value.dob : d.toLocaleDateString(locale.value, { day: 'numeric', month: 'long', year: 'numeric' })
})
const citizenshipText = computed(() => (user.value.citizenship ? t(`auth.citizenships.${user.value.citizenship}`) : '—'))

// Each row: label + value. A list, so a screen reader announces "Name: Mei Ling".
const rows = computed(() => [
  { key: 'name', label: t('auth.name'), value: user.value.name || '—' },
  { key: 'email', label: t('auth.email'), value: user.value.email || '—' },
  { key: 'dob', label: t('auth.dob'), value: dobText.value },
  { key: 'citizenship', label: t('auth.citizenship'), value: citizenshipText.value },
])

function leave() {
  logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="account d-flex flex-column gap-4">
    <PageHeader :title="t('pages.account')">{{ t('account.lead') }}</PageHeader>

    <Card :title="t('account.details')">
      <dl class="rows m-0">
        <div v-for="r in rows" :key="r.key" class="row-item" :data-testid="`account-${r.key}`">
          <dt>{{ r.label }}</dt>
          <dd>{{ r.value }}</dd>
        </div>
      </dl>
      <p class="text-soft mt-3 mb-0">{{ t('account.passwordNote') }}</p>
    </Card>

    <BigButton variant="alt" data-testid="account-logout" @click="leave">{{ t('account.logout') }}</BigButton>
  </div>
</template>

<style scoped>
.account { max-width: 620px; margin: 0 auto; }
.row-item { display: flex; flex-direction: column; gap: var(--s-1); padding: var(--s-3) 0; border-bottom: 1px solid var(--color-border); }
.row-item:last-child { border-bottom: 0; }
dt { font-size: var(--fs-small); color: var(--color-text-muted); font-weight: 600; }
dd { margin: 0; font-size: var(--fs-h3); font-weight: 700; overflow-wrap: anywhere; }
</style>