// Reads a photo on the phone (Tesseract.js) and sends only the medicine and bill lines: the image starts all black and
// just those lines are copied back in, with labelled personal details on them blacked out again. Black, not blur: a blur
// can still be read. The rules live in sensitive.js.
// shortcut: Tesseract downloads its engine and English data (~5 MB, cached) from the jsDelivr CDN on first use;
// self-host them in public/ before shipping so it works offline and no third party is involved.
import { createWorker } from 'tesseract.js'
import { baselineAt, planRedaction } from './sensitive.js'

let worker = null
function getWorker() {
  // A failed start (e.g. offline) is forgotten, so the next photo tries again.
  worker ??= createWorker('eng').catch((err) => {
    worker = null
    throw err
  })
  return worker
}

// Called when the Scan page opens, so the reader (~5 MB, once) is ready before the photo is taken.
// Skipped when the phone asks to save data; then it downloads on the first photo as before. Errors wait for that too.
export function warmUp() {
  if (navigator.connection?.saveData) return
  getWorker().catch(() => {})
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Tesseract reads best with text about 30px tall and strong contrast; phone photos of small labels are often below that.
const READ_SIDE = 2400
function forReading(img) {
  const scale = Math.min(2, Math.max(1, READ_SIDE / Math.max(img.naturalWidth, img.naturalHeight)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  ctx.filter = 'grayscale(1) contrast(1.5)' // ignored where unsupported; reading still works, just less well
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { canvas, scale }
}

/**
 * @param dataUrl the (already compressed) JPEG data URL
 * @returns { dataUrl, keep: [{ text, band }], hits: [{ text, reason, bbox }], text, ms } — dataUrl is the covered JPEG.
 *          keep is empty when nothing readable was found: the image is then all black (the scan reports it unreadable).
 */
export async function redactImage(dataUrl) {
  const started = performance.now()
  const img = await loadImage(dataUrl)
  const { canvas: reading, scale } = forReading(img)
  const ocr = await getWorker()
  const { data } = await ocr.recognize(reading, {}, { blocks: true, text: true })
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((p) => p.lines))
  const { keep, hits } = planRedaction(lines)

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // Everything below is in reading-canvas pixels, drawn at 1/scale onto the real-size image.
  ctx.scale(1 / scale, 1 / scale)
  for (const { band } of keep) {
    // A tilted strip along the row: from just above the tallest letters to just below the descenders, a little past both ends.
    const up = band.above * 1.15
    const down = band.below * 1.15 // no extra: the next row's capitals start right under the descenders
    const x0 = band.x0 - band.above * 0.3
    const x1 = band.x1 + band.above * 0.3
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x0, baselineAt(band, x0) - up)
    ctx.lineTo(x1, baselineAt(band, x1) - up)
    ctx.lineTo(x1, baselineAt(band, x1) + down)
    ctx.lineTo(x0, baselineAt(band, x0) + down)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale)
    // Personal details on a shown row are blacked out again, only inside the strip (so they never cut into the next row).
    for (const { bbox } of hits) {
      const pad = Math.max(4, (bbox.y1 - bbox.y0) * 0.2)
      ctx.fillRect(bbox.x0 - pad, bbox.y0 - pad, bbox.x1 - bbox.x0 + 2 * pad, bbox.y1 - bbox.y0 + 2 * pad)
    }
    ctx.restore()
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), keep, hits, text: data.text, ms: Math.round(performance.now() - started) }
}
