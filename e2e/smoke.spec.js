// Foundation smoke test. Each owner adds their own <feature>.spec.js next to this one.
import { test, expect } from '@playwright/test'

test('home page loads and switches language', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Understand your medicine and bills')

  await page.getByTestId('language-select').selectOption('zh')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('看懂您的药物和账单')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
})

test('sample scan works through the dev proxy', async ({ request }) => {
  const res = await request.post('/api/scan', { data: { sampleId: 'med-1' } })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.data.medication.name).toBe('Metformin')
})
