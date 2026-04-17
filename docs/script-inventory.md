# Script Inventory

> **Purpose:** Categorize every file in `scripts/` as active, deprecated, or one-time patch artifact.
> **Why:** The scripts/ directory accumulated many one-time fix/patch scripts that should not be used in normal operations. This document clarifies what each script does and whether it's still relevant.

---

## ✅ Active / Recurring

These scripts are part of normal operations and are referenced in documentation or cron jobs.

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `ahoyvpn-monitor.sh` | System health monitor — checks PM2, nginx, disk, RAM, DB connectivity | Via cron (as documented in ops docs) |
| `backup-to-github.js` | Backs up workspace to a GitHub backup remote | Via cron |
| `backup_users_to_github.js` | Backs up auth-related DB tables to KeepUsAlive repo | Via cron (`0 */3 * * *`) |
| `backend_health_check.sh` | Checks backend is responding on port 3000 | Manual / health monitoring |
| `restore_auth_backup.js` | Selective table restore from KeepUsAlive backup repo | Emergency recovery only |
| `security_daily.sh` | Daily security checks | Via cron |
| `update-telegram-webhook.sh` | Updates Telegram webhook | Manual |

---

## ⚠️ One-Time Patch Artifacts (DELETED)

These scripts were used once to patch the codebase and are now obsolete. They have been deleted from the repository.

The following were deleted in commit c5d0f6e:
`fix_arb.py`, `fix_arb_complete.py`, `fix_arb_webhook.py`, `fix_frontend.py`, `patch_checkout.py`, `patch_checkout_frontend.py`, `process_logo.py`, `debug_pattern.py`, `generate_env.py`, `deploy_frontend.py`, `deploy_frontend2.py`

Note: `fix_payment_controller.py`, `fix_payment_final.py`, `patch_payment_remote.py` were already absent.

---

## ❌ Obsolete / Irrelevant

These scripts were for unrelated projects or otherwise not applicable to AhoyVPN operations. **All deleted (commit X).**

| Script | Why Irrelevant |
|--------|----------------|
| `atom_service_install.iss` | NSIS installer for Atom VPN Windows client — different project (Atom SDK VPN, not AhoyVPN) |
| `openclaw-backup.sh` | Backs up ~/.openclaw workspace (different project), not AhoyVPN |
| `parse-ical.js` | Fetches a personal Google Calendar (wrt9510@gmail.com) — unrelated to AhoyVPN |
| `ssh-helper.py` | References `/home/krabs/.ssh/truekey` — `krabs` user, different machine/admin setup |
| `psql-helper.py` | References `/home/krabs/.ssh/truekey` — same concern as ssh-helper.py |
| `check_db.py` | References `/home/krabs/.ssh/truekey` — same concern; also likely superseded by direct DB access |
| `deploy.sh` | Bash deployment script — purpose unclear; deploy_frontend.py (now deleted) was the active deployment script |

**Note on ahoyvpn-monitor.sh:** This script references `/home/krabs/.openclaw/workspace/scripts/ssh-helper.py` and `check_db.py` at lines 48-49 and 68 — these point to a different machine (`krabs` user). The monitor script itself is active/functional, but those helper references are dead paths on this system. The deleted scripts above are the LOCAL copies of those helpers, which were also unused.

## ❓ Uncertain / Needs Review

No scripts currently fall into this category.

*(`create_release.py` was previously listed here but does not exist in scripts/ — removed.)

---

## 📝 Notes

### Key Observations

1. **`backup-to-github.js` vs `backup_users_to_github.js`** — These are DIFFERENT tools serving different purposes:
   - `backup-to-github.js`: Backs up the entire workspace (git commits) to a backup remote
   - `backup_users_to_github.js`: Backs up PostgreSQL auth tables to the `KeepUsAlive` repo via `pg_dump`
   - Both are active; they complement each other

2. **`check_db.py` and `ssh-helper.py`** reference a `/home/krabs/.ssh/truekey` — this is a different user (`krabs`) than the normal `ahoy` user. These scripts were likely from a different machine or a shared admin setup. They should be reviewed for security before use.

3. **Patch scripts (`fix_*.py`, `patch_*.py`)** — All deleted (commit 471cded). The actual fixes were applied to the committed codebase. `restore_auth_backup.js` is the only remaining safety net for data recovery.

4. **`restore_auth_backup.js`** — Well-written with safety features (dry-run default, pre-restore snapshots, table-level selectivity). Confirmed active.

---

## Recommended Actions

1. ~~**Delete** the 10+ one-time patch scripts~~ — **DONE** (commit 471cded)
2. ~~**Delete** obsolete irrelevant scripts~~ — **DONE** (atom_service_install.iss, openclaw-backup.sh, parse-ical.js, ssh-helper.py, psql-helper.py, check_db.py, deploy.sh)
3. **No further action needed** — all 7 scripts in scripts/ are now either active or deleted

---

*Generated: 2026-04-18*
