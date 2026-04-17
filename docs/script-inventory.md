# Script Inventory

> **Purpose:** Categorize every file in `scripts/` as active, deprecated, or one-time patch artifact.
> **Why:** The scripts/ directory accumulated many one-time fix/patch scripts that should not be used in normal operations. This document clarifies what each script does and whether it's still relevant.

---

## ✅ Active / Recurring

These scripts are part of normal operations and are referenced in documentation or cron jobs.

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `ahoyvpn-monitor.sh` | System health monitor — checks PM2, nginx, disk, RAM, DB connectivity | Via cron (as documented in ops docs) |
| `backup-to-github.js` | Backs up auth-related DB tables to GitHub | Via cron (`0 */3 * * *`) |
| `backup_users_to_github.js` | Legacy backup script (superseded by backup-to-github.js?) | Manual / cron |
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

## ❓ Uncertain / Needs Review

These scripts exist but it's unclear if they're still used or relevant.

| Script | Purpose | Questions |
|--------|---------|-----------|
| `atom_service_install.iss` | NSIS installer script for Atom VPN Windows client | Is this used? Is the Windows client still maintained? |
| `check_db.py` | SQL query helper over SSH | Is this used for regular ops? References `/home/krabs/.ssh/truekey` |
| `check_patch.py` | Patch checker? | What did it check? Was it one-time? |
| `create_release.py` | Creates releases? | Is this part of the deployment pipeline? |
| `deploy.sh` | Bash deployment script | What does it deploy? Replaced by Python scripts? |
| `openclaw-backup.sh` | OpenClaw backup script | References different project — is this relevant? |
| `parse-ical.js` | Parse iCal calendar? | What calendar? Used for what? |
| `psql-helper.py` | PSQL over SSH helper | Same concern as check_db.py — references `/home/krabs/.ssh/truekey` |
| `ssh-helper.py` | SSH helper utilities | References `key = "/home/krabs/.ssh/truekey"` — krabs user, not ahoy |

---

## 📝 Notes

### Key Observations

1. **`check_db.py` and `ssh-helper.py`** reference a `/home/krabs/.ssh/truekey` — this is a different user (`krabs`) than the normal `ahoy` user. These scripts were likely from a different machine or a shared admin setup. They should be reviewed for security before use.

2. **Patch scripts (`fix_*.py`, `patch_*.py`)** — All 10 patch scripts were one-time use. The actual fixes are in the committed codebase. These scripts should either be deleted or moved to `docs/archive/patch-scripts/` if William wants to preserve them as historical reference.

3. **`deploy.sh` vs `deploy_frontend.py`** — There are three deployment scripts. If `deploy_frontend.py` (and `deploy_frontend2.py`) are the current ones, `deploy.sh` is likely obsolete.

4. **restore_auth_backup.js** — This script is actually well-written with safety features (dry-run default, pre-restore snapshots, table-level selectivity). It belongs in ✅ Active.

---

## Recommended Actions

1. ~~**Delete** the 10+ one-time patch scripts (`fix_*.py`, `patch_*.py`, `process_logo.py`, `debug_pattern.py`, `generate_env.py`)** — DONE
2. ~~**Move** `deploy.sh` to deprecated if `deploy_frontend.py` is current** — N/A, deploy_frontend.py deleted
3. **Review** `atom_service_install.iss`, `openclaw-backup.sh`, `parse-ical.js` — determine if they're still relevant
4. **Review** `check_db.py`, `psql-helper.py`, `ssh-helper.py` — the `/home/krabs/.ssh/truekey` reference should be replaced with documented SSH key management
5. **Consider** whether `backup_users_to_github.js` is superseded by `backup-to-github.js`

---

*Generated: 2026-04-18*
