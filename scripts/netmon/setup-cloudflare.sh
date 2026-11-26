#!/usr/bin/env bash
set -euo pipefail

# Provision Cloudflare D1 (`netmon`), apply migrations, set Pages secrets,
# and write ~/.config/netmon/env (chmod 600) for the Linux netmon collector.

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

PROJECT_NAME="${NETMON_PAGES_PROJECT:-kirtansite}"
DB_NAME="${NETMON_D1_NAME:-netmon}"
MIGRATION_FILE="migrations-netmon/0001_init.sql"
WRANGLER_CONFIG="wrangler.jsonc"
ENV_DIR="$HOME/.config/netmon"
ENV_FILE="$ENV_DIR/env"

info()  { printf '\033[1;34m[netmon]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[err]\033[0m %s\n' "$*" >&2; exit 1; }

command -v npx >/dev/null 2>&1 || err "npx is required (install Node.js)"
command -v node >/dev/null 2>&1 || err "node is required"
[[ -f "$MIGRATION_FILE" ]] || err "Missing $MIGRATION_FILE in $REPO_ROOT"
[[ -f "scripts/learning-hash.mjs" ]] || err "Missing scripts/learning-hash.mjs in $REPO_ROOT"

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    python3 -c 'import secrets; print(secrets.token_hex(32))'
  fi
}

info "Checking Cloudflare authentication..."
npx wrangler whoami >/dev/null 2>&1 || err "Not logged into Cloudflare. Run: npx wrangler login"

info "Ensuring D1 database '$DB_NAME' exists..."
DB_ID="$(
  npx wrangler d1 list --json 2>/dev/null | node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) process.exit(0);
    const list = JSON.parse(raw);
    const hit = list.find((d) => d.name === process.argv[1]);
    if (hit && hit.uuid) process.stdout.write(hit.uuid);
  ' "$DB_NAME"
)"

if [[ -z "$DB_ID" ]]; then
  info "Creating D1 database '$DB_NAME'..."
  CREATE_OUT="$(npx wrangler d1 create "$DB_NAME" 2>&1)"
  printf '%s\n' "$CREATE_OUT"
  DB_ID="$(printf '%s\n' "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n1 || true)"
  [[ -n "$DB_ID" ]] || err "Could not parse D1 database UUID from wrangler output"
  ok "Created D1 database '$DB_NAME' ($DB_ID)"
else
  ok "Found existing D1 database '$DB_NAME' ($DB_ID)"
fi

if [[ -f "$WRANGLER_CONFIG" ]]; then
  info "Checking $WRANGLER_CONFIG for '$DB_NAME' database_id..."
  node -e '
    const fs = require("fs");
    const [file, dbName, dbId] = process.argv.slice(1);
    let src = fs.readFileSync(file, "utf8");
    const blockRe = new RegExp(
      `("database_name"\\s*:\\s*"${dbName}"[\\s\\S]{0,400}?"database_id"\\s*:\\s*")([^"]*)(")`
    );
    const revRe = new RegExp(
      `("database_id"\\s*:\\s*")([^"]*)("[\\s\\S]{0,400}?"database_name"\\s*:\\s*"${dbName}")`
    );
    if (blockRe.test(src)) {
      const next = src.replace(blockRe, `$1${dbId}$3`);
      if (next !== src) {
        fs.writeFileSync(file, next, "utf8");
        console.log("Updated database_id for " + dbName + " in " + file);
      } else {
        console.log(file + " already has the matching database_id");
      }
    } else if (revRe.test(src)) {
      const next = src.replace(revRe, `$1${dbId}$3`);
      if (next !== src) {
        fs.writeFileSync(file, next, "utf8");
        console.log("Updated database_id for " + dbName + " in " + file);
      } else {
        console.log(file + " already has the matching database_id");
      }
    } else {
      console.warn("WARNING: No d1_databases entry for " + dbName + " found in " + file + ". Add database_id=" + dbId + " manually.");
    }
  ' "$WRANGLER_CONFIG" "$DB_NAME" "$DB_ID"
fi

info "Applying migration $MIGRATION_FILE (--local)..."
npx wrangler d1 execute "$DB_NAME" --local --file="$MIGRATION_FILE" --yes
ok "Local D1 migration applied"

info "Applying migration $MIGRATION_FILE (--remote)..."
npx wrangler d1 execute "$DB_NAME" --remote --file="$MIGRATION_FILE" --yes
ok "Remote D1 migration applied"

