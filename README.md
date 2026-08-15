# Idea Router

Reads Bengali idea submissions from your own Google Sheet copy, uses Gemini
to detect and cleanly separate however many distinct ideas are packed into
each submission, and lets you edit + email each idea to the right team.

Everything below is written for a **new, dedicated Gmail account** you create
just for this app — keep it separate from your personal Gmail throughout.

## 1. Create the dedicated Gmail account
Sign up for something like `idea-router.yourname@gmail.com`. This account
will own the Sheet copy, the Gemini key, and send all routing emails.

## 2. Live-sync the idea data in
While logged into the new account, create a blank sheet and in A1 put:

```
=IMPORTRANGE("https://docs.google.com/spreadsheets/d/ORIGINAL_SHEET_ID/edit", "Form Responses 1!A:K")
```

(swap in your original sheet's ID and its actual tab name). Approve the
"Allow access" prompt when it appears. This keeps your copy auto-updating
as new submissions come in, refreshed roughly hourly by Google or instantly
via Ctrl+Alt+Shift+F9 (Cmd+Option+Shift+F9 on Mac).

Since A:K is now a live formula, add the helper columns off to the side
instead: **N1: Status**, **O1: SplitResultJSON**. The app reads A:K and
writes to N/O.

The app's `SHEET_RANGE` in `src/lib/sheets.ts` is set to `Form Responses 1!A2:O`
— update the tab name there if yours differs.

## 3. Google Cloud project (same new account)
- console.cloud.google.com → new project (e.g. `idea-router`)
- Enable the **Google Sheets API** and **Gmail API**

## 4. Service account (for Sheets)
- IAM & Admin → Service Accounts → Create → generate a JSON key
- Open your Sheet copy → Share → add the service account's `client_email` as Editor

## 5. Gmail App Password (for sending)
No OAuth client needed — just:
- Turn on 2-Step Verification on the dedicated Gmail account (myaccount.google.com/security)
- Go to myaccount.google.com/apppasswords, create one named e.g. "idea-router"
- Copy the 16-character password it gives you

## 6. Gemini API key
aistudio.google.com, logged into the same new account → generate a free key.
Uses `gemini-3.6-flash` by default (set `GEMINI_MODEL` to override, e.g.
`gemini-3.5-flash-lite` for a cheaper/faster option).

## 7. Configure and run
```bash
cp .env.local.example .env.local
# fill in SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
# GEMINI_API_KEY, GMAIL_SENDER_ADDRESS, GMAIL_APP_PASSWORD

npm install
npm run dev                 # http://localhost:3000
```

## How it works
- `GET /api/ideas` — reads all rows from your Sheet copy
- `POST /api/ideas` — sends one row's raw text to Gemini, gets back
  `{ ideaCount, ideas: [{ title, summary }] }`, caches it in columns N/O
- The page shows each split idea as an editable card with a team-email field
- `POST /api/send` — sends that idea via Gmail (App Password/SMTP) and marks the row `sent`

## Notes
- Volume (2–3 submissions/day) is far under Gemini's free tier and Gmail
  API's free sending quota, so this stays entirely free on `localhost`.
- Deploying free later: Vercel works fine for the Next.js app; just add the
  same env vars in the Vercel project settings.
