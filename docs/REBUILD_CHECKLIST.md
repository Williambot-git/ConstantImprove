# AhoyVPN Late-Night Rebuild Checklist

Date: _________________ Time started: _________ Rollback commit: _________

---

## BEFORE THE NIGHT

### 1. Git backup branch
```bash
cd ~/ConstantImprove
git branch backup-pre-rebuild-$(date +%Y%m%d)
git push -u origin backup-pre-rebuild-$(date +%Y%m%d)
```
Note the current commit hash for rollback:
```bash
git rev-parse HEAD
```

### 2. Database dump (before touching anything)
```bash
pg_dump -U ahoyvpn -h localhost ahoyvpn > ~/backups/pre-rebuild-$(date +%Y%m%d-%H%M).sql
```
Verify it looks good:
```bash
ls -lh ~/backups/pre-rebuild-*.sql
```

### 3. Warn your customer
Send a quick message: "Hey, site may be down for 30-60 min tonight for upgrades. Will notify when back up."

### 4. Pull latest ConstantImprove
```bash
cd ~/ConstantImprove
git pull origin main
```
Review what changed since last deploy.

---

## THE REBUILD (in order)

### 5. Take down the site
```bash
sudo systemctl stop ahoyvpn   # or whatever the service is called
pm2 stop all                   # if using pm2
```

### 6. Database dump (final, post-traffic)
```bash
pg_dump -U ahoyvpn -h localhost ahoyvpn > ~/backups/pre-rebuild-final.sql
```

### 7. Backend dependencies
```bash
cd ~/ConstantImprove/backend
npm install
```

### 8. Frontend build
```bash
cd ~/ConstantImprove/frontend
npm install
npm run build
```
Output goes to `frontend/out/` — verify it exists:
```bash
ls ~/ConstantImprove/frontend/out/ | head -10
```

### 9. Environment variables
Copy `.env.example` to `.env` and fill in ALL values. Critical ones that must be real:
- [ ] `DATABASE_URL` — your PostgreSQL connection string
- [ ] `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] `REFRESH_TOKEN_SECRET` — same generator, different run
- [ ] `PLISIO_API_KEY`
- [ ] `AUTHORIZE_SIGNATURE_KEY`
- [ ] `AUTHORIZE_NET_API_LOGIN_ID`
- [ ] `AUTHORIZE_NET_TRANSACTION_KEY`
- [ ] `VPN_RESELLERS_API_TOKEN` + plan IDs
- [ ] `SMTP_*` — email credentials
- [ ] `PAYCLOUD_SECRET` — get the real value or disable PayCloud in code

### 10. Run migrations
```bash
cd ~/ConstantImprove/backend
npm run migrate
```
Expected output: runs all 12 migrations cleanly. Check for errors.

### 11. Start the backend
```bash
cd ~/ConstantImprove/backend
npm start
```
Watch for:
- `[DATABASE]` connected messages
- Port 3000 binding
- Any unhandled errors in first 10 seconds

### 12. Smoke-test the API
```bash
curl -s http://localhost:3000/health | python3 -m json.tool
```
Expected: `{"status":"OK",...}`

### 13. Smoke-test a webhook endpoint (Plisio)
```bash
curl -s -X POST http://localhost:3000/api/webhooks/plisio \
  -H "Content-Type: application/json" \
  -H "x-plisio-signature: dummy" \
  -d '{"status":"completed","invoice_id":"test_123","order_number":"test_123"}'
