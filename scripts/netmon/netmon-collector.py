#!/usr/bin/env python3
"""
netmon-collector.py — Zero-dependency Linux router & network telemetry collector.

Scrapes Syrotech SY-GPON-2010-WADONT (Realtek/Boa) routers, enriches LAN presence
via `ip neigh` / `ip -br`, captures active flows (`nf_conntrack` or `ss -tunp`),
optionally runs a threaded UDP DNS forwarder, tails dnsmasq/AdGuard query logs,
and listens for UDP syslog — pushing batched telemetry to POST /net/api/ingest.

Python 3 stdlib only.
"""

from __future__ import annotations

import argparse
import base64
import collections
import concurrent.futures
import datetime
import html
import http.cookiejar
import ipaddress
import json
import os
import re
import signal
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Deque, Dict, List, Optional, Tuple

# API payload limits per POST
MAX_DEVICES_PER_POST = 80
MAX_DNS_PER_POST = 120
MAX_FLOWS_PER_POST = 90
MAX_SYSLOG_PER_POST = 60
MAX_CHUNKS_PER_POLL = 5

DNS_QTYPES = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    12: "PTR",
    15: "MX",
    16: "TXT",
    28: "AAAA",
    33: "SRV",
    64: "SVCB",
    65: "HTTPS",
    255: "ANY",
}

DNS_RCODES = {
    0: "NOERROR",
    1: "FORMERR",
    2: "SERVFAIL",
    3: "NXDOMAIN",
    4: "NOTIMP",
    5: "REFUSED",
}

SYSLOG_SEVERITIES = {
    0: "emerg",
    1: "alert",
    2: "crit",
    3: "err",
    4: "warning",
    5: "notice",
    6: "info",
    7: "debug",
}

SYSLOG_FACILITIES = {
    0: "kern",
    1: "user",
    2: "mail",
    3: "daemon",
    4: "auth",
    5: "syslog",
    6: "lpr",
    7: "news",
    8: "uucp",
    9: "cron",
    10: "authpriv",
    11: "ftp",
    16: "local0",
    17: "local1",
    18: "local2",
    19: "local3",
    20: "local4",
    21: "local5",
    22: "local6",
    23: "local7",
}

MAC_RE = re.compile(r"^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$")
VIRTUAL_IFACE_PREFIXES = (
    "lo",
    "docker",
    "br-",
    "veth",
    "virbr",
    "tailscale",
    "wg",
    "tun",
    "tap",
    "zt",
    "cni",
    "flannel",
    "podman",
)


def utc_now_iso() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def log(msg: str, level: str = "INFO") -> None:
    stream = sys.stderr if level in ("WARN", "ERROR") else sys.stdout
    print(f"[{utc_now_iso()}] [{level}] {msg}", file=stream, flush=True)


def normalize_mac(mac: Optional[str]) -> Optional[str]:
    if not mac:
        return None
    cleaned = mac.strip().lower().replace("-", ":")
    if MAC_RE.match(cleaned) and cleaned != "00:00:00:00:00:00":
        return cleaned
    return None


def parse_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    s = str(val).strip().replace(",", "")
    m = re.search(r"[-+]?\d+", s)
    if not m:
        return None
    try:
        return int(m.group(0))
    except ValueError:
        return None


def parse_float(val: Any, ndigits: int = 2) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        return round(float(val), ndigits)
    s = str(val).strip().replace(",", "")
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        return round(float(m.group(0)), ndigits)
    except ValueError:
        return None


