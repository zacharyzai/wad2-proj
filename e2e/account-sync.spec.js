// The medicine list belongs to the account, not the browser (src/stores/scheduleSync.js): loaded from GET /api/schedule,
// saved with PUT after a change, and a checked scan goes to History. Both calls are answered here, so no database is needed.
import { test, expect } from './fixtures.js'

const med = (id, name) => ({ id, source: 'label', sample: false, medication: { name, strength: '5 mg', doseAmount: 1, doseUnit: 'tablet', quantity: null,
  timesPerDay: 1, timing: ['morning'], withFood: null, frequencyType: 'daily', rawInstruction: null, warnings: [] }, schedule: { startDate: '2026-10-01', days: 365, times: {} } })

async function account(page, saved) {
  const sent = { history: [], schedule: [] }
  await page.route('**/api/history', (route) => {
    sent.history.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: { ok: true, data: { id: '0123456789abcdef01234567', createdAt: new Date().toISOString() } } })
  })
  await page.route('**/api/schedule', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { ok: true, data: { medicines: saved } } })
    sent.schedule.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true, data: { saved: route.request().postDataJSON().medicines.length } } })
  })
  return sent
}

test('Looks correct saves the scan to History and the medicine to the account', async ({ page }) => {
  const sent = await account(page, [])
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/schedule') && r.method() === 'PUT')
  await page.goto('/scan')
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take 1 tablet, 2 times a day.')

  expect(sent.history).toHaveLength(1)
  expect(Object.keys(sent.history[0].scan).sort()).toEqual(['medication', 'source', 'type', 'unclear']) // contract fields only, never the photo
  const { medicines } = (await saved).postDataJSON()
  expect(medicines.map((m) => m.medication.name)).toEqual(['Metformin'])
})

test("the account's list replaces whatever this browser had, and loading it sends nothing back", async ({ page }) => {
  // Left by another account on this browser (a shared tablet): never shown, never saved here.
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('medicines', JSON.stringify(list))
    localStorage.setItem('medicinesOwner', 'someone-else@example.com')
  }, [med('other-1', 'Someone Else Pill')])
  const sent = await account(page, [med('acct-1', 'Amlodipine')])
  await page.goto('/schedule?view=meds')
  await expect(page.getByText('Amlodipine').first()).toBeVisible()
  await expect(page.getByText('Someone Else Pill')).toHaveCount(0)
  await page.waitForTimeout(2000) // past the 1.5 s wait before a save
  expect(sent.schedule).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('medicinesOwner'))).toBe('demo@example.com')
})

test("an account that never saved a list keeps this browser's own list and saves it once", async ({ page }) => {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem('medicines', JSON.stringify(list))
  }, [med('old-1', 'Lisinopril')])
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/schedule') && r.method() === 'PUT')
  await account(page, null)
  await page.goto('/schedule?view=meds')
  await expect(page.getByText('Lisinopril').first()).toBeVisible()
  expect((await saved).postDataJSON().medicines.map((m) => m.id)).toEqual(['old-1'])
})
