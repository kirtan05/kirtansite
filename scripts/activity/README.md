# Laptop activity monitor — runbook

What this is, and the honest limits, live in
`docs/superpowers/specs/2026-10-14-learning-activity-monitor-design.md`. This is
the how-to. It is **visible** monitoring: the tray icon stays on the laptop and
the system reports rather than blocks.

The site code deploys with the rest of `kirtansite`. Each of the three off-site
surfaces has a one-line installer. Run them in this order; every one is safe to
re-run.

## 1. Cloudflare — one line, from the repo root

Be logged in first (`npx wrangler login`), then:

```bash
bash scripts/activity/setup-cloudflare.sh
```

Creates the `activity` D1 database, writes its id into `wrangler.jsonc`, applies
the migration (local + remote), sets both Pages secrets, and **prints the INGEST
and READ tokens once** — copy them; you need them in steps 2 and 3. Then deploy
the site as usual. Verify:
`curl -s -o /dev/null -w '%{http_code}' https://kirtanjain.com/learning/api/activity/ingest` → `401`.

## 2. His Windows laptop — one line, elevated PowerShell

Copy this folder to the laptop, open PowerShell **as administrator** in it, and:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-laptop.ps1 -Token '<INGEST_TOKEN>' -ChildUser 'PCNAME\hisuser'
```

Installs ActivityWatch (winget), applies the Chrome policy (incognito off + web
watcher forced), registers the uploader (child user, every 10 min) and watchdog
(SYSTEM, at startup), stores config at machine scope, reports whether his account
is Standard or Administrator, and starts the tracker. **Before running, confirm
the AW web-extension ID** — pass `-ExtId '<id>'` if it differs from the default.
Then sign in as the child to approve the forced extension, and reboot to start
the watchdog. Data appears at `.../learning/coach/activity` within ~10 minutes.

## 3. This box — one line (report ships disabled until a group is set)

```bash
bash scripts/activity/setup-report.sh '<READ_TOKEN>'
```

Installs the user systemd service + timer and enables the 23:30 IST run. With no
group it prints the report but never sends. When the group is decided, pass it
(must match exactly one WhatsApp group — see the whatsapp skill):

```bash
bash scripts/activity/setup-report.sh '<READ_TOKEN>' 'Exact Group Name'
```

## Maintenance

- Re-run `chrome-policy.ps1`'s `chrome://policy` check after major Chrome updates.
- Raw events are pruned at 90 days; daily rollups are kept. (Pruning job: TODO —
  not yet wired; see the spec's open items.)
- Rotate a token by putting a new secret and updating the laptop/env file.
