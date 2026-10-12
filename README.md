# Ah Ma Ah Gong Can

Scan a medication label or SingHealth Polyclinic bill and get a plain-language explanation in English, 中文, Bahasa Melayu or தமிழ், read aloud.

IS216 G7 T8 · Vue 3 + Bootstrap 5 · Express · MongoDB · Gemini · Playwright

> The graded submission needs a `README.txt` (setup, live URL, dummy login, AI-use declaration). It gets written before Week 12. This file is the team's dev guide.

## Setup
Requires Node 22.9 or newer.

```bash
npm install
cp .env.example .env          # USE_MOCK_AI=true works without any API key
npx playwright install chromium
```

## Run (two terminals)
```bash
npm run server   # API on http://localhost:3000 (auto-restarts on change)
npm run dev      # app on http://localhost:5173 (proxies /api to the API)
```

## Test
```bash
npm run test:api   # backend checks (node:test)
npm run test:e2e   # Playwright; starts both servers itself, AI mocked
```

## Try the real AI (Zachary)
Set `GEMINI_API_KEY` in `.env`, then:
```bash
npm run try:scan -- medication path/to/label.jpg   # prints the contract JSON
```
To make the app use the real AI, set `USE_MOCK_AI=false` in `.env`. Every real scan uses free-tier quota.

## Layout
```
docs/scan-contract.md   the data shape every feature builds on (read this first)
server/                 Express API: app.js (routes, errors), routes/, middleware/, fixtures/
src/                    Vue app: views/ (one per page), components/<feature>/, i18n/, api/client.js
e2e/                    Playwright specs, one per feature
public/samples/         sample label and bill images
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, PRs and who owns what.
