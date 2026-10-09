# Coopsaas Invest: a Tickr Rails sample app

A complete, working example of a fintech offering stock trading through
Tickr Rails. Coopsaas is a fictional cooperative-savings app. With
Coopsaas Invest, its members open a stockbroking account, move money from their savings, and buy
and sell shares on the Nigerian Exchange.

Use it to see a Tickr Rails integration end to end, or as the starting point for your own.

> **A reference, not production code.** It shows how to integrate safely, but it leaves out
> things a live app needs, such as two-factor sign-in, a real savings ledger, and KYC document
> checks. See [Before you go live](#before-you-go-live).

## What it does

| Screen | What happens |
| --- | --- |
| Sign up and sign in | The member's account with you. New members get demo savings. |
| Open your investment account | KYC goes to Tickr Rails, which opens a CSCS account and a broker account. Each step shows as it completes. |
| Home | Portfolio value, investing cash, shares held, savings, and every transfer with its status. |
| Add money and Move to savings | Moves money between the member's savings and their investment account. |
| Markets | Every NGX security, today's top gainers, a quote, a 3-month price line, and a buy or sell form. |
| Orders | Each order and its status from the broker, with Cancel while it is open. |
| Activity | Every webhook Tickr Rails sent about the member, in plain words. |

## How it is built

```
 Members' app (React)  ──►  Your backend (Express, SQLite)  ──►  Tickr Rails API
                            ◄──  signed webhooks: POST /webhooks/tickr
```

- **The browser never sees your Tickr Rails API key.** Every call goes through your backend,
  which adds the key.
- **Your backend keeps its own records:** members, savings, and which Tickr Rails client,
  orders and transfers belong to whom.
- **Webhooks are verified,** then applied once.
- **Polling covers a missed webhook.** Onboarding and transfers are also checked against Tickr
  Rails, so a lost webhook only delays an update.

## Running it

You need a Tickr Rails sandbox API key and webhook secret. Get them when your fintech signs up,
or from Settings in the Tickr Rails dashboard.

```bash
cp backend/.env.example backend/.env    # fill in TICKR_BASE_URL, TICKR_API_KEY, TICKR_WEBHOOK_SECRET
```

Then start it in one of two ways.

**With Docker**

```bash
docker compose up --build
```

**With Node 22.13 or later**

```bash
cd frontend && npm install && npm run build && cd ..
cd backend && npm install && npm start
```

Open http://localhost:4100.

Set your webhook URL in the Tickr Rails dashboard to `https://<your-host>/webhooks/tickr`. While
developing on your own machine, use a tunnel such as ngrok to give the backend a public https
address.

To work on the app with live reload, run `npm run dev` in `backend` and in `frontend`. Then open
http://localhost:5173.

### Settings

All of these go in `backend/.env`.

| Setting | Meaning |
| --- | --- |
| `TICKR_BASE_URL` | The Tickr Rails API, for example your sandbox URL |
| `TICKR_API_KEY` | Your fintech's API key. Keep it on the server |
| `TICKR_WEBHOOK_SECRET` | Your webhook signing secret, `whsec_…` |
| `SANDBOX` | `true` shows **Fill in test details** when opening an account |
| `SESSION_SECRET` | Signs member sessions. Any long random string |
| `STARTING_SAVINGS` | Demo savings for each new member, in naira |
| `MAX_TRANSFER` | Optional cap per deposit or withdrawal, in naira |

### Making it yours

Your name, tagline and colours are all in `frontend/src/brand.js`, and your logo is
`frontend/public/favicon.svg`. Nothing else in the app names the brand.

## The integration, step by step

Each step below points to the code that does it.

### 1. Keep the API key on your server

`backend/src/tickr.js` adds `x-api-key` to every request and returns the `data` part of each
response. A Tickr Rails `401` or `403` means your setup is wrong, not the member's request, so
`server.js` shows members a general "unavailable" message instead.

### 2. Open the member's investment account

`startOnboarding` in `backend/src/members.js` sends the KYC with `POST /clients` and stores the
returned `platformClientId` and `pollingId` against the member.

`refreshOnboarding` checks `GET /clients/jobs/{pollingId}/status` for progress. It treats the
account as open once `GET /clients/{id}/account` succeeds, or when a `client.onboarded`
webhook arrives.

A failed attempt can be sent again with corrected details. Tickr Rails resumes at the step that
failed.

### 3. Move money with your own references

`fundInvesting` and `withdrawToSavings` send `POST /clients/{id}/transactions`. Each request
carries a unique `reference`, so it can be matched later and never sent twice. Each request
follows two rules:

- **A deposit takes the savings first,** so they cannot be spent twice.
- **A withdrawal adds to savings only when Tickr Rails confirms it.**

`settleTransfer` records each outcome exactly once, whether it arrives by webhook or by polling.

### 4. Check orders before placing them

`placeOrder` checks the order with `POST /trades/validate`, then places it with `POST /trades`.

Validation does not check the member's balance. So for a buy, the app first compares
`totalRequired` with `availableBalance` from `GET /clients/{id}/trading-summary`.

Orders are listed with `GET /trades/client/{id}`, and cancelled with `POST /trades/{id}/cancel`.

### 5. Verify every webhook

`handleTickrWebhook` in `backend/src/webhooks.js` runs four checks, in order:

1. It reads the raw request body, before any JSON parsing.
2. It checks `x-tickr-signature` against an HMAC-SHA256 of that body, made with your secret,
   using a constant-time comparison.
3. It rejects any webhook whose `timestamp` is more than 5 minutes old.
4. It ignores an event `id` it has already stored.

It answers within Tickr Rails' 5-second limit and does any slow work afterwards.

### 6. Show members plain words

Tickr Rails failure reasons can include the broker's technical text. `backend/src/reasons.js`
keeps only the readable sentence.

## Tests

```bash
cd backend && npm test
```

The tests cover webhook signatures, the age limit, ignoring repeats, and settling each transfer
exactly once, all against a throwaway database.

## Before you go live

- **Use your real ledger** for savings instead of the SQLite `members.savings_kobo` column, and
  move money for real.
- **Add two-factor sign-in,** account recovery and rate limits on sign-in.
- **Check members' identity** before sending their KYC, as your licence requires.
- **Put the backend behind https** and set your production webhook URL.
- **Store sessions and data** in a database built for your traffic.

## Licence

MIT. See [LICENSE](LICENSE).
