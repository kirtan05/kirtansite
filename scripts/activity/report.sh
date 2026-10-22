#!/usr/bin/env bash
# report.sh — nightly laptop summary to WhatsApp, run by activity-report.timer
# at 23:30 IST on Kirtan's Arch box.
#
# Pulls aggregates only (no raw URLs/titles) from the summary endpoint and
# sends a short message plus the coach-page link via the system `wa` CLI.
#
# Ships DISABLED: with no WA_GROUP set it prints the message and exits 0
# without sending. Set WA_GROUP (and it must match exactly one group) to turn
# sending on — see the whatsapp skill for the rules.
#
# Config via environment (e.g. an EnvironmentFile in the systemd unit):
#   ACTIVITY_READ_TOKEN  required
#   SITE                 default https://kirtanjain.com
#   WA_GROUP             WhatsApp group name; unset = don't send
set -euo pipefail

SITE="${SITE:-https://kirtanjain.com}"
TOKEN="${ACTIVITY_READ_TOKEN:?set ACTIVITY_READ_TOKEN}"
# The timer fires 23:30 IST, so an on-time run reports "today". A Persistent
# catch-up usually fires at next boot on a later calendar day: if it is before
# 20:00 IST and no date was given, assume we are catching up on yesterday.
if [[ -n "${1:-}" ]]; then
  DATE="$1"
elif (( 10#$(TZ=Asia/Kolkata date +%H) < 20 )); then
  DATE="$(TZ=Asia/Kolkata date -d 'yesterday' +%F)"
else
  DATE="$(TZ=Asia/Kolkata date +%F)"
fi

json="$(curl -fsS -H "Authorization: Bearer $TOKEN" "$SITE/learning/api/activity/summary?date=$DATE")"

hms() { # seconds -> "2h 05m" / "45m"
  local s="${1%.*}"; s="${s:-0}"
  if (( s < 3600 )); then printf '%dm' $(( (s + 30) / 60 ));
  else printf '%dh %02dm' $(( s / 3600 )) $(( (s % 3600) / 60 )); fi
}

ist() { TZ=Asia/Kolkata date -d "$1" +%H:%M 2>/dev/null || echo '??:??'; }

active=$(jq -r '.activeSeconds // 0' <<<"$json")
samples=$(jq -r '.sampleCount // 0' <<<"$json")
late=$(jq -r '.lateNightSeconds // 0' <<<"$json")
first=$(jq -r '.firstAt // empty' <<<"$json")
last=$(jq -r '.lastAt // empty' <<<"$json")
stops=$(jq -r '.stops | length' <<<"$json")
human_date="$(TZ=Asia/Kolkata date -d "$DATE" '+%a %-d %b')"

hm12() { TZ=Asia/Kolkata date -d "$1" '+%-I:%M %p' 2>/dev/null | sed 's/AM/am/;s/PM/pm/'; }

if [[ "$samples" == "0" ]]; then
  body="📱 Laptop report — $human_date

The laptop wasn't used today (it was off, or not signed in).

See everything: $SITE/learning/coach/activity/$DATE"
else
  window=""
  [[ -n "$first" ]] && window=" ($(hm12 "$first")–$(hm12 "$last"))"

  # YouTube videos watched (names from the window title).
  yt=$(jq -r '.youtube[]? | "• \(.name) — \(.seconds)"' <<<"$json" \
    | while IFS= read -r line; do s="${line##* — }"; printf '%s — %s\n' "${line% — *}" "$(hms "$s")"; done)
  # Any real YouTube links (only when the browser extension is present).
  links=$(jq -r '.youtubeLinks[]?' <<<"$json")
  # Websites visited, plain host names.
  sites=$(jq -r '[.topHosts[]? | select(.seconds>=60) | .key] | join(", ")' <<<"$json")

  late_line=""
  (( ${late%.*} >= 60 )) && late_line="
⚠️ Late night (10pm–6am): $(hms "$late")"
  tracker_line=""
  [[ "$stops" != "0" ]] && tracker_line="
⚠️ Tracker was switched off $stops time(s) today."

  body="📱 Laptop report — $human_date

On the laptop: $(hms "$active")$window"
  [[ -n "$yt" ]] && body="$body

▶️ Watched on YouTube:
$yt"
  [[ -n "$links" ]] && body="$body

Links:
$links"
  [[ -n "$sites" ]] && body="$body

🌐 Websites: $sites"
  body="$body$late_line$tracker_line

See everything: $SITE/learning/coach/activity/$DATE"
fi

if [[ -z "${WA_GROUP:-}" ]]; then
  echo "[report] WA_GROUP unset — not sending. Message would have been:"
  echo "$body"
  exit 0
fi

printf '%s' "$body" | wa send "$WA_GROUP"
echo "[report] sent to $WA_GROUP"
