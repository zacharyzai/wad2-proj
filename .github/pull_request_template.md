## What
<!-- One or two lines: what does this PR add or fix? Link the issue: Closes #12 -->

## How to test
<!-- Steps a reviewer can follow, e.g. npm run dev → /scan → pick sample med-1 -->

## Checklist
- [ ] Playwright spec added/updated in `e2e/` (uses samples, not real AI)
- [ ] All UI text uses `t('...')`, and keys were added to **all 4** locale files
- [ ] Checked at iPhone 6 width and desktop in Chrome DevTools
- [ ] `npm run test:api` and `npm run test:e2e` pass
- [ ] No secrets, real patient data or photos committed
- [ ] If `docs/scan-contract.md` or `server/fixtures/` changed: Zachary is a reviewer
