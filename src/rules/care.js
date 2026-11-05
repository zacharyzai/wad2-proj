// The caregiver pages (views/CareView.vue, views/CareSeniorView.vue): how a senior's day is going, from today's counts
// ({ taken, missed, upcoming }, server/routes/care.js). Our own rules.
//   missed   a dose not ticked once its time has passed: worth a call
//   done     every dose today taken
//   onTrack  nothing missed, some still to come
//   none     no doses today
export function dayState(today) {
  const total = today.taken + today.missed + today.upcoming
  if (today.missed) return 'missed'
  if (!total) return 'none'
  return today.upcoming ? 'onTrack' : 'done'
}

// Each part of the day as a share of all its doses (0 to 100), for a bar: taken, then not ticked, then still to come.
export function dayParts(today) {
  const total = today.taken + today.missed + today.upcoming
  const pct = (n) => (total ? (n / total) * 100 : 0)
  return {
    total,
    taken: pct(today.taken),
    missed: pct(today.missed),
    upcoming: pct(today.upcoming),
  }
}
