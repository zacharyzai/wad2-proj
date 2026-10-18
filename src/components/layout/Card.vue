<!-- Owner: Isaac. The standard card (.card in styles/global/surfaces.css). `soft` gives the teal-tinted version.
     Give it a `title` for a heading, or just put your own content in the slot. -->
<script setup>
defineProps({
  title: { type: String, default: '' },
  soft: { type: Boolean, default: false },
})
</script>

<template>
  <div class="card gap-3" :class="{ 'card-tint': soft }">
    <h2 v-if="title">{{ title }}</h2>
    <slot />
  </div>
</template>
