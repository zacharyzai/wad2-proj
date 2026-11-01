// A short message at the bottom of the page ("Saved", "Not saved") that hides itself after a few seconds.
// A composable (Week 11): reusable reactive state + functions. Pages show it with <p v-if="toast">{{ toast.text }}</p>.
import { onBeforeUnmount, ref } from 'vue'

export function useToast(ms = 3000) {
  const toast = ref(null) // { text, bad } while showing
  let timer = 0

  function notify(text, bad = false) {
    clearTimeout(timer)
    toast.value = { text, bad }
    timer = setTimeout(() => (toast.value = null), ms)
  }

  onBeforeUnmount(() => clearTimeout(timer))
  return { toast, notify }
}
