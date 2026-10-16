<!-- Owner: Isaac. The standard bordered card (.box in main.css). `soft` gives the teal-tinted version.
     Give it a `title` for a heading, or just put your own content in the slot. -->
<script setup>
defineProps({
  title: { type: String, default: '' },
  soft: { type: Boolean, default: false },
})
</script>

<template>
  <div class="box d-flex flex-column gap-3" :class="{ soft }">
    <h2 v-if="title" class="h-sec">{{ title }}</h2>
    <slot />
  </div>
</template>