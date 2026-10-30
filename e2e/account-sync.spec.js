// What a logged-in senior's app saves to their account in the background: each checked scan to History, and the timetable
// for their caregiver (src/stores/scheduleSync.js). Both calls are answered here, so no database is needed.
import { test, expect } from './fixtures.js'

async function answerSaves(page) {
  const sent = { history: [], schedule: [] }
  await page.route('**/api/history', (route) => {
    sent.history.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { ok: true, data: { id: '0123456789abcdef01234567', createdAt: new Date().toISOString() } } })
  })
  await page.route('**/api/schedule', (route) => {
    sent.schedule.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true, data: { saved: route.request().postDataJSON().entries.length } } })
  })
  return sent
}

async function confirmSample(page) {
  await page.goto('/scan?type=medication')
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take 1 tablet, 2 times a day.')
}

test('Looks correct saves the checked scan to History, and the timetable to the account', async ({ page }) => {
  const sent = await answerSaves(page)
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/schedule') && r.method() === 'PUT')
  await confirmSample(page)

  expect(sent.history).toHaveLength(1)
  const { scan } = sent.history[0]
  expect(Object.keys(scan).sort()).toEqual(['medication', 'source', 'type', 'unclear']) // contract fields only, never the photo
  expect(scan.medication.name).toBe('Metformin')

  const [entry] = (await saved).postDataJSON().entries
  expect(entry.label).toContain('Metformin')
  expect(entry.doses.map((d) => d.time)).toEqual(['08:00', '18:00'])
})

test("a shared browser never sends the last senior's medicines to the next senior's account", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('medicinesOwner', 'someone-else@example.com'))
  const sent = await answerSaves(page)
  await confirmSample(page)
  await page.waitForTimeout(2500) // past the 1.5 s wait before a timetable is sent
  expect(sent.history).toHaveLength(1) // History is per account already, so it still saves
  expect(sent.schedule).toEqual([])
})