def clean_html_text(fragment: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", fragment)
    unescaped = html.unescape(no_tags)
    return " ".join(unescaped.split()).strip()


def load_env_file(path: str) -> None:
    if not path:
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
                val = val[1:-1]
            if key:
                os.environ.setdefault(key, val)


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


def parse_host_port(spec: str, default_port: int) -> Tuple[str, int]:
    spec = spec.strip()
    if spec.startswith("["):
        end = spec.find("]")
        if end != -1:
            host = spec[1:end]
            rest = spec[end + 1 :]
            if rest.startswith(":"):
                return host, int(rest[1:])
            return host, default_port
    if ":" in spec:
        host, port_s = spec.rsplit(":", 1)
        return (host or "0.0.0.0"), int(port_s)
    return spec, default_port


# ---------------------------------------------------------------------------
# Syrotech / Realtek Boa HTML & JS parsers
# ---------------------------------------------------------------------------


def parse_th_td_table(page_html: str) -> Dict[str, str]:
    """Extract all <th>key</th><td>value</td> pairs (lowercased keys)."""
    result: Dict[str, str] = {}
    for m in re.finditer(
        r"<th\b[^>]*>(.*?)</th>\s*<td\b[^>]*>(.*?)</td>",
        page_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        key = clean_html_text(m.group(1)).rstrip(":").strip().lower()
        val = clean_html_text(m.group(2))
        if key and key not in result:
            result[key] = val
    return result


def parse_boa_it_nr(page_html: str, array_name: str) -> List[Dict[str, str]]:
    """
    Parse Realtek/Boa JS array pushes such as:
      ethers.push(new it_nr("0", new it("ifname", "Port_1"), new it("rx_bytes", 0)));
    Handles nested parentheses and quoted strings safely.
    """
    entries: List[Dict[str, str]] = []
    pattern = re.compile(
        rf"\b{re.escape(array_name)}\.push\(\s*new\s+it_nr\s*\(",
        flags=re.IGNORECASE,
    )
    it_pattern = re.compile(
        r"""new\s+it\s*\(\s*(['"])(.*?)\1\s*,\s*(?:(['"])(.*?)\3|([^,\)\s]+))\s*\)""",
        flags=re.DOTALL,
    )

    n = len(page_html)
    for m in pattern.finditer(page_html):
        idx = m.end()
        depth = 1
        quote: Optional[str] = None
        escaped = False
        start = idx
        while idx < n and depth > 0:
            ch = page_html[idx]
            if quote is not None:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == quote:
                    quote = None
            else:
                if ch in ("'", '"'):
                    quote = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
            idx += 1
        if depth != 0:
            continue
        inner = page_html[start : idx - 1]
        row: Dict[str, str] = {}
        for im in it_pattern.finditer(inner):
            key = im.group(2).strip()
            val = im.group(4) if im.group(4) is not None else (im.group(5) or "")
            row[key] = html.unescape(val).strip()
        if row:
            entries.append(row)
    return entries


def parse_wlstatbl(page_html: str, band: str) -> List[Dict[str, Any]]:
    """
    Parse /wlstatbl.asp rows:
      <tr class="tbl_body"> with 9 <td> cells:
      [devname, ssid, mac, tx_packets, rx_packets, tx_rate_mbps, rssi_dbm, power_saving, expired_sec]
    """
    clients: List[Dict[str, Any]] = []
    for row_m in re.finditer(
        r"<tr\b[^>]*class\s*=\s*['\"]?tbl_body['\"]?[^>]*>(.*?)</tr>",
        page_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        cells = [
            clean_html_text(td_m.group(1))
            for td_m in re.finditer(
                r"<td\b[^>]*>(.*?)</td>",
                row_m.group(1),
                flags=re.IGNORECASE | re.DOTALL,
            )
        ]
        if len(cells) < 7:
            continue
        mac = normalize_mac(cells[2])
        if not mac:
            continue
        devname = cells[0].strip()
        if devname in ("-", "--", "N/A", "Unknown", "unknown"):
            devname = ""
        ssid = cells[1].strip()
        clients.append(
            {
                "mac": mac,
                "hostname": devname,
                "ssid": ssid,
                "connection": band,
                "tx_packets": parse_int(cells[3]),
                "rx_packets": parse_int(cells[4]),
                "tx_rate_mbps": parse_int(cells[5]),
                "rssi": parse_int(cells[6]),
                "online": True,
            }
        )
    return clients


class SyrotechRouterClient:
    """HTTP session scraper for Syrotech SY-GPON-2010-WADONT (Realtek/Boa)."""

    def __init__(self, base_url: str, username: str, password: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = timeout
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar)
        )
        self._authenticated = False

    def _raw_request(
        self,
        path: str,
        data: Optional[bytes] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> str:
        url = f"{self.base_url}{path}"
        req_headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) netmon-collector/1.0",
            "Accept": "text/html,application/xhtml+xml,*/*",
        }
        if headers:
            req_headers.update(headers)
        req = urllib.request.Request(url, data=data, headers=req_headers)
        with self.opener.open(req, timeout=self.timeout) as resp:
            raw = resp.read()
        return raw.decode("utf-8", errors="replace")

    @staticmethod
    def _is_login_page(body: str) -> bool:
        low = body.lower()
        return ("formlogin" in low) or ("login.asp" in low)

    @staticmethod
    def _extract_csrf_token(login_html: str) -> str:
        m = re.search(
            r"name\s*=\s*['\"]csrftoken['\"][^>]*value\s*=\s*['\"]([^'\"]*)['\"]",
            login_html,
            flags=re.IGNORECASE,
        )
        if m:
            return m.group(1)
        m = re.search(
            r"value\s*=\s*['\"]([^'\"]*)['\"][^>]*name\s*=\s*['\"]csrftoken['\"]",
            login_html,
            flags=re.IGNORECASE,
        )
        return m.group(1) if m else ""

    def login(self) -> None:
        self.cookie_jar.clear()
        login_html = self._raw_request("/admin/login.asp")
        csrf = self._extract_csrf_token(login_html)
        payload = urllib.parse.urlencode(
            {
                "username": self.username,
                "psd": self.password,
                "username1": self.username,
                "psd1": self.password,
                "sec_lang": "0",
                "loginSelinit": "",
                "ismobile": "",
                "csrftoken": csrf,
            }
        ).encode("utf-8")
        resp_html = self._raw_request(
            "/boaform/admin/formLogin",
            data=payload,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": f"{self.base_url}/admin/login.asp",
            },
        )
        if "formLogin" in resp_html and "name='psd'" in resp_html.replace('"', "'"):
            raise RuntimeError("Router login rejected (check ROUTER_USER / ROUTER_PASS)")
        self._authenticated = True

    def get_page(self, path: str, retry_auth: bool = True) -> str:
        if not self._authenticated:
            self.login()
        body = self._raw_request(path)
        if retry_auth and self._is_login_page(body):
            self.login()
            body = self._raw_request(path)
        return body

    def scrape_all(self) -> Dict[str, Any]:
        # 1. Basic device info
        basic_html = self.get_page("/status_device_basic_info.asp")
        basic_tbl = parse_th_td_table(basic_html)
        router_model = basic_tbl.get("device model", "")
        firmware = basic_tbl.get("firmware version", "")
        uptime_str = basic_tbl.get("uptime", "")

        # 2. WAN connection info
        wan_html = self.get_page("/status_user_net_connet_info.asp")
        links = parse_boa_it_nr(wan_html, "links")
        wan_ip = ""
        wan_dns: List[str] = []
        wan_gateway = ""
        best_link: Optional[Dict[str, str]] = None
        for link in links:
            ip_val = link.get("ipAddr", "").strip()
            if not ip_val or ip_val in ("0.0.0.0", "-", "N/A"):
                continue
            serv = (link.get("servName", "") + " " + link.get("applicationtype", "")).upper()
            if "INTERNET" in serv:
                best_link = link
                break
            if best_link is None:
                best_link = link
        if best_link:
            wan_ip = best_link.get("ipAddr", "").strip()
            for dk in ("dns1", "dns2"):
                dv = best_link.get(dk, "").strip()
                if dv and dv not in ("0.0.0.0", "-", "N/A"):
                    wan_dns.append(dv)
            gw = best_link.get("gateway", "").strip()
            if gw and gw not in ("0.0.0.0", "-", "N/A"):
                wan_gateway = gw

        # 3. GPON optical & WAN traffic counters
        gpon_html = self.get_page("/status_gpon.asp")
        gpon_tbl = parse_th_td_table(gpon_html)
        gpon_tx_dbm = parse_float(gpon_tbl.get("tx power"))
        gpon_rx_dbm = parse_float(gpon_tbl.get("rx power"))
        gpon_temp_c = parse_float(gpon_tbl.get("temperature"))
        gpon_voltage_v = parse_float(gpon_tbl.get("voltage"))
        wan_tx_bytes = parse_int(gpon_tbl.get("bytes sent")) or 0
        wan_rx_bytes = parse_int(gpon_tbl.get("bytes received")) or 0
        wan_tx_packets = parse_int(gpon_tbl.get("packets sent")) or 0
        wan_rx_packets = parse_int(gpon_tbl.get("packets received")) or 0
        wan_dropped = parse_int(gpon_tbl.get("packets dropped")) or 0

        # 4. Ethernet LAN ports + known clients (clts)
        eth_html = self.get_page("/status_ethernet_info.asp")
        ethers = parse_boa_it_nr(eth_html, "ethers")
        clts = parse_boa_it_nr(eth_html, "clts")

        lan1_rx_bytes = 0
        lan1_tx_bytes = 0
        lan2_rx_bytes = 0
        lan2_tx_bytes = 0
        for eth in ethers:
            ifname = eth.get("ifname", "").strip().lower()
            rx_b = parse_int(eth.get("rx_bytes")) or 0
            tx_b = parse_int(eth.get("tx_bytes")) or 0
            if ifname in ("port_1", "port1", "lan1", "lan_1"):
                lan1_rx_bytes = rx_b
                lan1_tx_bytes = tx_b
            elif ifname in ("port_2", "port2", "lan2", "lan_2"):
                lan2_rx_bytes = rx_b
                lan2_tx_bytes = tx_b

        # 5. Active Wi-Fi clients (5 GHz = wlan_idx=0, 2.4 GHz = wlan_idx=1)
        self.get_page("/boaform/formWlanRedirect?redirect-url=/wlbasic.asp&wlan_idx=0")
        wl_5g_html = self.get_page("/wlstatbl.asp")
        wifi_5g_clients = parse_wlstatbl(wl_5g_html, "wifi_5g")

        self.get_page("/boaform/formWlanRedirect?redirect-url=/wlbasic.asp&wlan_idx=1")
        wl_2g_html = self.get_page("/wlstatbl.asp")
        wifi_2g_clients = parse_wlstatbl(wl_2g_html, "wifi_2g")

        return {
            "meta": {
                "router_model": router_model,
                "firmware": firmware,
                "wan_gateway": wan_gateway,
                "wan_dns": wan_dns,
            },
            "router": {
                "wan_ip": wan_ip,
                "wan_rx_bytes": wan_rx_bytes,
                "wan_tx_bytes": wan_tx_bytes,
                "wan_rx_packets": wan_rx_packets,
                "wan_tx_packets": wan_tx_packets,
                "wan_dropped": wan_dropped,
                "gpon_rx_dbm": gpon_rx_dbm,
                "gpon_tx_dbm": gpon_tx_dbm,
                "gpon_temp_c": gpon_temp_c,
                "gpon_voltage_v": gpon_voltage_v,
                "lan1_rx_bytes": lan1_rx_bytes,
                "lan1_tx_bytes": lan1_tx_bytes,
                "lan2_rx_bytes": lan2_rx_bytes,
                "lan2_tx_bytes": lan2_tx_bytes,
                "uptime_str": uptime_str,
            },
            "clts": clts,
            "wifi_clients": wifi_5g_clients + wifi_2g_clients,
        }


# ---------------------------------------------------------------------------
# Local Linux network discovery (`ip neigh`, `ip -br link`, `ip -br addr`)
# ---------------------------------------------------------------------------


def _run_cmd(args: List[str], timeout: float = 3.0) -> str:
    try:
        proc = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.stdout or ""
    except (OSError, subprocess.SubprocessError):
        return ""


