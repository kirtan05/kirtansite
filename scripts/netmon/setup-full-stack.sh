#!/usr/bin/env bash
set -euo pipefail

# setup-full-stack.sh — Installs & configures the complete local monitoring +
# monitored Wi-Fi hotspot stack on EndeavourOS / Arch Linux:
#   - AdGuard Home (DoH upstream + querylog.json -> kirtanjain.com/net)
#   - hostapd + dnsmasq (DHCP-only) monitored Wi-Fi hotspot on wlan0 -> enp1s0f0
#   - Zeek (podman container sniffing wlan0 + enp1s0f0, JSON conn/ssl/dns/http logs)
#   - ntopng (podman container DPI/L7 UI on port 3000)
#   - firewalld rules (DNS 53, DHCP 67, Syslog 1514/udp, AdGuard 3080, ntopng 3000)
#   - Wires ~/.config/netmon/env so netmon-collector.py streams all of it to kirtanjain.com/net

[[ $EUID -eq 0 ]] || { echo "Run as root (via sudo)" >&2; exit 1; }

TARGET_USER="${SUDO_USER:-kirtan}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
LAN_IFACE="${NETMON_LAN_IFACE:-enp1s0f0}"
AP_IFACE="${NETMON_AP_IFACE:-wlan0}"
AP_SSID="${NETMON_AP_SSID:-Kirtan-Monitored}"
AP_SUBNET="10.42.0"
AP_IP="${AP_SUBNET}.1"
LAN_IP="$(ip -4 -br addr show "$LAN_IFACE" | awk '{print $3}' | cut -d/ -f1 | head -n1)"
LAN_IP="${LAN_IP:-192.168.1.44}"

AP_PASS="${NETMON_AP_PASS:-$(python3 -c 'import secrets; print("km-" + secrets.token_urlsafe(10))')}"
AGH_PASS="${NETMON_AGH_PASS:-$(python3 -c 'import secrets; print("agh-" + secrets.token_urlsafe(10))')}"

echo "=== 1/7 Installing Arch packages ==="
pacman -S --needed --noconfirm adguardhome hostapd dnsmasq wireshark-cli tcpdump conntrack-tools podman python-bcrypt || \
pacman -S --needed --noconfirm adguardhome hostapd dnsmasq wireshark-cli tcpdump conntrack-tools podman

echo "=== 2/7 Configuring AdGuard Home (DoH + querylog) ==="
mkdir -p /var/lib/adguardhome/data /etc/netmon /var/log/zeek /var/lib/misc

# Generate bcrypt hash for AdGuard Home web UI password
AGH_HASH="$(python3 -c '
import sys
pw = sys.argv[1].encode()
try:
    import bcrypt
    print(bcrypt.hashpw(pw, bcrypt.gensalt(rounds=10)).decode())
except ImportError:
    import subprocess
    out = subprocess.check_output(["htpasswd", "-nbB", "admin", sys.argv[1]], text=True).strip()
    print(out.split(":", 1)[1])
' "$AGH_PASS" 2>/dev/null || true)"

cat > /etc/netmon/adguardhome.yaml <<EOF
http:
  pprof:
    port: 6060
    enabled: false
  address: 0.0.0.0:3080
  session_ttl: 720h
users:
$(if [[ -n "$AGH_HASH" ]]; then printf '  - name: admin\n    password: %s\n' "$AGH_HASH"; else printf '  []\n'; fi)
auth_attempts: 5
block_auth_min: 15
http_proxy: ""
language: en
theme: auto
dns:
  bind_hosts:
    - ${LAN_IP}
    - ${AP_IP}
    - 127.0.0.1
  port: 53
  anonymize_client_ip: false
  ratelimit: 0
  ratelimit_subnet_len_ipv4: 24
  ratelimit_subnet_len_ipv6: 56
  refuse_any: true
  upstream_dns:
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - tls://1.1.1.1
  upstream_dns_file: ""
  bootstrap_dns:
    - 1.1.1.1
    - 8.8.8.8
  fallback_dns:
    - 1.1.1.1
    - 8.8.8.8
  upstream_mode: parallel
  fastest_timeout: 1s
  all_servers: false
  allowed_clients: []
  disallowed_clients: []
  blocked_hosts:
    - version.bind
    - id.server
    - hostname.bind
  trusted_proxies:
    - 127.0.0.0/8
    - ::1/128
  cache_size: 4194304
  cache_ttl_min: 0
  cache_ttl_max: 0
  cache_optimistic: true
  bogus_nxdomain: []
  aaaa_disabled: false
  enable_dnssec: true
  edns_client_subnet:
    custom_ip: ""
    enabled: false
    use_custom: false
  max_goroutines: 300
  handle_ddr: true
  ipset: []
  ipset_file: ""
  bootstrap_prefer_ipv6: false
  upstream_timeout: 10s
  private_networks: []
  use_private_ptr_resolvers: true
  local_ptr_upstreams:
    - 192.168.1.1
  use_dns64: false
  dns64_prefixes: []
  serve_http3: false
  use_http3_upstreams: false
  serve_plain_dns: true
  hostsfile_enabled: true
