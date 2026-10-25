# Chat contract ("Ask about my medicine")

Owner: **Zachary**. The chatbot is its own page (`/ask`), open any time. It supports the pharmacist and does not replace them.

- **My medicines**: every medication label the user checks on Confirm is remembered, and the user can also type a medicine in (name + what the label says). The whole list is sent with each question. shortcut: the list lives in the browser (`src/stores/medicines.js`, extracted text only); move it to the user's account once Sheen Hern's history API exists.
- **About one of their medicines**: the answer uses only that medicine's entry.
- **About a medicine we don't know** (not in the list, or unclear which): the reply is `NEED_MEDICINE`, and the page asks for a label photo or the name and instructions, then offers "Ask again".
- **General questions**: general, well-established medicine information only; anything personal gets "ask your pharmacist". This uses the model's own knowledge until a human-checked information bank is added.
- **Small talk and off-topic**: greetings and thanks get a short, warm reply that invites a medicine question; other topics (homework, news, recipes) get a kind "I only help with medicines" and an idea of what to ask instead.
- **Follow-ups**: the last few answered turns are sent with each question, so "and at night?" makes sense. Under each answer the page shows the AI's suggested next questions as chips, or fixed ones when it gave none.

## Request

`POST /api/chat`

```jsonc
{
  "medicines": [{ "source": "label" | "typed", "medication": Medication }],  // 0 to 10; Medication as in docs/scan-contract.md
  "question": "Can I take it with food?",
  "lang": "en" | "zh" | "ms" | "ta",
  "history": [{ "q": "When do I take it?", "a": "Twice a day, after food." }]  // optional, 0 to 4 earlier turns, oldest first
}
```

- Each `medication` is re-checked with `normalizeMedication`, so only contract fields reach the AI. `name` is required; typed medicines usually only have `name` and `rawInstruction`.
- `question` is 1 to 300 characters. Each `history` turn is `{ q, a }` strings (q up to 300, a up to 800); other fields are dropped. Only `question` is checked for red flags.
- From the client, call `askMedicine(medicines, question, lang, history)` from `src/api/client.js`.

## Response

```jsonc
{ "ok": true, "data": { "type": "ANSWER", "answer": "Take it after food.", "askPharmacist": false } }
{ "ok": true, "data": { "type": "ANSWER", "answer": "Hello! ...", "askPharmacist": false, "suggestions": ["How do I store insulin?"] } }  // 1 to 3 next questions, only when there are some
{ "ok": true, "data": { "type": "ANSWER", "answer": null, "askPharmacist": true } }  // no usable answer: show a fixed "ask your pharmacist" line
{ "ok": true, "data": { "type": "NEED_MEDICINE" } }                               // ask for a label photo or the name and instructions
{ "ok": true, "data": { "type": "URGENT" } }                                      // show the fixed 995 card
```

Reserved for the information bank: an `ANSWER` may carry `"sources": [{ "title": "HealthHub", "url": "..." }]` (or plain strings). The page shows them as "From: ...". The server does not send it yet; never let the AI write its own sources.

Errors use the same envelope and codes as `/api/scan` (`BAD_REQUEST`, `RATE_LIMITED`, `AI_UNAVAILABLE`, ...).

## Safety layers (in order)

1. **Input checks**: language, question length, at most 10 medicines, each with a source and a name, size cap.
2. **Red flags in code**: emergency phrases in all 4 languages (`server/services/chat.js`) return `URGENT` without calling the AI.
3. **Limits**: 10 questions per minute per IP (`CHAT_RATE_LIMIT`), and a daily cap of 500 (`AI_CHAT_DAILY_CAP`) kept separate from scans.
4. **Prompt**: rules are in the system instruction; the history (as JSON) and the question each sit inside `"""` delimiters. Temperature 0.5 for natural, varied wording; safety does not rely on it. Answers about the user's medicines use only their entries and repeat that label's exact amount (`doseAmount` + `doseUnit`, never `strength`), times, time of day, food rule and relevant warning; general answers stay general. Never change a dose, recommend a medicine or diagnose; under 60 words; numbers as digits.
5. **Reply checks**: JSON schema `{ answer, suggestions, askPharmacist, urgent, needMedicine }`. `urgent` wins over `needMedicine`; an empty or broken reply becomes "ask your pharmacist". Suggestions keep only strings of 80 characters or less, at most 3, and drop any containing a red-flag phrase.

## Models

`GEMINI_CHAT_MODELS` (default `gemini-flash-lite-latest,gemini-2.5-flash-lite`), then optional `GROQ_CHAT_MODELS`. These are separate from the scan models, so chat has its own free quota. `USE_MOCK_AI=true` returns fixed answers (from the first medicine, `NEED_MEDICINE` for "it/this/my" questions with no medicines, otherwise a general line).
