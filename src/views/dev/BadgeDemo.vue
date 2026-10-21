<!-- Owner: Zachary. Dev-only demo (/dev/badges, not in production builds) for components/layout/StatusBadge.vue.
     English only on purpose: it is a developer page; real uses take their labels from t(). -->
<script setup>
import StatusBadge from '../../components/layout/StatusBadge.vue'
</script>

<template>
  <div class="d-flex flex-column gap-4">
    <h1>StatusBadge demo</h1>
    <div class="d-flex flex-wrap justify-content-center gap-3">
      <StatusBadge left-icon="shield" right-icon="xCircle" left-label="Protection" right-label="SSO login" status="success" />
      <StatusBadge left-icon="checkCircle" right-icon="xCircle" left-label="Live" right-label="Audit trails" status="success" />
      <StatusBadge left-icon="xCircle" right-icon="shield" left-label="Safety checks" right-label="Production" status="error" />
      <StatusBadge left-label="No icons" right-label="Default" />
    </div>
  </div>
</template>
