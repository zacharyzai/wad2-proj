<!-- Owner: Zachary (built by Claude, declared in README.txt). Ask's "My medicines": one row that opens (like a chat's attached
     context) to see the list, remove one (with Undo), add one by photo, or type one in. AskView opens the form with
     openForm() (defineExpose) and hears `added` when a typed medicine is saved. -->
<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMedicinesStore } from '../../stores/medicines'
import AppIcon from '../layout/AppIcon.vue'

const emit = defineEmits(['added'])
const { t } = useI18n()
const { medicines, rememberMedicine, forgetMedicine, restoreMedicine } = useMedicinesStore()
const medName = (m) => [m.name, m.strength].filter(Boolean).join(' ')

const open = ref(false)

// "Type a medicine": name is required, the instructions are what the label says (optional but useful).
const adding = ref(false)
const newName = ref('')
const newText = ref('')
const nameInput = ref(null)
const nameMissing = ref(false)
async function openForm() {
  open.value = true
  adding.value = true
  nameMissing.value = false
  await nextTick()
  nameInput.value.focus()
  nameInput.value.scrollIntoView({ block: 'center' })
}
defineExpose({ openForm })

function addTyped() {
  if (!newName.value.trim()) {
    nameMissing.value = true
    return nameInput.value.focus()
  }
  rememberMedicine({ name: newName.value.trim(), rawInstruction: newText.value.trim() || null }, 'typed')
  newName.value = newText.value = ''
  adding.value = false
  emit('added')
}

// Remove with Undo: the medicine goes back where it was. The toast stays 8 seconds; a new removal replaces it.
const removed = ref(null)
const undoButton = ref(null)
let toastTimer = null
async function remove(m) {
  clearTimeout(toastTimer)
  removed.value = forgetMedicine(m.id)
  toastTimer = setTimeout(() => (removed.value = null), 8000)
  await nextTick()
  undoButton.value?.focus() // the Remove button is gone, so keep keyboard focus somewhere useful
}
function undo() {
  clearTimeout(toastTimer)
  restoreMedicine(removed.value)
  removed.value = null
}
onBeforeUnmount(() => clearTimeout(toastTimer))
</script>

<template>
  <section class="card meds-panel" data-testid="my-medicines">
    <button type="button" class="meds-toggle" :aria-expanded="open" aria-controls="meds-body" @click="open = !open">
      <span class="tile tile-soft"><AppIcon name="pill" :size="22" /></span>
      <span class="meds-head">
        <span class="meds-title">{{ t('ask.meds.title') }}</span>
        <span class="badge badge-teal meds-count">{{ t('ask.meds.count', medicines.length) }}</span>
      </span>
      <AppIcon :name="open ? 'up' : 'down'" :size="22" class="text-muted-a11y" />
    </button>

    <!-- No Bootstrap d-flex here: its !important display would beat v-show. -->
    <div v-show="open" id="meds-body" class="meds-body">
      <p class="text-muted-a11y">{{ t(medicines.length ? 'ask.meds.note' : 'ask.meds.empty') }}</p>
      <ul v-if="medicines.length" class="meds">
        <li v-for="m in medicines" :key="m.id" class="med">
          <span class="tile"><AppIcon name="pill" :size="20" /></span>
          <div class="med-info">
            <span class="med-name">{{ medName(m.medication) }}</span>
            <span v-if="m.medication.rawInstruction" class="text-muted-a11y" :lang="m.source === 'label' ? 'en' : null">“{{ m.medication.rawInstruction }}”</span>
            <span v-if="m.sample || m.source === 'typed'" class="badge align-self-start">{{ t(m.sample ? 'ask.meds.sample' : 'ask.meds.typed') }}</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm" :aria-label="t('ask.meds.removeOne', { name: medName(m.medication) })" @click="remove(m)">
            {{ t('ask.meds.remove') }}
          </button>
        </li>
      </ul>

      <form v-if="adding" class="add-form" @submit.prevent="addTyped">
        <div class="field">
          <label for="new-name" class="field-label">{{ t('ask.form.name') }}</label>
          <input
            id="new-name"
            ref="nameInput"
            v-model="newName"
            class="field-input"
            :class="{ 'is-error': nameMissing }"
            maxlength="80"
            autocomplete="off"
            :aria-invalid="nameMissing"
            :aria-describedby="nameMissing ? 'new-name-error' : null"
            @input="nameMissing = false"
          />
          <span v-if="nameMissing" id="new-name-error" class="field-help name-error" role="alert">{{ t('ask.form.nameMissing') }}</span>
        </div>
        <div class="field">
          <label for="new-text" class="field-label">{{ t('ask.form.instructions') }}</label>
          <input id="new-text" v-model="newText" class="field-input" maxlength="200" autocomplete="off" aria-describedby="new-text-hint" />
          <span id="new-text-hint" class="field-help">{{ t('ask.form.hint') }}</span>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary btn-sm"><AppIcon name="plus" :size="20" />{{ t('ask.form.add') }}</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="adding = false">{{ t('ask.form.cancel') }}</button>
        </div>
      </form>
      <div v-else class="acts-row">
        <RouterLink :to="{ name: 'scan', query: { type: 'medication' } }" class="btn btn-secondary btn-sm"><AppIcon name="camera" :size="20" />{{ t('ask.meds.photo') }}</RouterLink>
        <button type="button" class="btn btn-secondary btn-sm" @click="openForm"><AppIcon name="pencil" :size="20" />{{ t('ask.meds.type') }}</button>
      </div>
    </div>

    <!-- Undo for Remove. Polite, so screen readers hear it without being interrupted. -->
    <div v-if="removed" class="toast-ahma toast-undo rise" role="status" data-testid="ask-undo">
      <span>{{ t('ask.toast.removed', { name: medName(removed.entry.medication) }) }}</span>
      <button ref="undoButton" type="button" class="btn btn-on-hero btn-sm" @click="undo">{{ t('ask.toast.undo') }}</button>
    </div>
  </section>
</template>

<style scoped src="../../styles/components/AskMedicines.css"></style>
