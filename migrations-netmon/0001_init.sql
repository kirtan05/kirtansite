-- /net — Home router & network monitor schema for NETMON_DB.
--
-- Apply:
--   npx wrangler d1 execute netmon --local  --file migrations-netmon/0001_init.sql -y
--   npx wrangler d1 execute netmon --remote --file migrations-netmon/0001_init.sql -y

CREATE TABLE IF NOT EXISTS net_setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO net_setting (key, value, updated_at)
VALUES ('epoch', '1', '2026-01-01T00:00:00.000Z');

-- Active collectors pushing data (thinkpad-eos, esp32, pi, openwrt, etc.)
CREATE TABLE IF NOT EXISTS net_collector (
  id        TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  kind      TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  meta_json TEXT
);

-- Known LAN/Wi-Fi devices keyed by normalized lowercase MAC address
CREATE TABLE IF NOT EXISTS net_device (
  mac          TEXT PRIMARY KEY,
  hostname     TEXT,
  custom_name  TEXT,
  ip           TEXT,
  connection   TEXT NOT NULL DEFAULT 'unknown', -- 'wifi_5g' | 'wifi_2g' | 'lan' | 'unknown'
  ssid         TEXT,
  rssi         INTEGER,
  tx_rate_mbps INTEGER,
  tx_packets   INTEGER NOT NULL DEFAULT 0,
  rx_packets   INTEGER NOT NULL DEFAULT 0,
  online       INTEGER NOT NULL DEFAULT 0,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_net_device_ip ON net_device(ip);
CREATE INDEX IF NOT EXISTS idx_net_device_online ON net_device(online, last_seen);

-- Join / leave / new-device / IP-change timeline
CREATE TABLE IF NOT EXISTS net_device_event (
  id     TEXT PRIMARY KEY,
  mac    TEXT NOT NULL,
  event  TEXT NOT NULL CHECK (event IN ('new', 'online', 'offline', 'ip_change')),
  ip     TEXT,
  detail TEXT,
  at     TEXT NOT NULL,
  day    TEXT NOT NULL -- YYYY-MM-DD in IST
);

CREATE INDEX IF NOT EXISTS idx_net_device_event_day ON net_device_event(day, at DESC);
CREATE INDEX IF NOT EXISTS idx_net_device_event_mac ON net_device_event(mac, at DESC);

-- Periodic router / WAN / GPON / LAN port snapshots
CREATE TABLE IF NOT EXISTS net_router_sample (
  id              TEXT PRIMARY KEY,
  at              TEXT NOT NULL,
  day             TEXT NOT NULL,
  wan_ip          TEXT,
  wan_rx_bytes    INTEGER NOT NULL DEFAULT 0,
  wan_tx_bytes    INTEGER NOT NULL DEFAULT 0,
  wan_rx_rate_bps INTEGER NOT NULL DEFAULT 0,
  wan_tx_rate_bps INTEGER NOT NULL DEFAULT 0,
  wan_rx_packets  INTEGER NOT NULL DEFAULT 0,
  wan_tx_packets  INTEGER NOT NULL DEFAULT 0,
  wan_dropped     INTEGER NOT NULL DEFAULT 0,
  gpon_rx_dbm     REAL,
  gpon_tx_dbm     REAL,
  gpon_temp_c     REAL,
  gpon_voltage_v  REAL,
  lan1_rx_bytes   INTEGER NOT NULL DEFAULT 0,
  lan1_tx_bytes   INTEGER NOT NULL DEFAULT 0,
  lan2_rx_bytes   INTEGER NOT NULL DEFAULT 0,
  lan2_tx_bytes   INTEGER NOT NULL DEFAULT 0,
  active_devices  INTEGER NOT NULL DEFAULT 0,
  uptime_str      TEXT
);

CREATE INDEX IF NOT EXISTS idx_net_router_sample_day ON net_router_sample(day, at DESC);
CREATE INDEX IF NOT EXISTS idx_net_router_sample_at  ON net_router_sample(at DESC);

-- Per-device DNS queries ("who visited which domain")
CREATE TABLE IF NOT EXISTS net_dns_query (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  client_ip   TEXT NOT NULL,
  client_mac  TEXT,
  client_name TEXT,
  domain      TEXT NOT NULL,
  qtype       TEXT NOT NULL DEFAULT 'A',
  rcode       TEXT,
  answer      TEXT,
  source      TEXT NOT NULL DEFAULT 'dns'
);

CREATE INDEX IF NOT EXISTS idx_net_dns_day_at   ON net_dns_query(day, at DESC);
CREATE INDEX IF NOT EXISTS idx_net_dns_mac_day  ON net_dns_query(client_mac, day);
CREATE INDEX IF NOT EXISTS idx_net_dns_domain   ON net_dns_query(day, domain);

-- Network connections / flows ("who went to whom", IP/SNI/port/bytes)
CREATE TABLE IF NOT EXISTS net_flow (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  client_ip   TEXT NOT NULL,
  client_mac  TEXT,
  client_name TEXT,
  dst_ip      TEXT NOT NULL,
  dst_port    INTEGER NOT NULL DEFAULT 0,
  proto       TEXT NOT NULL DEFAULT 'TCP',
  sni_or_host TEXT,
  bytes_tx    INTEGER NOT NULL DEFAULT 0,
  bytes_rx    INTEGER NOT NULL DEFAULT 0,
  packets     INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'host'
);

CREATE INDEX IF NOT EXISTS idx_net_flow_day_at  ON net_flow(day, at DESC);
CREATE INDEX IF NOT EXISTS idx_net_flow_mac_day ON net_flow(client_mac, day);
CREATE INDEX IF NOT EXISTS idx_net_flow_dst     ON net_flow(day, dst_ip, dst_port);

-- Router syslog stream
CREATE TABLE IF NOT EXISTS net_syslog (
  id       TEXT PRIMARY KEY,
  at       TEXT NOT NULL,
  day      TEXT NOT NULL,
  severity TEXT,
  facility TEXT,
  message  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_net_syslog_day_at ON net_syslog(day, at DESC);
