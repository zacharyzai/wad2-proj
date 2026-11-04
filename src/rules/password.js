// A new password: what makes it good enough. Our own rules, the same on the page (components/layout/PasswordRules.vue ticks
// each one off as it is typed, on Sign up and Reset) and on the server (POST /api/auth/signup and /reset, server/routes/auth.js):
//   length   at least 8 characters
//   mix      letters and numbers
//   special  a special character: anything that isn't a letter, a number or a space
export const MIN_PASSWORD = 8

// { length, mix, special }: true for each rule the password meets.
export function passwordChecks(password) {
  const text = String(password ?? '')
  return {
    length: text.length >= MIN_PASSWORD,
    mix: /\p{L}/u.test(text) && /\p{N}/u.test(text),
    special: /[^\p{L}\p{N}\s]/u.test(text),
  }
}

export const passwordOk = (password) => Object.values(passwordChecks(password)).every(Boolean)
