# AhoyVPN — What This Project Is

**AhoyVPN** is a white-label VPN subscription service. People sign up, pay, and get VPN credentials. There's also an affiliate program that pays people to refer customers.

This repo contains the complete codebase: frontend website and backend API.

---

## The Big Picture (60-Second Version)

```
User's Browser          Your Server              Outside Services
      |                      |                           |
      |-- visits website --->|                           |
      |                      |-- serves pages --------->|
      |<-- page renders -----|                           |
      |                      |                           |
      |-- signs up -------->|                           |
      |                      |-- creates account ------->| PostgreSQL DB
      |                      |-- talks to payment ----->| Plisio (crypto)
      |                      |                           | Authorize.net (cards)
      |<-- login page -------|                           |
      |                      |                           |
      |-- pays --------------|                           |
      |                      |-- webhook confirms ----->| Plisio / Auth.net
      |                      |-- creates VPN account -->| PureWL (VPN provider)
      |<-- success page -----|                           |
      |                      |-- VPN credentials ------->| email to user
```

That's the whole flow. Everything else is details.

---

## What Each Part Does

### Frontend (`/frontend`)
A Next.js website users interact with. Pages include:
- `/` — Homepage
- `/login` — User login with numeric account number + password
- `/register` — Create a new account
- `/checkout` — Select plan and pay
- `/dashboard` — View subscription, get VPN credentials
- `/affiliate` — Track referrals and request payouts
- `/admin` — Manage users, affiliates, promo codes

The frontend never stores payment info. It calls the backend API for everything.

### Backend (`/backend`)
A Node.js/Express API server. Handles:
- Authentication (JWT tokens, numeric account passwords, recovery kits)
- Subscription management (create, pause, cancel, upgrade)
- Payment processing (Plisio for crypto, Authorize.net for cards, PayCloud as backup)
- VPN account provisioning (via PureWL API — creates actual VPN credentials)
- Affiliate tracking and commission payout ledger

### Database (PostgreSQL)
Stores everything persistent:
- User accounts (numeric IDs, hashed passwords, recovery kits)
- Subscriptions (plan, status, start/end dates)
- Payments (amount, currency, status, webhook history)
- VPN accounts (credentials from PureWL, encrypted)
- Affiliates (commission rates, earnings ledger, payout history)

---

## Key Domain Concepts

### Numeric Accounts (Privacy-First Design)
Users don't provide an email to create an account. They get:
- **Account Number** — 8-digit username (e.g., `73829104`)
- **Password** — 8-digit numeric password
- **Recovery Kit** — A single-use 32-character code used to reset a lost password

No email required. No "forgot password via email." Recovery kit or nothing.

### The 30-Day Grace Period
When someone signs up, their subscription starts in `trialing` status for 30 days before they need to pay. This is a grace window, not a free trial — payment is still required, they just have 30 days to complete it.

### How VPN Access Works
1. User completes payment (webhook confirms it)
2. Backend calls PureWL API to create a VPN account
3. Backend stores the VPN credentials (encrypted in DB)
4. User retrieves credentials from their dashboard

The actual VPN servers are provided by **PureWL** (also called Atom VPN). AhoyVPN doesn't run any VPN infrastructure — it's a reseller.

### Affiliate Program
- Affiliates get a unique referral code
- When someone signs up with that code and pays, the affiliate earns commission
- Commission is tracked in a ledger and paid out on request
- Commission rate is 10% by default

### Tax Calculation (Ziptax)
Sales tax is calculated via the Ziptax API based on the user's state. It can be toggled on/off via the `ZIPTAX_ENABLED` environment variable. No code changes needed to add/remove states.

---

## How a Typical User Flow Works

### New User Signs Up
1. Goes to `/register`
2. Enters desired account number + password (both numeric, 8 digits)
3. Account is created immediately — no email verification
4. Redirected to `/checkout`

