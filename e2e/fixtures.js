// Every spec imports test and expect from here. Tests start logged in, because every page needs an account;
// tests about the logged-out experience use test.use({ loggedIn: false }).
import { test as base, expect } from '@playwright/test'
import { signIn } from './helpers/auth.js'

export const test = base.extend({
  loggedIn: [true, { option: true }],
  page: async ({ page, loggedIn }, use) => {
    if (loggedIn) await signIn(page)
    await use(page)
  },
})

export { expect }
