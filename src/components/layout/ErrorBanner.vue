<!-- Owner: Isaac. Shows an API error code in the chosen language. Unknown codes fall back to a generic message. -->
<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  code: { type: String, required: true }, // e.g. 'WRONG_LOGIN', from res.error.code
  retryable: { type: Boolean, default: false },
})
defineEmits(['retry'])

const { t, te } = useI18n()
const message = computed(() => (te(`errors.${props.code}`) ? t(`errors.${props.code}`) : t('errors.SERVER_ERROR')))
</script>

<template>
  <div class="alert-red" role="alert">
    <div class="d-flex flex-column gap-3">
      <div class="title">{{ message }}</div>
      <button v-if="retryable" type="button" class="btn-small" @click="$emit('retry')">{{ t('common.retry') }}</button>
    </div>
  </div>
</template>