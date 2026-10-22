# Ah Ma Ah Gong Can

Scan a medication label or SingHealth Polyclinic bill and get a plain-language explanation in English, 中文, Bahasa Melayu or தமிழ், read aloud.

IS216 G7 T8 · Vue 3 + Bootstrap 5 · Express · MongoDB · Gemini · Playwright

> The graded submission needs a `README.txt` (setup, live URL, dummy login, AI-use declaration). It gets written before Week 12. This file is the team's dev guide.

## Setup
Requires Node 22.9 or newer and pnpm (`npm install -g pnpm`, or `corepack enable`). Use pnpm only: `npm install` would bring back a second lockfile.

```bash
pnpm install
cp .env.example .env          # USE_MOCK_AI=true works without any API key; accounts need MONGODB_URI and JWT_SECRET
pnpm exec playwright install chromium
```

## Run (two terminals)
```bash
pnpm server   # API on http://localhost:3000 (auto-restarts on change)
pnpm dev      # app on http://localhost:5173 (proxies /api to the API)
```

## Demo accounts
Every page needs an account. These five fake people each show a different subsidy result on the Bill page (their date of birth and citizenship fill in the subsidy questions). Password for all: `Demo1234!`

| Email | Person | Born | Citizenship | Bill page shows |
|---|---|---|---|---|
| `pioneer.demo@example.com` | Tan Ah Kow | 1945 | Citizen by birth | Pioneer Generation |
| `merdeka.demo@example.com` | Siti Aminah binte Rahman | 1955 | Citizen by birth | Merdeka Generation |
| `late.citizen.demo@example.com` | Lim Mei Ling | 1946 | Citizen since 1990 | Merdeka Generation (missed Pioneer: citizen after 1986) |
| `chas.demo@example.com` | Rajesh s/o Kumar | 1975 | Citizen by birth | No Pioneer or Merdeka; CHAS once a household income is picked |
| `pr.demo@example.com` | Maria Santos | 1958 | Permanent resident | No Pioneer, Merdeka or CHAS; polyclinic PR rates only |

Create or reset them in the database from `.env` (safe to run again; it updates the same five):
```bash
node --env-file=.env server/scripts/seed-demo-accounts.js
```
How login works (Remember me, tokens, endpoints): [docs/auth-contract.md](docs/auth-contract.md).

## Test
```bash
pnpm test:api   # backend checks (node:test)
pnpm test:e2e   # Playwright; starts both servers itself, AI and logins mocked
```
Stop `pnpm server` before `pnpm test:e2e`: Playwright reuses a server already on port 3000, and yours signs logins with your real `JWT_SECRET`, so the tests' logins would be refused.

## Try the real AI (Zachary)
Set `GEMINI_API_KEY` in `.env`, then:
```bash
pnpm try:scan medication path/to/label.jpg   # prints the contract JSON
```
To make the app use the real AI, set `USE_MOCK_AI=false` in `.env`. Every real scan uses free-tier quota.

## Layout
```
docs/scan-contract.md   the data shape every feature builds on (read this first)
docs/auth-contract.md   accounts: endpoints, tokens, Remember me
server/                 Express API: app.js (routes, errors), routes/, middleware/, fixtures/
src/                    Vue app: views/ (one per page), components/<feature>/, i18n/, api/client.js
e2e/                    Playwright specs, one per feature
public/samples/         sample label and bill images
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, PRs and who owns what.
