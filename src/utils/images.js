// Turning what the user picked into the JPEG pages a scan sends (ScanView). Plain functions, no Vue.
import { isPdf, pdfToJpegs, MAX_PAGES } from './pdfToImage'

const MAX_SIDE = 1600
// The server takes 4 MB in all (server/app.js); base64 characters, with room for the rest of the request.
const MAX_UPLOAD = 3_600_000

// Keeps the upload well under the 4 MB API limit (contract asks for about 1 MB).
export function toJpeg(source, width, height, quality = 0.8) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

// An <img> decodes everything the browser can show (JPEG, PNG, WebP, SVG, …) and applies photo rotation;
// createImageBitmap can't read SVG.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Each file becomes its pages: a photo is one, a PDF (a bill saved from email) one per page. Never more than the server takes:
// the upload box allows MAX_PAGES; the other upload buttons keep the first ones.
// Returns { pages, pdfPages: { total, read } of a PDF or null, fromPdf: the pages that came from a PDF }.
export async function compress(files) {
  let pdfPages = null
  const fromPdf = new Set()
  const pages = []
  for (const file of files) {
    if (isPdf(file)) {
      const drawn = await pdfToJpegs(file, { pages: MAX_PAGES - pages.length, onInfo: (info) => (pdfPages = info) })
      drawn.forEach((page) => fromPdf.add(page))
      pages.push(...drawn)
    } else {
      const url = URL.createObjectURL(file)
      const img = await loadImage(url).finally(() => URL.revokeObjectURL(url))
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('Image has no size')
      pages.push(toJpeg(img, img.naturalWidth, img.naturalHeight))
    }
    if (pages.length >= MAX_PAGES) break
  }
  return { pages: pages.slice(0, MAX_PAGES), pdfPages, fromPdf }
}

// Covered pages are mostly black, so this rarely runs: several busy pages over the limit are saved again at lower quality
// (still sharp enough to read) instead of failing with IMAGE_TOO_LARGE.
export async function fitUpload(pages) {
  for (const quality of [0.65, 0.5]) {
    if (pages.reduce((sum, page) => sum + page.length, 0) <= MAX_UPLOAD) break
    pages = await Promise.all(pages.map((src) => loadImage(src).then((img) => toJpeg(img, img.naturalWidth, img.naturalHeight, quality))))
  }
  return pages
}
