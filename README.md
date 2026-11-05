# Ah Ma Ah Gong Can

**Medicine labels and medical bills, explained in your own language.** Take a photo of a medicine label or a medical bill, and the app tells you in plain words, in **English, 中文, Bahasa Melayu or தமிழ்**, what to take and when, or what you pay and which subsidies may help. Every explanation can be read aloud.

Made for elderly Singaporeans and the family members who help them. It supports your doctor and pharmacist; it never replaces them.

**Try it:** https://ahma-ahgong-can.vercel.app

IS216 Web Application Development II · G7 T8 · Vue 3 · Pinia · Bootstrap 5 · Express · MongoDB · Gemini

---

## Try it in 5 minutes

### 1. Log in with a demo account

Use one of these fake people (password for all: **`Demo1234!`**). Each one gets a different subsidy result on bills, because the app reads their date of birth, citizenship and household income from the account.

| Email | Person | Born | Citizenship | Income per person | Bills show |
|---|---|---|---|---|---|
| `pioneer.demo@example.com` | Tan Ah Kow | 1945 | Citizen by birth | $1,500 or less | Pioneer Generation; CHAS Blue |
| `merdeka.demo@example.com` | Siti Aminah binte Rahman | 1955 | Citizen by birth | $1,501 to $2,300 | Merdeka Generation; CHAS Orange |
| `late.citizen.demo@example.com` | Lim Mei Ling | 1946 | Citizen since 1990 | More than $2,300 | Merdeka Generation (missed Pioneer: citizen after 1986); CHAS Green |
| `chas.demo@example.com` | Rajesh s/o Kumar | 1975 | Citizen by birth | $1,500 or less | No Pioneer or Merdeka; CHAS Blue only |
| `pr.demo@example.com` | Maria Santos | 1958 | Permanent resident | (not asked) | No Pioneer, Merdeka or CHAS; polyclinic PR rates only |
| `chas.orange.demo@example.com` | Nur Aisyah binte Ismail | 1968 | Citizen by birth | $1,501 to $2,300 | No Pioneer or Merdeka; CHAS Orange only |
| `chas.green.demo@example.com` | David Lee Wei Ming | 1972 | Citizen by birth | More than $2,300 | No Pioneer or Merdeka; CHAS Green only |
| `unsure.demo@example.com` | Gopal s/o Ramasamy | 1952 | Citizen by birth | Not sure | Merdeka Generation; CHAS applies, card colour unknown |
| `foreigner.demo@example.com` | Kenji Watanabe | 1960 | Neither citizen nor PR | (not asked) | No subsidy estimates; schemes listed with their official links |

There is also a **caregiver** demo account (step 6).

Or create your own account. It asks for your name, date of birth, citizenship and (for citizens) household income, whether you are a senior or a caregiver, and then whether you'd like day or night mode. The language you're using becomes your account's language. Everything except the welcome page, Log in, Sign up, Forgot password and caregiver invite links needs an account.

### 2. Read a medicine label

1. On Home, tap **Scan a medicine label**, then **Try an example** and pick **Metformin label** (no photo needed).
2. **Check what we read:** every field is shown next to the label. Fix anything that's wrong; anything we couldn't read is marked **Please check** and must be filled in before you continue. The app won't accept impossible doses (0 tablets, 20 times a day).
3. **Looks correct** → the explanation: how much, how often, before or after food, and warnings, in big text.
4. Tap **Read aloud**, change the speed, and answer the quick check question ("How many tablets in the morning?").

Try your own label too: **Take a photo of the label**, or **Browse photos** (PNG, JPG, HEIC or PDF). Before anything is sent, your name, NRIC, address and phone number are blacked out **on your phone**, and you can watch it happen.

### 3. See your medicine schedule

Tap **Schedule**. The labels you checked become a daily timetable, built by our own rules (never AI):

- **Today:** the week as a row of days at the top (tap one to see what was taken or is coming), and today's doses by time of day below. Tick a dose when you've taken it; ticks are saved to your account. Ticking a 9 pm dose at 8 am asks first.
- **My medicines:** one card per medicine (its name, what it is for and its times); **Change** opens the rest: days and times, fix what we read, stop or remove it, with Undo. **Reminders** sit at the bottom: connect Google Calendar for an alert at each dose, and a "Not ticked yet" alert 15 minutes later if it isn't ticked.
- "When necessary", weekly and tapering medicines are listed for your pharmacist instead of being scheduled.

### 4. Understand a bill

1. On Home, tap **Scan a medical bill**, then **Try an example** → **Medical bill**. After **Looks correct**, the bill page offers more samples:
   - **Bedok:** a doctor visit and medicine, with the polyclinic subsidy.
   - **Tampines:** blood tests and MediSave.
   - **Marine Parade:** wound dressing, with the Merdeka Generation subsidy.
   - **Hospital stay:** ward charges, GST and a MediShield Life claim.
