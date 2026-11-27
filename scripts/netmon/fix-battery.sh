#!/usr/bin/env bash
set -euo pipefail

# fix-battery.sh — Fixes the netmon battery drain cleanly:
#   1. Permanently disables & stops netmon-ntopng (CPU spinloop culprit)
#   2. Installs /usr/local/bin/netmon-power-mode + udev rule so hotspot & Zeek
#      auto-pause whenever running on battery and auto-resume on AC + Ethernet
#   3. Applies the right mode immediately based on current AC/battery state

[[ $EUID -eq 0 ]] || { echo "Run with sudo: sudo $0" >&2; exit 1; }

LAN_IFACE="${NETMON_LAN_IFACE:-enp1s0f0}"

echo "=== 1/3 Disabling & stopping netmon-ntopng (spinloop fix) ==="
systemctl disable --now netmon-ntopng.service 2>/dev/null || true
podman rm -f netmon-ntopng 2>/dev/null || true

echo "=== 2/3 Installing AC/battery auto-pause hook & udev rule ==="
cat > /usr/local/bin/netmon-power-mode <<EOF
#!/usr/bin/env bash
set -euo pipefail

# Check if any AC mains adapter is online
AC_ONLINE=0
for f in /sys/class/power_supply/*/online; do
  [[ -f "\$f" ]] || continue
  type_file="\$(dirname "\$f")/type"
  if [[ -f "\$type_file" ]] && grep -qi 'Mains' "\$type_file"; then
    if [[ "\$(cat "\$f" 2>/dev/null)" == "1" ]]; then
      AC_ONLINE=1
      break
    fi
  fi
done

if [[ "\$AC_ONLINE" == "1" ]]; then
  # Only run hotspot + Zeek on AC when wired Ethernet is up so we don't kill laptop Wi-Fi
  if [[ "\$(cat /sys/class/net/${LAN_IFACE}/carrier 2>/dev/null || echo 0)" == "1" ]]; then
    systemctl start netmon-hotspot.service netmon-zeek.service 2>/dev/null || true
  fi
else
  # On battery: stop heavy radio/pcap services and restore wlan0 to NetworkManager
  systemctl stop netmon-ntopng.service netmon-hotspot.service netmon-zeek.service 2>/dev/null || true
fi
EOF
chmod +x /usr/local/bin/netmon-power-mode

cat > /etc/udev/rules.d/99-netmon-power.rules <<'EOF'
SUBSYSTEM=="power_supply", ATTR{type}=="Mains", ACTION=="change", RUN+="/usr/bin/systemd-run --no-block --unit=netmon-power-mode /usr/local/bin/netmon-power-mode"
EOF

# Disable hotspot/zeek auto-start unconditionally on boot; let power-mode decide at boot
systemctl disable netmon-hotspot.service netmon-zeek.service 2>/dev/null || true

cat > /etc/systemd/system/netmon-power-mode.service <<'EOF'
[Unit]
Description=Apply Netmon AC/Battery power policy on boot
After=network-online.target NetworkManager.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/netmon-power-mode

[Install]
WantedBy=multi-user.target
EOF

udevadm control --reload-rules
systemctl daemon-reload
systemctl enable netmon-power-mode.service

echo "=== 3/3 Applying current power policy now ==="
/usr/local/bin/netmon-power-mode

echo "=== Done! Current service states ==="
for s in netmon-hotspot netmon-adguardhome netmon-zeek netmon-ntopng; do
  printf "  %-22s %s\n" "$s" "$(systemctl is-active "$s" 2>/dev/null || true)"
done