tls:
  enabled: false
querylog:
  dir_path: ""
  ignored: []
  interval: 168h
  size_memory: 2000
  enabled: true
  file_enabled: true
statistics:
  dir_path: ""
  ignored: []
  interval: 168h
  enabled: true
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
    id: 1
whitelist_filters: []
user_rules: []
dhcp:
  enabled: false
filtering:
  blocking_ipv4: ""
  blocking_ipv6: ""
  blocked_services:
    schedule:
      time_zone: Asia/Kolkata
    ids: []
  protection_disabled_until: null
  safe_search:
    enabled: false
  blocking_mode: default
  parental_block_host: family-block.dns.adguard.com
  safebrowsing_block_host: standard-block.dns.adguard.com
  rewrites: []
  safe_fs_patterns:
    - /var/lib/adguardhome/userfilters/*
  safebrowsing_cache_size: 1048576
  safesearch_cache_size: 1048576
  parental_cache_size: 1048576
  cache_time: 30
  filters_update_interval: 24
  blocked_response_ttl: 10
  filtering_enabled: true
  parental_enabled: false
  safebrowsing_enabled: true
  protection_enabled: true
clients:
  runtime_sources:
    whois: true
    arp: true
    rdns: true
    dhcp: true
    hosts: true
  persistent: []
log:
  enabled: true
  file: ""
  max_backups: 0
  max_size: 100
  max_age: 3
  compress: false
  local_time: true
  verbose: false
os:
  group: ""
  user: ""
  rlimit_nofile: 0
schema_version: 29
EOF

# Dedicated AdGuard Home unit that binds after hotspot IP is up & keeps querylog readable
AGH_BIN="$(command -v AdGuardHome || command -v adguardhome || echo /usr/bin/adguardhome)"
cat > /etc/systemd/system/netmon-adguardhome.service <<EOF
[Unit]
Description=AdGuard Home (DoH DNS + Query Logger for Netmon)
After=network-online.target netmon-hotspot.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=${AGH_BIN} -c /etc/netmon/adguardhome.yaml -w /var/lib/adguardhome --no-check-update
UMask=0022
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Ensure stock adguardhome.service isn't fighting for port 53/3080
systemctl disable --now adguardhome.service 2>/dev/null || true

echo "=== 3/7 Configuring Monitored Wi-Fi Hotspot (${AP_SSID} on ${AP_IFACE} -> ${LAN_IFACE}) ==="
cat > /etc/netmon/hostapd.conf <<EOF
interface=${AP_IFACE}
driver=nl80211
ssid=${AP_SSID}
hw_mode=g
channel=6
country_code=IN
ieee80211n=1
wmm_enabled=1
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${AP_PASS}
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF
chmod 600 /etc/netmon/hostapd.conf

cat > /etc/netmon/dnsmasq-hotspot.conf <<EOF
# DHCP-only for monitored hotspot (port=0 so AdGuard Home owns port 53)
port=0
interface=${AP_IFACE}
bind-interfaces
dhcp-range=${AP_SUBNET}.10,${AP_SUBNET}.200,255.255.255.0,12h
dhcp-option=option:router,${AP_IP}
dhcp-option=option:dns-server,${AP_IP}
dhcp-leasefile=/var/lib/misc/netmon-hotspot.leases
dhcp-authoritative
EOF

cat > /usr/local/bin/netmon-hotspot-up.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
nmcli dev disconnect "${AP_IFACE}" 2>/dev/null || true
nmcli dev set "${AP_IFACE}" managed no 2>/dev/null || true
sleep 1
ip link set "${AP_IFACE}" down 2>/dev/null || true
ip addr flush dev "${AP_IFACE}" 2>/dev/null || true
ip link set "${AP_IFACE}" up
ip addr add "${AP_IP}/24" dev "${AP_IFACE}"

sysctl -w net.ipv4.ip_forward=1 >/dev/null

# Clean nftables table dedicated to netmon hotspot NAT + transparent DNS capture
nft delete table ip netmon_hotspot 2>/dev/null || true
nft -f - <<NFT
table ip netmon_hotspot {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    iifname "${AP_IFACE}" udp dport 53 dnat to ${AP_IP}:53
    iifname "${AP_IFACE}" tcp dport 53 dnat to ${AP_IP}:53
  }
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oifname "${LAN_IFACE}" ip saddr ${AP_SUBNET}.0/24 masquerade
  }
  chain forward {
    type filter hook forward priority filter; policy accept;
    iifname "${AP_IFACE}" oifname "${LAN_IFACE}" accept
    iifname "${LAN_IFACE}" oifname "${AP_IFACE}" ct state established,related accept
  }
}
NFT

touch /var/lib/misc/netmon-hotspot.leases
chmod 644 /var/lib/misc/netmon-hotspot.leases

# Start dnsmasq (DHCP-only) and hostapd in foreground (or daemonized under systemd)
/usr/bin/dnsmasq --conf-file=/etc/netmon/dnsmasq-hotspot.conf --pid-file=/run/netmon-dnsmasq.pid
exec /usr/bin/hostapd /etc/netmon/hostapd.conf
EOF
chmod +x /usr/local/bin/netmon-hotspot-up.sh

cat > /usr/local/bin/netmon-hotspot-down.sh <<EOF
#!/usr/bin/env bash
set +e
if [[ -f /run/netmon-dnsmasq.pid ]]; then
  kill "\$(cat /run/netmon-dnsmasq.pid)" 2>/dev/null || true
  rm -f /run/netmon-dnsmasq.pid
fi
nft delete table ip netmon_hotspot 2>/dev/null || true
ip addr flush dev "${AP_IFACE}" 2>/dev/null || true
nmcli dev set "${AP_IFACE}" managed yes 2>/dev/null || true
EOF
chmod +x /usr/local/bin/netmon-hotspot-down.sh

cat > /etc/systemd/system/netmon-hotspot.service <<EOF
[Unit]
Description=Monitored Wi-Fi Hotspot (${AP_SSID} on ${AP_IFACE})
After=network-online.target NetworkManager.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/netmon-hotspot-up.sh
ExecStopPost=/usr/local/bin/netmon-hotspot-down.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "=== 4/7 Opening firewalld ports ==="
if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=53/udp --add-port=53/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=67/udp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=1514/udp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=3000/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-port=3080/tcp >/dev/null 2>&1 || true
  firewall-cmd --permanent --add-masquerade >/dev/null 2>&1 || true
  firewall-cmd --permanent --zone=trusted --add-interface="${AP_IFACE}" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1 || true
fi

echo "=== 5/7 Pulling & configuring Zeek + ntopng (podman) ==="
cat > /etc/netmon/zeek-local.zeek <<'EOF'
@load base/protocols/conn
@load base/protocols/dns
@load base/protocols/http
@load base/protocols/ssl
@load policy/tuning/json-logs.zeek
redef LogAscii::use_json = T;
redef Log::default_rotation_interval = 1 hr;
EOF
chmod 755 /var/log/zeek

podman pull docker.io/zeek/zeek:lts
podman pull docker.io/ntop/ntopng:latest

cat > /etc/systemd/system/netmon-zeek.service <<EOF
[Unit]
Description=Zeek Network Security Monitor (JSON conn/ssl/dns/http logs on ${LAN_IFACE} + ${AP_IFACE})
After=network-online.target netmon-hotspot.service
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=-/usr/bin/podman rm -f netmon-zeek
ExecStartPre=/usr/bin/mkdir -p /var/log/zeek/lan /var/log/zeek/hotspot
ExecStart=/usr/bin/podman run --rm --name netmon-zeek \
  --network=host \
  --cap-add=NET_RAW --cap-add=NET_ADMIN \
  -v /var/log/zeek:/logs \
  -v /etc/netmon/zeek-local.zeek:/etc/zeek-local.zeek:ro \
  docker.io/zeek/zeek:lts \
  sh -c 'umask 022; (cd /logs/lan && zeek -C -i ${LAN_IFACE} /etc/zeek-local.zeek) & (cd /logs/hotspot && zeek -C -i ${AP_IFACE} /etc/zeek-local.zeek) & wait'
ExecStop=/usr/bin/podman stop -t 5 netmon-zeek
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /var/lib/ntopng
cat > /etc/systemd/system/netmon-ntopng.service <<EOF
[Unit]
Description=ntopng Deep Packet & Flow Inspector (UI on :3000)
After=network-online.target netmon-hotspot.service
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=-/usr/bin/podman rm -f netmon-ntopng
ExecStart=/usr/bin/podman run --rm --name netmon-ntopng \
  --network=host \
  --cap-add=NET_RAW --cap-add=NET_ADMIN \
  -v /var/lib/ntopng:/var/lib/ntopng \
  docker.io/ntop/ntopng:latest \
  --community -i ${AP_IFACE} -i ${LAN_IFACE} -w 3000 -m "192.168.1.0/24,${AP_SUBNET}.0/24"
ExecStop=/usr/bin/podman stop -t 5 netmon-ntopng
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "=== 6/7 Starting services ==="
systemctl daemon-reload
systemctl enable --now netmon-hotspot.service
sleep 2
systemctl enable --now netmon-adguardhome.service
systemctl enable --now netmon-zeek.service
systemctl enable --now netmon-ntopng.service

echo "=== 7/7 Wiring collector env (${TARGET_HOME}/.config/netmon/env) ==="
ENV_FILE="${TARGET_HOME}/.config/netmon/env"
if [[ -f "$ENV_FILE" ]]; then
  python3 - "$ENV_FILE" "$AP_IFACE" "$AP_SSID" "$AGH_PASS" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
ap_iface, ap_ssid, agh_pass = sys.argv[2], sys.argv[3], sys.argv[4]
lines = p.read_text().splitlines()
updates = {
    "NETMON_ADGUARD_URL": "http://127.0.0.1:3080",
    "NETMON_ADGUARD_USER": "admin",
    "NETMON_ADGUARD_PASS": agh_pass,
    "NETMON_ZEEK_LOG_DIR": "/var/log/zeek/lan,/var/log/zeek/hotspot",
    "NETMON_HOTSPOT_LEASES": "/var/lib/misc/netmon-hotspot.leases",
    "NETMON_HOTSPOT_IFACE": ap_iface,
    "NETMON_HOTSPOT_SSID": ap_ssid,
    "NETMON_SYSLOG_LISTEN": "0.0.0.0:1514",
}
out = []
seen = set()
for line in lines:
    stripped = line.lstrip("# ").strip()
    matched = None
    for k in updates:
        if stripped.startswith(k + "="):
            matched = k
            break
    if matched:
        if matched not in seen:
            out.append(f"{matched}={updates[matched]}")
            seen.add(matched)
    else:
        out.append(line)
for k, v in updates.items():
    if k not in seen:
        out.append(f"{k}={v}")
p.write_text("\n".join(out) + "\n")
PY
  chown "${TARGET_USER}:${TARGET_USER}" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

# Save generated credentials for root/owner reference
cat > /etc/netmon/credentials.txt <<EOF
HOTSPOT_SSID=${AP_SSID}
HOTSPOT_PASSWORD=${AP_PASS}
HOTSPOT_SUBNET=${AP_SUBNET}.0/24
ADGUARD_UI=http://${LAN_IP}:3080
ADGUARD_USER=admin
ADGUARD_PASSWORD=${AGH_PASS}
NTOPNG_UI=http://${LAN_IP}:3000
NTOPNG_DEFAULT_LOGIN=admin / admin
SYSLOG_UDP=${LAN_IP}:1514
EOF
chmod 600 /etc/netmon/credentials.txt

cat <<EOF

=== FULL STACK READY ===
HOTSPOT_SSID=${AP_SSID}
HOTSPOT_PASSWORD=${AP_PASS}
ADGUARD_UI=http://${LAN_IP}:3080  (admin / ${AGH_PASS})
NTOPNG_UI=http://${LAN_IP}:3000   (default: admin / admin)
ZEEK_LOGS=/var/log/zeek (JSON: conn.log, ssl.log, dns.log, http.log)
SYSLOG_UDP=${LAN_IP}:1514
EOF
