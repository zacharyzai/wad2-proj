// Languages and read-aloud: 6 E2E tests, written the Week 10 way (set up, act, assert).
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

const CHINESE = /[一-鿿]/ // any Chinese character
const TAMIL = /[஀-௿]/ // any Tamil letter

test('switching to Chinese changes the page', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan')
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(CHINESE)
})

test('switching to Malay changes the language', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan')
  await page.getByRole('button', { name: /^BM/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ms')
})

test('switching to Tamil changes the page', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan')
  await page.getByRole('button', { name: 'தமிழ்', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TAMIL)
})

test('the language stays after a reload', async ({ page }) => {
  await signUp(page)
  await page.goto('/scan')
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(CHINESE)
})

test('read-aloud speed can be chosen', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  const player = page.getByRole('region', { name: 'Reading in English' })
  await player.getByRole('button', { name: '1.25×' }).click()
  await expect(player.getByRole('button', { name: '1.25×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(player.getByRole('button', { name: 'Read aloud' })).toBeVisible()
})

test('Replay starts the reading again', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  const player = page.getByRole('region', { name: 'Reading in English' })
  await player.getByRole('button', { name: 'Replay' }).click()
  await expect(player.getByRole('button', { name: /Pause|Getting the audio/ })).toBeVisible()
})