def _is_private_ipv4(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
        return (
            addr.version == 4
            and addr.is_private
            and not addr.is_loopback
            and not addr.is_link_local
            and not addr.is_multicast
        )
    except ValueError:
        return False


def discover_local_interfaces() -> List[Dict[str, Any]]:
    """Detect UP non-virtual interfaces with IPv4 and MAC via `ip -br link` & `ip -br addr`."""
    link_out = _run_cmd(["ip", "-br", "link"])
    addr_out = _run_cmd(["ip", "-br", "addr"])

    ifaces: Dict[str, Dict[str, Any]] = {}
    for line in link_out.splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        name = parts[0].split("@", 1)[0]
        if any(name.startswith(p) for p in VIRTUAL_IFACE_PREFIXES):
            continue
        state = parts[1].upper()
        mac = normalize_mac(parts[2])
        if mac:
            ifaces[name] = {
                "iface": name,
                "state": state,
                "mac": mac,
                "ip": "",
                "is_wifi": name.startswith("wl"),
            }

    for line in addr_out.splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        name = parts[0].split("@", 1)[0]
        if name not in ifaces:
            continue
        for token in parts[2:]:
            ip_part = token.split("/", 1)[0]
            if _is_private_ipv4(ip_part):
                ifaces[name]["ip"] = ip_part
                break

    return [
        info
        for info in ifaces.values()
        if info["state"] == "UP" and info["ip"] and info["mac"]
    ]


def discover_lan_neighbors() -> List[Dict[str, Any]]:
    """Run `ip neigh show` and return REACHABLE/DELAY/PROBE IPv4 LAN neighbors."""
    out = _run_cmd(["ip", "neigh", "show"])
    neighbors: List[Dict[str, Any]] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        ip_str = parts[0]
        if not _is_private_ipv4(ip_str):
            continue
        state = parts[-1].upper()
        mac: Optional[str] = None
        if "lladdr" in parts:
            idx = parts.index("lladdr")
            if idx + 1 < len(parts):
                mac = normalize_mac(parts[idx + 1])
        if not mac:
            continue
        neighbors.append(
            {
                "ip": ip_str,
                "mac": mac,
                "state": state,
                "active": state in ("REACHABLE", "DELAY", "PROBE", "PERMANENT"),
            }
        )
    return neighbors


def merge_devices(
    clts: List[Dict[str, str]],
    wifi_clients: List[Dict[str, Any]],
    neighbors: List[Dict[str, Any]],
    local_ifaces: List[Dict[str, Any]],
    router_ip: str,
    local_hostname: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Merge router clts, 5G/2.4G Wi-Fi clients, local ARP neighbors, and local UP interfaces.
    Returns (devices_list, ip_to_mac_map).
    """
    by_mac: Dict[str, Dict[str, Any]] = {}
    ip_to_mac: Dict[str, str] = {}

    # 1. Seed from router clts table
    for entry in clts:
        mac = normalize_mac(entry.get("macAddr"))
        if not mac:
            continue
        ip_val = entry.get("ipAddr", "").strip()
        if ip_val in ("0.0.0.0", "-", "N/A"):
            ip_val = ""
        devname = entry.get("devname", "").strip()
        if devname in ("-", "--", "N/A", "Unknown", "unknown"):
            devname = ""
        by_mac[mac] = {
            "mac": mac,
            "hostname": devname,
            "ip": ip_val,
            "connection": "unknown",
            "online": False,
        }
        if ip_val:
            ip_to_mac[ip_val] = mac

    # 2. Merge active Wi-Fi clients (both bands)
    for wc in wifi_clients:
        mac = wc["mac"]
        dev = by_mac.setdefault(
            mac,
            {
                "mac": mac,
                "hostname": "",
                "ip": "",
                "connection": wc["connection"],
                "online": True,
            },
        )
        dev["online"] = True
        dev["connection"] = wc["connection"]
        if wc.get("hostname") and not dev.get("hostname"):
            dev["hostname"] = wc["hostname"]
        elif wc.get("hostname"):
            dev["hostname"] = wc["hostname"]
        if wc.get("ssid"):
            dev["ssid"] = wc["ssid"]
        for k in ("rssi", "tx_rate_mbps", "tx_packets", "rx_packets"):
            if wc.get(k) is not None:
                dev[k] = wc[k]

    # 3. Merge ARP neighbors (for IP enrichment and wired online detection)
    for nb in neighbors:
        nb_ip = nb["ip"]
        nb_mac = nb["mac"]
        ip_to_mac.setdefault(nb_ip, nb_mac)
        if nb_ip == router_ip:
            continue
        if nb_mac in by_mac:
            dev = by_mac[nb_mac]
            if not dev.get("ip"):
                dev["ip"] = nb_ip
            if nb["active"]:
                dev["online"] = True
                if dev.get("connection") == "unknown":
                    dev["connection"] = "lan"
        elif nb["active"]:
            by_mac[nb_mac] = {
                "mac": nb_mac,
                "hostname": "",
                "ip": nb_ip,
                "connection": "lan",
                "online": True,
            }

    # 4. Merge local host UP interfaces (e.g., ThinkPad's enp1s0f0)
    for iface in local_ifaces:
        mac = iface["mac"]
        ip_val = iface["ip"]
        ip_to_mac[ip_val] = mac
        dev = by_mac.setdefault(
            mac,
            {
                "mac": mac,
                "hostname": local_hostname,
                "ip": ip_val,
                "connection": "unknown" if iface["is_wifi"] else "lan",
                "online": True,
            },
        )
        dev["online"] = True
        if ip_val:
            dev["ip"] = ip_val
        if not dev.get("hostname"):
            dev["hostname"] = local_hostname
        if not iface["is_wifi"] and dev.get("connection") not in ("wifi_5g", "wifi_2g"):
            dev["connection"] = "lan"

    # Sort: online first, then wifi_5g/wifi_2g/lan/unknown, then hostname/mac
    conn_rank = {"wifi_5g": 0, "wifi_2g": 1, "lan": 2, "unknown": 3}
    devices = sorted(
        by_mac.values(),
        key=lambda d: (
            0 if d.get("online") else 1,
            conn_rank.get(d.get("connection", "unknown"), 9),
            (d.get("hostname") or "").lower(),
            d["mac"],
        ),
    )

    # Clean optional empty fields while preserving contract shape
    cleaned: List[Dict[str, Any]] = []
    for d in devices[:MAX_DEVICES_PER_POST]:
        item: Dict[str, Any] = {
            "mac": d["mac"],
            "hostname": d.get("hostname") or "",
            "ip": d.get("ip") or "",
            "connection": d.get("connection") or "unknown",
            "online": bool(d.get("online")),
        }
        for opt_k in ("ssid", "rssi", "tx_rate_mbps", "tx_packets", "rx_packets"):
            if d.get(opt_k) is not None:
                item[opt_k] = d[opt_k]
        cleaned.append(item)

    return cleaned, ip_to_mac


# ---------------------------------------------------------------------------
# Bounded LRU Reverse-DNS Cache (non-blocking / short timeout)
# ---------------------------------------------------------------------------


class ReverseDNSCache:
    def __init__(
        self,
        max_size: int = 512,
        pos_ttl: float = 3600.0,
        neg_ttl: float = 600.0,
        lookup_timeout: float = 0.35,
    ) -> None:
        self.max_size = max_size
        self.pos_ttl = pos_ttl
        self.neg_ttl = neg_ttl
        self.lookup_timeout = lookup_timeout
        self._lock = threading.Lock()
        self._cache: "collections.OrderedDict[str, Tuple[Optional[str], float]]" = (
            collections.OrderedDict()
        )
        self._pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=6, thread_name_prefix="rdns"
        )

    def _get_cached(self, ip: str, now: float) -> Tuple[bool, Optional[str]]:
        with self._lock:
            entry = self._cache.get(ip)
            if entry is None:
                return False, None
            host, expires = entry
            if now > expires:
                del self._cache[ip]
                return False, None
            self._cache.move_to_end(ip)
            return True, host

    def _put_cached(self, ip: str, host: Optional[str], now: float) -> None:
        ttl = self.pos_ttl if host else self.neg_ttl
        with self._lock:
            self._cache[ip] = (host, now + ttl)
            self._cache.move_to_end(ip)
            while len(self._cache) > self.max_size:
                self._cache.popitem(last=False)

    @staticmethod
    def _resolve_one(ip: str) -> Optional[str]:
        try:
            host, _, _ = socket.gethostbyaddr(ip)
            return host.rstrip(".") if host else None
        except (OSError, socket.herror, socket.gaierror):
            return None

    def resolve_batch(
        self, ips: List[str], max_fresh: int = 16, total_budget: float = 1.5
    ) -> Dict[str, str]:
        now = time.monotonic()
        results: Dict[str, str] = {}
        missing: List[str] = []
        seen = set()

        for ip in ips:
            if ip in seen:
                continue
            seen.add(ip)
            hit, host = self._get_cached(ip, now)
            if hit:
                if host:
                    results[ip] = host
            elif len(missing) < max_fresh:
                missing.append(ip)

        if not missing:
            return results

        futures = {self._pool.submit(self._resolve_one, ip): ip for ip in missing}
        deadline = time.monotonic() + total_budget
        for fut, ip in list(futures.items()):
            remaining = max(0.01, min(self.lookup_timeout, deadline - time.monotonic()))
            try:
                host = fut.result(timeout=remaining)
            except concurrent.futures.TimeoutError:
                host = None
            except Exception:
                host = None
            self._put_cached(ip, host, time.monotonic())
            if host:
                results[ip] = host

        return results

    def close(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)


# ---------------------------------------------------------------------------
# Flow capture (`/proc/net/nf_conntrack` -> fallback `ss -tunp`)
# ---------------------------------------------------------------------------


def _normalize_addr(addr: str) -> str:
    addr = addr.strip()
    if addr.startswith("[") and addr.endswith("]"):
        addr = addr[1:-1]
    if "%" in addr:
        addr = addr.split("%", 1)[0]
    if addr.lower().startswith("::ffff:"):
        addr = addr[7:]
    return addr


def _split_ss_endpoint(ep: str) -> Tuple[str, int]:
    ep = ep.strip()
    if ep.startswith("["):
        end = ep.rfind("]")
        if end != -1 and end + 2 <= len(ep) and ep[end + 1] == ":":
            ip_s = _normalize_addr(ep[1:end])
            port = parse_int(ep[end + 2 :]) or 0
            return ip_s, port
    if ":" in ep:
        ip_part, port_part = ep.rsplit(":", 1)
        return _normalize_addr(ip_part), parse_int(port_part) or 0
    return _normalize_addr(ep), 0


def _is_interesting_remote_ip(
    ip_str: str, local_ips: set, router_ip: str, dst_port: int
) -> bool:
    if not ip_str or ip_str in ("*", "0.0.0.0", "::"):
        return False
    if ip_str in local_ips:
        return False
    if ip_str == router_ip and dst_port in (80, 443):
        return False
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    if (
        addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_unspecified
    ):
        return False
    return True


def _capture_flows_conntrack(
    ip_to_mac: Dict[str, str], local_ips: set, router_ip: str, now_iso: str
) -> Optional[List[Dict[str, Any]]]:
    path = "/proc/net/nf_conntrack"
    if not os.access(path, os.R_OK):
        return None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except OSError:
        return None

    flows: List[Dict[str, Any]] = []
    seen = set()
    for line in lines:
        parts = line.split()
        if len(parts) < 6:
            continue
        proto = parts[2].upper()
        if proto not in ("TCP", "UDP"):
            continue

        # Original tuple comes first, reply tuple second
        srcs: List[str] = []
        dsts: List[str] = []
        dports: List[int] = []
        bytes_list: List[int] = []
        packets_list: List[int] = []
        for tok in parts[3:]:
            if tok.startswith("src="):
                srcs.append(_normalize_addr(tok[4:]))
            elif tok.startswith("dst="):
                dsts.append(_normalize_addr(tok[4:]))
            elif tok.startswith("dport="):
                dports.append(parse_int(tok[6:]) or 0)
            elif tok.startswith("bytes="):
                bytes_list.append(parse_int(tok[6:]) or 0)
            elif tok.startswith("packets="):
                packets_list.append(parse_int(tok[8:]) or 0)

        if not srcs or not dsts or not dports:
            continue
        client_ip = srcs[0]
        dst_ip = dsts[0]
        dst_port = dports[0]
        if dst_port <= 0:
            continue
        if not _is_interesting_remote_ip(dst_ip, local_ips, router_ip, dst_port):
            continue

        key = (client_ip, dst_ip, dst_port, proto)
        if key in seen:
            continue
        seen.add(key)

        bytes_tx = bytes_list[0] if len(bytes_list) >= 1 else 0
        bytes_rx = bytes_list[1] if len(bytes_list) >= 2 else 0
        packets = sum(packets_list[:2])
        flow: Dict[str, Any] = {
            "at": now_iso,
            "client_ip": client_ip,
            "dst_ip": dst_ip,
            "dst_port": dst_port,
            "proto": proto,
            "sni_or_host": "",
            "bytes_tx": bytes_tx,
            "bytes_rx": bytes_rx,
            "packets": packets,
            "source": "conntrack",
        }
        mac = ip_to_mac.get(client_ip)
        if mac:
            flow["client_mac"] = mac
        flows.append(flow)
    return flows


def _capture_flows_ss(
    ip_to_mac: Dict[str, str], local_ips: set, router_ip: str, now_iso: str
) -> List[Dict[str, Any]]:
    out = _run_cmd(["ss", "-tunpH"], timeout=3.0)
    if not out:
        raw = _run_cmd(["ss", "-tunp"], timeout=3.0)
        lines = raw.splitlines()[1:] if raw else []
    else:
        lines = out.splitlines()

    flows: List[Dict[str, Any]] = []
    seen = set()
    for line in lines:
        parts = line.split()
        if len(parts) < 6:
            continue
        proto = parts[0].upper()
        if proto not in ("TCP", "UDP"):
            continue
        state = parts[1].upper()
        if state in ("LISTEN", "TIME-WAIT", "CLOSE", "CLOSING"):
            continue
        local_ep = parts[4]
        peer_ep = parts[5]
        client_ip, _ = _split_ss_endpoint(local_ep)
        dst_ip, dst_port = _split_ss_endpoint(peer_ep)
        if dst_port <= 0:
            continue
        if not _is_interesting_remote_ip(dst_ip, local_ips, router_ip, dst_port):
            continue
        # Skip loopback client_ip
        try:
            if ipaddress.ip_address(client_ip).is_loopback:
                continue
        except ValueError:
            continue

        key = (client_ip, dst_ip, dst_port, proto)
        if key in seen:
            continue
        seen.add(key)

        flow: Dict[str, Any] = {
            "at": now_iso,
            "client_ip": client_ip,
            "dst_ip": dst_ip,
            "dst_port": dst_port,
            "proto": proto,
            "sni_or_host": "",
            "bytes_tx": 0,
            "bytes_rx": 0,
            "packets": 0,
            "source": "ss",
        }
        mac = ip_to_mac.get(client_ip)
        if mac:
            flow["client_mac"] = mac
        flows.append(flow)
    return flows


def capture_flows(
    ip_to_mac: Dict[str, str],
    local_ifaces: List[Dict[str, Any]],
    router_ip: str,
    rdns: ReverseDNSCache,
    now_iso: str,
) -> List[Dict[str, Any]]:
    local_ips = {iface["ip"] for iface in local_ifaces if iface.get("ip")}
    flows = _capture_flows_conntrack(ip_to_mac, local_ips, router_ip, now_iso)
    if flows is None:
        flows = _capture_flows_ss(ip_to_mac, local_ips, router_ip, now_iso)

    # Sort by traffic descending (for conntrack) or port/dst for stability
    flows.sort(
        key=lambda f: (-(f["bytes_tx"] + f["bytes_rx"]), f["dst_port"], f["dst_ip"])
    )
    flows = flows[:MAX_FLOWS_PER_POST]

    # Enrich remote IPs with bounded LRU reverse-DNS
    remote_ips = [f["dst_ip"] for f in flows]
    resolved = rdns.resolve_batch(remote_ips)
    for f in flows:
        host = resolved.get(f["dst_ip"], "")
        if host:
            f["sni_or_host"] = host
    return flows


# ---------------------------------------------------------------------------
# Pure-Python DNS wire parser & threaded UDP forwarder
# ---------------------------------------------------------------------------


def _dns_decode_name(buf: bytes, offset: int) -> Tuple[str, int]:
    labels: List[str] = []
    jumped = False
    orig_next = offset
    n = len(buf)
    jumps = 0

    while offset < n:
        length = buf[offset]
        if length == 0:
            offset += 1
            if not jumped:
                orig_next = offset
            break
        if (length & 0xC0) == 0xC0:
            if offset + 1 >= n:
                return "", n
            pointer = ((length & 0x3F) << 8) | buf[offset + 1]
            if not jumped:
                orig_next = offset + 2
                jumped = True
            offset = pointer
            jumps += 1
            if jumps > 16 or offset >= n:
                return "", orig_next
        else:
            offset += 1
            if offset + length > n:
                return "", n
            labels.append(buf[offset : offset + length].decode("ascii", errors="replace"))
            offset += length
            if not jumped:
                orig_next = offset

    return ".".join(labels), orig_next


def parse_dns_wire(
    query_pkt: bytes, resp_pkt: Optional[bytes]
) -> Optional[Dict[str, str]]:
    """Parse QNAME, QTYPE, RCODE, and A/AAAA/CNAME answers from raw DNS UDP packets."""
    pkt = resp_pkt if (resp_pkt and len(resp_pkt) >= 12) else query_pkt
    if not pkt or len(pkt) < 12:
        return None

    _, flags, qdcount, ancount, _, _ = struct.unpack("!HHHHHH", pkt[:12])
    if qdcount < 1:
        return None

    offset = 12
    qname = ""
    qtype = 0
    for i in range(qdcount):
        name, offset = _dns_decode_name(pkt, offset)
        if offset + 4 > len(pkt):
            return None
        qt, _ = struct.unpack("!HH", pkt[offset : offset + 4])
        offset += 4
        if i == 0:
            qname = name.rstrip(".").lower()
            qtype = qt

    if not qname:
        return None

    qtype_str = DNS_QTYPES.get(qtype, f"TYPE{qtype}")
    rcode_str = DNS_RCODES.get(flags & 0x0F, f"RCODE{flags & 0x0F}") if resp_pkt else "SERVFAIL"

    ip_answers: List[str] = []
    cname_answers: List[str] = []
    if resp_pkt and ancount > 0:
        for _ in range(ancount):
            _, offset = _dns_decode_name(pkt, offset)
            if offset + 10 > len(pkt):
                break
            atype, _, _, rdlen = struct.unpack("!HHIH", pkt[offset : offset + 10])
            offset += 10
            if offset + rdlen > len(pkt):
                break
            rdata = pkt[offset : offset + rdlen]
            if atype == 1 and rdlen == 4:
                ip_answers.append(socket.inet_ntop(socket.AF_INET, rdata))
            elif atype == 28 and rdlen == 16:
                ip_answers.append(socket.inet_ntop(socket.AF_INET6, rdata))
            elif atype == 5:
                cname, _ = _dns_decode_name(pkt, offset)
                if cname:
                    cname_answers.append(cname.rstrip("."))
            offset += rdlen

    answers = ip_answers or cname_answers
    answer_str = ", ".join(answers[:3]) if answers else ""
    return {
        "domain": qname,
        "qtype": qtype_str,
        "rcode": rcode_str,
        "answer": answer_str,
    }


class DNSForwarder:
    """Pure-Python threaded UDP DNS forwarder with telemetry queue."""

    def __init__(
        self,
        listen_spec: str,
        upstreams: List[Tuple[str, int]],
        queue: Deque[Dict[str, Any]],
        lock: threading.Lock,
    ) -> None:
        self.host, self.port = parse_host_port(listen_spec, 53)
        self.upstreams = upstreams
        self.queue = queue
        self.lock = lock
        self._stop = threading.Event()
        self._sock: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=32, thread_name_prefix="dns-fwd"
        )

    def start(self) -> None:
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.settimeout(1.0)
        self._thread = threading.Thread(
            target=self._serve_loop, name="dns-listener", daemon=True
        )
        self._thread.start()
        upstream_desc = ", ".join(f"{h}:{p}" for h, p in self.upstreams)
        log(f"DNS forwarder listening on {self.host}:{self.port} -> {upstream_desc}")

    def _serve_loop(self) -> None:
        assert self._sock is not None
        while not self._stop.is_set():
            try:
                data, client_addr = self._sock.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                if self._stop.is_set():
                    break
                continue
            self._pool.submit(self._handle_query, data, client_addr)

    def _handle_query(self, query: bytes, client_addr: Tuple[str, int]) -> None:
        resp: Optional[bytes] = None
        for upstream in self.upstreams:
            usock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            usock.settimeout(2.5)
            try:
                usock.sendto(query, upstream)
                resp, _ = usock.recvfrom(4096)
                break
            except OSError:
                continue
            finally:
                usock.close()

        if resp and self._sock is not None:
            try:
                self._sock.sendto(resp, client_addr)
            except OSError:
                pass

        parsed = parse_dns_wire(query, resp)
        if parsed:
            event = {
                "at": utc_now_iso(),
                "client_ip": client_addr[0],
                "domain": parsed["domain"],
                "qtype": parsed["qtype"],
                "rcode": parsed["rcode"],
                "answer": parsed["answer"],
                "source": "dns-proxy",
            }
            with self.lock:
                self.queue.append(event)

    def stop(self) -> None:
        self._stop.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self._pool.shutdown(wait=False, cancel_futures=True)


# ---------------------------------------------------------------------------
# Optional DNS log file tailer (AdGuard Home JSONL & dnsmasq)
# ---------------------------------------------------------------------------

DNSMASQ_QUERY_RE = re.compile(
    r"query\[([A-Za-z0-9]+)\]\s+(\S+)\s+from\s+(\S+)"
)
DNSMASQ_REPLY_RE = re.compile(
    r"(?:reply|cached|forwarded)\s+(\S+)\s+is\s+(\S+)"
)


class DNSLogTailer:
    """Incrementally tails an AdGuard Home JSON querylog or dnsmasq log file."""

    def __init__(self, path: str) -> None:
        self.path = path
        self._inode: Optional[int] = None
        self._offset: int = 0
        self._initialized = False

    def _open_and_seek(self) -> Optional[Any]:
        try:
            st = os.stat(self.path)
        except OSError:
            return None
        fh = open(self.path, "r", encoding="utf-8", errors="replace")
        if not self._initialized:
            self._inode = st.st_ino
            self._offset = st.st_size
            self._initialized = True
            fh.seek(self._offset)
            return fh
        if self._inode != st.st_ino or st.st_size < self._offset:
            self._inode = st.st_ino
            self._offset = 0
        fh.seek(self._offset)
        return fh

    @staticmethod
    def _parse_adguard_line(line: str) -> Optional[Dict[str, Any]]:
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            return None
        if not isinstance(obj, dict) or "QH" not in obj:
            return None
        domain = str(obj.get("QH", "")).rstrip(".").lower()
        if not domain:
            return None
        client_ip = str(obj.get("IP", "")).strip()
        qtype = str(obj.get("QT", "A")).upper()
        at = str(obj.get("T", "")) or utc_now_iso()
        rcode = "NOERROR"
        answer = ""
        ans_raw = obj.get("Answer")
        if isinstance(ans_raw, str) and ans_raw:
            try:
                raw_bytes = base64.b64decode(ans_raw)
                parsed = parse_dns_wire(raw_bytes, raw_bytes)
                if parsed:
                    rcode = parsed["rcode"]
                    answer = parsed["answer"]
            except Exception:
                pass
        elif isinstance(ans_raw, list):
            vals = []
            for a in ans_raw:
                if isinstance(a, dict) and a.get("value"):
                    vals.append(str(a["value"]))
            answer = ", ".join(vals[:3])
        if obj.get("Result", {}).get("IsFiltered"):
            rcode = "BLOCKED"
        return {
            "at": at,
            "client_ip": client_ip,
            "domain": domain,
            "qtype": qtype,
            "rcode": rcode,
            "answer": answer,
            "source": "adguard",
        }

    def read_new(self, limit: int = 500) -> List[Dict[str, Any]]:
        fh = self._open_and_seek()
        if fh is None:
            return []
        events: List[Dict[str, Any]] = []
        recent_by_domain: Dict[str, Dict[str, Any]] = {}
        try:
            while True:
                line = fh.readline()
                if not line:
                    break
                s = line.strip()
                if not s:
                    continue
                if s.startswith("{"):
                    ev = self._parse_adguard_line(s)
                    if ev:
                        events.append(ev)
                else:
                    qm = DNSMASQ_QUERY_RE.search(s)
                    if qm:
                        ev = {
                            "at": utc_now_iso(),
                            "client_ip": qm.group(3),
                            "domain": qm.group(2).rstrip(".").lower(),
                            "qtype": qm.group(1).upper(),
                            "rcode": "NOERROR",
                            "answer": "",
                            "source": "dnsmasq",
                        }
                        events.append(ev)
                        recent_by_domain[ev["domain"]] = ev
                    else:
                        rm = DNSMASQ_REPLY_RE.search(s)
                        if rm:
                            dom = rm.group(1).rstrip(".").lower()
                            ans = rm.group(2)
                            if dom in recent_by_domain:
                                if ans == "NXDOMAIN":
                                    recent_by_domain[dom]["rcode"] = "NXDOMAIN"
                                elif ans not in ("<CNAME>", "NODATA-IPv4", "NODATA-IPv6"):
                                    prev = recent_by_domain[dom]["answer"]
                                    if not prev:
                                        recent_by_domain[dom]["answer"] = ans
                if len(events) >= limit:
                    break
            self._offset = fh.tell()
        finally:
            fh.close()
        return events


# ---------------------------------------------------------------------------
# Optional UDP Syslog listener
# ---------------------------------------------------------------------------

SYSLOG_PRI_RE = re.compile(r"^<(\d{1,3})>(.*)$", flags=re.DOTALL)


class SyslogListener:
    def __init__(
        self,
        listen_spec: str,
        router_ip: str,
        queue: Deque[Dict[str, Any]],
        lock: threading.Lock,
    ) -> None:
        self.host, self.port = parse_host_port(listen_spec, 1514)
        self.router_ip = router_ip
        self.queue = queue
        self.lock = lock
        self._stop = threading.Event()
        self._sock: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.settimeout(1.0)
        self._thread = threading.Thread(
            target=self._serve_loop, name="syslog-listener", daemon=True
        )
        self._thread.start()
        log(f"Syslog UDP listener bound on {self.host}:{self.port}")

    def _serve_loop(self) -> None:
        assert self._sock is not None
        while not self._stop.is_set():
            try:
                data, addr = self._sock.recvfrom(8192)
            except socket.timeout:
                continue
            except OSError:
                if self._stop.is_set():
                    break
                continue
            text = data.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            severity = "notice"
            facility = "router" if addr[0] == self.router_ip else "syslog"
            msg = text
            m = SYSLOG_PRI_RE.match(text)
            if m:
                pri = int(m.group(1))
                severity = SYSLOG_SEVERITIES.get(pri & 0x07, "notice")
                if addr[0] != self.router_ip:
                    facility = SYSLOG_FACILITIES.get(pri >> 3, "syslog")
                msg = m.group(2).strip()
            event = {
                "at": utc_now_iso(),
                "severity": severity,
                "facility": facility,
                "message": msg[:1000],
            }
            with self.lock:
                self.queue.append(event)

    def stop(self) -> None:
        self._stop.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Hotspot discovery (`dnsmasq.leases` + `iw dev <iface> station dump`)
# ---------------------------------------------------------------------------


def discover_hotspot_clients(
    leases_path: str, iface: str, ssid: str
) -> List[Dict[str, Any]]:
    """Read dnsmasq hotspot DHCP leases + iw station dump (RSSI, bitrate, packets)."""
    leases: Dict[str, Dict[str, str]] = {}
    if leases_path and os.access(leases_path, os.R_OK):
        try:
            with open(leases_path, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    parts = line.split()
                    if len(parts) < 4:
                        continue
                    mac = normalize_mac(parts[1])
                    if not mac:
                        continue
                    ip_val = parts[2].strip()
                    host = parts[3].strip()
                    if host in ("*", "-", ""):
                        host = ""
                    leases[mac] = {"ip": ip_val, "hostname": host}
        except OSError:
            pass

    stations: Dict[str, Dict[str, Any]] = {}
    if iface:
        out = _run_cmd(["iw", "dev", iface, "station", "dump"], timeout=3.0)
        cur_mac: Optional[str] = None
        for line in out.splitlines():
            m = re.match(r"^Station\s+([0-9a-fA-F:]{17})\b", line.strip())
            if m:
                cur_mac = normalize_mac(m.group(1))
                if cur_mac:
                    stations[cur_mac] = {"mac": cur_mac, "online": True}
                continue
            if not cur_mac or cur_mac not in stations:
                continue
            s = line.strip()
            if s.startswith("signal:"):
                stations[cur_mac]["rssi"] = parse_int(s.split(":", 1)[1])
            elif s.startswith("tx bitrate:"):
                val = parse_float(s.split(":", 1)[1], 0)
                if val is not None:
                    stations[cur_mac]["tx_rate_mbps"] = int(val)
            elif s.startswith("tx packets:"):
                stations[cur_mac]["tx_packets"] = parse_int(s.split(":", 1)[1])
            elif s.startswith("rx packets:"):
                stations[cur_mac]["rx_packets"] = parse_int(s.split(":", 1)[1])

    results: List[Dict[str, Any]] = []
    all_macs = set(leases.keys()) | set(stations.keys())
    for mac in all_macs:
        lease = leases.get(mac, {})
        sta = stations.get(mac)
        item: Dict[str, Any] = {
            "mac": mac,
            "hostname": lease.get("hostname", ""),
            "ip": lease.get("ip", ""),
            "connection": "wifi_2g",
            "ssid": ssid,
            "online": bool(sta is not None),
        }
        if sta:
            for k in ("rssi", "tx_rate_mbps", "tx_packets", "rx_packets"):
                if sta.get(k) is not None:
                    item[k] = sta[k]
        results.append(item)
    return results


# ---------------------------------------------------------------------------
# Zeek JSON Log Tailer (`dns.log`, `ssl.log`, `http.log`, `conn.log`)
# ---------------------------------------------------------------------------


class _JsonFileTailer:
    """Single-file JSONL tailer with rotation handling (seeks to EOF on startup)."""

    def __init__(self, path: str) -> None:
        self.path = path
        self._inode: Optional[int] = None
        self._offset: int = 0
        self._initialized = False

    def read_objects(self, limit: int = 200) -> List[Dict[str, Any]]:
        try:
            st = os.stat(self.path)
        except OSError:
            return []
        try:
            fh = open(self.path, "r", encoding="utf-8", errors="replace")
        except OSError:
            return []
        objs: List[Dict[str, Any]] = []
        try:
            if not self._initialized:
                self._inode = st.st_ino
                self._offset = max(0, st.st_size - 65536)
                self._initialized = True
                fh.seek(self._offset)
                if self._offset > 0:
                    fh.readline()  # discard partial line
            elif self._inode != st.st_ino or st.st_size < self._offset:
                self._inode = st.st_ino
                self._offset = 0
                fh.seek(0)
            else:
                fh.seek(self._offset)

            while True:
                line = fh.readline()
                if not line:
                    break
                s = line.strip()
                if not s or not s.startswith("{"):
                    continue
                try:
                    obj = json.loads(s)
                    if isinstance(obj, dict):
                        objs.append(obj)
                except json.JSONDecodeError:
                    continue
                if len(objs) >= limit:
                    break
            self._offset = fh.tell()
        finally:
            fh.close()
        return objs


class AdGuardApiPoller:
    """Polls AdGuard Home HTTP /control/querylog API (no root file perms needed)."""

    def __init__(self, base_url: str, user: str, password: str, timeout: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        raw = f"{user}:{password}".encode("utf-8")
        self._auth_header = "Basic " + base64.b64encode(raw).decode("ascii")
        self._seen_keys: "collections.OrderedDict[str, None]" = collections.OrderedDict()
        self._primed = False

    def read_new(self, limit: int = 120) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/control/querylog?limit={limit}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": self._auth_header,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except Exception as exc:
            log(f"AdGuard API poll error: {exc}", "WARN")
            return []

        rows = data.get("data") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            return []

        events: List[Dict[str, Any]] = []
        # API returns newest first; process oldest first
        for item in reversed(rows):
            if not isinstance(item, dict):
                continue
            q = item.get("question") or {}
            domain = str(q.get("name") or "").strip().rstrip(".").lower()
            client_ip = str(item.get("client") or "").strip()
            t_str = str(item.get("time") or "")
            if not domain or not client_ip:
                continue
            key = f"{t_str}|{client_ip}|{domain}|{q.get('type', 'A')}"
            if key in self._seen_keys:
                continue
            self._seen_keys[key] = None
            self._seen_keys.move_to_end(key)
            while len(self._seen_keys) > 4000:
                self._seen_keys.popitem(last=False)

            # Parse timestamp to ISO UTC
            at_iso = utc_now_iso()
            if t_str:
                try:
                    # Trim nanosecond precision for Python fromisoformat
                    m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$", t_str)
                    if m:
                        norm = m.group(1) + (m.group(2) or "Z")
                        if norm.endswith("Z"):
                            norm = norm[:-1] + "+00:00"
                        dt = datetime.datetime.fromisoformat(norm).astimezone(datetime.timezone.utc)
                        at_iso = dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                except Exception:
                    pass

            ans_list = item.get("answer")
            answers: List[str] = []
            if isinstance(ans_list, list):
                for a in ans_list[:3]:
                    if isinstance(a, dict) and a.get("value"):
                        answers.append(str(a["value"]))
            reason = str(item.get("reason") or "")
            rcode = "BLOCKED" if reason.startswith("Filtered") else str(item.get("status") or "NOERROR")
            events.append(
                {
                    "at": at_iso,
                    "client_ip": client_ip,
                    "domain": domain,
                    "qtype": str(q.get("type") or "A").upper()[:16],
                    "rcode": rcode[:24],
                    "answer": ", ".join(answers)[:128],
                    "source": "adguard",
                }
            )
        self._primed = True
        return events


class ZeekLogTailer:
    """Tails Zeek JSON logs (dns.log, ssl.log, http.log, conn.log) across one or more dirs."""

    def __init__(self, log_dirs_spec: str) -> None:
        dirs = [d.strip() for d in log_dirs_spec.split(",") if d.strip()]
        self.log_dirs = dirs
        self._tailers = [
            {
                "dns": _JsonFileTailer(os.path.join(d, "dns.log")),
                "ssl": _JsonFileTailer(os.path.join(d, "ssl.log")),
                "http": _JsonFileTailer(os.path.join(d, "http.log")),
                "conn": _JsonFileTailer(os.path.join(d, "conn.log")),
            }
            for d in dirs
        ]
        self._sni_cache: "collections.OrderedDict[str, str]" = collections.OrderedDict()

    @staticmethod
    def _zeek_ts(val: Any) -> str:
        if isinstance(val, (int, float)) and val > 1_000_000_000:
            return (
                datetime.datetime.fromtimestamp(val, tz=datetime.timezone.utc)
                .replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z")
            )
        if isinstance(val, str) and val:
            return val
        return utc_now_iso()

    def _remember_sni(self, uid: str, host: str) -> None:
        if not uid or not host:
            return
        self._sni_cache[uid] = host
        self._sni_cache.move_to_end(uid)
        while len(self._sni_cache) > 2048:
            self._sni_cache.popitem(last=False)

    def read_new(
        self, ip_to_mac: Dict[str, str], local_ips: set, router_ip: str
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        dns_out: List[Dict[str, Any]] = []
        flows_out: List[Dict[str, Any]] = []

        for tset in self._tailers:
            # 1. Zeek dns.log
            for obj in tset["dns"].read_objects(120):
                query = str(obj.get("query") or "").strip().rstrip(".").lower()
                client_ip = str(obj.get("id.orig_h") or "").strip()
                if not query or not client_ip:
                    continue
                answers_raw = obj.get("answers")
                if isinstance(answers_raw, list):
                    ans = ", ".join(str(a) for a in answers_raw[:3])
                else:
                    ans = str(answers_raw or "")
                item: Dict[str, Any] = {
                    "at": self._zeek_ts(obj.get("ts")),
                    "client_ip": client_ip,
                    "domain": query,
                    "qtype": str(obj.get("qtype_name") or "A").upper()[:16],
                    "rcode": str(obj.get("rcode_name") or "NOERROR")[:24],
                    "answer": ans[:128],
                    "source": "zeek-dns",
                }
                mac = ip_to_mac.get(client_ip)
                if mac:
                    item["client_mac"] = mac
                dns_out.append(item)

            # 2. Zeek ssl.log (TLS SNI — reveals exact HTTPS domain even with DoH!)
            for obj in tset["ssl"].read_objects(120):
                sni = str(obj.get("server_name") or "").strip().lower()
                uid = str(obj.get("uid") or "")
                if sni:
                    self._remember_sni(uid, sni)
                client_ip = str(obj.get("id.orig_h") or "").strip()
                dst_ip = str(obj.get("id.resp_h") or "").strip()
                dst_port = parse_int(obj.get("id.resp_p")) or 443
                if not client_ip or not dst_ip or not sni:
                    continue
                if not _is_interesting_remote_ip(dst_ip, local_ips, router_ip, dst_port):
                    continue
                fl: Dict[str, Any] = {
                    "at": self._zeek_ts(obj.get("ts")),
                    "client_ip": client_ip,
                    "dst_ip": dst_ip,
                    "dst_port": dst_port,
                    "proto": "TCP",
                    "sni_or_host": sni,
                    "bytes_tx": 0,
                    "bytes_rx": 0,
                    "packets": 0,
                    "source": "zeek-ssl",
                }
                mac = ip_to_mac.get(client_ip)
                if mac:
                    fl["client_mac"] = mac
                flows_out.append(fl)

            # 3. Zeek http.log
            for obj in tset["http"].read_objects(80):
                host = str(obj.get("host") or "").strip().lower()
                uid = str(obj.get("uid") or "")
                if host:
                    self._remember_sni(uid, host)
                client_ip = str(obj.get("id.orig_h") or "").strip()
                dst_ip = str(obj.get("id.resp_h") or "").strip()
                dst_port = parse_int(obj.get("id.resp_p")) or 80
                if not client_ip or not dst_ip or not host:
                    continue
                if not _is_interesting_remote_ip(dst_ip, local_ips, router_ip, dst_port):
                    continue
                fl = {
                    "at": self._zeek_ts(obj.get("ts")),
                    "client_ip": client_ip,
                    "dst_ip": dst_ip,
                    "dst_port": dst_port,
                    "proto": "TCP",
                    "sni_or_host": host,
                    "bytes_tx": parse_int(obj.get("request_body_len")) or 0,
                    "bytes_rx": parse_int(obj.get("response_body_len")) or 0,
                    "packets": 0,
                    "source": "zeek-http",
                }
                mac = ip_to_mac.get(client_ip)
                if mac:
                    fl["client_mac"] = mac
                flows_out.append(fl)

            # 4. Zeek conn.log (full byte/packet flow records enriched with SNI)
            for obj in tset["conn"].read_objects(120):
                client_ip = str(obj.get("id.orig_h") or "").strip()
                dst_ip = str(obj.get("id.resp_h") or "").strip()
                dst_port = parse_int(obj.get("id.resp_p")) or 0
                proto = str(obj.get("proto") or "TCP").upper()
                if not client_ip or not dst_ip or dst_port <= 0 or proto not in ("TCP", "UDP"):
                    continue
                if not _is_interesting_remote_ip(dst_ip, local_ips, router_ip, dst_port):
                    continue
                uid = str(obj.get("uid") or "")
                sni = self._sni_cache.get(uid, "")
                b_tx = parse_int(obj.get("orig_ip_bytes")) or parse_int(obj.get("orig_bytes")) or 0
                b_rx = parse_int(obj.get("resp_ip_bytes")) or parse_int(obj.get("resp_bytes")) or 0
                pkts = (parse_int(obj.get("orig_pkts")) or 0) + (parse_int(obj.get("resp_pkts")) or 0)
                fl = {
                    "at": self._zeek_ts(obj.get("ts")),
                    "client_ip": client_ip,
                    "dst_ip": dst_ip,
                    "dst_port": dst_port,
                    "proto": proto,
                    "sni_or_host": sni,
                    "bytes_tx": b_tx,
                    "bytes_rx": b_rx,
                    "packets": pkts,
                    "source": "zeek-conn",
                }
                mac = ip_to_mac.get(client_ip)
                if mac:
                    fl["client_mac"] = mac
                flows_out.append(fl)

        return dns_out, flows_out


# ---------------------------------------------------------------------------
# Main Collector Orchestrator
# ---------------------------------------------------------------------------


class NetmonCollector:
    def __init__(self, args: argparse.Namespace) -> None:
        self.ingest_url = args.ingest_url or os.environ.get(
            "NETMON_INGEST_URL", "https://kirtanjain.com/net/api/ingest"
        )
        self.ingest_token = os.environ.get("NETMON_INGEST_TOKEN", "")
        self.local_hostname = socket.gethostname()
        self.collector_id = os.environ.get("NETMON_COLLECTOR_ID") or self.local_hostname
        self.collector_label = (
            os.environ.get("NETMON_COLLECTOR_LABEL") or "ThinkPad EOS (Linux)"
        )
        self.router_url = args.router_url or os.environ.get(
            "ROUTER_URL", "http://192.168.1.1"
        )
        self.router_user = os.environ.get("ROUTER_USER", "admin")
        self.router_pass = os.environ.get("ROUTER_PASS", "admin")
        self.poll_seconds = max(
            5,
            int(
                args.poll_seconds
                or os.environ.get("NETMON_POLL_SECONDS", "30")
            ),
        )
        self.http_timeout = float(os.environ.get("NETMON_HTTP_TIMEOUT", "10"))
        self.capture_flows_enabled = env_bool("NETMON_CAPTURE_FLOWS", True)
        self.dns_listen = os.environ.get("NETMON_DNS_LISTEN", "").strip()
        self.dns_upstream_raw = os.environ.get("NETMON_DNS_UPSTREAM", "1.1.1.1:53").strip()
        self.dns_log_file = os.environ.get("NETMON_DNS_LOG_FILE", "").strip()
        self.adguard_url = os.environ.get("NETMON_ADGUARD_URL", "").strip()
        self.adguard_user = os.environ.get("NETMON_ADGUARD_USER", "admin").strip()
        self.adguard_pass = os.environ.get("NETMON_ADGUARD_PASS", "").strip()
        self.zeek_log_dir = os.environ.get("NETMON_ZEEK_LOG_DIR", "").strip()
        self.hotspot_leases = os.environ.get("NETMON_HOTSPOT_LEASES", "").strip()
        self.hotspot_iface = os.environ.get("NETMON_HOTSPOT_IFACE", "").strip()
        self.hotspot_ssid = os.environ.get("NETMON_HOTSPOT_SSID", "Kirtan-Monitored").strip()
        self.syslog_listen = os.environ.get("NETMON_SYSLOG_LISTEN", "").strip()
        self.dry_run = bool(args.dry_run)
        self.once = bool(args.once)
        self.verbose = bool(args.verbose)

        parsed_router = urllib.parse.urlparse(self.router_url)
        self.router_ip = parsed_router.hostname or "192.168.1.1"

        self.router_client = SyrotechRouterClient(
            self.router_url,
            self.router_user,
            self.router_pass,
            timeout=self.http_timeout,
        )
        self.rdns = ReverseDNSCache()
        self.dns_queue: Deque[Dict[str, Any]] = collections.deque(maxlen=2000)
        self.dns_lock = threading.Lock()
        self.syslog_queue: Deque[Dict[str, Any]] = collections.deque(maxlen=500)
        self.syslog_lock = threading.Lock()

        self.dns_forwarder: Optional[DNSForwarder] = None
        self.adguard_poller: Optional[AdGuardApiPoller] = (
            AdGuardApiPoller(self.adguard_url, self.adguard_user, self.adguard_pass)
            if self.adguard_url
            else None
        )
        self.dns_tailer: Optional[DNSLogTailer] = (
            DNSLogTailer(self.dns_log_file) if (self.dns_log_file and not self.adguard_poller) else None
        )
        self.zeek_tailer: Optional[ZeekLogTailer] = (
            ZeekLogTailer(self.zeek_log_dir) if self.zeek_log_dir else None
        )
        self.syslog_listener: Optional[SyslogListener] = None

        self._prev_ts: Optional[float] = None
        self._prev_rx_bytes: Optional[int] = None
        self._prev_tx_bytes: Optional[int] = None

    def _build_dns_upstreams(self) -> List[Tuple[str, int]]:
        upstreams: List[Tuple[str, int]] = []
        for part in self.dns_upstream_raw.split(","):
            part = part.strip()
            if part:
                upstreams.append(parse_host_port(part, 53))
        if not upstreams:
            upstreams.append(("1.1.1.1", 53))
        if ("8.8.8.8", 53) not in upstreams:
            upstreams.append(("8.8.8.8", 53))
        return upstreams

    def start_background_services(self) -> None:
        if self.once:
            return
        if self.dns_listen:
            try:
                self.dns_forwarder = DNSForwarder(
                    self.dns_listen,
                    self._build_dns_upstreams(),
                    self.dns_queue,
                    self.dns_lock,
                )
                self.dns_forwarder.start()
            except OSError as exc:
                log(f"Failed to start DNS forwarder on {self.dns_listen}: {exc}", "ERROR")
                self.dns_forwarder = None

        if self.syslog_listen:
            try:
                self.syslog_listener = SyslogListener(
                    self.syslog_listen,
                    self.router_ip,
                    self.syslog_queue,
                    self.syslog_lock,
                )
                self.syslog_listener.start()
            except OSError as exc:
                log(f"Failed to start syslog listener on {self.syslog_listen}: {exc}", "ERROR")
                self.syslog_listener = None

    def stop_background_services(self) -> None:
        if self.dns_forwarder:
            self.dns_forwarder.stop()
        if self.syslog_listener:
            self.syslog_listener.stop()
        self.rdns.close()

    def _compute_rates_bps(self, rx_bytes: int, tx_bytes: int) -> Tuple[int, int]:
        now_mono = time.monotonic()
        rx_rate = 0
        tx_rate = 0
        if (
            self._prev_ts is not None
            and self._prev_rx_bytes is not None
            and self._prev_tx_bytes is not None
        ):
            dt = now_mono - self._prev_ts
            if dt > 0:
                drx = rx_bytes - self._prev_rx_bytes
                dtx = tx_bytes - self._prev_tx_bytes
                # Safely handle router reboot or counter wraparound (reset -> 0)
                if drx >= 0:
                    rx_rate = int(round((drx * 8) / dt))
                if dtx >= 0:
                    tx_rate = int(round((dtx * 8) / dt))
        self._prev_ts = now_mono
        self._prev_rx_bytes = rx_bytes
        self._prev_tx_bytes = tx_bytes
        return rx_rate, tx_rate

    def _drain_queue(
        self, q: Deque[Dict[str, Any]], lock: threading.Lock, max_items: int
    ) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        with lock:
            while q and len(items) < max_items:
                items.append(q.popleft())
        return items

    def collect_payloads(self) -> List[Dict[str, Any]]:
        now_iso = utc_now_iso()
        scraped = self.router_client.scrape_all()
        router_data = scraped["router"]
        meta = scraped["meta"]

        rx_rate_bps, tx_rate_bps = self._compute_rates_bps(
            router_data["wan_rx_bytes"], router_data["wan_tx_bytes"]
        )

        local_ifaces = discover_local_interfaces()
        neighbors = discover_lan_neighbors()
        hotspot_clients = (
            discover_hotspot_clients(self.hotspot_leases, self.hotspot_iface, self.hotspot_ssid)
            if (self.hotspot_leases or self.hotspot_iface)
            else []
        )
        devices, ip_to_mac = merge_devices(
            scraped["clts"],
            scraped["wifi_clients"] + [c for c in hotspot_clients if c.get("online")],
            neighbors,
            local_ifaces,
            self.router_ip,
            self.local_hostname,
        )
        # Ensure hotspot DHCP leases (IP + hostname) enrich merged devices & ip_to_mac
        dev_by_mac = {d["mac"]: d for d in devices}
        for hc in hotspot_clients:
            if hc.get("ip"):
                ip_to_mac[hc["ip"]] = hc["mac"]
            if hc["mac"] in dev_by_mac:
                if hc.get("ip"):
                    dev_by_mac[hc["mac"]]["ip"] = hc["ip"]
                if hc.get("hostname") and not dev_by_mac[hc["mac"]].get("hostname"):
                    dev_by_mac[hc["mac"]]["hostname"] = hc["hostname"]
            elif len(devices) < MAX_DEVICES_PER_POST:
                devices.append(hc)
                dev_by_mac[hc["mac"]] = hc
        active_devices = sum(1 for d in devices if d.get("online"))

        router_payload: Dict[str, Any] = {
            "at": now_iso,
            "wan_ip": router_data["wan_ip"],
            "wan_rx_bytes": router_data["wan_rx_bytes"],
            "wan_tx_bytes": router_data["wan_tx_bytes"],
            "wan_rx_rate_bps": rx_rate_bps,
            "wan_tx_rate_bps": tx_rate_bps,
            "wan_rx_packets": router_data["wan_rx_packets"],
            "wan_tx_packets": router_data["wan_tx_packets"],
            "wan_dropped": router_data["wan_dropped"],
            "gpon_rx_dbm": router_data["gpon_rx_dbm"],
            "gpon_tx_dbm": router_data["gpon_tx_dbm"],
            "gpon_temp_c": router_data["gpon_temp_c"],
            "gpon_voltage_v": router_data["gpon_voltage_v"],
            "lan1_rx_bytes": router_data["lan1_rx_bytes"],
            "lan1_tx_bytes": router_data["lan1_tx_bytes"],
            "lan2_rx_bytes": router_data["lan2_rx_bytes"],
            "lan2_tx_bytes": router_data["lan2_tx_bytes"],
            "active_devices": active_devices,
            "uptime_str": router_data["uptime_str"],
        }

        flows: List[Dict[str, Any]] = []
        if self.capture_flows_enabled:
            flows = capture_flows(
                ip_to_mac, local_ifaces, self.router_ip, self.rdns, now_iso
            )

        dns_events = self._drain_queue(
            self.dns_queue, self.dns_lock, MAX_DNS_PER_POST * MAX_CHUNKS_PER_POLL
        )
        if self.adguard_poller:
            dns_events.extend(self.adguard_poller.read_new(MAX_DNS_PER_POST * 2))
        if self.dns_tailer:
            dns_events.extend(self.dns_tailer.read_new(MAX_DNS_PER_POST * 2))

        if self.zeek_tailer:
            local_ips = {iface["ip"] for iface in local_ifaces if iface.get("ip")}
            z_dns, z_flows = self.zeek_tailer.read_new(ip_to_mac, local_ips, self.router_ip)
            # Prefer AdGuard Home for DNS when active, but add Zeek DNS if AdGuard isn't logging them
            if not (self.dns_tailer or self.adguard_poller):
                dns_events.extend(z_dns)
            else:
                seen_dns = {(e.get("client_ip"), e.get("domain")) for e in dns_events}
                for zd in z_dns:
                    if (zd.get("client_ip"), zd.get("domain")) not in seen_dns:
                        dns_events.append(zd)
            # Prepend rich Zeek SNI/conn flows ahead of basic ss host flows
            flows = z_flows + flows

        syslog_events = self._drain_queue(
            self.syslog_queue,
            self.syslog_lock,
            MAX_SYSLOG_PER_POST * MAX_CHUNKS_PER_POLL,
        )

        collector_block: Dict[str, Any] = {
            "id": self.collector_id,
            "label": self.collector_label,
            "kind": "linux",
            "meta": {
                "router_model": meta.get("router_model", ""),
                "firmware": meta.get("firmware", ""),
                "dns_proxy": bool(self.dns_forwarder is not None),
                "adguard": bool(self.adguard_poller is not None or self.dns_tailer is not None),
                "zeek": bool(self.zeek_tailer is not None),
                "hotspot": bool(self.hotspot_iface),
                "syslog": bool(self.syslog_listener is not None),
            },
        }
        if meta.get("wan_gateway"):
            collector_block["meta"]["wan_gateway"] = meta["wan_gateway"]
        if meta.get("wan_dns"):
            collector_block["meta"]["wan_dns"] = meta["wan_dns"]

        # Primary payload with router stats + full device snapshot + first batch of events
        primary: Dict[str, Any] = {
            "collector": collector_block,
            "full_device_snapshot": True,
            "router": router_payload,
            "devices": devices[:MAX_DEVICES_PER_POST],
            "dns": dns_events[:MAX_DNS_PER_POST],
            "flows": flows[:MAX_FLOWS_PER_POST],
            "syslog": syslog_events[:MAX_SYSLOG_PER_POST],
        }
        payloads = [primary]

        # Chunk remaining DNS / flow / syslog events within API limits
        dns_rem = dns_events[MAX_DNS_PER_POST:]
        flows_rem = flows[MAX_FLOWS_PER_POST:]
        sys_rem = syslog_events[MAX_SYSLOG_PER_POST:]
        chunks = 1
        while (dns_rem or flows_rem or sys_rem) and chunks < MAX_CHUNKS_PER_POLL:
            payloads.append(
                {
                    "collector": collector_block,
                    "full_device_snapshot": False,
                    "dns": dns_rem[:MAX_DNS_PER_POST],
                    "flows": flows_rem[:MAX_FLOWS_PER_POST],
                    "syslog": sys_rem[:MAX_SYSLOG_PER_POST],
                }
            )
            dns_rem = dns_rem[MAX_DNS_PER_POST:]
            flows_rem = flows_rem[MAX_FLOWS_PER_POST:]
            sys_rem = sys_rem[MAX_SYSLOG_PER_POST:]
            chunks += 1

        return payloads

    def post_payload(self, payload: Dict[str, Any]) -> Tuple[int, str]:
        if not self.ingest_token:
            raise RuntimeError("NETMON_INGEST_TOKEN is not set")
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = urllib.request.Request(
            self.ingest_url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.ingest_token}",
                "Content-Type": "application/json",
                "User-Agent": "netmon-collector/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=self.http_timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")

    def run_poll(self) -> bool:
        try:
            payloads = self.collect_payloads()
        except Exception as exc:
            log(f"Scrape error: {exc}", "ERROR")
            return False

        primary = payloads[0]
        r = primary["router"]
        devs = primary["devices"]
        total_dns = sum(len(p.get("dns", [])) for p in payloads)
        total_flows = sum(len(p.get("flows", [])) for p in payloads)
        total_syslog = sum(len(p.get("syslog", [])) for p in payloads)

        if self.dry_run:
            out_obj: Any = primary if len(payloads) == 1 else payloads
            print(json.dumps(out_obj, indent=2), flush=True)
            log(
                f"DRY-RUN ok: active={r['active_devices']}/{len(devs)} "
                f"wan={r['wan_ip']} gpon_rx={r['gpon_rx_dbm']}dBm "
                f"flows={total_flows} dns={total_dns} syslog={total_syslog}",
                "WARN" if False else "INFO",
            )
            return True

        ok = True
        for idx, payload in enumerate(payloads):
            try:
                status, resp_text = self.post_payload(payload)
                if self.verbose:
                    log(f"POST chunk {idx + 1}/{len(payloads)} -> HTTP {status}: {resp_text[:200]}")
            except urllib.error.HTTPError as exc:
                err_body = exc.read().decode("utf-8", errors="replace")[:300]
                log(
                    f"Ingest HTTP {exc.code} on chunk {idx + 1}/{len(payloads)}: {err_body}",
                    "ERROR",
                )
                ok = False
                break
            except Exception as exc:
                log(f"Ingest error on chunk {idx + 1}/{len(payloads)}: {exc}", "ERROR")
                ok = False
                break

        if ok:
            rx_mbps = r["wan_rx_rate_bps"] / 1_000_000.0
            tx_mbps = r["wan_tx_rate_bps"] / 1_000_000.0
            log(
                f"Pushed {len(payloads)} batch(es): active={r['active_devices']}/{len(devs)} "
                f"wan={r['wan_ip']} rx={rx_mbps:.2f}Mbps tx={tx_mbps:.2f}Mbps "
                f"flows={total_flows} dns={total_dns} syslog={total_syslog}"
            )
        return ok


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Linux router & network telemetry collector for kirtanjain.com/net"
    )
    parser.add_argument(
        "--env-file",
        default="",
        help="Optional env file to load (KEY=VALUE) before reading configuration",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single scrape + capture cycle and exit",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape and print JSON payload(s) to stdout without POSTing",
    )
    parser.add_argument("--router-url", default="", help="Override ROUTER_URL")
    parser.add_argument("--ingest-url", default="", help="Override NETMON_INGEST_URL")
    parser.add_argument(
        "--poll-seconds", type=int, default=0, help="Override NETMON_POLL_SECONDS"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.env_file:
        try:
            load_env_file(args.env_file)
        except OSError as exc:
            log(f"Failed to read env file {args.env_file}: {exc}", "ERROR")
            return 2

    stop_event = threading.Event()

    def _handle_sig(signum: int, _frame: Any) -> None:
        log(f"Received signal {signum}, shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    collector = NetmonCollector(args)
    if args.once:
        ok = collector.run_poll()
        collector.stop_background_services()
        return 0 if ok else 1

    log(
        f"Starting netmon-collector id={collector.collector_id} "
        f"router={collector.router_url} poll={collector.poll_seconds}s "
        f"flows={collector.capture_flows_enabled}"
    )
    collector.start_background_services()
    try:
        while not stop_event.is_set():
            started = time.monotonic()
            collector.run_poll()
            elapsed = time.monotonic() - started
            wait_s = max(1.0, collector.poll_seconds - elapsed)
            stop_event.wait(wait_s)
    finally:
        collector.stop_background_services()
        log("Stopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
