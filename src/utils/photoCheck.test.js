// Run: pnpm vitest run src/utils/photoCheck.test.js
import { describe, it, expect } from 'vitest'
import { photoProblem } from './photoCheck.js'

const W = 120
const H = 120
// Builds an RGBA image from a function (x, y) => grey level 0-255.
const image = (grey) => {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const g = grey(x, y)
      px.set([g, g, g, 255], (y * W + x) * 4)
    }
  return px
}
// Pretend text: white paper with dark 2-pixel strokes, like a printed line.
const text = (paper) => (x, y) => (y % 8 < 2 && x % 6 < 4 ? 20 : paper)

describe('photoProblem: is the photo too dark, blurry or glary?', () => {
  it('a well lit photo of printed text has no problem', () => {
    expect(photoProblem(image(text(225)), W, H)).toBe(null)
  })

  it('too dark: a dim photo is called dark, even with text in it', () => {
    expect(photoProblem(image(text(40)), W, H)).toBe('dark')
    expect(
      photoProblem(
        image(() => 10),
        W,
        H,
      ),
    ).toBe('dark')
  })

  it('glare: mostly blown out, the text faded to almost white', () => {
    expect(
      photoProblem(
        image((x, y) => (y % 8 < 2 && x % 6 < 4 ? 235 : 255)),
        W,
        H,
      ),
    ).toBe('glare')
    expect(
      photoProblem(
        image(() => 255),
        W,
        H,
      ),
    ).toBe('glare') // a completely white photo
  })

  it('a PDF or screenshot of a bill is mostly pure white but not glare: its text is crisp and dark', () => {
    expect(photoProblem(image(text(255)), W, H)).toBe(null) // white page, lots of text
    expect(
      photoProblem(
        image((x, y) => (y % 24 < 2 && x % 6 < 4 ? 20 : 255)),
        W,
        H,
      ),
    ).toBe(null) // a sparse receipt: about 5% ink
  })

  it('blurry: smooth gradients and flat colour have no edges for the text to be read from', () => {
    expect(
      photoProblem(
        image((x) => 100 + x),
        W,
        H,
      ),
    ).toBe('blurry')
    expect(
      photoProblem(
        image(() => 140),
        W,
        H,
      ),
    ).toBe('blurry')
  })

  it('ordinary white paper is not glare, and a tiny image is never judged', () => {
    expect(photoProblem(image(text(240)), W, H)).toBe(null)
    expect(photoProblem(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBe(null)
  })
})
