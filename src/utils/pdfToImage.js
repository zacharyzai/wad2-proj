// Turns a PDF (a bill saved from a clinic's website or email) into JPEG pictures, one per page, so it goes through the same
// path as photos: cover personal details on this device, then read. The PDF library is only downloaded the first time
// someone picks a PDF, so photos never pay for it. Nothing here leaves the device.
const PAGE_WIDTH = 1600 // pixels per page: two money columns of small print stay readable
export const MAX_PAGES = 4 // same as the server (server/routes/scan.js); a bill's total is often on the last page

export const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// Each page is its own picture: the AI gives every image the same detail, so one tall strip of pages would make each
// page's print smaller. Throws for a file that isn't a readable PDF (damaged, or password-protected); ScanView shows that
// as "This file can't be used". { pages, width } let the upload box ask for just the first page, small, as its preview.
// onInfo({ total, read }) tells the caller how many pages the file has and how many were drawn.
export async function pdfToJpegs(file, { pages: maxPages = MAX_PAGES, width = PAGE_WIDTH, onInfo } = {}) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    // Past the limit: the first pages and the last one (where the total is), not just the first few. A one-page preview is page 1.
    const numbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
    const read = numbers.length <= maxPages ? numbers : maxPages === 1 ? [1] : [...numbers.slice(0, maxPages - 1), pdf.numPages]
    onInfo?.({ total: pdf.numPages, read: read.length })
    const out = []
    for (const n of read) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // a PDF page has no background of its own
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      out.push(canvas.toDataURL('image/jpeg', 0.85))
    }
    return out
  } finally {
    task.destroy() // frees the worker's copy of the file
  }
}
