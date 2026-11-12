#!/usr/bin/env bash
# report.sh — nightly laptop + phone summary to WhatsApp, run by activity-report.timer
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

# ── Laptop
if [[ "$samples" == "0" ]]; then
  laptop="💻 Laptop: not used (it was off, or not signed in)."
else
  window=""
  [[ -n "$first" ]] && window=" ($(hm12 "$first")–$(hm12 "$last"))"

  # YouTube videos watched (names from the window title).
  yt=$(jq -r '(.youtube // [])[:5][] | "• \(.name) — \(.seconds)"' <<<"$json" \
    | while IFS= read -r line; do s="${line##* — }"; printf '%s — %s\n' "${line% — *}" "$(hms "$s")"; done)
  # Any real YouTube links (only when the browser extension is present).
  links=$(jq -r '(.youtubeLinks // [])[:5][]' <<<"$json")
  # Websites visited, plain host names.
  sites=$(jq -r '[.topHosts[]? | select(.seconds>=60) | .key] | join(", ")' <<<"$json")

  laptop="💻 Laptop: $(hms "$active")$window"
  [[ -n "$yt" ]] && laptop="$laptop

▶️ Watched on YouTube:
$yt"
  [[ -n "$links" ]] && laptop="$laptop

Links:
$links"
  [[ -n "$sites" ]] && laptop="$laptop

🌐 Websites: $sites"
  (( ${late%.*} >= 60 )) && laptop="$laptop
⚠️ Late night (10pm–6am): $(hms "$late")"
  [[ "$stops" != "0" ]] && laptop="$laptop
⚠️ Tracker was switched off $stops time(s) today."
fi

# ── Phone (only once a phone has ever checked in)
phone=""
if [[ "$(jq -r '.phone != null' <<<"$json")" == "true" ]]; then
  p_samples=$(jq -r '.phone.sampleCount // 0' <<<"$json")
  p_seen=$(jq -r '.phone.lastSeen // empty' <<<"$json")
  p_stops=$(jq -r '.phone.stops | length' <<<"$json")
  seen_line=""
  if [[ -n "$p_seen" ]]; then
    seen_age=$(( $(date +%s) - $(date -d "$p_seen" +%s) ))
    # The uploader checks in every 15 min; over 2 h silent means it is not running.
    (( seen_age > 7200 )) && seen_line="
⚠️ Phone tracker last checked in $(TZ=Asia/Kolkata date -d "$p_seen" '+%a %-I:%M %p' | sed 's/AM/am/;s/PM/pm/')."
  fi
  if [[ "$p_samples" == "0" ]]; then
    phone="📱 Phone: no data today.$seen_line"
  else
    p_active=$(jq -r '.phone.activeSeconds // 0' <<<"$json")
    p_late=$(jq -r '.phone.lateNightSeconds // 0' <<<"$json")
    p_first=$(jq -r '.phone.firstAt // empty' <<<"$json")
    p_last=$(jq -r '.phone.lastAt // empty' <<<"$json")
    p_window=""; [[ -n "$p_first" ]] && p_window=" ($(hm12 "$p_first")–$(hm12 "$p_last"))"
    p_apps=$(jq -r '.phone.topApps[]? | select(.seconds>=60) | "\(.key)\t\(.seconds)"' <<<"$json" \
      | while IFS=$'\t' read -r k v; do printf '%s %s, ' "$k" "$(hms "$v")"; done | sed 's/, $//')
    p_media=$(jq -r '(.phone.media // [])[:5][] | "\(.name)\t\(.seconds)"' <<<"$json" \
      | while IFS=$'\t' read -r n v; do printf '• %s — %s\n' "$n" "$(hms "$v")"; done)
    p_sites=$(jq -r '[.phone.topHosts[]? | select(.seconds>=60) | .key] | join(", ")' <<<"$json")

    phone="📱 Phone: $(hms "$p_active")$p_window"
    [[ -n "$p_apps" ]] && phone="$phone
Apps: $p_apps"
    [[ -n "$p_media" ]] && phone="$phone

▶️ Played on the phone:
$p_media"
    [[ -n "$p_sites" ]] && phone="$phone

🌐 Websites (phone): $p_sites"
    (( ${p_late%.*} >= 60 )) && phone="$phone
⚠️ Late night (10pm–6am): $(hms "$p_late")"
    phone="$phone$seen_line"
  fi
  [[ "$p_stops" != "0" ]] && phone="$phone
⚠️ ActivityWatch on the phone was off/unreachable $p_stops time(s)."
fi

body="📊 Daily report — $human_date

$laptop"
[[ -n "$phone" ]] && body="$body

$phone"
body="$body

See everything: $SITE/learning/coach/activity/$DATE"

if [[ -z "${WA_GROUP:-}" ]]; then
  echo "[report] WA_GROUP unset — not sending. Message would have been:"
  echo "$body"
  exit 0
fi

printf '%s' "$body" | wa send "$WA_GROUP"
echo "[report] sent to $WA_GROUP"
