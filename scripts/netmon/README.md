# Netmon Collector (`scripts/netmon`)

Zero-dependency Python 3 collector and Cloudflare setup scripts for the `/net` router & home network telemetry dashboard on `kirtanjain.com`.

## How It Works (ThinkPad EOS)

`netmon-collector.py` runs as a user-level systemd service on Linux using Python 3 stdlib only (no virtualenv or pip packages required). Every `NETMON_POLL_SECONDS` (default `30s`) it:

1. **Authenticates to the Syrotech `SY-GPON-2010-WADONT` router** (`192.168.1.1`) via Realtek/Boa cookie auth (`/admin/login.asp` CSRF token -> `POST /boaform/admin/formLogin`), automatically re-authenticating if the session expires.
2. **Scrapes router telemetry**:
   - `/status_device_basic_info.asp`: model, firmware, uptime
   - `/status_user_net_connet_info.asp`: WAN IP, gateway, DNS servers
   - `/status_gpon.asp`: optical Tx/Rx power (dBm), temperature (°C), voltage (V), WAN byte/packet/drop counters
   - `/status_ethernet_info.asp`: LAN `Port_1` / `Port_2` counters and known client table (`clts`)
   - `/wlstatbl.asp` (both `wlan_idx=0` 5 GHz and `wlan_idx=1` 2.4 GHz via `/boaform/formWlanRedirect`): active Wi-Fi clients with SSID, RSSI, Tx rate, and Tx/Rx packet counts
3. **Detects wired LAN presence locally**:
   - Runs `ip neigh show` (`REACHABLE`/`DELAY`/`PROBE`) so wired LAN devices show up as `online: true`, `connection: "lan"`.
   - Runs `ip -br link` and `ip -br addr` so the collector host's own wired NIC (e.g. `enp1s0f0`) is marked online and mapped to its MAC address.
4. **Computes WAN throughput** (`wan_rx_rate_bps`, `wan_tx_rate_bps` in bits/sec) from counter deltas between polls, safely resetting to `0` on router reboot or counter reset.
5. **Captures active flows** (`NETMON_CAPTURE_FLOWS=1`):
   - Reads `/proc/net/nf_conntrack` when running on a Linux router/gateway (`source: "conntrack"`), or falls back to `ss -tunp` on a host (`source: "ss"`).
   - Filters loopback/link-local/multicast/self-scrape noise and enriches remote IPs via a bounded, short-timeout LRU reverse-DNS cache.
6. **POSTs chunked JSON batches** to `POST /net/api/ingest` within API limits (`<= 80` devices, `<= 120` DNS, `<= 90` flows, `<= 60` syslog per request).

---

## Quick Start

1. **Provision Cloudflare D1, Pages secrets, and `~/.config/netmon/env`**:
   ```bash
   ./scripts/netmon/setup-cloudflare.sh
   ```
2. **Verify live scraping without posting**:
   ```bash
   ./scripts/netmon/netmon-collector.py --env-file ~/.config/netmon/env --once --dry-run
   ```
3. **Install and start the background systemd service**:
   ```bash
   ./scripts/netmon/install-systemd.sh
   journalctl --user -u netmon-collector.service -f
   ```

---

## Configuration

All settings are configured via environment variables (stored in `~/.config/netmon/env`, mode `600`):

| Variable | Default | Description |
| --- | --- | --- |
| `NETMON_INGEST_URL` | `https://kirtanjain.com/net/api/ingest` | Ingest API endpoint |
| `NETMON_INGEST_TOKEN` | *(required)* | Bearer token matching Pages secret `NETMON_INGEST_TOKEN` |
| `NETMON_COLLECTOR_ID` | `$(hostname)` | Unique collector identifier |
| `NETMON_COLLECTOR_LABEL` | `ThinkPad EOS (Linux)` | Display label in dashboard |
| `ROUTER_URL` | `http://192.168.1.1` | Router web UI base URL |
| `ROUTER_USER` | `admin` | Router admin username |
| `ROUTER_PASS` | `admin` | Router admin password |
| `NETMON_POLL_SECONDS` | `30` | Scrape & push interval in seconds (min `5`) |
| `NETMON_CAPTURE_FLOWS` | `1` | Set to `0` to disable `conntrack`/`ss` flow capture |
| `NETMON_DNS_LISTEN` | *(disabled)* | Optional UDP bind for built-in DNS forwarder (e.g. `0.0.0.0:5353`) |
| `NETMON_DNS_UPSTREAM` | `1.1.1.1:53` | Upstream DNS server(s), comma-separated (auto-falls back to `8.8.8.8:53`) |
| `NETMON_DNS_LOG_FILE` | *(disabled)* | Optional path to tail dnsmasq or AdGuard Home `querylog.json` |
| `NETMON_SYSLOG_LISTEN` | *(disabled)* | Optional UDP bind for router syslog receiver (e.g. `0.0.0.0:1514`) |

CLI flags: `--env-file PATH`, `--once`, `--dry-run`, `--router-url URL`, `--ingest-url URL`, `--poll-seconds N`, `-v/--verbose`.

---

## Optional DNS & Syslog Telemetry

### Option A: Built-in Zero-Dependency UDP DNS Forwarder

Uncomment in `~/.config/netmon/env`:
```ini
NETMON_DNS_LISTEN=0.0.0.0:5353
NETMON_DNS_UPSTREAM=1.1.1.1:53,8.8.8.8:53
```
To listen directly on port `53` without running as root, grant `CAP_NET_BIND_SERVICE` to your Python binary (or forward UDP 53 -> 5353 with `nftables`/`iptables`) and point your router's DHCP Primary DNS at this machine's LAN IP. Every query's `client_ip`, `domain`, `qtype`, `rcode`, and `A`/`AAAA` answers are parsed directly from DNS wire bytes and flushed on each poll.

