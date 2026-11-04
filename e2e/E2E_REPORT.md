# E2E report: Ah Ma Ah Gong Can

4 Nov 2026, `zac` branch. Playwright, Chromium. Each test runs twice: desktop Chrome and iPhone 6 (375px).
AI, TTS, Google Calendar and the chatbot are mocked (`USE_MOCK_AI=true` and `page.route`). Most tests use a fake
login (a signed test token plus a faked `/api/auth`) and need no database. The `*-api` specs use a throwaway in-memory
MongoDB. The test server has no `MONGODB_URI` and never reuses a running `pnpm server`, so tests cannot reach the real database.

## Results

**770 test runs (385 tests × 2 viewports): 751 passed, 15 skipped by design, 4 failed.** Full suite: 8.2 min on 4 workers.
The 4 failures are the two app issues below, each on both viewports. `pnpm test`: 234 passed. `pnpm build`: passed.

Every feature has at least 5 tests, covering function and senior usability: Accounts, Forgot password, Scan, Photo checks
and privacy, Confirm, Explain and quick check, Read-aloud, Languages, Bill breakdown, Subsidy checker, Schedule, Google
Calendar, Ask, History, Account page, Caregiver, Home, Landing, Beginner's guide, App shell and theme.

## App issues found (app code not changed)

1. **Schedule > Today: text under 16px, and day buttons under 44px wide on phones.** Test: `schedule.spec.js` "Today and My medicines: big targets and text".
   - [DayStrip.vue:101](../src/components/schedule/DayStrip.vue#L101): `.lid` weekday letters are 15px, and the `.badge-dot` mark is also under 16px.
   - [TodayList.css:22](../src/styles/components/TodayList.css#L22): `.pc-stats small` ("Doses today", "Taken") is 15px.
   - [DayCards.css:14](../src/styles/components/DayCards.css#L14): `.tag` (the dose time) is 14px.
   - `.comp` day buttons are narrower than 44px at 375px, because seven share the row.
2. **History: the delete question ignores Esc.** [HistoryItem.vue:64](../src/components/history/HistoryItem.vue#L64) has `role="alertdialog"` but no Esc handling, and focus does not move into it. Test: `history.spec.js` "the delete pop-up works by keyboard".

## Test limits

- Tests with nothing to wait for ("nothing happens") use `page.clock` for timers, or `nextFrames` from `helpers/checks.js` to let the page draw. No `waitForTimeout` is left.
- `expectSeniorFriendly` skips `.dose-btn` (its tap area is the whole card) and, on Landing, the decorative papers.
- Logged-out pages are always day mode, so their "(dark)" axe tests repeat the day check. Night mode is checked on logged-in pages.
- Under load, 3 tests failed once in a partial run, then passed 18 of 18 repeats and the full run.

## Not built, so not tested

- Browser notifications / permission prompts (no Notification API or service worker)
- RAG in the chatbot (it is grounded only on the user's own medicines)
- Nearby-clinics map (stretch goal)
- Not automated in the browser: the 15-minute Calendar alert (covered by `server/test/doses.test.js` and `google.test.js`), real Gemini/TTS quality, how Tamil/Chinese fonts look, real screen readers

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