2. Tap any line to hear what it means.
3. Open **What this means for you** to see the subsidies already on the bill, and **You may also qualify for…**, each with its official MOH or CHAS page and the date we last checked it. Log in as a different demo person to see the result change.
4. Scan a real bill from any clinic, hospital, dental clinic or pharmacy, **page by page** (up to 4 pages) or as a PDF. If a bill lists Gross / Subsidy / **Net** for each line, the net amounts are used. If you scan a bill as a medicine label (or the reverse), the app asks: *"Was this meant for a medical bill?"*

### 5. Ask and look back

- **Ask:** type or say a question ("Can I take it with food?"). Answers come from the labels you checked, or from general medicine information, and suggest next questions to tap. Emergencies ("chest pain", "can't breathe") get a **Call 995** card straight away. **New conversation** starts over, with Undo.
- **History:** every scan you confirmed with **Looks correct**, newest first, grouped by medicine and by month for bills. **Listen again**, or delete one.

### 6. Caregivers

`caregiver.demo@example.com` (Tan Wei Jie, same password) is already linked to **Tan Ah Kow** (`pioneer.demo`) and **Siti Aminah** (`merdeka.demo`). It opens on **My seniors**: each senior's doses today, taken, missed or still to come, and the details of their medicines, to read only. A senior shows "Not shared yet" until they have used Schedule while logged in.

To see it update, log in as `pioneer.demo` in a second browser, scan the **Metformin label** sample, tap **Looks correct** and tick a dose; the caregiver's page refreshes every minute.

A senior links their own caregiver from **Account → Invite a caregiver**: the link works for 7 days for anyone it is sent to, and the caregiver sees their medicines and today's doses, never scans, photos, bills or account details.

### 7. Make it yours

