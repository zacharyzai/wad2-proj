// Photo scans never reach the API in e2e: they'd use rate-limit budget (and Gemini quota if USE_MOCK_AI=false).
// Checks the client sent compressed JPEG pages, then answers with the Metformin sample (or the bill sample for a bill).
// window.__scanBodies keeps what was sent, so a test can look at every page.
import { expect } from '@playwright/test'

export async function mockImageScan(page, { cover = 'keep' } = {}) {
  // Covering personal details (src/utils/redact.js) needs the reader download and real label text; tests use a fake that
  // keeps the photo as it is. Pass { cover } to test other outcomes: 'none' (nothing readable), 'fail' (reader broke) or 'hang' (never finishes).
  await page.addInitScript((cover) => {
    window.__redactForTests = async (dataUrl) => {
      if (cover === 'fail') throw new Error('reader failed')
      if (cover === 'hang') return new Promise(() => {})
      return { dataUrl, keep: cover === 'none' ? [] : [{ text: 'TAKE 1 TABLET' }], hits: [] }
    }
  }, cover)
  await page.route('**/api/scan', async (route) => {
    const body = route.request().postDataJSON()
    if (body.sampleId) return route.continue()
    expect(['medication', 'bill']).toContain(body.type)
    expect(body.images.length).toBeGreaterThan(0)
    for (const image of body.images) expect(image).toMatch(/^data:image\/jpeg;base64,/)
    const sample = await route.fetch({
      postData: JSON.stringify({ sampleId: body.type === 'bill' ? 'bill-1' : 'med-1' }),
    })
    const json = await sample.json()
    await route.fulfill({ json: { ok: true, data: { ...json.data, source: 'mock' } } })
  })
}
