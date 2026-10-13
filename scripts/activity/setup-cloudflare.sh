#!/usr/bin/env bash
# setup-cloudflare.sh — one-line Cloudflare setup for the activity monitor.
#
# Run from the repo root, logged in to wrangler (npx wrangler login):
#   bash scripts/activity/setup-cloudflare.sh
#
# Creates the `activity` D1 database, writes its id into wrangler.jsonc, applies
# the migration (local + remote), and sets the two Pages secrets. Idempotent:
# re-running reuses the existing database and rotates the secrets. Prints the
# two tokens at the end — you need them on the laptop and this box.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
PROJECT=kirtansite
WR="npx wrangler"

echo '→ Ensuring the D1 database exists...'
$WR d1 create activity >/dev/null 2>&1 || true
DBID="$($WR d1 list --json | jq -r '.[] | select(.name=="activity") | .uuid')"
[[ -n "$DBID" && "$DBID" != "null" ]] || { echo 'could not find/create the activity database'; exit 1; }
echo "  activity = $DBID"

echo '→ Writing the id into wrangler.jsonc...'
# Replace the placeholder on first run; thereafter replace whatever id is there,
# but only inside the ACTIVITY_DB block (match database_name "activity").
perl -0pi -e 's/("database_name":\s*"activity",\s*"database_id":\s*)"[^"]*"/$1"'"$DBID"'"/s' wrangler.jsonc
grep -q "\"$DBID\"" wrangler.jsonc || { echo 'failed to patch wrangler.jsonc — do it by hand'; exit 1; }

echo '→ Applying the migration (local + remote)...'
$WR d1 execute activity --local  --file migrations-activity/0001_init.sql -y
$WR d1 execute activity --remote --file migrations-activity/0001_init.sql -y

echo '→ Generating and setting the two tokens...'
gen() { node -e 'console.log(crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,""))'; }
INGEST="$(gen)"; READ="$(gen)"
printf '%s' "$INGEST" | $WR pages secret put ACTIVITY_INGEST_TOKEN --project-name "$PROJECT"
printf '%s' "$READ"   | $WR pages secret put ACTIVITY_READ_TOKEN   --project-name "$PROJECT"

cat <<EOF

Done. Deploy the site (git push / your usual deploy), then verify:
  curl -s -o /dev/null -w '%{http_code}\\n' https://kirtanjain.com/learning/api/activity/ingest   # expect 401

Copy these now — they are shown once:
  INGEST token (for the laptop setup -Token):   $INGEST
  READ   token (for this box's report env file): $READ
EOF
