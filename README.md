# Ah Ma Ah Gong Can

**Medicine labels and medical bills, explained in your own language.** Take a photo of a medicine label or a medical bill, and the app tells you in plain words, in **English, 中文, Bahasa Melayu or தமிழ்**, what to take and when, or what you pay and which subsidies may help. Every explanation can be read aloud.

Made for elderly Singaporeans and the family members who help them. It supports your doctor and pharmacist; it never replaces them.

**Try it:** https://ahma-ahgong-can.vercel.app

IS216 Web Application Development II · G7 T8 · Vue 3 · Express · MongoDB · Gemini

---

## Try it in 5 minutes

### 1. Log in with a demo account

Every page needs an account. Use one of these fake people (password for all: **`Demo1234!`**). Each one gets a different subsidy result on bills, because the app reads their date of birth, citizenship and household income from the account.

| Email | Person | Born | Citizenship | Income per person | Bills show |
|---|---|---|---|---|---|
| `pioneer.demo@example.com` | Tan Ah Kow | 1945 | Citizen by birth | $1,500 or less | Pioneer Generation; CHAS Blue |
| `merdeka.demo@example.com` | Siti Aminah binte Rahman | 1955 | Citizen by birth | $1,501 to $2,300 | Merdeka Generation; CHAS Orange |
| `late.citizen.demo@example.com` | Lim Mei Ling | 1946 | Citizen since 1990 | More than $2,300 | Merdeka Generation (missed Pioneer: citizen after 1986); CHAS Green |
| `chas.demo@example.com` | Rajesh s/o Kumar | 1975 | Citizen by birth | $1,500 or less | No Pioneer or Merdeka; CHAS Blue only |
| `pr.demo@example.com` | Maria Santos | 1958 | Permanent resident | (not asked) | No Pioneer, Merdeka or CHAS; polyclinic PR rates only |

Or create your own account: it asks for your name, date of birth, citizenship and (for citizens) household income, and the language you're using becomes your account's language.

### 2. Read a medicine label

1. Tap **Scan**, then a sample such as **Metformin label** (no photo needed).
2. **Check what we read:** every field is shown next to the label. Fix anything that's wrong; anything we couldn't read is marked **Please check** and must be filled in before you continue. The app won't accept impossible doses (0 tablets, 20 times a day).
3. **Looks correct** → the explanation: how much, how often, before or after food, and warnings, in big text.
4. Tap **Read aloud**, change the speed, and answer the quick check question ("How many tablets in the morning?").

Try it with your own label too: **Take photo**, or upload one with **Browse photos**. Before anything is sent, your name, NRIC, address and phone number are blacked out **on your phone**, and you can watch it happen.

### 3. Understand a bill

1. Tap **Bill**, then a sample bill:
   - **Bedok:** a doctor visit and medicine, with the polyclinic subsidy.
   - **Tampines:** blood tests and MediSave.
   - **Marine Parade:** wound dressing, with the Merdeka Generation subsidy.
   - **Hospital stay:** ward charges, GST and a MediShield Life claim.
2. Tap any line to hear what it means.
3. Open **What this means for you** to see the subsidies already on the bill, and the ones you **may also qualify for**, each with its official MOH or CHAS page. Log in as a different demo person to see the result change.
4. Scan a real bill from any clinic, hospital, dental clinic or pharmacy. If a bill lists Gross / Subsidy / **Net** for each line, the net amounts are used. If you scan a bill on the medicine page (or the reverse), the app asks: *"Was this meant for a medical bill?"*

### 4. Ask about your medicine

Tap **Ask** and type or say a question ("Can I take it with food?"). Answers come from the labels you checked, or from general medicine information, and suggest next questions to tap. Emergencies ("chest pain", "can't breathe") get a **Call 995** card straight away. **New conversation** starts over, with Undo.

### 5. Make it yours

