# Ah Ma Ah Gong Can

A web app that explains medicine labels and medical bills in plain language, in four languages, read aloud.

IS216 Web Application Development II, G7 T8.

## Overview

Many elderly Singaporeans struggle with English-only medicine labels and with bills full of subsidy jargon (CHAS, Pioneer/Merdeka Generation, MediSave). The app is for seniors and the caregivers who help them. The user photographs a label or bill, checks the text the app read, and gets an explanation in English, Chinese, Malay or Tamil that can be read aloud. It supports doctors and pharmacists and does not replace them.

## Key Features

- Scan, Confirm, Explain: extracted fields are shown beside the photo and must be confirmed; unclear fields are flagged, never guessed. Built-in sample scans need no login.
- Explanations come from pre-written, human-checked templates, with a one-question understanding check.
- Whole UI in English, 中文, Bahasa Melayu and தமிழ்; read-aloud with replay and speed control (browser voice first, server voice fallback).
- Daily medicine schedule built by rule-based logic; doses can be ticked, edited and removed; non-standard instructions are flagged for a pharmacist.
- Bill breakdown with a subsidy checker (estimates only where official figures exist; otherwise schemes are listed with links).
- Accounts and scan history; a senior can invite a caregiver by link for a read-only view of today's doses.
- Personal details (name, NRIC, address, phone) are covered on the device before upload; photos are never stored.
- Optional: Ask chatbot about confirmed medicines, and Google Calendar dose reminders.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vue Router, Pinia, vue-i18n, Bootstrap 5, Vite |
| Backend | Node.js 22.9+, Express 5, express-rate-limit, JSON Web Tokens, Argon2 password hashing |
| Database | MongoDB Atlas via Mongoose |
| APIs / Libraries | Google Gemini (photo reading, chatbot, speech), Groq (backup), Google Calendar, Brevo or Resend (reset emails), Tesseract.js and pdf.js (on-device covering and PDFs), Axios |
| Testing | Vitest, Vue Test Utils, Playwright, axe-core |
| Deployment | Vercel (Express runs as one function in `api/index.js`) |

## Getting Started

### Prerequisites

- Node.js 22.9 or later
- pnpm (`npm install -g pnpm` or `corepack enable`). Use pnpm only.
- A MongoDB database (Atlas) for accounts. Scanning the built-in samples works without one.

### Install and run

```bash
pnpm install
cp .env.example .env     # then edit .env (see below)
pnpm server              # API on http://localhost:3000
pnpm dev                 # app on http://localhost:5173 (second terminal)
```

No Atlas account? `pnpm server:local` runs the API with a throwaway local database (see `docs/auth.md`).

### Environment variables

Set in `.env` (never committed). Full list with comments in `.env.example`.

```
USE_MOCK_AI=true                 # true = fixed sample answers, no AI key needed
GEMINI_API_KEY=your-gemini-key   # needed only when USE_MOCK_AI is not true
GROQ_API_KEY=your-groq-key       # optional backup
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/wad2_dev
JWT_SECRET=replace-with-random-string-of-32-or-more-bytes
APP_URL=http://localhost:5173
MAIL_PROVIDER=console            # console prints reset emails in the server terminal
GOOGLE_CLIENT_ID=your-client-id            # optional, Calendar reminders
GOOGLE_CLIENT_SECRET=your-client-secret    # optional
GOOGLE_REDIRECT_URI=http://localhost:5173/api/google/callback
GOOGLE_TOKEN_KEY=base64-32-byte-key        # optional
```

### Demo login

Create the demo accounts once (safe to re-run):

```bash
node --env-file=.env server/scripts/seed-demo-accounts.js
```

| Email | Role | Password |
|---|---|---|
| `pioneer.demo@example.com` | Senior (Pioneer Generation, CHAS Blue) | `Demo1234!` |
| `merdeka.demo@example.com` | Senior (Merdeka Generation, CHAS Orange) | `Demo1234!` |
| `caregiver.demo@example.com` | Caregiver, linked to the two seniors above | `Demo1234!` |

The same script creates seven more demo seniors (other CHAS tiers, PR, foreigner); their emails are in `server/scripts/seed-demo-accounts.js`.

It also fills every senior with fake data (`server/scripts/demo-data.js`): medicines on their Schedule, saved scans in History (the sample labels and bills), and a week of dose ticks. Pioneer and Merdeka, the two seniors the caregiver follows, have the fullest schedules, so `caregiver.demo@example.com` shows their doses today. Pioneer has one dose left unticked after about midday, to show the "Not ticked yet" flag. Re-running the script resets those accounts' data and refreshes the ticks to today.
Quick try: Home, Scan a medicine label, Try an example, Metformin label.

### Tests

```bash
pnpm test                # Vitest unit and API tests
pnpm test:e2e            # Playwright, AI mocked (port 3000 must be free)
pnpm test:e2e:simple     # Playwright against a real server and throwaway database
pnpm build               # production build
pnpm format              # Prettier
```

## Project Structure

```
api/index.js        Vercel entry: runs the Express app as one function
docs/               Data contracts (scan, auth, care, chat, doses, history, Google)
e2e/, e2e-simple/   Playwright specs
load/               k6 load test
public/samples/     Sample label and bill images
server/             Express API
  routes/           Scan, auth, history, care, doses, schedule, chat, tts, Google
  services/         Gemini/Groq calls, chat, tts, mail, Google Calendar, scan normalising
  models/           Mongoose models
  middleware/       Auth and rate limiting
  fixtures/         Mock AI responses
src/                Vue app
  views/            One view per page
  components/       Components grouped by feature
  stores/           Pinia stores
  rules/            Schedule, subsidy and password rules
  i18n/locales/     en, zh, ms, ta strings
  api/client.js     The only place the frontend calls the backend
  styles/           Design tokens and component styles
vercel.json         Routing for the deployed app
CONTRIBUTING.md     Branching, pull requests, file ownership
```

## Team

| Member | Contribution |
|---|---|
| Zachary | Scan API and AI reading, on-device covering, Ask chatbot, Google Calendar |
| Sheen Hern | Database, accounts, history, caregivers, cloud read-aloud, deployment |
| Asher | Scan, Confirm and Explain pages, translations, read-aloud |
| Lokesh | Schedule and Bill pages, subsidy rules, samples |
| Isaac | Design system, app shell, Home, Login, Account and History pages |

TODO: confirm names and contributions above.

## Links

- Live demo: https://ahma-ahgong-can.vercel.app
- Demo video: TODO add link
