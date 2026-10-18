<!-- Owner: Isaac. The "empty" state: say what is missing and what to do next. Put the action button in the slot. -->
<script setup>
defineProps({
  title: { type: String, required: true },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="box soft d-flex flex-column gap-3">
    <h2 class="h-sec">{{ title }}</h2>
    <p v-if="text">{{ text }}</p>
    <div><slot /></div>
  </div>
</template>