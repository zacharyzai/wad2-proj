// Run: node --test src/utils/photoCheck.test.js
// Looks at a photo on this device before it is covered and sent, so the person is told WHY it won't read (too dark,
// blurry, glare) instead of a general "try again". Nothing here is sent anywhere.
// shortcut: thresholds are a first guess, not tuned on real label photos; the error screen has "Scan it anyway" so a wrong
// call never blocks anyone. Tune DARK_BELOW / GLARE_ABOVE / BLUR_BELOW on a batch of real photos.
const DARK_BELOW = 50 // average brightness (0-255); a well lit label is far above this
const GLARE_ABOVE = 0.4 // share of pixels that are pure white...
const INK_BELOW = 0.04 // ...AND almost no text-like dark pixels (under 200) left: that is washed out. A PDF or screenshot of a bill is
//                         mostly pure white too, but its text is crisp and dark (about 15% of its pixels), so it is not glare.
const BLUR_BELOW = 15 // sharpness (variance of the Laplacian); printed text gives hundreds, a blur or flat colour gives ~0
const MAX_SIDE = 480 // measured on a small copy: faster, and a blur is still a blur

// rgba: Uint8ClampedArray from canvas getImageData. Returns 'dark' | 'glare' | 'blurry' | null (null = looks fine).
export function photoProblem(rgba, width, height) {
  const n = width * height
  if (n < 64 * 64) return null // too small to judge (and nothing to read in it anyway)
  const gray = new Float32Array(n)
  let sum = 0
  let white = 0
  let ink = 0
  for (let i = 0; i < n; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    gray[i] = g
    sum += g
    if (g >= 250) white++
    else if (g < 200) ink++
  }
  if (sum / n < DARK_BELOW) return 'dark'
  if (white / n > GLARE_ABOVE && ink / n < INK_BELOW) return 'glare'

  // Edges: the Laplacian of each inner pixel; sharp text makes it swing a lot, a blurred photo barely moves.
  let mean = 0
  let m2 = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]
      count++
      const d = lap - mean
      mean += d / count
      m2 += d * (lap - mean)
    }
  }
  return m2 / count < BLUR_BELOW ? 'blurry' : null
}

// The same, for a photo as a data URL. Any failure to look at it means "no problem found": never block on our own error.
export async function checkPhoto(dataUrl) {
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = dataUrl
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return photoProblem(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  } catch {
    return null
  }
}
