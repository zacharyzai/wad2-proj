// Home's capsule (components/home/WavingCapsule.vue) counts each new thing it does here, so other things on Home can move
// at the same moments: the reminder bell rings when the capsule moves (components/home/TodayMedicines.vue).
import { ref } from 'vue'

export const capsuleBeat = ref(0)
