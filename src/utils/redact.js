// Reads a photo on the phone (Tesseract.js) and paints solid black boxes over personal details, so only the covered
// image is sent to the AI. Black, not blur: a blur can still be read. The rules live in sensitive.js.
// shortcut: Tesseract downloads its engine and English data (~5 MB, cached) from the jsDelivr CDN on first use;
// self-host them in public/ before shipping so it works offline and no third party is involved.
import { createWorker } from 'tesseract.js'
import { findSensitive } from './sensitive.js'

let worker = null
function getWorker() {
  // A failed start (e.g. offline) is forgotten, so the next photo tries again.
  worker ??= createWorker('eng').catch((err) => {
    worker = null
    throw err
  })
  return worker
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * @param dataUrl the (already compressed) JPEG data URL
 * @returns { dataUrl, hits: [{ text, reason, bbox }], text, ms } — dataUrl is the covered JPEG
 */
export async function redactImage(dataUrl) {
  const started = performance.now()
  const ocr = await getWorker()
  const { data } = await ocr.recognize(dataUrl, {}, { blocks: true, text: true })
  const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((p) => p.lines))
  const hits = findSensitive(lines)

  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = '#000'
  for (const { bbox } of hits) {
    // A little extra around each word, so letter edges don't peek out.
    const pad = Math.max(4, (bbox.y1 - bbox.y0) * 0.25)
    ctx.fillRect(bbox.x0 - pad, bbox.y0 - pad, bbox.x1 - bbox.x0 + 2 * pad, bbox.y1 - bbox.y0 + 2 * pad)
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), hits, text: data.text, ms: Math.round(performance.now() - started) }
}
