#!/usr/bin/env bash
# setup-report.sh — one-line install of the nightly WhatsApp report on this box.
#
#   bash scripts/activity/setup-report.sh '<READ_TOKEN>' ['Exact WhatsApp Group']
#
# Installs the user systemd service + timer, writes the env file (chmod 600),
# and enables the 23:30 IST timer. The group is optional: without it the report
# runs but only prints (never sends) until you add WA_GROUP. Idempotent.
set -euo pipefail

READ_TOKEN="${1:?usage: setup-report.sh <READ_TOKEN> [WA_GROUP]}"
WA_GROUP="${2:-}"

UNIT_DIR="$HOME/.config/systemd/user"
ENV_FILE="$HOME/.config/activity-report.env"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$UNIT_DIR"
cp "$SRC/activity-report.service" "$SRC/activity-report.timer" "$UNIT_DIR/"

umask 077
{
  printf 'ACTIVITY_READ_TOKEN=%s\n' "$READ_TOKEN"
  [[ -n "$WA_GROUP" ]] && printf 'WA_GROUP=%s\n' "$WA_GROUP"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

systemctl --user daemon-reload
systemctl --user enable --now activity-report.timer

echo "Installed. Timer:"
systemctl --user list-timers activity-report.timer --all --no-pager || true
if [[ -z "$WA_GROUP" ]]; then
  echo "No WA_GROUP set — the report will print, not send. Add 'WA_GROUP=...' to $ENV_FILE when ready, then: systemctl --user restart activity-report.timer"
fi
echo "Dry-run any day:  ACTIVITY_READ_TOKEN='$READ_TOKEN' $SRC/report.sh 2026-10-13"