# Dashboard password -> hash via scripts/learning-hash.mjs
NETMON_RAW_PW="${NETMON_PASSWORD:-}"
if [[ -z "$NETMON_RAW_PW" ]]; then
  read -r -s -p "Enter /net dashboard password (NETMON_PW): " NETMON_RAW_PW
  printf '\n'
  [[ -n "$NETMON_RAW_PW" ]] || err "Password cannot be empty"
  read -r -s -p "Confirm password: " NETMON_RAW_PW_CONFIRM
  printf '\n'
  [[ "$NETMON_RAW_PW" == "$NETMON_RAW_PW_CONFIRM" ]] || err "Passwords do not match"
fi

info "Hashing NETMON_PW via scripts/learning-hash.mjs..."
NETMON_PW_HASH="$(
  node scripts/learning-hash.mjs "$NETMON_RAW_PW" | awk 'NF { line = $0 } END { print line }' | sed -E 's/^[A-Za-z0-9_]+=//; s/^[[:space:]]+//; s/[[:space:]]+$//'
)"
[[ -n "$NETMON_PW_HASH" ]] || err "Failed to hash password with scripts/learning-hash.mjs"

NETMON_COOKIE_KEY="$(rand_hex)"
NETMON_INGEST_TOKEN="$(rand_hex)"

info "Setting Cloudflare Pages secrets on project '$PROJECT_NAME'..."
printf '%s' "$NETMON_PW_HASH"     | npx wrangler pages secret put NETMON_PW           --project-name="$PROJECT_NAME"
printf '%s' "$NETMON_COOKIE_KEY"  | npx wrangler pages secret put NETMON_COOKIE_KEY   --project-name="$PROJECT_NAME"
printf '%s' "$NETMON_INGEST_TOKEN"| npx wrangler pages secret put NETMON_INGEST_TOKEN --project-name="$PROJECT_NAME"
ok "Pages secrets updated"

COLLECTOR_ID="${NETMON_COLLECTOR_ID:-$(hostname)}"
COLLECTOR_LABEL="${NETMON_COLLECTOR_LABEL:-ThinkPad EOS (Linux)}"
INGEST_URL="${NETMON_INGEST_URL:-https://kirtanjain.com/net/api/ingest}"
ROUTER_URL="${ROUTER_URL:-http://192.168.1.1}"
ROUTER_USER="${ROUTER_USER:-admin}"
ROUTER_PASS="${ROUTER_PASS:-admin}"

info "Writing $ENV_FILE (chmod 600)..."
mkdir -p "$ENV_DIR"
chmod 700 "$ENV_DIR"

umask 077
cat > "$ENV_FILE" <<EOF
# Kirtan Netmon Collector configuration
# Generated by scripts/netmon/setup-cloudflare.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)

NETMON_INGEST_URL=${INGEST_URL}
NETMON_INGEST_TOKEN=${NETMON_INGEST_TOKEN}
NETMON_COLLECTOR_ID=${COLLECTOR_ID}
NETMON_COLLECTOR_LABEL=${COLLECTOR_LABEL}

ROUTER_URL=${ROUTER_URL}
ROUTER_USER=${ROUTER_USER}
ROUTER_PASS=${ROUTER_PASS}

NETMON_POLL_SECONDS=30
NETMON_CAPTURE_FLOWS=1

# Optional built-in UDP DNS proxy (set router DHCP DNS to this host):
# NETMON_DNS_LISTEN=0.0.0.0:5353
# NETMON_DNS_UPSTREAM=1.1.1.1:53,8.8.8.8:53

# Optional dnsmasq or AdGuard Home querylog tailer:
# NETMON_DNS_LOG_FILE=/var/log/dnsmasq.log

# Optional UDP syslog listener for router logs:
# NETMON_SYSLOG_LISTEN=0.0.0.0:1514
EOF
chmod 600 "$ENV_FILE"
ok "Wrote $ENV_FILE"

printf '\n'
ok "Cloudflare D1, Pages secrets, and collector env are ready."
info "Next steps:"
printf '  1. Test scrape:   ./scripts/netmon/netmon-collector.py --env-file "%s" --once --dry-run\n' "$ENV_FILE"
printf '  2. Install timer: ./scripts/netmon/install-systemd.sh\n'
printf '  3. Deploy Pages:  npm run build && npx wrangler pages deploy dist --project-name=%s\n' "$PROJECT_NAME"
