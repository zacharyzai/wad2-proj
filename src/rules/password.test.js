// Tests for the password rules.
import { describe, expect, test } from 'vitest'
import { passwordChecks, passwordOk } from './password.js'

describe('a new password', () => {
  test('meets every rule: long enough, letters and numbers, a special character', () => {
    for (const good of ['teh-tarik-1952', 'Kopi0 at 7am!', 'garden58walk?', '我的花园-1952'])
      expect(passwordOk(good), good).toBe(true)
  })
  test('too short, or without both letters and numbers', () => {
    expect(passwordChecks('ab12')).toEqual({ length: false, mix: true, special: false })
    expect(passwordChecks('gardenwalk').mix).toBe(false)
    expect(passwordChecks('19521952').mix).toBe(false)
  })
  test('a special character is anything but a letter, a number or a space', () => {
    for (const none of ['garden58walk', 'garden 58 walk', '我的花园1952'])
      expect(passwordChecks(none).special, none).toBe(false)
    for (const one of ['garden58walk!', 'garden-58', 'garden_58', 'garden58€'])
      expect(passwordChecks(one).special, one).toBe(true)
  })
  test('nothing typed yet meets nothing', () => {
    expect(passwordChecks('')).toEqual({ length: false, mix: false, special: false })
  })
})
