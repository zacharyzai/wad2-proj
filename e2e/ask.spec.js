// Feature 6: Ask about my medicine. Open any time; answers use the user's medicines (checked labels or typed in).
// Answers are mocked in the browser (no AI quota); red flags hit the real server because they never reach the AI.
import { test, expect } from './fixtures.js'

async function checkSample(page) {
  await page.goto('/scan')
  await page.getByRole('button', { name: 'Metformin label' }).click()
  await page.getByRole('button', { name: 'Looks correct' }).click()
}

// Answers like the server would; records what the page sent.
function mockChat(page, replies) {
  const sent = []
  page.route('**/api/chat', (route) => {
    sent.push(route.request().postDataJSON())
    return route.fulfill({ json: replies.shift() })
  })
  return sent
}
const answer = (text, askPharmacist = false) => ({ ok: true, data: { type: 'ANSWER', answer: text, askPharmacist } })
const myMedicines = (page) => page.getByTestId('my-medicines')

test('Ask works without any medicines, with general answers', async ({ page }) => {
  const sent = mockChat(page, [answer('Keep them in a cool, dry place.', true)])
  await page.goto('/ask')
  await expect(myMedicines(page)).toContainText('None yet')
  // Folded until tapped.
  const toggle = page.getByRole('button', { name: /^My medicines/ })
  await expect(page.getByRole('button', { name: 'Type it in' })).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Type it in' })).toBeVisible()
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await expect(page.getByTestId('ask-answer')).toContainText('Keep them in a cool, dry place.')
  await expect(page.getByTestId('ask-pharmacist')).toContainText('Check with your pharmacist')
  expect(sent[0]).toMatchObject({ medicines: [], question: 'How do I store medicines?', lang: 'en' })
})

test('a checked label is remembered, sent with questions, and can be removed', async ({ page }) => {
  const sent = mockChat(page, [answer('Take it after your meal.'), answer(null, true)])
  await checkSample(page)
  await page.getByRole('link', { name: 'Ask about this medicine' }).click()
  await expect(myMedicines(page)).toContainText('Metformin 500 mg')
  await expect(myMedicines(page)).toContainText('Sample')

  await page.getByRole('button', { name: 'Can I take my medicine with food?' }).click()
  await expect(page.getByTestId('ask-answer')).toContainText('Take it after your meal.')
  expect(sent[0].medicines).toMatchObject([{ source: 'label', medication: { name: 'Metformin', strength: '500 mg' } }])

  // Typed question sent with Enter; a "not on the label" reply shows the fixed pharmacist line.
  await page.getByLabel('Or type your own question').fill('Can I drink coffee with it?')
  await page.getByLabel('Or type your own question').press('Enter')
  await expect(page.getByTestId('ask-answer').nth(1)).toContainText('Not on your label. Ask your pharmacist.')
  await expect(page.getByLabel('Or type your own question')).toHaveValue('')

  // The medicine list survives a reload; the conversation survives moving between pages.
  await page.getByRole('link', { name: 'Scan', exact: true }).click()
  await page.getByRole('link', { name: 'Ask', exact: true }).click()
  await expect(page.getByTestId('ask-answer')).toHaveCount(2)
  await page.reload()
  await page.getByRole('button', { name: /^My medicines/ }).click()
  await page.getByRole('button', { name: 'Remove Metformin 500 mg' }).click()
  await expect(myMedicines(page)).toContainText('None yet')
  await expect(page.getByTestId('ask-undo')).toContainText('Metformin 500 mg removed')
})

test('Undo puts a removed medicine back where it was', async ({ page }) => {
  await page.goto('/ask')
  for (const name of ['Amlodipine', 'Panadol', 'Lipitor']) {
    await page.getByRole('button', { name: 'Add a medicine' }).click()
    await page.getByLabel('Medicine name').fill(name)
    await page.getByRole('button', { name: 'Add medicine' }).click()
  }
  const names = myMedicines(page).locator('.med-name')
  await expect(names).toHaveText(['Lipitor', 'Panadol', 'Amlodipine'])
  await page.getByRole('button', { name: 'Remove Panadol' }).click()
  await expect(names).toHaveText(['Lipitor', 'Amlodipine'])
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(names).toHaveText(['Lipitor', 'Panadol', 'Amlodipine'])
  await expect(page.getByTestId('ask-undo')).toHaveCount(0)
})

test('one question at a time, then follow-ups under the answer', async ({ page }) => {
  let release
  const sent = []
  await page.route('**/api/chat', async (route) => {
    sent.push(route.request().postDataJSON())
    if (sent.length === 1) await new Promise((r) => (release = r))
    route.fulfill({ json: answer('Take it after meals.') })
  })
  await page.goto('/ask')
  await page.getByRole('button', { name: 'Can I take my medicine with food?' }).click()
  await expect(page.getByTestId('ask-loading')).toContainText('Thinking')
  await expect(page.getByTestId('ask-thread')).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByRole('button', { name: 'When do I take my medicine?' })).toBeDisabled()
  await page.getByLabel('Or type your own question').fill('Another one')
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
  release()

  const follow = page.getByTestId('ask-follow')
  await expect(follow.getByRole('button')).toHaveText(['When do I take my medicine?', 'What side effects to watch for?', 'What if I miss a dose?'])
  await follow.getByRole('button', { name: 'What side effects to watch for?' }).click()
  await expect(page.getByTestId('ask-answer')).toHaveCount(2)
  expect(sent.map((b) => b.question)).toEqual(['Can I take my medicine with food?', 'What side effects to watch for?'])
  await expect(page.getByTestId('ask-follow')).toHaveCount(1) // only under the newest answer
})

