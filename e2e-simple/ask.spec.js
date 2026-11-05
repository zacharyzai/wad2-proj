// Ask about my medicine: 4 E2E tests, written the Week 10 way (set up, act, assert).
// The test server uses mock AI, so answers are free and always the same.
import { test, expect } from '@playwright/test'
import { signUp, openSample } from './helpers.js'

test('Ask says hello by name', async ({ page }) => {
  await signUp(page, { name: 'Mei Ling' })
  await page.goto('/ask')
  await expect(page.getByTestId('ask-hello')).toContainText('Mei Ling')
})

test('an emergency question gets the 995 card', async ({ page }) => {
  await signUp(page)
  await page.goto('/ask')
  await page
    .getByLabel('Or type your own question')
    .fill('My mother has chest pain after taking it')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByTestId('ask-urgent')).toContainText('This could be an emergency')
  await expect(page.getByRole('link', { name: 'Call 995' })).toBeVisible()
})

test('a question gets an answer', async ({ page }) => {
  await signUp(page)
  await page.goto('/ask')
  await page.getByLabel('Or type your own question').fill('How do I store medicines?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByTestId('ask-answer')).toBeVisible()
})

test('a checked label shows in My medicines', async ({ page }) => {
  await signUp(page)
  await openSample(page, 'Metformin label')
  await page.getByRole('button', { name: 'Looks correct' }).click()
  await page.goto('/ask')
  await page.getByRole('button', { name: /^My medicines/ }).click()
  await expect(page.getByTestId('my-medicines')).toContainText('Metformin')
})
