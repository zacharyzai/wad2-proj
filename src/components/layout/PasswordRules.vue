<script setup>
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

defineProps({
  checks: { type: Object, required: true }, // passwordChecks(): { rule: met? }
  tried: { type: Boolean, default: false },
})
const { t } = useI18n()
</script>

<template>
  <div class="auth-rules" :class="{ tried }">
    <span class="auth-rules-title">{{ t('auth.pwRules.title') }}</span>
    <ul class="m-0">
      <li v-for="(ok, rule) in checks" :key="rule" :class="{ ok }" :data-rule="rule" :data-ok="ok">
        <span class="auth-rule-mark" aria-hidden="true"
          ><AppIcon v-if="ok" name="check" :size="16" :stroke="3" /><AppIcon
            v-else-if="tried"
            name="x"
            :size="16"
            :stroke="3"
        /></span>
        <span
          ><span class="visually-hidden"
            >{{ t(ok ? 'auth.pwRules.met' : 'auth.pwRules.notMet') }}: </span
          >{{ t(`auth.pwRules.${rule}`) }}</span
        >
      </li>
    </ul>
  </div>
</template>
