import { describe, expect, test } from 'vitest'
import { passwordChecks, passwordOk } from './password.js'

const who = { name: 'Tan Mei Ling', email: 'meiling52@example.com' }

describe('a new password', () => {
  test('meets every rule: long enough, letters and numbers, not easy to guess', () => {
    for (const good of ['teh-tarik-1952', 'Kopi0 at 7am', 'garden58walk', '我的花园1952']) expect(passwordOk(good, who), good).toBe(true)
  })
  test('too short, or without both letters and numbers', () => {
    expect(passwordChecks('ab12', who)).toEqual({ length: false, mix: true, guess: true })
    expect(passwordChecks('gardenwalk', who).mix).toBe(false)
    expect(passwordChecks('19521952', who).mix).toBe(false)
  })
  test('easy to guess: well-known passwords with numbers added, runs, one letter, their own name', () => {
    for (const weak of ['password123', 'Password2024!', 'qwerty123', 'abcd1234', 'asdf5678', 'aaaa1111', 'iloveyou1', 'meiling1952', 'LING2024', 'tan12345']) {
      expect(passwordChecks(weak, who).guess, weak).toBe(false)
    }
  })
  test('nothing typed yet meets nothing', () => {
    expect(passwordChecks('', who)).toEqual({ length: false, mix: false, guess: false })
  })
})
