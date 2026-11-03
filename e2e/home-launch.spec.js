// Home, livelier: each card opens with a short picture of its own before its page; the Ask card shows a little chat; the
// greeting is one centred column; faint drawings sit behind it all. Reduced motion: the cards just open.
import { test, expect } from './fixtures.js'

const CARDS = [
  { testid: 'home-med', kind: 'med', url: /\/scan\?type=medication$/ },
  { testid: 'home-bill', kind: 'bill', url: /\/scan\?type=bill$/ },
  { testid: 'home-ask', kind: 'ask', url: /\/ask$/ },
  { testid: 'home-today-open', kind: 'schedule', url: /\/schedule$/ },
]

for (const card of CARDS) {
  test(`${card.kind}: its own picture plays first, then its page opens`, async ({ page }) => {
    await page.goto('/')
    await page.getByTestId(card.testid).click()
    const launch = page.getByTestId('card-launch')
    await expect(launch).toHaveAttribute('data-kind', card.kind)
    await expect(launch).toHaveAttribute('aria-hidden', 'true') // decoration: the page that opens says where you are
    await expect(page).toHaveURL(/\/$/) // still Home while it plays
    await expect(page).toHaveURL(card.url)
    await expect(launch).toHaveCount(0) // gone with Home
  })
}

test('a second tap while a picture plays does nothing more', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('home-bill').click()
  await page.getByTestId('card-launch').click({ force: true }) // the picture covers the screen
  await expect(page).toHaveURL(/\/scan\?type=bill$/)
})

test('reduced motion: no picture, the card opens at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('home-ask').click()
  await expect(page).toHaveURL(/\/ask$/)
  await expect(page.getByTestId('card-launch')).toHaveCount(0)
})

test('the Ask card shows a little chat, and the greeting is one centred column around the capsule', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home-ask')).toContainText('Can I take it with food?')
  await expect(page.getByTestId('home-ask')).toContainText('Yes. Take it after your meal.')
  const panel = await page.locator('.greet-panel').boundingBox()
  const capsule = await page.getByTestId('home-capsule').boundingBox()
  const middle = (b) => b.x + b.width / 2
  expect(Math.abs(middle(capsule) - middle(panel))).toBeLessThan(3) // in the middle
  const greet = await page.getByTestId('home-greet').boundingBox()
  const title = await page.getByRole('heading', { level: 1 }).boundingBox()
  expect(greet.y).toBeLessThan(capsule.y) // hello above it
  expect(title.y).toBeGreaterThan(capsule.y + capsule.height - 4) // the question below it
})

test('behind Home: faint drawings of medicine, bills and people, never in the way', async ({ page }) => {
  await page.goto('/')
  const backdrop = page.locator('.backdrop')
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true')
  await expect(backdrop).toHaveCSS('pointer-events', 'none')
  expect(await backdrop.locator('.bit').count()).toBeGreaterThanOrEqual(10)
  await page.getByTestId('home-med').click() // the cards still take the tap
  await expect(page).toHaveURL(/\/scan\?type=medication$/)
})