### Option B: Tail AdGuard Home or dnsmasq Query Logs

If you already run AdGuard Home or `dnsmasq` (`log-queries`), set:
```ini
# AdGuard Home JSONL query log
NETMON_DNS_LOG_FILE=/opt/AdGuardHome/data/querylog.json
# or dnsmasq log
# NETMON_DNS_LOG_FILE=/var/log/dnsmasq.log
```
The tailer seeks to EOF on startup and handles log rotation automatically.

### Option C: Router Syslog Receiver

Uncomment in `~/.config/netmon/env`:
```ini
NETMON_SYSLOG_LISTEN=0.0.0.0:1514
```
Then configure remote syslog in the router UI (or OpenWrt `system.@system[0].log_ip` / `log_port`) to send UDP syslog to `<host-lan-ip>:1514`.

---

## Moving to an ESP32 or OpenWrt Collector

Any device that can send HTTPS POST requests can act as a collector (or run alongside the Linux collector using a distinct `collector.id`).

### Endpoint & Auth

- **URL**: `POST https://kirtanjain.com/net/api/ingest`
- **Headers**:
  - `Authorization: Bearer <NETMON_INGEST_TOKEN>`
  - `Content-Type: application/json`

### JSON Payload Contract

```json
{
  "collector": {
    "id": "openwrt-main",
    "label": "OpenWrt Gateway",
    "kind": "openwrt",
    "meta": {
      "router_model": "SY-GPON-2010-WADONT",
      "firmware": "V2.1.08-230110",
      "dns_proxy": true
    }
  },
  "full_device_snapshot": true,
  "router": {
    "at": "2026-11-26T18:30:00Z",
    "wan_ip": "100.74.71.116",
    "wan_rx_bytes": 100261535215,
    "wan_tx_bytes": 7563693641,
    "wan_rx_rate_bps": 1250000,
    "wan_tx_rate_bps": 240000,
    "wan_rx_packets": 80389320,
    "wan_tx_packets": 19635176,
    "wan_dropped": 0,
    "gpon_rx_dbm": -18.18,
    "gpon_tx_dbm": 1.98,
    "gpon_temp_c": 39.57,
    "gpon_voltage_v": 3.26,
    "lan1_rx_bytes": 0,
    "lan1_tx_bytes": 0,
    "lan2_rx_bytes": 14520024,
    "lan2_tx_bytes": 33132285,
    "active_devices": 6,
    "uptime_str": "4 days, 21:40"
  },
  "devices": [
    {
      "mac": "32:27:e7:83:5a:60",
      "hostname": "Abhishek-s-A56",
      "ip": "192.168.1.33",
      "connection": "wifi_5g",
      "ssid": "Parvgupta_5G",
      "rssi": -63,
      "tx_rate_mbps": 468,
      "tx_packets": 151381,
      "rx_packets": 12770,
      "online": true
    }
  ],
  "dns": [
    {
      "at": "2026-11-26T18:30:01Z",
      "client_ip": "192.168.1.41",
      "domain": "youtube.com",
      "qtype": "A",
      "rcode": "NOERROR",
      "answer": "142.250.193.206",
      "source": "dns-proxy"
    }
  ],
  "flows": [
    {
      "at": "2026-11-26T18:30:01Z",
      "client_ip": "192.168.1.44",
      "client_mac": "18:3d:2d:3e:55:ce",
      "dst_ip": "142.250.193.206",
      "dst_port": 443,
      "proto": "TCP",
      "sni_or_host": "maa05s27-in-f14.1e100.net",
      "bytes_tx": 0,
      "bytes_rx": 0,
      "packets": 0,
      "source": "ss"
    }
  ],
  "syslog": [
    {
      "at": "2026-11-26T18:30:01Z",
      "severity": "notice",
      "facility": "router",
      "message": "Link up on Port_2"
    }
  ]
}
```

### Limits & Field Rules

- **Per-POST caps**: `devices <= 80`, `dns <= 120`, `flows <= 90`, `syslog <= 60`. For larger batches, send follow-up POSTs with `full_device_snapshot: false` and omit `router`/`devices`.
- **`devices[].connection` enum**: `"wifi_5g"` | `"wifi_2g"` | `"lan"` | `"unknown"`.
- **`full_device_snapshot`**: when `true`, the server treats `devices` as the complete presence snapshot (marking previously seen devices missing from the snapshot offline).
- **Timestamps (`at`)**: ISO-8601 UTC (`YYYY-MM-DDTHH:MM:SSZ`).

### Collector Migration Notes

- **OpenWrt**: Set `collector.kind` to `"openwrt"`. If Python 3 is installed (`python3-light`), `netmon-collector.py` can run directly and will automatically prefer `/proc/net/nf_conntrack` for full LAN-wide byte/packet flow visibility alongside `NETMON_DNS_LOG_FILE` for `dnsmasq`. On low-flash routers, a small Lua/ash script + `curl` reading `/proc/net/dev`, `iwinfo`, `/tmp/dhcp.leases`, and `/proc/net/nf_conntrack` can POST the exact JSON above every 30s.
- **ESP32**: Set `collector.kind` to `"esp32"`. Use `WiFiClientSecure` + `HTTPClient` (Arduino/ESP-IDF) to scrape the Syrotech router pages over LAN HTTP every 30–60s and POST `collector`, `full_device_snapshot: true`, `router`, and `devices` (omitting `dns`/`flows`/`syslog` or sending empty arrays). Keep JSON payloads compact (`< 8 KB`) and reuse TLS sessions where possible.
