// Run: node --test src/utils/photoCheck.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
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

test('a well lit photo of printed text has no problem', () => {
  assert.equal(photoProblem(image(text(225)), W, H), null)
})

test('too dark: a dim photo is called dark, even with text in it', () => {
  assert.equal(photoProblem(image(text(40)), W, H), 'dark')
  assert.equal(photoProblem(image(() => 10), W, H), 'dark')
})

test('glare: a large part of the picture is pure white', () => {
  assert.equal(photoProblem(image((x, y) => (x < 80 ? 255 : text(200)(x, y))), W, H), 'glare')
})

test('blurry: smooth gradients and flat colour have no edges for the text to be read from', () => {
  assert.equal(photoProblem(image((x) => 100 + x), W, H), 'blurry')
  assert.equal(photoProblem(image(() => 140), W, H), 'blurry')
})

test('ordinary white paper is not glare, and a tiny image is never judged', () => {
  assert.equal(photoProblem(image(text(240)), W, H), null)
  assert.equal(photoProblem(new Uint8ClampedArray(4 * 4 * 4), 4, 4), null)
})
