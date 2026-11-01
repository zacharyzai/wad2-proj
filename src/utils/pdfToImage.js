// Turns a PDF (a bill saved from a clinic's website or email) into one JPEG picture, so it goes through the same
// path as a photo: cover personal details on this device, then read. The PDF library is only downloaded the first time
// someone picks a PDF, so photos never pay for it. Nothing here leaves the device.
const PAGE_WIDTH = 1200 // pixels per page: small print stays readable, and the upload stays well under the 4 MB limit
const MAX_PAGES = 3 // a bill's total is often on the last page; more than 3 pages is not a bill we can sensibly send

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// Pages are drawn one under the other into a single picture. Throws for a file that isn't a readable PDF
// (damaged, or password-protected); ScanView shows that as "This file can't be used".
// { pages, width } let the upload box ask for just the first page, small, as its preview.
export async function pdfToJpeg(file, { pages: maxPages = MAX_PAGES, width = PAGE_WIDTH } = {}) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const pages = []
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
      pages.push(canvas)
    }
    const out = document.createElement('canvas')
    out.width = width
    out.height = pages.reduce((sum, c) => sum + c.height, 0)
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, out.width, out.height)
    let y = 0
    for (const c of pages) {
      ctx.drawImage(c, 0, y)
      y += c.height
    }
    const jpeg = out.toDataURL('image/jpeg', 0.82)
    // shortcut: one retry at lower quality for a scanned (photographic) PDF; a very long one can still be too big, and the
    // server then says IMAGE_TOO_LARGE. Upgrade to resizing if that shows up.
    return jpeg.length > 3_500_000 ? out.toDataURL('image/jpeg', 0.6) : jpeg
  } finally {
    task.destroy() // frees the worker's copy of the file
  }
}
