import { reactive } from 'vue'
import { defineStore } from 'pinia'

export const useAskStore = defineStore('ask', () => {
  // state: one reactive array, changed in place (push, splice), so `const { messages } = useAskStore()` stays live.
  const messages = reactive([])

  // Empties the conversation (on log out, so the next account never sees it)
  function forget() {
    messages.splice(0)
  }

  return { messages, forget }
})
