# /learning — laptop activity monitor

Date: 2026-10-14. Status: design, awaiting review. Architectural change: new D1
database, new coach-only routes, a Windows agent, and a nightly report.

## Why

An eleven-year-old (Kirtan's brother, 6th standard) has a Windows laptop. The
computer track of `/learning` has not started yet but will soon, and in the
meantime the parents want to see where laptop time actually goes — so a slow
drift into games or video gets noticed early rather than discovered after a
term of missed study.

This is **visible** monitoring inside the family, not covert surveillance. The
tracker's tray icon stays on screen; the child can see it is there. The system
*notices and reports*; it never silently blocks. That matches the existing
`/learning` principle: **never block, always show.**

**Success:** at the end of a day, a parent can open one page and see how long
the laptop was active, the split across apps and sites, the late-night slice,
and whether the tracker ran all day or was stopped.

## Scope decisions (settled in brainstorming)

- **Detail level:** full timeline (every app, window title, and URL), not just
  category totals. The child's study is currently on paper, so the laptop view
  is about what the time went to, not about recognising study.
- **Auth: option A** — the existing coach password guards the new pages. No
  Cloudflare Access. This is a **known, accepted trade**: `security.md` already
  records that one-word shared passwords with no rate limiting are light, and a
  full browsing timeline is more sensitive than the maths record. Written here
  so it is a decision on the record, not a silent assumption. If the contents
  ever feel too exposed, the upgrade is Cloudflare Access on the `activity`
  routes only, free up to 50 users.
- **Incognito / other browsers:** handled by **Chrome enterprise policy**, not
  by network or DNS monitoring. Network monitoring was considered and rejected:
  it only yields domains (HTTPS hides the path), it is brittle against Chrome's
  built-in DNS and DoH, and quietly defeating incognito costs more trust than
  it returns. Instead a machine-wide Chrome policy disables incognito and
  force-installs the ActivityWatch web extension, so there is no private gap to
  recover. Other browsers (Firefox, Edge) appear as app time with no URLs;
  blocking them is optional and out of scope for v1.
- **Tamper handling:** the parent holds local admin; the child's account is
  standard. The system **reports** when the tracker stops; it does not try to
  make itself unkillable. On a standard account the child cannot remove the
  watchdog service, so a stop is a deliberate quit of the tray app and shows up
  as a gap plus a `tracker_stopped` event.
- **Report delivery:** a nightly WhatsApp message via the `wa` CLI on Kirtan's
  Arch box. Recipient group is **not chosen yet**; the send step is
  configurable and ships disabled until a group name is set.

## The shape of it

```
His Windows laptop (standard account, parent holds admin)
   │
   ├── ActivityWatch  ─ tray visible ─ localhost:5600
   │      aw-watcher-window · aw-watcher-afk · aw-watcher-web (Chrome ext)
   │
   ├── Chrome policy (HKLM\SOFTWARE\Policies\Google\Chrome)
   │      IncognitoModeAvailability = 1  (incognito off)
   │      ExtensionInstallForcelist   = aw-watcher-web
   │
   ├── Uploader         Task Scheduler, every 10 min, runs as the child's user
   │      reads new AW events since a stored cursor, POSTs in batches,
   │      sends a heartbeat each run
   │
   └── Watchdog service  runs as SYSTEM (parent-installed)
          notices aw tray/process exit → POSTs a tracker_stopped event
          │
          ▼  HTTPS, device-token auth
   kirtanjain.com/learning/api/activity/ingest
          │
          ├── D1  ACTIVITY_DB     raw events (90-day retention) + daily rollups (kept)
          └── coach-only pages    /learning/coach/activity[/YYYY-MM-DD]
          │
          ▼  (pull, read-only)
   Arch box systemd timer 23:30 IST → wa send "<group>"   (configurable, off until set)
```

## Components

### 1. Laptop — ActivityWatch + policy + uploader + watchdog

- **ActivityWatch** installed for the child's user, autostart on login, tray
  visible. Window, AFK, and web watchers. Window tracking needs the classic
  desktop (Windows gives window titles fine; the Wayland caveat is Linux-only).
- **Chrome policy** written once to `HKLM\SOFTWARE\Policies\Google\Chrome`:
  `IncognitoModeAvailability=1`, `ExtensionInstallForcelist` entry for the AW
  web extension. Works on an unmanaged (non-domain) machine because the keys
  live in HKLM. The installer verifies via `chrome://policy` and prints what it
  found.
- **Uploader** (PowerShell, Task Scheduler every 10 min, child's user):
  - reads a stored cursor (last event timestamp per bucket) from a local file;
  - `GET localhost:5600/api/0/buckets/<id>/events?start=<cursor>`;
  - POSTs new events to the ingest endpoint in batches, with a long random
    device token in the `Authorization` header;
  - advances the cursor only on a 2xx, so an offline laptop catches up later;
  - sends a heartbeat (device id + timestamp) every run, so the site can tell
    "laptop off" from "tracker stopped".
- **Watchdog** (small service, runs as SYSTEM, parent-installed): watches for
  the AW process/tray exiting and POSTs a `tracker_stopped` event with a
  timestamp. It reports; it does not relaunch or block.

### 2. Site — `ACTIVITY_DB` + ingest + coach pages

- **New D1 database `ACTIVITY_DB`**, bound in `wrangler.jsonc` alongside
  `LEARNING_DB` and `GREE_DB`, exactly as `/gree` got its own. Separate DB so a
  browsing timeline never mixes with the maths record. Expected volume ~1M raw
  rows over three years, well within D1; rollups keep the common queries cheap.
  Schema: `device`, `event` (ts, duration, bucket, app, title, url, host),
  `daily_rollup` (date, bucket/app/host, seconds), `tracker_event`.
- **`POST /learning/api/activity/ingest`** — the only route **not** behind the
  cookie. Authenticated by device token (constant-time compare against a Pages
  secret, same discipline as the password check). Validates and inserts events,
  updates the heartbeat, respects the D1 50-statement-per-invocation limit by
  batching. `prerender = false`.
- **`/learning/coach/activity[/YYYY-MM-DD]`** — coach-only via the existing
  `requireRole('coach')` gate, so it inherits hostname check, bindings check,
  cookie, and epoch. A day view: active time, timeline, totals by app and host,
  late-night (after 22:00 IST) slice, and tracker status with gaps shown
  honestly as "no data" rather than guessed. No change to the child's screens.
- **Retention:** a scheduled task (or ingest-time sweep) rolls raw events older
  than 90 days into `daily_rollup` and deletes them; rollups are kept.

### 3. Arch box — nightly report

- A systemd **user** timer at 23:30 IST runs a script that pulls the day's
  summary from the site (read-only, over the coach session or a dedicated
  read token) and calls `wa send "<group>"`.
- The message is a **summary with a link**, never the URL-level detail:
  active time, the active window, top apps/sites, the after-22:00 slice, and
  tracker status, then the `activity` page link.
- Ships **disabled**: no group is set yet, so the send step is a no-op until a
  `WA_GROUP` value is configured. The timer and script exist; they just don't
  send.
- If the box is off at 23:30, the timer is `Persistent=true`, so it sends on
  next boot and labels the report with the date it covers.

## What is deliberately not here

- No network/DNS capture, no proxy, no DoH defeat.
- No attempt to make the tracker unkillable; standard-account permissions plus
  the stop-report are the whole of it.
- No blocking, time limits, or nagging. This is observation only. (Timekpr has
  no Windows build; if limits are ever wanted, that is a separate decision.)
- Nothing added to the child's `/learning/today` screen.
- No second browser lockdown in v1.

## Risks and honest limits

- On the child's standard account the tray app can still be quit; the report
  shows the gap but cannot prevent it. Removing the watchdog needs admin.
- Incognito is closed by policy, but a Chrome update or a policy reset reopens
  it; the installer's `chrome://policy` check should be re-run after major
  updates.
- Other browsers show as app time with no URLs.
- The ingest token in a file on the laptop is readable by that user; a leaked
  token lets someone write junk events, not read the record. Rotatable via a
  new secret, like the password record.
- The nightly report depends on the Arch box being on; `Persistent=true`
  covers a miss, within a day.

## Post-review changes (code review, 2026-10-14)

A review caught several correctness bugs in the first cut; the built code
differs from the sketch above in these ways:

- **Idempotent ingest.** Each event's primary key is deterministic
  (`device|bucket|start`); the uploader deliberately re-sends the still-open
  tail event each run (AW grows an open event's duration in place) and the
  server upserts it. This fixes both duplicate-on-retry and the frozen-duration
  bug that otherwise undercounted long sessions badly.
- **Statement budget.** Events are written as multi-row `INSERT`s (8 rows each)
  with `MAX_EVENTS=300`, and the uploader chunks to 25/POST, so a request stays
  under the free plan's ~50-statement ceiling. The first cut's per-batch
  chunking did not actually bound the per-invocation total.
- **AFK is now used.** Active time, app/category totals and the late slice are
  computed from the window time with AFK intervals cut out (interval math in
  `activity.ts`), so an idle laptop with a game open no longer counts.
- **Late-night = 22:00–06:00 IST**, within each IST day, not just "after 22:00".
- **Reads aggregate across all devices** rather than trusting a most-recently-
  seen pointer, which a leaked ingest token could otherwise use to hide the real
  data behind a forged empty device. Residual: the token on the laptop can still
  write junk (it can never read) — acceptable given monitoring is visible and
  the realistic actor is the child, who can also just quit the visible tray app.
- **Task settings:** uploader runs on battery; watchdog has no execution time
  limit (would otherwise be killed at 72h) and waits for the device id rather
  than exiting. The report's Persistent catch-up reports the day it covers.

## Open items for review

1. Is the spec's **option A** auth note an acceptable record of the trade, or
   do you want Cloudflare Access on the `activity` routes from the start?
2. Retention at 90 days of raw events — longer, shorter, or fine?
3. Report wording and the after-22:00 cutoff — adjust later when the group is set.
