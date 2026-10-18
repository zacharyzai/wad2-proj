<!-- Owner: Isaac. Shows an API error code in the chosen language. Unknown codes fall back to a generic message. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  code: { type: String, required: true }, // e.g. 'WRONG_LOGIN', from res.error.code
  retryable: { type: Boolean, default: false },
})
defineEmits(['retry'])

const { t, te } = useI18n()
const message = computed(() => (te(`errors.${props.code}`) ? t(`errors.${props.code}`) : t('errors.SERVER_ERROR')))
</script>

<template>
  <div class="alert alert-warning" role="alert">
    <AppIcon name="alert" />
    <div class="d-flex flex-column gap-3">
      <div>{{ message }}</div>
      <button v-if="retryable" type="button" class="btn btn-outline btn-sm align-self-start" @click="$emit('retry')">{{ t('common.retry') }}</button>
    </div>
  </div>
</template>