test('sources, when a reply has them, show under the answer', async ({ page }) => {
  mockChat(page, [{ ok: true, data: { type: 'ANSWER', answer: 'Keep below 30 degrees.', askPharmacist: false, sources: [{ title: 'HealthHub' }] } }])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await expect(page.getByTestId('ask-from')).toHaveText('From: HealthHub')
})

test('a question about an unknown medicine asks for it, and adding it answers the question', async ({ page }) => {
  const sent = mockChat(page, [{ ok: true, data: { type: 'NEED_MEDICINE' } }, answer('Take 2 tablets when needed, as your label says.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'When do I take my medicine?' }).click()
  const need = page.getByTestId('ask-need')
  await expect(need).toContainText('Which medicine is this?')
  await expect(need.getByRole('link', { name: 'Photo of label' })).toHaveAttribute('href', '/scan?type=medication')
  await expect(need.getByRole('button', { name: 'Ask again' })).toBeDisabled()

  await need.getByRole('button', { name: 'Type it in' }).click()
  await expect(page.getByLabel('Medicine name')).toBeFocused()
  await page.getByLabel('Medicine name').fill('Panadol')
  await page.getByLabel('What the label says (optional)').fill('Take 2 tablets when needed')
  // Adding the medicine re-asks the waiting question by itself.
  await page.getByRole('button', { name: 'Add medicine' }).click()
  await expect(myMedicines(page)).toContainText('Typed in')
  await expect(page.getByTestId('ask-answer')).toContainText('Take 2 tablets when needed')
  expect(sent[1].medicines).toEqual([{ source: 'typed', medication: { name: 'Panadol', rawInstruction: 'Take 2 tablets when needed' } }])
  await expect(page.getByTestId('ask-need')).toHaveCount(0)
})

test('an emergency question shows the 995 card, with no AI involved', async ({ page }) => {
  await page.goto('/ask')
  await page.getByLabel('Or type your own question').fill('My mother has chest pain after taking it')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByTestId('ask-urgent')).toContainText('This could be an emergency')
  await expect(page.getByRole('link', { name: 'Call 995' })).toHaveAttribute('href', 'tel:995')
})

test('a failed question can be retried', async ({ page }) => {
  mockChat(page, [{ ok: false, error: { code: 'RATE_LIMITED', message: '' } }, answer('Store them below 25 degrees.')])
  await page.goto('/ask')
  await page.getByRole('button', { name: 'How do I store medicines?' }).click()
  await expect(page.getByRole('alert')).toContainText('Too many questions')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('ask-answer')).toContainText('Store them below 25 degrees.')
})

test('questions are asked in the chosen language', async ({ page }) => {
  const sent = mockChat(page, [answer('放在阴凉干燥的地方。')])
  await page.goto('/ask')
  await page.getByRole('button', { name: '中文' }).click()
  await page.getByRole('button', { name: '药物怎样保存？' }).click()
  await expect(page.getByTestId('ask-answer')).toContainText('放在阴凉干燥的地方。')
  expect(sent[0]).toMatchObject({ question: '药物怎样保存？', lang: 'zh' })
})

test('the AI\'s suggested next questions become chips, and follow-ups carry the earlier turns', async ({ page }) => {
  const suggested = { ok: true, data: { type: 'ANSWER', answer: 'Hello! I can help with your medicines.', askPharmacist: false, suggestions: ['How do I store insulin?', 'What if I miss a dose?'] } }
  const sent = mockChat(page, [suggested, answer('Keep it in the fridge.')])
  await page.goto('/ask')
  await page.getByLabel('Or type your own question').fill('Hi there')
  await page.getByLabel('Or type your own question').press('Enter')
  const follow = page.getByTestId('ask-follow')
  await expect(follow.getByRole('button')).toHaveText(['How do I store insulin?', 'What if I miss a dose?'])
  expect(sent[0].history).toEqual([])

  await follow.getByRole('button', { name: 'How do I store insulin?' }).click()
  await expect(page.getByTestId('ask-answer').nth(1)).toContainText('Keep it in the fridge.')
  expect(sent[1]).toMatchObject({ question: 'How do I store insulin?', history: [{ q: 'Hi there', a: 'Hello! I can help with your medicines.' }] })
  // No suggestions on this answer: the fixed follow-ups come back.
  await expect(follow.getByRole('button')).toHaveText(['When do I take my medicine?', 'What if I miss a dose?', 'What side effects to watch for?'])
})