- **Language:** switch at the top (or in the sidebar). The whole app, the read-aloud and the bill explanations change. It's saved to your account, so it follows you to other devices.
- **Night mode:** the moon button. The app always starts in day mode.
- **How to use the app:** a short guide that points at each button. It opens on your first visit, and again any time from the sidebar or Account.
- **Account:** see and edit your details (these drive the bill subsidies), change language (you'll see "Settings saved"), and log out.

---

## What's built, and what's coming

| Feature | Status |
|---|---|
| Scan → Check → Explain, read aloud, quick check | ✅ |
| 4 languages for the whole app | ✅ (translations being checked by native speakers) |
| Bills from any medical place, with subsidies from your account | ✅ Estimates only where official figures exist (polyclinic, CHAS GP and dental); other places list the schemes with links, never a made-up amount |
| On-phone covering of personal details | ✅ |
| Ask chatbot | ✅ |
| Accounts, Remember me, language on the account | ✅ |
| Google Calendar reminders | ✅ Connect, Disconnect and automatic sync on the Schedule page |
| Medicine schedule with dose ticks | ✅ Ticks saved to your account; "when necessary", weekly and tapering medicines go to your pharmacist, never scheduled |
| Caregiver view (a family member sees whether today's doses were taken, with the senior's approval) | Coming |
| Scan history and WhatsApp share links | Coming |

## Your privacy and safety

- **Photos are never stored.** Personal details are covered on your phone first; only the covered photo is sent, to read the text, and then it's discarded. We keep extracted text only.
- **You always check** what was read before anything uses it. Unclear fields are flagged, never guessed.
- **Explanations come from human-checked templates**, not free AI text. The medicine schedule uses our own rules, not AI.
- **Not medical advice.** The app never tells you to change a dose. "When necessary" and tapering medicines are sent to your pharmacist, not scheduled.
- **Passwords are hashed**; your login stays on your device.

## Tips

- **Photos:** good light, the whole label or bill inside the frame, held steady. A clear photo of the wrong document gets its own message (not "retake in good light").
- **Read aloud in Tamil or Malay** needs a voice for that language on your device. Some devices don't have one yet.
- **Google's "unverified app" screen** (when Calendar connecting arrives): it's a student project, so press **Advanced → Go to Ah Ma Ah Gong Can**.
- **Free AI limits:** real photo scans use a free AI quota. If you see "Too many tries right now", wait a few minutes or use a sample.

---

## For developers

Requires **Node 22.9+** and **pnpm** (`npm install -g pnpm`, or `corepack enable`). Use pnpm only: `npm install` would bring back a second lockfile.

```bash
pnpm install
cp .env.example .env               # USE_MOCK_AI=true works without any API key; accounts need MONGODB_URI and JWT_SECRET (32+ bytes)
pnpm exec playwright install chromium
```

### Run (two terminals)

```bash
pnpm server   # API on http://localhost:3000 (restarts on change)
pnpm dev      # app on http://localhost:5173 (sends /api to the API)
```

### Environment (`.env`, never committed)

| Variable | What for |
|---|---|
| `USE_MOCK_AI` | `true` (default): fixed answers, no AI quota. `false`: real AI |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GROQ_API_KEY`, `GROQ_MODELS` | Reading photos and the chatbot. Gemini first, Groq as the backup. Overloaded models rest for 2 minutes |
| `MONGODB_URI`, `JWT_SECRET` | Accounts. `JWT_SECRET` must be at least 32 bytes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` | Google Calendar. See [docs/google-contract.md](docs/google-contract.md) |

### Database

Follow [docs/atlas.md](docs/atlas.md) for team access. `pnpm atlas:configure` writes your `.env`; `pnpm db:check` checks the connection. `pnpm server:local` uses a throwaway local database instead.

Create or reset the 5 demo accounts (safe to run again):

```bash
node --env-file=.env server/scripts/seed-demo-accounts.js
```

### Test

```bash
pnpm test:api                          # backend (node:test): scan, chat, auth, subsidies, Calendar
node --test src/utils/sensitive.test.js # on-phone covering of personal details
pnpm test:e2e                          # Playwright, phone and desktop; starts both servers; AI, logins and Google mocked
```

Stop your own `pnpm server` before `pnpm test:e2e`: Playwright reuses a server already on port 3000, and yours signs logins with your real `JWT_SECRET`, so the tests' logins would be refused.

### Try the real AI

```bash
pnpm try:scan medication path/to/label.jpg   # prints the scan JSON
```

Set `USE_MOCK_AI=false` to use it in the app. Every real scan uses free quota (Gemini's free tier allows about 20 scans a day per model).

### Deploy

Vercel: every push to `main` deploys. `api/index.js` runs the Express app as one function; `vercel.json` sends every other path to the Vue app. Set the same environment variables in Vercel (with `GOOGLE_REDIRECT_URI` pointing at the live site), plus `MONGOMS_DISABLE_POSTINSTALL=1`. Atlas Network Access needs `0.0.0.0/0`.

### Where things are

```
docs/scan-contract.md      the scan data shape every feature builds on (read this first)
docs/auth-contract.md      accounts: endpoints, tokens, Remember me, language
docs/chat-contract.md      the Ask chatbot and its safety layers
docs/google-contract.md    Google Calendar: endpoints, sync, the Connect button steps
docs/heuristic-audit.md    Nielsen's 10 heuristics: findings and fixes, 3 rounds
server/                    Express API: app.js, routes/, services/, models/, middleware/, fixtures/
src/                       Vue app: views/ (one per page), components/<feature>/, rules/, i18n/, api/client.js
e2e/                       Playwright specs, one per feature
public/samples/            sample label and bill images
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, pull requests and who owns what.

## Team

| Who | Owns |
|---|---|
| Zachary (lead) | Scan API and AI reading, on-phone covering, Ask chatbot, Google Calendar, welcome page |
| Sheen Hern | Database, accounts, history, sharing, cloud read-aloud, deploy |
| Asher | Scan, Check and Explain pages, translations, read-aloud |
| Lokesh | Schedule and Bill pages, subsidy rules, samples |
| Isaac | Design system, app shell, Home, Login, Account, History and Share pages |

The graded `README.txt` (setup, live URL, dummy login, AI-use declaration) is written separately for submission.
