#!/usr/bin/env bash
set -euo pipefail

# Install and start the user-level systemd service for netmon-collector.py.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTOR_PATH="$SCRIPT_DIR/netmon-collector.py"
ENV_FILE="$HOME/.config/netmon/env"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_NAME="netmon-collector.service"
UNIT_PATH="$UNIT_DIR/$UNIT_NAME"

info() { printf '\033[1;34m[netmon]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[err]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$COLLECTOR_PATH" ]] || err "Collector not found at $COLLECTOR_PATH"
chmod +x "$COLLECTOR_PATH"

if [[ ! -f "$ENV_FILE" ]]; then
  err "Missing $ENV_FILE. Run ./scripts/netmon/setup-cloudflare.sh first (or create $ENV_FILE)."
fi
chmod 600 "$ENV_FILE"

mkdir -p "$UNIT_DIR"

info "Writing $UNIT_PATH..."
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Kirtan Netmon Router & Network Telemetry Collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=%h/.config/netmon/env
ExecStart=/usr/bin/env python3 ${COLLECTOR_PATH}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

info "Reloading user systemd daemon and starting $UNIT_NAME..."
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

ok "Installed and started $UNIT_NAME"
systemctl --user status --no-pager "$UNIT_NAME" || true

printf '\n'
info "Useful commands:"
printf '  Logs:     journalctl --user -u %s -f\n' "$UNIT_NAME"
printf '  Restart:  systemctl --user restart %s\n' "$UNIT_NAME"
printf '  Linger:   loginctl enable-linger "%s"  (optional: run even when logged out)\n' "$USER"
