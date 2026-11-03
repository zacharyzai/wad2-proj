// A new account's password: what makes it good enough. Our own rules, the same on the page (views/SignupView.vue ticks
// each one off as it is typed) and on the server (POST /api/auth/signup, server/routes/auth.js):
//   length  at least 8 characters
//   mix     letters and numbers
//   guess   not easy to guess: not a well-known password with numbers added ("password123", "qwerty2024"), not one
//           letter or a run of letters ("aaaa1111", "abcd1234"), and not the person's own name or email name
export const MIN_PASSWORD = 8

// The words of the best-known passwords (with their numbers and symbols taken out), lower case.
const COMMON = new Set([
  'password', 'passw', 'pass', 'qazwsx', 'iloveyou',
  'admin', 'welcome', 'letmein', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'master', 'shadow',
  'superman', 'batman', 'trustno', 'hello', 'freedom', 'whatever', 'login', 'secret', 'changeme', 'singapore',
])
// Runs along the alphabet or a keyboard row: "abcd", "qwerty", "asdf".
const RUNS = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function easyToGuess(password, { name = '', email = '' } = {}) {
  const letters = password.toLowerCase().replace(/[^\p{L}]/gu, '')
  if (!letters) return false // only numbers: the "letters and numbers" rule says so already
  if (COMMON.has(letters)) return true
  if (/^(.)\1*$/u.test(letters)) return true // "aaaa1234"
  if (letters.length >= 3 && RUNS.some((run) => run.includes(letters))) return true // "abcd1234", "qwer5678"
  // Their own name or email name: "meiling1952", "Tan12345".
  const own = [...String(name).toLowerCase().split(/[^\p{L}]+/u), String(email).toLowerCase().split('@')[0].replace(/[^\p{L}]/gu, '')]
  return own.some((word) => (word.length >= 4 && letters.includes(word)) || (word.length >= 3 && letters === word))
}

// { length, mix, guess }: true for each rule the password meets. who: { name, email } (either may be empty).
export function passwordChecks(password, who) {
  const text = String(password ?? '')
  return {
    length: text.length >= MIN_PASSWORD,
    mix: /\p{L}/u.test(text) && /\p{N}/u.test(text),
    guess: text.length > 0 && !easyToGuess(text, who),
  }
}

export const passwordOk = (password, who) => Object.values(passwordChecks(password, who)).every(Boolean)
