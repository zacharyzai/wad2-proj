<!-- Owner: Isaac. From the Claude Design 404 screen. -->
<script setup>
import { useI18n } from 'vue-i18n'
import EmptyState from '../components/layout/EmptyState.vue'
import AppIcon from '../components/layout/AppIcon.vue'
import { openGuide } from '../stores/guide'

const { t } = useI18n()
</script>

<template>
  <div class="page">
    <EmptyState as="h1" :label="t('notFound.label')" :title="t('notFound.title')" :text="t('notFound.text')" icon="compass">
      <template #default>
        <RouterLink to="/" class="btn btn-primary"><AppIcon name="home" />{{ t('notFound.home') }}</RouterLink>
        <RouterLink :to="{ name: 'ask' }" class="btn btn-ghost"><AppIcon name="chat" />{{ t('notFound.ask') }}</RouterLink>
        <button type="button" class="btn btn-ghost" @click="openGuide"><AppIcon name="compass" />{{ t('guide.open') }}</button>
      </template>
    </EmptyState>
  </div>
</template>
