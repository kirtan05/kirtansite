#!/data/data/com.termux/files/usr/bin/bash
# phone-upload.sh — his Android phone's uploader. The phone twin of upload.ps1.
#
# Runs in Termux every 15 minutes (termux-job-scheduler, persisted across
# reboots). Reads new events from aw-android's on-device server
# (127.0.0.1:5600, kept alive by its foreground service — the visible
# "ActivityWatch" notification) and POSTs them to the same ingest endpoint as
# the laptop, under the device label "his-phone".
#
# Buckets read (aw-android):
#   aw-watcher-android        currentwindow    → window  (app in front, screen on)
#   aw-watcher-android-web    web.tab.current  → web     (Chrome URL, via accessibility)
#   aw-watcher-android-media  media.playback   → media   (YouTube video title + channel)
#
# Same discipline as the laptop: per-bucket cursor, inclusive re-send of the
# open tail event (server upserts), cursors advance only if every chunk
# succeeded, a heartbeat every run. If aw-android cannot be reached the run
# reports a 'stopped' tracker event — once, on the transition — and 'started'
# when it comes back, so a force-stopped or uninstalled tracker shows up.
#
# Config: $HOME/.aw-phone/env  (AW_TOKEN=..., AW_API_KEY=..., optional AW_LABEL / AW_INGEST)
# AW_API_KEY is aw-android's own local API key (Settings → Authentication);
# recent aw-android requires it, which also keeps other apps out of its data.
set -uo pipefail

STATE="$HOME/.aw-phone"
# shellcheck disable=SC1091
[[ -f "$STATE/env" ]] && . "$STATE/env"
SERVER="${AW_SERVER:-http://127.0.0.1:5600}"
INGEST="${AW_INGEST:-https://kirtanjain.com/learning/api/activity/ingest}"
LABEL="${AW_LABEL:-his-phone}"
TOKEN="${AW_TOKEN:?AW_TOKEN missing from $STATE/env}"
CHUNK=25 # must stay <= the server's MAX_EVENTS
AWH=(); [[ -n "${AW_API_KEY:-}" ]] && AWH=(-H "Authorization: Bearer $AW_API_KEY")
aw() { curl -fsS "${AWH[@]}" "$@"; } # talk to aw-android
LOG="$STATE/upload.log"

mkdir -p "$STATE"
exec >>"$LOG" 2>&1
# Keep the log small.
if [[ $(wc -l <"$LOG") -gt 2000 ]]; then tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
echo "[$(now)] run"

[[ -f "$STATE/device-id" ]] || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$STATE/device-id"
DEVICE_ID="$(cat "$STATE/device-id")"
CUR="$STATE/cursors.json"
[[ -f "$CUR" ]] || echo '{}' >"$CUR"

post() { # $1 = JSON body
  curl -fsS --max-time 60 -X POST "$INGEST" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    --data-binary "$1" | jq -e '.ok == true' >/dev/null
}
tracker() { # $1 kind, $2 detail → a one-element tracker array
  jq -cn --arg k "$1" --arg at "$(now)" --arg d "$2" '[{kind:$k, at:$at, detail:$d}]'
}

# ── Is aw-android up?
DOWN_FLAG="$STATE/down"
if ! buckets="$(aw --max-time 15 "$SERVER/api/0/buckets/")"; then
  echo "aw-android unreachable"
  if [[ ! -f "$DOWN_FLAG" ]]; then
    body=$(jq -cn --arg l "$LABEL" --arg id "$DEVICE_ID" --argjson t "$(tracker stopped 'aw-android not reachable on the phone')" \
      '{device:$l, device_id:$id, events:[], tracker:$t}')
    post "$body" && touch "$DOWN_FLAG"
  else # still a heartbeat, so the site knows the uploader itself is alive
    post "$(jq -cn --arg l "$LABEL" --arg id "$DEVICE_ID" --argjson t "$(tracker heartbeat 'aw-android down')" \
      '{device:$l, device_id:$id, events:[], tracker:$t}')" || true
  fi
  exit 1
fi
extra_tracker='[]'
if [[ -f "$DOWN_FLAG" ]]; then extra_tracker="$(tracker started 'aw-android reachable again')"; fi

# ── Collect new events from each bucket we understand.
events_file="$STATE/batch.jsonl"; : >"$events_file"
new_cur="$(cat "$CUR")"
while IFS=$'\t' read -r id type; do
  case "$type" in
    currentwindow) kind=window ;;
    web.tab.current) kind=web ;;
    media.playback) kind=media ;;
    *) continue ;;
  esac
  since="$(jq -r --arg id "$id" '.[$id] // empty' "$CUR")"
  if [[ -n "$since" ]]; then q="?start=$(jq -rn --arg s "$since" '$s|@uri')&limit=-1"; else q='?limit=2000'; fi
  rows="$(aw --max-time 60 "$SERVER/api/0/buckets/$(jq -rn --arg s "$id" '$s|@uri')/events$q")" || { echo "read $id failed"; exit 1; }
  # Inclusive from the cursor: the still-open tail is re-sent and upserted server-side.
  jq -c --arg k "$kind" '.[] | {bucket:$k, timestamp, duration, data}' <<<"$rows" >>"$events_file"
  maxts="$(jq -r 'map(.timestamp) | max // empty' <<<"$rows")"
  [[ -n "$maxts" ]] && new_cur="$(jq -c --arg id "$id" --arg t "$maxts" '.[$id] = $t' <<<"$new_cur")"
done < <(jq -r 'to_entries[] | "\(.key)\t\(.value.type)"' <<<"$buckets")

# ── POST in chunks; heartbeat (and any 'started') rides on the last one.
total=$(wc -l <"$events_file")
ok=1; i=0
while :; do
  slice="$(sed -n "$((i + 1)),$((i + CHUNK))p" "$events_file" | jq -sc '.')"
  last=$(( i + CHUNK >= total ))
  trk='[]'
  if (( last )); then trk="$(jq -c --argjson a "$extra_tracker" --argjson b "$(tracker heartbeat '')" -n '$a + $b')"; fi
  body=$(jq -cn --arg l "$LABEL" --arg id "$DEVICE_ID" --argjson e "$slice" --argjson t "$trk" \
    '{device:$l, device_id:$id, events:$e, tracker:$t}')
  if ! post "$body"; then ok=0; echo "post failed at $i"; break; fi
  (( last )) && break
  i=$((i + CHUNK))
done

if (( ok )); then
  printf '%s' "$new_cur" >"$CUR"
  rm -f "$DOWN_FLAG"
  echo "uploaded $total events"
else
  echo "incomplete; cursors not advanced, will retry next run"
  exit 1
fi
