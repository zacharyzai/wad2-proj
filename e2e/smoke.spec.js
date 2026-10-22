// Foundation smoke test. Each owner adds their own <feature>.spec.js next to this one.
import { test, expect } from './fixtures.js'
import { testToken } from './helpers/auth.js'

test('home page loads and switches language', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would you like to understand?')

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('您想了解什么？')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
})

test('sample scan works through the dev proxy, and only with a login', async ({ request }) => {
  expect((await request.post('/api/scan', { data: { sampleId: 'med-1' } })).status()).toBe(401)
  const res = await request.post('/api/scan', { data: { sampleId: 'med-1' }, headers: { authorization: `Bearer ${testToken()}` } })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.data.medication.name).toBe('Metformin')
})
