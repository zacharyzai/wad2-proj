# E2E report: Ah Ma Ah Gong Can

> **Rerun before submission.** These numbers are from 3 Nov. Since then: caregiver medicine details (flip cards), scan sharing removed, "Not ticked yet" alerts. Run `pnpm test:e2e` on a laptop and update the Results line.

3 Nov 2026, `zac` branch. Playwright 1.64, Chromium. Each test runs twice: desktop Chrome and iPhone 6 (375px).
AI, TTS, Google Calendar and the chatbot are mocked (`USE_MOCK_AI=true` and `page.route`). Most tests use a fake
login (a signed test token plus a faked `/api/auth`) and need no database. The `*-api` specs use a throwaway in-memory MongoDB and never touch Atlas.

## Results

**578 test runs (289 tests × 2 viewports): 570 passed, 8 skipped by design, 0 failed.** Full suite: 4.4–4.8 min on 8 workers.

| Feature | Spec files | Tests | Passing | Notes |
|---|---|---|---|---|
| Landing page + Beginner's guide | landing, guide | 40 | 40 | Reduced motion, keyboard, axe, Tamil voice fallback. Hover-only tests skip on phones. |
| Auth (signup, login, logout, forgot, reset) | auth, auth-api, forgot | 30 | 30 | Includes runs against a real in-memory database |
| Account page | account (new), auth, theme | 19 | 19 | New: invalid year or empty name blocked, Cancel, failed save keeps the typing, reload, axe + sizes |
| Scan + Gemini extraction | scan-flow, scan-cover, scan-camera, smoke | ~40 | all | Errors, wrong file types, PDFs, camera, covering private details |
| Confirm / correction | scan-flow | ~16 | all | Unclear fields block Confirm; impossible doses are flagged |
| Explain + understanding check | explain (new), scan-flow | 9 | 9 | New: a wrong answer and "Not sure" show the right dose; the bill check; keyboard |
| Read-aloud / TTS | explain (new), ask-speech, guide, landing | 14 | 14 | New: play, replay, speed kept after reload, 中文 voice with digits kept, plain message when there is no audio at all |
| Multilingual (EN / 中文 / BM / தமிழ்) | i18n (new), plus tests tagged `@i18n` | 15 | 15 | New: same keys in all 4 files; 9 pages × 4 languages with no missing keys and no sideways scroll |
| Bill breakdown | bill, bill-gap | 20 | 20 | |
| Subsidy checker | bill, auth | 8 | 8 | PG, MG, not eligible, PR, links to the official pages |
| Medication schedule | schedule | 27 | 27 | |
| Google Calendar reminders | schedule | 8 | 8 | Uses Google sign-in (OAuth) sync, not "add to calendar" links |
| AI chatbot (Ask) | ask, ask-chat, ask-speech, ask-ux | 34 | 34 | |
| History + caregiver invite links | history, history-api, account-sync | 13 | 13 | |
| Caregiver tracking | care, care-api | 15 | 15 | The tab is hidden from seniors; `/care` sends a senior Home |
| App shell / 404 / a11y | shell (new), a11y | 12 | 12 | New: 404 logged in and out, keyboard focus ring, axe + sizes on Home, Scan, Confirm, History and 404 |

The "~" counts are approximate because `scan-flow.spec.js` covers Scan and Confirm together. Every feature has at least 5
tests covering the happy path, errors, permissions, usability and persistence where each applies.

## App bugs found (app code not changed)

1. ~~Scan picker captions are 15px on phones.~~ Fixed: `.pick-text` is now `clamp(16px, 3.8vw, 18px)` and the `test.fail` line was removed.

## Flakiness

The suite ran 4 times in a row (570, 570, 569, 569 passed) and then once more after fixes (570). All 3 failures were **test bugs**, now fixed:

- `scan-flow.spec.js` "explanation follows the language switch" opened Account before Explain had loaded, so Back went to Confirm. It now waits for the Explain address.
- `landing.spec.js` "the reminder phone buzzes…": under load, scroll-snap pulled the page back while `click()` scrolled the switch into view. It now uses `dispatchEvent('click')`, as the next test in that file already does.
- `landing.spec.js` "scrolling stops at each section": 12 separate wheel notches could each end and snap back to the hero on a busy machine. It now sends one wheel of 1440px.

The new specs and the fixed tests then passed `--repeat-each=4/5` under full load. Nothing is quarantined.
One existing test still uses `waitForTimeout(900)` (landing scroll-snap), because the test needs to prove the page *stays* put.

## Not built, so not tested

- Browser notifications / permission prompts (no Notification API or service worker)
- Missed-dose alert to the caregiver (the senior's own "Not ticked yet" Calendar alert, 15 min after a dose, was added 4 Nov and needs an e2e rerun)
- Google Calendar "add to calendar" links (the app uses OAuth sync instead, which is tested)
- RAG in the chatbot (it is grounded only on the user's own medicines)
- Nearby-clinics map (stretch goal)
- Not automated: real Gemini/TTS quality, how Tamil/Chinese fonts look, real screen readers, and the dev-only pages being absent from a production build (needs `vite build`)

## Commands

Stop any running `pnpm server` first: port 3000 must be free.

```bash
pnpm test:e2e                                  # everything (desktop + iPhone 6)
pnpm test:e2e e2e/explain.spec.js              # one feature
pnpm test:e2e --grep @smoke                    # 21 runs, ~16 s
pnpm test:e2e --grep @a11y                     # axe + senior layout
pnpm test:e2e --grep @i18n                     # 4 languages
pnpm test:e2e --project=chromium               # desktop only (half the time)
pnpm test:e2e --last-failed                    # rerun failures
pnpm exec playwright show-report               # HTML report (playwright-report/)
```

## What changed (tests and config only)

- New: `e2e/explain.spec.js`, `e2e/account.spec.js`, `e2e/i18n.spec.js`, `e2e/shell.spec.js`, `e2e/helpers/checks.js`
  (axe, ≥44px targets / ≥16px text / no sideways scroll, visible focus).
- Tags `@smoke`, `@a11y` and `@i18n` added to 25 existing test titles. Three existing tests were fixed for flakiness (above).
- `playwright.config.js`: CI retries 2 → 1, `workers: '100%'`, `screenshot: 'only-on-failure'`.