### Checkout
1. Selects a plan (monthly, quarterly, semi-annual, annual)
2. Chooses payment method (crypto via Plisio OR card via Authorize.net)
3. Optional: enters affiliate code
4. Pays — sent to payment processor
5. Backend waits for webhook confirmation

### After Payment
1. Webhook arrives → backend verifies signature
2. Backend calls PureWL → creates VPN account
3. Backend sends email with VPN credentials (WireGuard/OpenVPN config)
4. User can now use VPN

### Login / Dashboard
1. User logs in at `/login` with account number + password
2. JWT token issued, valid for 15 minutes (refresh token valid 7 days)
3. Dashboard shows: subscription status, renewal date, VPN credentials, support options

---

## File Structure (What Goes Where)

```
ConstantImprove/
├── frontend/
│   ├── pages/           # Every route on the site (one file per page)
│   ├── components/      # Reusable UI pieces
│   │   ├── ui/          # Basic building blocks: Button, Card, Modal, etc.
│   │   ├── dashboard/   # Dashboard-specific components
│   │   └── admin/       # Admin panel components
│   ├── tests/           # Jest tests (1,029 tests — all passing)
│   ├── next.config.mjs  # Next.js build settings
│   └── babel.config.js  # Babel settings (for Jest, not the build)
│
├── backend/
│   ├── src/
│   │   ├── index.js           # Entry point — starts the server
│   │   ├── controllers/       # Request handlers (one file per API route group)
│   │   ├── routes/            # Route definitions — maps URLs to controllers
│   │   ├── middleware/        # Auth, rate limiting, error handling
│   │   ├── services/          # Business logic (payments, VPN, email, etc.)
│   │   ├── models/            # Database operations (raw SQL queries)
│   │   ├── utils/             # Helpers (logging, encryption, etc.)
│   │   └── templates/         # Email HTML templates
│   ├── db/
│   │   ├── migrations/        # 14 SQL migration files (run on every deploy)
│   │   ├── runMigrations.js   # Script that runs all migrations
│   │   └── seed.js            # Creates test data (dev only)
│   ├── tests/                 # Jest tests (1,235 tests — all passing)
│   └── .env                   # Secrets and config (NOT committed to git)
│
├── docs/
│   ├── REBUILD_CHECKLIST.md   # Step-by-step deploy guide
│   ├── automation-status.md   # Cron jobs and automated tasks
│   └── ...
│
└── scripts/
    └── ...                    # Utility scripts
```

---

## How to Run It Locally

### Prerequisites
- Node.js 20+
- PostgreSQL (running locally or via Docker)
- npm

### Backend
```bash
cd backend

# Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum you need:
#   DATABASE_URL (PostgreSQL connection string)
#   JWT_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Install dependencies
npm install

# Run database migrations (creates all tables)
npm run migrate

# Seed test data (optional — creates fake users, subs, etc.)
npm run seed

# Start the server
npm run dev
# Server runs on http://localhost:3000
```

### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# Frontend runs on http://localhost:3001
# (Backend API should already be running on :3000)
```

### Run All Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

**Current test status: 2,264 tests passing** (1,235 backend + 1,029 frontend)

---

## Environment Variables That Matter Most

| Variable | What It Does | Notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Required — won't start without it |
| `JWT_SECRET` | Signs auth tokens | Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `REFRESH_TOKEN_SECRET` | Signs refresh tokens | Same generator, different run |
| `PLISIO_API_KEY` | Crypto payment processing | Sandbox available for testing |
| `AUTHORIZE_NET_*` | Card payment processing | Requires Authorize.net merchant account |
| `VPN_RESELLERS_API_TOKEN` | Creates VPN accounts via PureWL | Get from vpnresellers.com dashboard |
| `CORS_ORIGIN` | Allowed frontend URL | Must match exactly or browser blocks requests |

---

## Common "What the Heck Is Happening" Moments

### "The build fails but tests pass"
Check `package.json` for `"type": "module"`. If present, the frontend code must use `export default` not `module.exports`. The codebase uses CommonJS (`module.exports`) throughout. If you add `"type": "module"`, you must convert every component file.

### "Webhook isn't firing, payment isn't activating"
1. Check the payment processor's webhook logs (Plisio dashboard or Authorize.net)
2. Check the backend logs: `tail -f backend/logs/authorize-webhook.log` or general logs
3. Verify the webhook URL is publicly accessible (not localhost)
4. Check the HMAC signature is being verified correctly

### "VPN credentials not showing up"
1. Check `VPN_RESELLERS_PLAN_*_ID` env vars match the plan IDs in your vpnresellers.com dashboard
2. The PureWL API call happens server-side on webhook — check backend logs for `PureWL` or `vpn` errors
3. VPN accounts are created ONLY after payment webhook confirms payment

### "Affiliate commission isn't tracking"
1. The affiliate code must be entered at checkout, not after
2. Commission only counts when the referred user COMPLETES a payment
3. Check the `earnings_ledger` table to see if rows were created

### "Tax isn't being calculated"
1. Verify `ZIPTAX_ENABLED=true` in .env
2. Verify `ZIPTAX_API_KEY` is set (get from Ziptax dashboard)
3. Tax is calculated at checkout time based on the user's state — it requires the user to have entered their state

---

## Key Files for Common Tasks

| Task | File(s) to Look At |
|---|---|
| Add a new API endpoint | `backend/src/routes/*.js` + `backend/src/controllers/*.js` |
| Change the login flow | `backend/src/services/authService.js` + `frontend/pages/login.jsx` |
| Add a new page | Create file in `frontend/pages/` — Next.js auto-creates route |
| Change payment logic | `backend/src/services/paymentService.js` + webhook handlers |
| Add database table | Create migration in `backend/db/migrations/` + model in `backend/src/models/` |
| Change email templates | `backend/src/templates/` + `backend/src/services/emailService.js` |
| Modify affiliate commission | `backend/src/services/affiliateService.js` |
| Add VPN server | `backend/src/services/vpnService.js` + PureWL API calls |

---

## Architecture Decisions Worth Knowing

**Why numeric accounts instead of email?**
Privacy. No email to leak, no "reset via email" attack surface. Recovery is done via physical recovery kit (written down by the user during signup).

**Why no payment info stored?**
PCI compliance. By offloading card/crypto handling to Plisio and Authorize.net, AhoyVPN never touches raw payment data. Webhooks confirm payment — that's it.

**Why PureWL?**
White-label VPN reseller. They handle the actual VPN infrastructure (servers, protocols, apps). AhoyVPN just provisions accounts through their API.

**Why a 30-day grace period instead of immediate paywall?**
So users can sign up, get their account, and be prompted to pay within the checkout flow. It's a softer entry point — the paywall comes after they're already in.

**Why a separate affiliate ledger?**
Commission is tracked separately from balances. Affiliates earn commission on each referred payment, but it's held in the ledger until they request a payout. This decouples "earning" from "withdrawing" so the accounting is always clean.

---

## Deploying to Production (The Short Version)

See `docs/REBUILD_CHECKLIST.md` for the full step-by-step. The short version:

1. `git pull origin main` on the server
2. `npm install` in backend and frontend
3. `npm run migrate` in backend
4. Build frontend: `npm run build` in frontend
5. Restart services
6. Test with `curl http://localhost:3000/api/health`

---

## Getting Help

- **Backend API** — `backend/README.md` has full endpoint documentation
- **Frontend pages** — `frontend/README.md` maps routes to components
- **Deployment** — `docs/REBUILD_CHECKLIST.md` is the go-to deploy guide
- **Payment flows** — `PAYMENTS_INTEGRATION_REFERENCE.md` covers Plisio, Authorize.net, PayCloud
- **VPN provisioning** — `VPNRESELLERS_INTEGRATION.md` covers PureWL integration

If something is wrong or missing, check `docs/REBUILD_CHECKLIST.md` under "KNOWN GOTCHAS."
