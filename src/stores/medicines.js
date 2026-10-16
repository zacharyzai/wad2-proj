// The user's medicines, so Ask can answer about what they actually take. Extracted text only (contract fields), never photos.
// shortcut: kept in this browser only; move to the user's account (Sheen Hern's history API) once login exists.
import { reactive, toRaw, watch } from 'vue'

const KEY = 'medicines'
const MAX = 10 // same limit as the server

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list.filter((m) => m?.medication?.name) : []
  } catch {
    return [] // storage blocked or corrupted: start empty
  }
}

// [{ id, source: 'label' | 'typed', sample, medication }], newest first.
export const medicines = reactive(load())

watch(medicines, (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Not critical: the list just won't survive a reload.
  }
})

const same = (a, b) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && (a.strength ?? '') === (b.strength ?? '')

// Re-adding a medicine replaces the old entry, so a re-scanned label updates its instructions.
export function rememberMedicine(medication, source, sample = false) {
  const copy = structuredClone(toRaw(medication))
  const old = medicines.findIndex((m) => same(m.medication, copy))
  if (old !== -1) medicines.splice(old, 1)
  medicines.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, source, sample, medication: copy })
  medicines.splice(MAX)
}

// Returns what was removed and where, so the page can offer Undo.
export function forgetMedicine(id) {
  const index = medicines.findIndex((m) => m.id === id)
  return index === -1 ? null : { entry: medicines.splice(index, 1)[0], index }
}

export function restoreMedicine({ entry, index }) {
  if (!medicines.some((m) => m.id === entry.id)) medicines.splice(index, 0, entry)
}
