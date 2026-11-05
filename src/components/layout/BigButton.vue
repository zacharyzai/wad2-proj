<!-- Large button or link for the main action on a page; can show a busy state. -->
<script setup>
defineProps({
  to: { type: [String, Object], default: null },
  variant: { type: String, default: 'main' }, // 'main' | 'alt'
  busy: { type: Boolean, default: false }, // disables the button while a request is running
})
</script>

<template>
  <RouterLink
    v-if="to"
    :to="to"
    class="btn"
    :class="variant === 'alt' ? 'btn-secondary' : 'btn-primary'"
    ><slot
  /></RouterLink>
  <button
    v-else
    type="button"
    class="btn"
    :class="variant === 'alt' ? 'btn-secondary' : 'btn-primary'"
    :disabled="busy"
  >
    <slot />
  </button>
</template>