- **Language:** switch at the top (or in the sidebar). The whole app, the read-aloud and the bill explanations change. It's saved to your account, so it follows you to other devices.
- **Day or night mode:** asked once after you sign up; change it any time on **Account** (Day, Night or Same as my device).
- **How to use the app:** a short guide that walks through the real buttons. It opens the first time you use the app **in this browser** (a second account in the same browser won't see it again), and any time from the sidebar or Account.
- **Account:** see and edit your details (these drive the bill subsidies), change language (you'll see "Settings saved"), invite a caregiver, and log out. Logging out also clears the Ask conversation and any scan in progress, so the next person on a shared device sees nothing.
- **Forgot your password?** On Log in, tap **Forgot your password?**, then **Send me a link**. Running locally, the email is printed in the terminal running `pnpm server`: open its link, choose a new password, and you're logged in (any other device that was logged in is logged out). Each link works once, for 30 minutes.

---

## Designed for the senior's phone

The person this app is for is usually on a phone and not comfortable with technology; the family member helping them is often on a computer. So the two get slightly different apps:

- **Phones:** full-size text and buttons (buttons 64px tall, every tap target at least 48px), pages change instantly, and nothing moves behind the words.
- **Laptops and desktops:** about 25% more compact (text never below 16px), with page transitions and gentle background motion.
- **Everyone:** turning on "reduce motion" on the device stops the animations. Accessibility checks (axe) run in our end-to-end tests.

## What's built, and what's coming

| Feature | Status |
|---|---|
| Scan → Check → Explain, read aloud, quick check | ✅ |
| 4 languages for the whole app | ✅ (translations being checked by native speakers) |
| Read aloud in every language | ✅ The device's own voice first; our server voice where a device has none (often Tamil and Malay) |
| Bills from any medical place, with subsidies from your account | ✅ Estimates only where official figures exist (polyclinic, CHAS GP and dental); other places list the schemes with links, never a made-up amount |
| Multi-page bills and PDFs | ✅ Up to 4 pages |
| On-phone covering of personal details | ✅ |
| Ask chatbot | ✅ |
| Accounts, Remember me, language and day/night on the account | ✅ |
| Forgot your password? (reset link by email; logs out every other device) | ✅ Needs an email provider on the live site (`MAIL_PROVIDER`); locally the email prints in the server terminal |
| Medicine schedule with dose ticks | ✅ Ticks saved to your account; "when necessary", weekly and tapering medicines go to your pharmacist, never scheduled |
| Google Calendar reminders | ✅ Connect, Disconnect and automatic sync on Schedule → My medicines |
| Scan history, Listen again | ✅ |
| Caregiver linking and read-only view of today's doses | ✅ |
| Missed-dose alerts | ✅ for the senior: a "Not ticked yet" Google Calendar alert 15 minutes after each dose, cancelled when it is ticked. The caregiver's own alert is not built |
| Nearby clinics map | Stretch goal |

## Your privacy and safety

- **Photos are never stored.** Personal details are covered on your phone first; only the covered photo is sent, to read the text, and then it's discarded. We keep extracted text only.
- **You always check** what was read before anything uses it. Unclear fields are flagged, never guessed.
- **Explanations come from human-checked templates**, not free AI text. The medicine schedule and the subsidy rules are our own rules, not AI.
- **Not medical advice.** The app never tells you to change a dose. "When necessary" and tapering medicines are sent to your pharmacist, not scheduled.
- **A caregiver can only read:** today's doses and the senior's medicine details, never scans, photos, bills or account details, and nothing they can change.
- **Passwords are hashed** (Argon2id); your login stays on your device.

## Tips

- **Photos:** good light, the whole label or bill inside the frame, held steady. A clear photo of the wrong document gets its own message (not "retake in good light").
- **Google's "unverified app" screen** when connecting Calendar: it's a student project, so press **Advanced → Go to Ah Ma Ah Gong Can**.
- **Free AI limits:** real photo scans, questions and the server voice share a free daily quota. If you see "Too many tries right now", wait a few minutes or try an example.

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
| `USE_MOCK_AI` | `true`: fixed answers, no AI quota (tests and local work). Anything else, or unset: real AI |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GROQ_API_KEY`, `GROQ_MODELS` | Reading photos, the chatbot and the server voice. Gemini first, Groq as the backup. Overloaded models rest for 2 minutes |
| `MONGODB_URI`, `JWT_SECRET` | Accounts. `JWT_SECRET` must be at least 32 bytes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_KEY` | Google Calendar. See [docs/google-contract.md](docs/google-contract.md) |
| `MAIL_PROVIDER` | Password-reset emails: `brevo` or `resend` sends them (with that provider's key); unset or `console` prints them in the server terminal |
| `AI_DAILY_CAP`, `AI_CHAT_DAILY_CAP`, `AI_TTS_DAILY_CAP` | App-wide daily limits for scans, questions and the server voice (defaults 200, 500, 300) |

### Database

Follow [docs/atlas.md](docs/atlas.md) for team access. `pnpm atlas:configure` writes your `.env`; `pnpm db:check` checks the connection. `pnpm server:local` uses a throwaway local database instead.

Create or reset the 10 demo accounts (9 seniors and the linked caregiver; safe to run again, and it re-links the caregiver to the Pioneer and Merdeka seniors):

```bash
node --env-file=.env server/scripts/seed-demo-accounts.js
```

### Test

```bash
pnpm test        # Vitest: everything below except e2e
pnpm test:unit   # src: rules, stores, on-phone covering, component tests (jsdom)
pnpm test:api    # server: scan, chat, auth, subsidies, history, care, Calendar
pnpm test:e2e    # Playwright, phone and desktop; starts its own API (no database, mock AI); logins and Google mocked
pnpm test:e2e:simple   # 50 simple end-to-end tests against a real server and a throwaway database
```

Stop your own `pnpm server` before `pnpm test:e2e`: the tests start their own API on port 3000 (so they can never reach the real database), and the run stops straight away if the port is busy. The full suite takes about 8 minutes; [e2e/E2E_REPORT.md](e2e/E2E_REPORT.md) has the latest results and one-feature commands.

Load test (20 seniors at once, needs [k6](https://k6.io)): `node load/server.js` in one terminal, `k6 run load/senior-day.js` in another.

### Code style

```bash
pnpm format      # Prettier: indentation and line breaks the same everywhere (run before every commit)
```

### Try the real AI

```bash
pnpm try:scan medication path/to/label.jpg   # prints the scan JSON
```

Leave `USE_MOCK_AI` unset (or anything but `true`) to use it in the app. Every real scan uses free quota (Gemini's free tier allows about 20 scans a day per model).

### Deploy

Vercel: every push to `main` deploys. `api/index.js` runs the Express app as one function; `vercel.json` sends every other path to the Vue app. Set the same environment variables in Vercel (with `GOOGLE_REDIRECT_URI` pointing at the live site), plus `MONGOMS_DISABLE_POSTINSTALL=1`. Atlas Network Access needs `0.0.0.0/0`.

### Where things are

```
docs/scan-contract.md      the scan data shape every feature builds on (read this first)
docs/auth-contract.md      accounts: endpoints, tokens, Remember me, language
docs/chat-contract.md      the Ask chatbot and its safety layers
docs/doses-contract.md     dose ticks
docs/history-contract.md   saved scans and ownership
docs/care-contract.md      caregiver invitations, linking and the read-only view
docs/google-contract.md    Google Calendar: endpoints, sync, the Connect button steps
docs/heuristic-audit.md    Nielsen's 10 heuristics: findings and fixes, 3 rounds
server/                    Express API: app.js, routes/, services/, models/, middleware/, fixtures/
src/                       Vue app: views/ (one per page), components/<feature>/, stores/ (Pinia), rules/, i18n/, api/client.js
e2e/                       Playwright specs, one per feature; E2E_REPORT.md has the latest results
e2e-simple/                50 simple end-to-end tests (real server, throwaway database)
load/                      k6 load test and its throwaway server
public/samples/            sample label and bill images
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, pull requests and who owns what.

## Team

| Who | Owns |
|---|---|
| Zachary (lead) | Scan API and AI reading, on-phone covering, Ask chatbot, Google Calendar, welcome page |
| Sheen Hern | Database, accounts, history, caregivers, cloud read-aloud, deploy |
| Asher | Scan, Check and Explain pages, translations, read-aloud |
| Lokesh | Schedule and Bill pages, subsidy rules, samples |
| Isaac | Design system, app shell, Home, Login, Account and History pages |

The graded `README.txt` (setup, live URL, dummy login, AI-use declaration) is written separately for submission.
