// Words for the Schedule page and its components, in the page language: dates, times, doses, how long a pack lasts.
// A composable (Week 11) so every Schedule component words things the same way.
import { useI18n } from 'vue-i18n'
import { useMedicinesStore } from '../stores/medicines'
import { doseSlots, labelLimitDays, packDays, supplyDays } from '../rules/schedule'

export const SLOT_ICONS = {
  morning: 'sunrise',
  afternoon: 'sun',
  evening: 'sunset',
  bedtime: 'bed',
} // same as Explain

// "Metformin 500 mg"
export const nameOf = (medication) =>
  [medication.name, medication.strength].filter(Boolean).join(' ')

export function useScheduleText() {
  const { t, locale } = useI18n()
  const { medicines } = useMedicinesStore()

  // Dates are Singapore calendar days: shown as UTC midnights, so the device's time zone never moves them.
  const dateText = (date, options = { day: 'numeric', month: 'short' }) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', ...options })
  // '18:00' → "6:00 PM" (or the page language's way of writing it)
  const timeText = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(locale.value, {
      timeZone: 'UTC',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  // "1 tablet · After food"
  const doseText = ({ count, unit, food }) =>
    [count != null && `${count} ${t(`unit.${unit ?? 'other'}`, count)}`, food && t(`food.${food}`)]
      .filter(Boolean)
      .join(' · ')
  const timesText = (entry) => entry.doses.map((d) => timeText(d.time)).join(', ')
  const amountText = (n, unit) => `${n} ${t(`unit.${unit ?? 'other'}`, n)}`

  // "Usually used for high blood pressure": from the medicine on the account, in our own words; nothing when it wasn't known.
  function purposeOf(medicineId) {
    const purpose = medicines.find((m) => m.id === medicineId)?.medication?.purpose
    return purpose ? `${t('purpose.lead')} ${t(`purpose.${purpose}`)}` : null
  }

  // "From the label: 60 tablets, 2 tablets a day, so it lasts 30 days." Only when supplyDays can do the sums.
  function supplyText(medication) {
    const days = supplyDays(medication)
    if (!days) return null
    const perDay = medication.doseAmount * doseSlots(medication).length
    // The label's limit is shorter than the pack: say that, so nobody wonders why 10 tablets are only scheduled for 7 days.
    if (days < packDays(medication))
      return t(
        'schedule.limit',
        {
          qty: amountText(medication.quantity, medication.doseUnit),
          days: labelLimitDays(medication),
        },
        days,
      )
    return t(
      'schedule.supply',
      {
        qty: amountText(medication.quantity, medication.doseUnit),
        per: amountText(perDay, medication.doseUnit),
        days,
      },
      days,
    )
  }

  // "Starts 3 Nov", "Ended 1 Nov" or "1 Nov to 30 Nov", with a kind for the badge's colour.
  function dateStatus(entry, today) {
    if (today < entry.startDate)
      return { kind: 'later', text: t('schedule.meds.starts', { date: dateText(entry.startDate) }) }
    if (today > entry.endDate)
      return { kind: 'ended', text: t('schedule.meds.ended', { date: dateText(entry.endDate) }) }
    return {
      kind: 'now',
      text: t('schedule.meds.until', {
        start: dateText(entry.startDate),
        end: dateText(entry.endDate),
      }),
    }
  }

  return { dateText, timeText, doseText, timesText, purposeOf, supplyText, dateStatus }
}
