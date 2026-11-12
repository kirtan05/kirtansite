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

## 2. His Windows laptop — one line, nothing to copy

The installer is hosted on the site at `/activity/setup.ps1` (served static;
`robots.txt` disallows `/activity`). On the laptop, open **Terminal (Admin)**
(right-click Start) and run:

```powershell
irm https://kirtanjain.com/activity/setup.ps1 | iex
```

It prompts for the INGEST token, **auto-detects the logged-in user** to monitor,
downloads its runtime scripts to `C:\ProgramData\aw-monitor`, installs
ActivityWatch (winget), applies the Chrome policy (incognito off + web watcher
forced), registers the uploader (every 10 min) and watchdog (SYSTEM, at startup),
and starts tracking. It **warns if that account is an Administrator** (he could
then remove the tracker; the report still shows the gap). Then approve the forced
Chrome extension once and reboot. Data appears at `.../learning/coach/activity`
within ~10 minutes.

Overrides if auto-detect is wrong (e.g. to target a different account):
```powershell
& ([scriptblock]::Create((irm https://kirtanjain.com/activity/setup.ps1))) -ChildUser 'PCNAME\hisuser' -Token '<INGEST_TOKEN>'
```
`public/activity/{setup,upload,watchdog}.ps1` are the hosted copies of the
scripts in this folder — keep them in sync. Confirm the AW web-extension ID
(`-ExtId`) against the Web Store before relying on the forced install.

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

## 4. His Android phone — from this box, over USB

The phone runs **ActivityWatch for Android** (aw-android, kept alive by its own
visible notification) and a small **Termux** job that uploads every 15 min to
the same ingest route, as device `his-phone`. What it records: app time
(screen on), Chrome URLs (accessibility service), and what was *playing*
(media watcher: YouTube video title + channel). Laptop and phone are summarised
separately on the coach page and in the nightly report.

One-time site side (the phone has its own token, revocable on its own):

```bash
npx wrangler d1 execute activity --remote --file migrations-activity/0002_phone_media.sql -y
openssl rand -hex 32   # the PHONE token; keep it for the next two steps
npx wrangler pages secret put ACTIVITY_INGEST_TOKEN_PHONE   # paste it
```

Deploy, then on the phone: Developer options → USB debugging on, plug in,
accept the prompt, and run:

```bash
bash scripts/activity/setup-phone.sh '<PHONE_TOKEN>'
```

It installs aw-android + Termux + Termux:API (GitHub releases), grants usage
access / accessibility / notification access, exempts them from battery
optimisation, and types the Termux install command (`phone-install.sh`). If
aw-android is force-stopped or removed the uploader reports it once as a
`stopped` event; if Termux itself stops, the report says when the phone last
checked in. Pair with **Google Family Link** on his account for the controls
(app-install approval, uninstall protection) this deliberately does not do.

### Installed 13 Nov 2026 — his Redmi Note 10 Pro (MIUI 13, Android 12)

What the script could not do, and was done by hand:

- **MIUI developer options**: turn on *Install via USB* and *USB debugging
  (Security settings)* before running the script (needs a Mi account), and tap
  *Install* on each of the three on-phone prompts.
- **aw-android API key**: recent aw-android puts an API key on its local server
  (401 without it). Read it from the app's side drawer → *API Authentication*
  and add `AW_API_KEY=...` to `~/.aw-phone/env` in Termux. Keep auth on — it
  keeps other apps out of his data.
- **MIUI background autostart** on for ActivityWatch, Termux, Termux:API
  (Security → Manage apps → Autostart), and **App info → Battery saver → No
  restrictions** for all three. Without these MIUI kills them.
- If more than one adb device is attached, set `ANDROID_SERIAL` to his phone.

Checks, from this box with the phone plugged in: `adb shell dumpsys
jobscheduler | grep 5600` (job registered), `adb shell dumpsys accessibility |
grep -i activitywatch` (URL watcher bound). From anywhere: the `his-phone`
device's `last_seen` should never be more than ~15 min old while the phone is
on. If he quits ActivityWatch, app time is backfilled from Android's usage
history when it restarts; URLs and media titles for the gap are lost; the
uploader records the gap as `stopped`/`started`.

## Maintenance

- Re-run `chrome-policy.ps1`'s `chrome://policy` check after major Chrome updates.
- Raw events are pruned at 90 days; daily rollups are kept. (Pruning job: TODO —
  not yet wired; see the spec's open items.)
- Rotate a token by putting a new secret and updating the laptop/env file.