```
Expected: `{"received":true}` — signature will fail but endpoint should respond.

### 14. Start the frontend (if separate)
If frontend is served by the same Express app (`app.use(express.static(...))`), skip. If separate:
```bash
cd ~/ConstantImprove/frontend
npm run dev   # dev only — for production use the built static files
```

### 15. Verify DNS still pointing to old server
```bash
dig ahoyvpn.net +short
# or
nslookup ahoyvpn.net
```
Confirm old IP before we switch.

### 16. Point web server to new code
```bash
sudo systemctl restart ahoyvpn   # or restart pm2 / nodemon / however it's running
pm2 restart all
```

### 17. Test the live site (on new server IP)
```bash
curl -s https://ahoyvpn.net/health
```
Expected: same health response.

### 18. Test a login flow end-to-end (as yourself)
1. Go to https://ahoyvpn.net/login
2. Log in with your test account
3. Visit https://ahoyvpn.net/dashboard
4. Check browser console for errors

### 19. Manually test the Plisio webhook
```bash
# Use Plisio's test/sandbox mode or manually hit the webhook:
curl -X POST https://ahoyvpn.net/api/webhooks/plisio \
  -H "Content-Type: application/json" \
  -H "x-plisio-signature: <use the real HMAC calculated with PLISIO_API_KEY>" \
  -d '{
    "status": "completed",
    "invoice_id": "test_smoke_123",
    "order_number": "test_order_456",
    "tx_id": "abc123tx",
    "amount": "5.99",
    "currency": "BTC",
    "email": "test@example.com"
  }'
```
Check logs:
```bash
tail -50 ~/ConstantImprove/backend/logs/$(date +%Y%m%d).log
# or
pm2 logs
```

---

## IF EVERYTHING WORKS

### 20. Update DNS (when ready to go live)
Update your DNS A record for `ahoyvpn.net` to point to the new server IP.
```bash
# After DNS update
dig ahoyvpn.net +short
```
Wait 5 min, then test again.

### 21. Final end-to-end test
1. Visit https://ahoyvpn.net as a fresh browser
2. Register a test account
3. Attempt checkout (use Plisio sandbox if available)
4. Verify VPN credentials email arrives

### 22. Watch webhook logs for 30 min
```bash
tail -f ~/ConstantImprove/backend/logs/authorize-webhook.log
tail -f ~/ConstantImprove/backend/logs/*.log
```

### 23. Notify customer
"Back up! Everything working."

---

## IF SOMETHING BREAKS

### Rollback (fast)
```bash
cd ~/ConstantImprove
git reset --hard <commit-hash-from-step-1>
sudo systemctl restart ahoyvpn   # or your restart command
```

### Rollback database (if DB was changed)
```bash
psql -U ahoyvpn -h localhost ahoyvpn < ~/backups/pre-rebuild-final.sql
```

### Rollback DNS (if already switched)
Point DNS back to old server IP. Propagation takes 5-30 min.

---

## KEY FILES & LOCATIONS

| What | Where |
|------|-------|
| Backend code | `~/ConstantImprove/backend/` |
| Frontend code | `~/ConstantImprove/frontend/` |
| Built frontend | `~/ConstantImprove/frontend/out/` |
| Env vars | `~/ConstantImprove/backend/.env` |
| Logs | `~/ConstantImprove/backend/logs/` |
| DB dumps | `~/backups/` |
| Migrations | `~/ConstantImprove/backend/db/migrations/` |
| Webhook logs | `~/ConstantImprove/backend/logs/authorize-webhook.log` |

## KNOWN GOTCHAS

1. **PAYCLOUD_SECRET** — currently placeholder `your_paymentscloud_webhook_secret`. Real secret needed, or disable the endpoint.

2. **VPN_RESELLERS_PLAN_*_ID** — must match plan IDs in your vpnresellers.com dashboard. If wrong, VPN account creation fails silently (only logged).

3. **Ziptax** — disabled by default (no API key). Site works fine without it. If enabling, set `ZIPTAX_API_KEY` + `ZIPTAX_ENABLED=true`.

4. **Authorize.net relay URL** — dynamically built from Host headers. Works correctly as long as DNS resolves to this server before Authorize.net POSTs.

5. **Plisio polling fallback** — if webhooks miss, invoice polling runs every 5 minutes. Won't lose payments, just delays activation by up to 5 min.
