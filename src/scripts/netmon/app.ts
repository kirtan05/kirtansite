type ConnectionType = 'wifi_5g' | 'wifi_2g' | 'lan' | 'unknown';
type DeviceEventType = 'new' | 'online' | 'offline' | 'ip_change';
type TabId = 'overview' | 'devices' | 'dns' | 'flows' | 'router';

interface Collector {
  id: string;
  label: string;
  kind: string;
  last_seen: string;
  meta_json: string | null;
}

interface RouterSnapshot {
  at: string;
  wan_ip: string | null;
  wan_rx_bytes: number;
  wan_tx_bytes: number;
  wan_rx_rate_bps: number;
  wan_tx_rate_bps: number;
  wan_rx_packets: number;
  wan_tx_packets: number;
  wan_dropped: number;
  gpon_rx_dbm: number | null;
  gpon_tx_dbm: number | null;
  gpon_temp_c: number | null;
  gpon_voltage_v: number | null;
  lan1_rx_bytes: number;
  lan1_tx_bytes: number;
  lan2_rx_bytes: number;
  lan2_tx_bytes: number;
  active_devices: number;
  uptime_str: string | null;
}

interface RouterPoint {
  at: string;
  wan_rx_rate_bps: number;
  wan_tx_rate_bps: number;
  gpon_rx_dbm: number | null;
  gpon_temp_c: number | null;
  active_devices: number;
  wan_rx_bytes: number;
  wan_tx_bytes: number;
  lan1_rx_bytes: number;
  lan1_tx_bytes: number;
  lan2_rx_bytes: number;
  lan2_tx_bytes: number;
}

interface DeviceRow {
  mac: string;
  hostname: string | null;
  custom_name: string | null;
  ip: string | null;
  connection: ConnectionType;
  ssid: string | null;
  rssi: number | null;
  tx_rate_mbps: number | null;
  tx_packets: number;
  rx_packets: number;
  online: number;
  first_seen: string;
  last_seen: string;
  dns_today: number;
  flows_today: number;
}

interface DeviceEvent {
  id: string;
  mac: string;
  event: DeviceEventType;
  ip: string | null;
  detail: string | null;
  at: string;
  device_name?: string;
}

interface TopDomain {
  domain: string;
  hits: number;
  clients?: number;
  last_at?: string;
}

interface TopDnsClient {
  client_ip: string;
  client_name: string;
  client_mac: string | null;
  hits: number;
  unique_domains: number;
}

interface TopDestination {
  target: string;
  dst_ip: string;
  dst_port: number;
  proto: string;
  hits: number;
  bytes_tx: number;
  bytes_rx: number;
  last_at: string;
}

interface DnsLog {
  id: string;
  at: string;
  client_ip: string;
  client_mac: string | null;
  client_name: string | null;
  domain: string;
  qtype: string;
  rcode: string | null;
  answer: string | null;
  source: string;
}

interface FlowLog {
  id: string;
  at: string;
  client_ip: string;
  client_mac: string | null;
  client_name: string | null;
  dst_ip: string;
  dst_port: number;
  proto: string;
  sni_or_host: string | null;
  bytes_tx: number;
  bytes_rx: number;
  packets: number;
  source: string;
}

interface SyslogRow {
  id: string;
  at: string;
  severity: string | null;
  facility: string | null;
  message: string;
}

interface OverviewPayload {
  day: string;
  today: string;
  days: string[];
  collectors: Collector[];
  router: RouterSnapshot | null;
  router_series: RouterPoint[];
  devices: DeviceRow[];
  device_events: DeviceEvent[];
  summary: {
    devices_total: number;
    devices_online: number;
    dns_queries_today: number;
    dns_unique_domains: number;
    flows_today: number;
  };
  top_domains: TopDomain[];
  top_dns_clients: TopDnsClient[];
  top_destinations: TopDestination[];
  dns_logs: DnsLog[];
  flow_logs: FlowLog[];
  syslog: SyslogRow[];
}

interface DeviceDetailPayload {
  day: string;
  device: DeviceRow | null;
  events: DeviceEvent[];
  top_domains: TopDomain[];
  recent_dns: DnsLog[];
  recent_flows: FlowLog[];
}

// ── Formatters & Sanitizers ──────────────────────────────────────────────────

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

const IST_TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const IST_HM_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const IST_DATETIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function parseUtc(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  let normalized = ts.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
    normalized = normalized.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
    normalized = normalized + 'Z';
  }
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtIstTime(ts: string | null | undefined): string {
  const d = parseUtc(ts);
  return d ? IST_TIME_FMT.format(d) : '—';
}

function fmtIstHM(ts: string | null | undefined): string {
  const d = parseUtc(ts);
  return d ? IST_HM_FMT.format(d) : '—';
}

function fmtIstDateTime(ts: string | null | undefined): string {
  const d = parseUtc(ts);
  return d ? `${IST_DATETIME_FMT.format(d)} IST` : '—';
}

function fmtRelative(ts: string | null | undefined): string {
  const d = parseUtc(ts);
  if (!d) return '—';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('en-US');
}

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : val >= 100 ? 0 : val >= 10 ? 1 : 2;
  return `${val.toFixed(digits)} ${units[idx]}`;
}

function fmtSpeed(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps) || bps <= 0) return '0.0 Mbps';
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) {
    const mbps = bps / 1e6;
    return `${mbps.toFixed(mbps >= 100 ? 0 : mbps >= 10 ? 1 : 2)} Mbps`;
  }
  if (bps >= 1e3) {
    const kbps = bps / 1e3;
    return `${kbps.toFixed(kbps >= 100 ? 0 : 1)} Kbps`;
  }
  return `${Math.round(bps)} bps`;
}

function fmtSpeedMbps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps) || bps <= 0) return '0.00 Mbps';
  const mbps = bps / 1e6;
  if (mbps >= 100) return `${mbps.toFixed(0)} Mbps`;
  if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
  if (mbps >= 0.01) return `${mbps.toFixed(2)} Mbps`;
  return fmtSpeed(bps);
}

function deviceLabel(d: Pick<DeviceRow, 'custom_name' | 'hostname' | 'mac'>): string {
  return d.custom_name?.trim() || d.hostname?.trim() || d.mac;
}

function connectionBadge(conn: ConnectionType): string {
  switch (conn) {
    case 'wifi_5g':
      return '<span class="badge badge-accent">5G</span>';
    case 'wifi_2g':
      return '<span class="badge badge-warn">2.4G</span>';
    case 'lan':
      return '<span class="badge badge-ok">LAN</span>';
    default:
      return '<span class="badge badge-muted">—</span>';
  }
}

function eventBadge(ev: DeviceEventType): string {
  switch (ev) {
    case 'new':
      return '<span class="badge badge-accent">new</span>';
    case 'online':
      return '<span class="badge badge-ok">online</span>';
    case 'offline':
      return '<span class="badge badge-muted">offline</span>';
    case 'ip_change':
      return '<span class="badge badge-warn">ip change</span>';
    default:
      return `<span class="badge badge-muted">${esc(ev)}</span>`;
  }
}

function rcodeBadge(rcode: string | null): string {
  if (!rcode) return '<span class="muted">—</span>';
  const upper = rcode.toUpperCase();
  if (upper === 'NOERROR' || upper === 'OK') {
    return `<span class="badge badge-ok mono">${esc(upper)}</span>`;
  }
  if (upper === 'NXDOMAIN' || upper === 'REFUSED') {
    return `<span class="badge badge-warn mono">${esc(upper)}</span>`;
  }
  return `<span class="badge badge-bad mono">${esc(upper)}</span>`;
}

function rssiClass(rssi: number | null): string {
  if (rssi === null || rssi === undefined) return 'muted';
  if (rssi >= -60) return 'text-ok';
  if (rssi >= -74) return 'text-warn';
  return 'text-bad';
}

function gponRxState(dbm: number | null): { cls: string; label: string } {
  if (dbm === null || dbm === undefined) return { cls: 'muted', label: 'No signal' };
  if (dbm <= -8 && dbm >= -26) return { cls: 'text-ok', label: 'Healthy' };
  if (dbm < -26 && dbm >= -29) return { cls: 'text-warn', label: 'Low signal' };
  if (dbm > -8 && dbm <= -5) return { cls: 'text-warn', label: 'Hot signal' };
  return { cls: 'text-bad', label: 'Critical' };
}

function syslogSeverityGroup(sev: string | null): 'err' | 'warn' | 'info' {
  const s = (sev ?? '').toLowerCase();
  if (/(emerg|alert|crit|err|fatal)/.test(s)) return 'err';
  if (/warn/.test(s)) return 'warn';
  return 'info';
}

function severityBadge(sev: string | null): string {
  const label = sev?.trim() || 'info';
  const grp = syslogSeverityGroup(label);
  const cls = grp === 'err' ? 'badge-bad' : grp === 'warn' ? 'badge-warn' : 'badge-muted';
  return `<span class="badge ${cls} mono">${esc(label)}</span>`;
}

// ── State ────────────────────────────────────────────────────────────────────

interface AppState {
  tab: TabId;
  day: string;
  autoRefresh: boolean;
  dnsQ: string;
  dnsMac: string;
  flowQ: string;
  flowMac: string;
  devSearch: string;
  devOnlineOnly: boolean;
  syslogSev: 'all' | 'err' | 'warn' | 'info';
  lastQueryKey: string;
  data: OverviewPayload | null;
  openMac: string | null;
  deviceDetail: DeviceDetailPayload | null;
  fetchSeq: number;
  deviceSeq: number;
}

const state: AppState = {
  tab: 'overview',
  day: '',
  autoRefresh: true,
  dnsQ: '',
  dnsMac: '',
  flowQ: '',
  flowMac: '',
  devSearch: '',
  devOnlineOnly: false,
  syslogSev: 'all',
  lastQueryKey: '',
  data: null,
  openMac: null,
  deviceDetail: null,
  fetchSeq: 0,
  deviceSeq: 0,
};

const AUTO_REFRESH_MS = 15_000;
let autoTimer: number | null = null;

// ── DOM References ───────────────────────────────────────────────────────────

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const els = {
  collectorPill: byId<HTMLDivElement>('collector-pill'),
  collectorPillText: byId<HTMLSpanElement>('collector-pill-text'),
  daySelect: byId<HTMLSelectElement>('day-select'),
  autoBtn: byId<HTMLButtonElement>('auto-btn'),
  refreshBtn: byId<HTMLButtonElement>('refresh-btn'),
  logoutBtn: byId<HTMLButtonElement>('logout-btn'),
  logoutAllBtn: byId<HTMLButtonElement>('logout-all-btn'),
  banner: byId<HTMLDivElement>('net-banner'),
  bannerText: byId<HTMLSpanElement>('net-banner-text'),
  bannerRetry: byId<HTMLButtonElement>('net-banner-retry'),
  badgeDevices: byId<HTMLSpanElement>('badge-devices'),
  badgeDns: byId<HTMLSpanElement>('badge-dns'),
  badgeFlows: byId<HTMLSpanElement>('badge-flows'),
  kpiGrid: byId<HTMLDivElement>('kpi-grid'),
  wanChartWrap: byId<HTMLDivElement>('wan-chart-wrap'),
  wanChartPeak: byId<HTMLSpanElement>('wan-chart-peak'),
  overviewEvents: byId<HTMLDivElement>('overview-events'),
  overviewEventsMeta: byId<HTMLSpanElement>('overview-events-meta'),
  overviewDomains: byId<HTMLDivElement>('overview-domains'),
  overviewDomainsMeta: byId<HTMLSpanElement>('overview-domains-meta'),
  overviewTalkers: byId<HTMLDivElement>('overview-talkers'),
  overviewTalkersMeta: byId<HTMLSpanElement>('overview-talkers-meta'),
  overviewDests: byId<HTMLDivElement>('overview-dests'),
  overviewDestsMeta: byId<HTMLSpanElement>('overview-dests-meta'),
  devSearch: byId<HTMLInputElement>('dev-search'),
  devOnlineOnly: byId<HTMLInputElement>('dev-online-only'),
  devCount: byId<HTMLSpanElement>('dev-count'),
  devTableWrap: byId<HTMLDivElement>('dev-table-wrap'),
  dnsFilterForm: byId<HTMLFormElement>('dns-filter-form'),
  dnsSearch: byId<HTMLInputElement>('dns-search'),
  dnsMacSelect: byId<HTMLSelectElement>('dns-mac-select'),
  dnsClearBtn: byId<HTMLButtonElement>('dns-clear-btn'),
  dnsTopMeta: byId<HTMLSpanElement>('dns-top-meta'),
  dnsTopDomains: byId<HTMLDivElement>('dns-top-domains'),
  dnsLogMeta: byId<HTMLSpanElement>('dns-log-meta'),
  dnsLogWrap: byId<HTMLDivElement>('dns-log-wrap'),
  flowFilterForm: byId<HTMLFormElement>('flow-filter-form'),
  flowSearch: byId<HTMLInputElement>('flow-search'),
  flowMacSelect: byId<HTMLSelectElement>('flow-mac-select'),
  flowClearBtn: byId<HTMLButtonElement>('flow-clear-btn'),
  flowTopMeta: byId<HTMLSpanElement>('flow-top-meta'),
  flowTopDests: byId<HTMLDivElement>('flow-top-dests'),
  flowLogMeta: byId<HTMLSpanElement>('flow-log-meta'),
  flowLogWrap: byId<HTMLDivElement>('flow-log-wrap'),
  routerCards: byId<HTMLDivElement>('router-cards'),
  collectorsMeta: byId<HTMLSpanElement>('collectors-meta'),
  collectorsList: byId<HTMLDivElement>('collectors-list'),
  syslogSevPills: byId<HTMLDivElement>('syslog-sev-pills'),
  syslogMeta: byId<HTMLSpanElement>('syslog-meta'),
  syslogWrap: byId<HTMLDivElement>('syslog-wrap'),
  drawerBackdrop: byId<HTMLDivElement>('device-drawer-backdrop'),
  drawerTitle: byId<HTMLHeadingElement>('drawer-title'),
  drawerSub: byId<HTMLDivElement>('drawer-sub'),
  drawerBody: byId<HTMLDivElement>('drawer-body'),
  drawerClose: byId<HTMLButtonElement>('drawer-close'),
};

// ── Networking ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 401) {
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // ignore non-json error bodies
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function activeServerFilter(): { q: string; mac: string } {
  if (state.tab === 'dns') return { q: state.dnsQ, mac: state.dnsMac };
  if (state.tab === 'flows') return { q: state.flowQ, mac: state.flowMac };
  return { q: '', mac: '' };
}

function buildOverviewUrl(): { url: string; key: string } {
  const { q, mac } = activeServerFilter();
  const params = new URLSearchParams();
  if (state.day) params.set('day', state.day);
  if (q) params.set('q', q);
  if (mac) params.set('mac', mac);
  const qs = params.toString();
  const url = qs ? `/net/api/overview?${qs}` : '/net/api/overview';
  return { url, key: `${state.day}|${q}|${mac}` };
}

function setBanner(msg: string | null): void {
  if (!msg) {
    els.banner.hidden = true;
    els.bannerText.textContent = '';
  } else {
    els.bannerText.textContent = msg;
    els.banner.hidden = false;
  }
}

async function fetchOverview(showBusy = false): Promise<void> {
  const seq = ++state.fetchSeq;
  const { url, key } = buildOverviewUrl();
  if (showBusy) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = 'Refreshing…';
  }
  try {
    const payload = await apiFetch<OverviewPayload>(url);
    if (seq !== state.fetchSeq) return;
    state.data = payload;
    state.day = payload.day;
    state.lastQueryKey = key;
    setBanner(null);
    renderAll();
  } catch (err) {
    if (seq !== state.fetchSeq) return;
    const message = err instanceof Error ? err.message : 'Failed to load network telemetry.';
    setBanner(message);
  } finally {
    if (showBusy) {
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = 'Refresh';
    }
  }
}

async function fetchDeviceDetail(mac: string): Promise<void> {
  const seq = ++state.deviceSeq;
  const params = new URLSearchParams({ mac });
  if (state.day) params.set('day', state.day);
  try {
    const detail = await apiFetch<DeviceDetailPayload>(`/net/api/device?${params.toString()}`);
    if (seq !== state.deviceSeq || state.openMac !== mac) return;
    state.deviceDetail = detail;
    renderDrawer(detail);
  } catch (err) {
    if (seq !== state.deviceSeq || state.openMac !== mac) return;
    const message = err instanceof Error ? err.message : 'Failed to load device details.';
    els.drawerBody.innerHTML = `<div class="empty text-bad">${esc(message)}</div>`;
  }
}

async function saveDeviceName(mac: string, customName: string): Promise<string | null> {
  const res = await apiFetch<{ ok: boolean; mac: string; custom_name: string | null }>('/net/api/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac, custom_name: customName }),
  });
  const saved = res.custom_name?.trim() ? res.custom_name.trim() : null;

  if (state.data) {
    const dev = state.data.devices.find((d) => d.mac === mac);
    if (dev) dev.custom_name = saved;
    const display = dev ? deviceLabel(dev) : saved || mac;

    for (const ev of state.data.device_events) {
      if (ev.mac === mac) ev.device_name = display;
    }
    for (const c of state.data.top_dns_clients) {
      if (c.client_mac === mac) c.client_name = display;
    }
    for (const log of state.data.dns_logs) {
      if (log.client_mac === mac) log.client_name = display;
    }
    for (const flow of state.data.flow_logs) {
      if (flow.client_mac === mac) flow.client_name = display;
    }
  }

  if (state.deviceDetail?.device && state.deviceDetail.device.mac === mac) {
    state.deviceDetail.device.custom_name = saved;
  }

  renderAll();
  return saved;
}

async function logout(all: boolean): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/net/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(all ? { all: true } : {}),
    });
  } catch {
    // reload anyway
  }
  window.location.href = '/net';
}

// ── Rendering: Header & Chrome ───────────────────────────────────────────────

function renderCollectorPill(collectors: Collector[]): void {
  if (!collectors.length) {
    els.collectorPill.className = 'pill muted';
    els.collectorPillText.textContent = 'No collector';
    els.collectorPill.title = 'No collectors have reported yet';
    return;
  }

  let newest: Collector | null = null;
  let newestMs = -Infinity;
  for (const c of collectors) {
    const d = parseUtc(c.last_seen);
    const ms = d ? d.getTime() : -Infinity;
    if (ms > newestMs) {
      newestMs = ms;
      newest = c;
    }
  }

  if (!newest || !Number.isFinite(newestMs)) {
    els.collectorPill.className = 'pill muted';
    els.collectorPillText.textContent = 'Collector idle';
    return;
  }

  const ageSec = Math.max(0, (Date.now() - newestMs) / 1000);
  const rel = fmtRelative(newest.last_seen);
  if (ageSec < 120) {
    els.collectorPill.className = 'pill ok';
    els.collectorPillText.textContent = `Live · ${rel}`;
  } else if (ageSec < 900) {
    els.collectorPill.className = 'pill warn';
    els.collectorPillText.textContent = `Delayed · ${rel}`;
  } else {
    els.collectorPill.className = 'pill muted';
    els.collectorPillText.textContent = `Offline · ${rel}`;
  }
  els.collectorPill.title = `${newest.label || newest.id} (${newest.kind}) · last seen ${fmtIstDateTime(newest.last_seen)}`;
}

function renderDaySelect(data: OverviewPayload): void {
  const days = data.days.length ? data.days : [data.day];
  const uniqueDays = Array.from(new Set(days.includes(data.day) ? days : [data.day, ...days]));
  const optionsHtml = uniqueDays
    .map((d) => {
      const tag = d === data.today ? `${d} (today)` : d;
      const sel = d === data.day ? ' selected' : '';
      return `<option value="${esc(d)}"${sel}>${esc(tag)}</option>`;
    })
    .join('');
  if (els.daySelect.innerHTML !== optionsHtml) {
    els.daySelect.innerHTML = optionsHtml;
  }
  els.daySelect.value = data.day;
}

function renderDeviceSelects(devices: DeviceRow[]): void {
  const sorted = [...devices].sort((a, b) => {
    if (a.online !== b.online) return b.online - a.online;
    return deviceLabel(a).localeCompare(deviceLabel(b));
  });

  const build = (currentMac: string) => {
    const opts = ['<option value="">All devices</option>'];
    for (const d of sorted) {
      const label = deviceLabel(d);
      const suffix = d.ip ? ` (${d.ip})` : '';
      const dot = d.online ? '● ' : '○ ';
      const sel = d.mac === currentMac ? ' selected' : '';
      opts.push(`<option value="${esc(d.mac)}"${sel}>${esc(dot + label + suffix)}</option>`);
    }
    return opts.join('');
  };

  els.dnsMacSelect.innerHTML = build(state.dnsMac);
  els.flowMacSelect.innerHTML = build(state.flowMac);
}

function renderTabBadges(data: OverviewPayload): void {
  els.badgeDevices.textContent = `${data.summary.devices_online}/${data.summary.devices_total}`;
  els.badgeDns.textContent = fmtCompact(data.summary.dns_queries_today);
  els.badgeFlows.textContent = fmtCompact(data.summary.flows_today);
}

// ── Rendering: Overview Tab ──────────────────────────────────────────────────

function renderOverview(data: OverviewPayload): void {
  const r = data.router;
  const s = data.summary;

  // 5 KPI cards
  const gponState = gponRxState(r?.gpon_rx_dbm ?? null);
  const gponRxStr = r?.gpon_rx_dbm !== null && r?.gpon_rx_dbm !== undefined ? `${r.gpon_rx_dbm.toFixed(1)} dBm` : '—';
  const gponTempStr = r?.gpon_temp_c !== null && r?.gpon_temp_c !== undefined ? `${r.gpon_temp_c.toFixed(1)}°C` : null;
  const gponSubParts = [gponTempStr, r?.uptime_str ? `Up ${r.uptime_str}` : null].filter(Boolean);

  els.kpiGrid.innerHTML = `
    <div class="kpi">
      <span class="kpi-label">Online Devices</span>
      <span class="kpi-value"><span class="text-ok">${fmtCount(s.devices_online)}</span> <span class="muted" style="font-size:0.95rem;font-weight:500;">/ ${fmtCount(s.devices_total)}</span></span>
      <span class="kpi-sub">${r ? `Router reports ${fmtCount(r.active_devices)} active` : 'No router snapshot'}</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">WAN Throughput</span>
      <span class="kpi-value-pair">
        <span class="text-accent">↓ ${esc(r ? fmtSpeedMbps(r.wan_rx_rate_bps) : '—')}</span>
        <span class="text-ok">↑ ${esc(r ? fmtSpeedMbps(r.wan_tx_rate_bps) : '—')}</span>
      </span>
      <span class="kpi-sub mono">${r ? `Total ↓ ${fmtBytes(r.wan_rx_bytes)} · ↑ ${fmtBytes(r.wan_tx_bytes)}` : 'Awaiting samples'}</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">GPON Health</span>
      <span class="kpi-value ${gponState.cls}">${esc(gponRxStr)}</span>
      <span class="kpi-sub">${esc(gponSubParts.length ? gponSubParts.join(' · ') : gponState.label)}</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">DNS Queries</span>
      <span class="kpi-value">${fmtCount(s.dns_queries_today)}</span>
      <span class="kpi-sub">${fmtCount(s.dns_unique_domains)} unique domains</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Active Flows</span>
      <span class="kpi-value">${fmtCount(s.flows_today)}</span>
      <span class="kpi-sub">${data.top_destinations.length ? `${fmtCount(data.top_destinations.length)} top endpoints` : 'Connection records today'}</span>
    </div>
  `;

  // WAN Throughput SVG Chart
  renderWanChart(data.router_series);

  // Recent Device Activity
  els.overviewEventsMeta.textContent = `${data.device_events.length} recent`;
  if (!data.device_events.length) {
    els.overviewEvents.innerHTML = '<div class="empty">No device join/leave events recorded on this day.</div>';
  } else {
    const items = data.device_events.slice(0, 14).map((ev) => {
      const name = ev.device_name || ev.mac;
      const detailParts = [ev.ip, ev.detail].filter(Boolean).join(' · ');
      return `
        <li class="event-item">
          <div class="event-main">
            ${eventBadge(ev.event)}
            <div class="event-text">
              <button type="button" class="bar-label-btn" data-open-mac="${esc(ev.mac)}">${esc(name)}</button>
              ${detailParts ? `<span class="muted mono" style="font-size:0.75rem;margin-left:0.35rem;">${esc(detailParts)}</span>` : ''}
            </div>
          </div>
          <span class="event-time mono" title="${esc(fmtIstDateTime(ev.at))}">${esc(fmtIstTime(ev.at))}</span>
        </li>
      `;
    });
    els.overviewEvents.innerHTML = `<ul class="event-list">${items.join('')}</ul>`;
  }

  // Top Queried Domains
  els.overviewDomainsMeta.textContent = data.top_domains.length
    ? `Top ${Math.min(10, data.top_domains.length)}`
    : '';
  els.overviewDomains.innerHTML = renderTopDomainsList(data.top_domains.slice(0, 10), true);

  // Top DNS Talkers
  els.overviewTalkersMeta.textContent = data.top_dns_clients.length
    ? `${data.top_dns_clients.length} clients`
    : '';
  if (!data.top_dns_clients.length) {
    els.overviewTalkers.innerHTML = '<div class="empty">No DNS client activity recorded yet.</div>';
  } else {
    const maxHits = Math.max(1, ...data.top_dns_clients.map((c) => c.hits));
    const rows = data.top_dns_clients.slice(0, 10).map((c) => {
      const pct = Math.max(2, Math.round((c.hits / maxHits) * 100));
      const label = c.client_name || c.client_ip;
      const nameHtml = c.client_mac
        ? `<button type="button" class="bar-label-btn" data-open-mac="${esc(c.client_mac)}">${esc(label)}</button>`
        : `<span>${esc(label)}</span>`;
      return `
        <li class="bar-row">
          <div class="bar-row-top">
            <span class="bar-label">${nameHtml} <span class="muted mono" style="font-size:0.74rem;">${esc(c.client_ip)}</span></span>
            <span class="bar-val mono">${fmtCount(c.hits)} <span class="muted">(${fmtCount(c.unique_domains)} dom)</span></span>
          </div>
          <div class="bar-track"><div class="bar-fill ok" style="width:${pct}%"></div></div>
        </li>
      `;
    });
    els.overviewTalkers.innerHTML = `<ul class="bar-list">${rows.join('')}</ul>`;
  }

  // Top Remote Destinations
  els.overviewDestsMeta.textContent = data.top_destinations.length
    ? `Top ${Math.min(10, data.top_destinations.length)}`
    : '';
  els.overviewDests.innerHTML = renderTopDestinationsList(data.top_destinations.slice(0, 10));
}

function renderTopDomainsList(domains: TopDomain[], clickableToDns: boolean): string {
  if (!domains.length) {
    return '<div class="empty">No DNS queries recorded on this day.</div>';
  }
  const maxHits = Math.max(1, ...domains.map((d) => d.hits));
  const rows = domains.map((d) => {
    const pct = Math.max(2, Math.round((d.hits / maxHits) * 100));
    const clientNote =
      d.clients !== undefined ? ` <span class="muted">· ${fmtCount(d.clients)} dev</span>` : '';
    const labelHtml = clickableToDns
      ? `<button type="button" class="bar-label-btn mono" data-filter-dns="${esc(d.domain)}">${esc(d.domain)}</button>`
      : `<span class="mono">${esc(d.domain)}</span>`;
    return `
      <li class="bar-row">
        <div class="bar-row-top">
          <span class="bar-label">${labelHtml}</span>
          <span class="bar-val mono">${fmtCount(d.hits)}${clientNote}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </li>
    `;
  });
  return `<ul class="bar-list">${rows.join('')}</ul>`;
}

function renderTopDestinationsList(dests: TopDestination[]): string {
  if (!dests.length) {
    return '<div class="empty">No remote connections recorded on this day.</div>';
  }
  const maxHits = Math.max(1, ...dests.map((d) => d.hits));
  const rows = dests.map((d) => {
    const pct = Math.max(2, Math.round((d.hits / maxHits) * 100));
    const endpoint = `${d.target || d.dst_ip}:${d.dst_port}`;
    const totalBytes = (d.bytes_rx || 0) + (d.bytes_tx || 0);
    const traffic = totalBytes > 0 ? ` · ${fmtBytes(totalBytes)}` : '';
    return `
      <li class="bar-row">
        <div class="bar-row-top">
          <span class="bar-label">
            <button type="button" class="bar-label-btn mono" data-filter-flow="${esc(d.target || d.dst_ip)}">${esc(endpoint)}</button>
            <span class="badge badge-muted mono" style="margin-left:0.3rem;">${esc(d.proto.toUpperCase())}</span>
          </span>
          <span class="bar-val mono">${fmtCount(d.hits)} hits${esc(traffic)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </li>
    `;
  });
  return `<ul class="bar-list">${rows.join('')}</ul>`;
}

// ── Rendering: WAN SVG Chart ─────────────────────────────────────────────────

function renderWanChart(series: RouterPoint[]): void {
  if (!series.length) {
    els.wanChartPeak.textContent = '';
    els.wanChartWrap.innerHTML =
      '<div class="empty">No WAN throughput time-series data for this day yet.</div>';
    return;
  }

  const maxRx = Math.max(0, ...series.map((p) => p.wan_rx_rate_bps || 0));
  const maxTx = Math.max(0, ...series.map((p) => p.wan_tx_rate_bps || 0));
  const peak = Math.max(maxRx, maxTx);
  const yMax = peak > 0 ? peak * 1.12 : 1_000_000;

  els.wanChartPeak.textContent = `Peak ↓ ${fmtSpeed(maxRx)} · ↑ ${fmtSpeed(maxTx)}`;

  const W = 820;
  const H = 225;
  const padL = 68;
  const padR = 16;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const times = series.map((p) => parseUtc(p.at)?.getTime() ?? 0);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const spanT = maxT > minT ? maxT - minT : 1;

  const xFor = (idx: number): number => {
    if (series.length === 1) return padL + plotW / 2;
    if (maxT > minT) return padL + ((times[idx] - minT) / spanT) * plotW;
    return padL + (idx / (series.length - 1)) * plotW;
  };

  const yFor = (val: number): number => {
    const clamped = Math.max(0, Math.min(yMax, val));
    return padT + plotH - (clamped / yMax) * plotH;
  };

  const rxCoords = series.map((p, i) => ({ x: xFor(i), y: yFor(p.wan_rx_rate_bps || 0) }));
  const txCoords = series.map((p, i) => ({ x: xFor(i), y: yFor(p.wan_tx_rate_bps || 0) }));

  const linePath = (pts: Array<{ x: number; y: number }>) =>
    pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');

  const areaPath = (pts: Array<{ x: number; y: number }>) => {
    if (!pts.length) return '';
    const base = (padT + plotH).toFixed(1);
    return `${linePath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
  };

  // Horizontal gridlines (4 steps)
  const yTicks = [0, 0.333, 0.666, 1];
  const gridSvg = yTicks
    .map((frac) => {
      const val = yMax * frac;
      const y = yFor(val);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"
              stroke="var(--rule)" stroke-width="1" stroke-dasharray="${frac === 0 ? '' : '3 3'}" />
        <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end"
              fill="var(--ink-2)" font-size="10.5" font-family="var(--font-mono)">${esc(fmtSpeed(val))}</text>
      `;
    })
    .join('');

  // X-axis IST labels (up to 6 evenly spaced)
  const tickCount = Math.min(6, series.length);
  const xTicksSvg: string[] = [];
  for (let t = 0; t < tickCount; t += 1) {
    const idx = tickCount === 1 ? 0 : Math.round((t / (tickCount - 1)) * (series.length - 1));
    const x = xFor(idx);
    const anchor = t === 0 ? 'start' : t === tickCount - 1 ? 'end' : 'middle';
    xTicksSvg.push(
      `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}"
             fill="var(--ink-2)" font-size="10.5" font-family="var(--font-mono)">${esc(fmtIstHM(series[idx].at))}</text>`
    );
  }

  const singleDotSvg =
    series.length === 1
      ? `<circle cx="${rxCoords[0].x}" cy="${rxCoords[0].y}" r="4" fill="var(--accent)" />
         <circle cx="${txCoords[0].x}" cy="${txCoords[0].y}" r="4" fill="var(--ok)" />`
      : '';

  els.wanChartWrap.innerHTML = `
    <div class="chart-tooltip mono" id="wan-chart-tip" hidden></div>
    <svg class="chart-svg" id="wan-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="WAN download and upload throughput chart">
      <defs>
        <linearGradient id="wan-rx-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
        </linearGradient>
        <linearGradient id="wan-tx-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--ok)" stop-opacity="0.24" />
          <stop offset="100%" stop-color="var(--ok)" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      ${gridSvg}
      ${xTicksSvg.join('')}
      ${
        series.length > 1
          ? `
            <path d="${areaPath(rxCoords)}" fill="url(#wan-rx-grad)" />
            <path d="${areaPath(txCoords)}" fill="url(#wan-tx-grad)" />
            <path d="${linePath(rxCoords)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            <path d="${linePath(txCoords)}" fill="none" stroke="var(--ok)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
          `
          : singleDotSvg
      }
      <g id="wan-chart-hover" style="display:none;">
        <line id="wan-hover-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="2 2" />
        <circle id="wan-hover-rx" cx="0" cy="0" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5" />
        <circle id="wan-hover-tx" cx="0" cy="0" r="3.5" fill="var(--ok)" stroke="var(--card)" stroke-width="1.5" />
      </g>
    </svg>
  `;

  const svg = document.getElementById('wan-chart-svg') as SVGSVGElement | null;
  const hoverGroup = document.getElementById('wan-chart-hover') as SVGGElement | null;
  const hoverLine = document.getElementById('wan-hover-line') as SVGLineElement | null;
  const hoverRx = document.getElementById('wan-hover-rx') as SVGCircleElement | null;
  const hoverTx = document.getElementById('wan-hover-tx') as SVGCircleElement | null;
  const tip = document.getElementById('wan-chart-tip') as HTMLDivElement | null;

  if (!svg || !hoverGroup || !hoverLine || !hoverRx || !hoverTx || !tip) return;

  const updateHover = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rxCoords.length; i += 1) {
      const dist = Math.abs(rxCoords[i].x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const pt = series[bestIdx];
    const rxPt = rxCoords[bestIdx];
    const txPt = txCoords[bestIdx];

    hoverLine.setAttribute('x1', rxPt.x.toFixed(1));
    hoverLine.setAttribute('x2', rxPt.x.toFixed(1));
    hoverRx.setAttribute('cx', rxPt.x.toFixed(1));
    hoverRx.setAttribute('cy', rxPt.y.toFixed(1));
    hoverTx.setAttribute('cx', txPt.x.toFixed(1));
    hoverTx.setAttribute('cy', txPt.y.toFixed(1));
    hoverGroup.style.display = '';

    tip.innerHTML = `
      <span class="muted">${esc(fmtIstTime(pt.at))} IST</span>
      <span class="text-accent">↓ ${esc(fmtSpeed(pt.wan_rx_rate_bps))}</span>
      <span class="text-ok">↑ ${esc(fmtSpeed(pt.wan_tx_rate_bps))}</span>
      <span class="muted">${fmtCount(pt.active_devices)} dev</span>
    `;
    tip.hidden = false;
  };

  svg.addEventListener('pointermove', (e) => updateHover(e.clientX));
  svg.addEventListener('pointerleave', () => {
    hoverGroup.style.display = 'none';
    tip.hidden = true;
  });
}

// ── Rendering: Devices Tab ───────────────────────────────────────────────────

function renderDevices(data: OverviewPayload): void {
  const q = state.devSearch.trim().toLowerCase();
  const filtered = data.devices
    .filter((d) => {
      if (state.devOnlineOnly && !d.online) return false;
      if (!q) return true;
      return (
        (d.custom_name ?? '').toLowerCase().includes(q) ||
        (d.hostname ?? '').toLowerCase().includes(q) ||
        (d.ip ?? '').toLowerCase().includes(q) ||
        d.mac.toLowerCase().includes(q) ||
        (d.ssid ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (a.online !== b.online) return b.online - a.online;
      const actA = (a.dns_today || 0) + (a.flows_today || 0);
      const actB = (b.dns_today || 0) + (b.flows_today || 0);
      if (actA !== actB) return actB - actA;
      return deviceLabel(a).localeCompare(deviceLabel(b));
    });

  els.devCount.textContent = `${filtered.length} of ${data.devices.length} devices`;

  if (!filtered.length) {
    els.devTableWrap.innerHTML = '<div class="empty">No devices match your filter.</div>';
    return;
  }

  const rows = filtered
    .map((d) => {
      const name = deviceLabel(d);
      const showSecondaryHost =
        d.custom_name?.trim() && d.hostname?.trim() && d.custom_name.trim() !== d.hostname.trim();
      const signalHtml =
        d.rssi !== null && d.rssi !== undefined
          ? `<span class="mono ${rssiClass(d.rssi)}">${d.rssi} dBm</span>${
              d.tx_rate_mbps !== null && d.tx_rate_mbps !== undefined
                ? `<span class="cell-sub mono">${Math.round(d.tx_rate_mbps)} Mbps</span>`
                : ''
            }`
          : d.connection === 'lan'
            ? '<span class="muted">Wired</span>'
            : '<span class="muted">—</span>';

      return `
        <tr class="clickable" data-open-mac="${esc(d.mac)}">
          <td style="width:28px;">
            <span class="status-dot ${d.online ? 'online' : 'offline'}" title="${d.online ? 'Online' : 'Offline'}"></span>
          </td>
          <td>
            <span class="cell-primary">${esc(name)}</span>
            ${showSecondaryHost ? `<span class="cell-sub mono">${esc(d.hostname)}</span>` : ''}
          </td>
          <td class="mono">${esc(d.ip || '—')}</td>
          <td class="mono muted" style="font-size:0.78rem;">${esc(d.mac)}</td>
          <td>
            ${connectionBadge(d.connection)}
            ${d.ssid ? `<span class="cell-sub">${esc(d.ssid)}</span>` : ''}
          </td>
          <td>${signalHtml}</td>
          <td class="mono" style="font-size:0.78rem;">
            <span>↑ ${fmtCompact(d.tx_packets)}</span>
            <span class="cell-sub">↓ ${fmtCompact(d.rx_packets)}</span>
          </td>
          <td class="mono" style="font-size:0.78rem;">
            <span>${fmtCount(d.dns_today)} DNS</span>
            <span class="cell-sub">${fmtCount(d.flows_today)} flows</span>
          </td>
          <td class="mono muted" title="${esc(fmtIstDateTime(d.last_seen))}">${esc(fmtRelative(d.last_seen))}</td>
        </tr>
      `;
    })
    .join('');

  els.devTableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th aria-label="Status"></th>
          <th>Device</th>
          <th>IP</th>
          <th>MAC</th>
          <th>Link</th>
          <th>Signal</th>
          <th>Packets</th>
          <th>Today</th>
          <th>Last Seen</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Rendering: DNS Traffic Tab ───────────────────────────────────────────────

function renderDnsTab(data: OverviewPayload): void {
  const hasFilter = Boolean(state.dnsQ || state.dnsMac);
  els.dnsTopMeta.textContent = data.top_domains.length
    ? `${fmtCount(data.summary.dns_queries_today)} total · ${fmtCount(data.summary.dns_unique_domains)} unique`
    : '';
  els.dnsTopDomains.innerHTML = renderTopDomainsList(data.top_domains.slice(0, 12), true);

  els.dnsLogMeta.textContent = `${fmtCount(data.dns_logs.length)} shown${hasFilter ? ' (filtered)' : ''}`;

  if (!data.dns_logs.length) {
    if (hasFilter) {
      els.dnsLogWrap.innerHTML = `
        <div class="empty">
          No DNS queries match the current filter.
        </div>
      `;
    } else {
      els.dnsLogWrap.innerHTML = `
        <div class="empty">
          <strong>No DNS queries captured for ${esc(data.day)}.</strong>
          <div class="empty-hint">
            To log per-device DNS traffic, enable your collector's local UDP DNS proxy (listening on port <code>53</code>) and point your router's DHCP DNS server (or individual devices' DNS settings) to the collector's LAN IP so queries are recorded before forwarding upstream.
          </div>
        </div>
      `;
    }
    return;
  }

  const rows = data.dns_logs
    .map((row) => {
      const devName = row.client_name || row.client_ip;
      const devHtml = row.client_mac
        ? `<button type="button" class="bar-label-btn" data-open-mac="${esc(row.client_mac)}">${esc(devName)}</button>`
        : `<span>${esc(devName)}</span>`;
      return `
        <tr>
          <td class="mono muted" title="${esc(fmtIstDateTime(row.at))}">${esc(fmtIstTime(row.at))}</td>
          <td>
            ${devHtml}
            ${row.client_name && row.client_name !== row.client_ip ? `<span class="cell-sub mono">${esc(row.client_ip)}</span>` : ''}
          </td>
          <td class="mono cell-wrap">${esc(row.domain)}</td>
          <td class="mono">${esc(row.qtype)}</td>
          <td>${rcodeBadge(row.rcode)}</td>
          <td class="mono muted cell-trunc" title="${esc(row.answer ?? '')}">${esc(row.answer || '—')}</td>
          <td><span class="badge badge-muted mono">${esc(row.source)}</span></td>
        </tr>
      `;
    })
    .join('');

  els.dnsLogWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Time IST</th>
          <th>Device</th>
          <th>Domain</th>
          <th>Type</th>
          <th>Status</th>
          <th>Answer</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Rendering: Connections Tab ───────────────────────────────────────────────

function renderFlowsTab(data: OverviewPayload): void {
  const hasFilter = Boolean(state.flowQ || state.flowMac);
  els.flowTopMeta.textContent = data.top_destinations.length
    ? `${fmtCount(data.summary.flows_today)} flows today`
    : '';
  els.flowTopDests.innerHTML = renderTopDestinationsList(data.top_destinations.slice(0, 12));

  els.flowLogMeta.textContent = `${fmtCount(data.flow_logs.length)} shown${hasFilter ? ' (filtered)' : ''}`;

  if (!data.flow_logs.length) {
    els.flowLogWrap.innerHTML = hasFilter
      ? '<div class="empty">No connections match the current filter.</div>'
      : `<div class="empty">No connection flows recorded for ${esc(data.day)}.</div>`;
    return;
  }

  const rows = data.flow_logs
    .map((f) => {
      const devName = f.client_name || f.client_ip;
      const devHtml = f.client_mac
        ? `<button type="button" class="bar-label-btn" data-open-mac="${esc(f.client_mac)}">${esc(devName)}</button>`
        : `<span>${esc(devName)}</span>`;
      const ipPort = `${f.dst_ip}:${f.dst_port}`;
      const destHtml = f.sni_or_host
        ? `<span class="cell-primary mono cell-wrap">${esc(f.sni_or_host)}</span><span class="cell-sub mono">${esc(ipPort)}</span>`
        : `<span class="mono">${esc(ipPort)}</span>`;
      const trafficHtml =
        f.bytes_rx || f.bytes_tx
          ? `<span class="mono">↓ ${fmtBytes(f.bytes_rx)}</span><span class="cell-sub mono">↑ ${fmtBytes(f.bytes_tx)} · ${fmtCompact(f.packets)} pkt</span>`
          : `<span class="mono muted">${fmtCompact(f.packets)} pkt</span>`;

      return `
        <tr>
          <td class="mono muted" title="${esc(fmtIstDateTime(f.at))}">${esc(fmtIstTime(f.at))}</td>
          <td>
            ${devHtml}
            ${f.client_name && f.client_name !== f.client_ip ? `<span class="cell-sub mono">${esc(f.client_ip)}</span>` : ''}
          </td>
          <td>${destHtml}</td>
          <td><span class="badge badge-muted mono">${esc(f.proto.toUpperCase())}</span></td>
          <td>${trafficHtml}</td>
          <td><span class="badge badge-muted mono">${esc(f.source)}</span></td>
        </tr>
      `;
    })
    .join('');

  els.flowLogWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Time IST</th>
          <th>Device</th>
          <th>Destination</th>
          <th>Proto</th>
          <th>Traffic</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Rendering: Router & Syslog Tab ───────────────────────────────────────────

function renderRouterTab(data: OverviewPayload): void {
  const r = data.router;
  if (!r) {
    els.routerCards.innerHTML = `
      <article class="card" style="grid-column: 1 / -1;">
        <div class="empty">No router snapshot recorded for ${esc(data.day)}.</div>
      </article>
    `;
  } else {
    const rxState = gponRxState(r.gpon_rx_dbm);
    const dropCls = r.wan_dropped > 0 ? 'text-warn' : '';
    els.routerCards.innerHTML = `
      <article class="card">
        <div class="card-head">
          <h2 class="card-title">WAN Interface</h2>
          <span class="card-meta mono">${esc(fmtIstTime(r.at))} IST</span>
        </div>
        <div class="card-body">
          <div class="kv-grid">
            <div class="kv-item">
              <span class="kv-k">WAN IP</span>
              <span class="kv-v mono">${esc(r.wan_ip || '—')}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Uptime</span>
              <span class="kv-v mono">${esc(r.uptime_str || '—')}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Total RX</span>
              <span class="kv-v mono">${fmtBytes(r.wan_rx_bytes)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Total TX</span>
              <span class="kv-v mono">${fmtBytes(r.wan_tx_bytes)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Packets (RX / TX)</span>
              <span class="kv-v mono">${fmtCompact(r.wan_rx_packets)} / ${fmtCompact(r.wan_tx_packets)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Dropped</span>
              <span class="kv-v mono ${dropCls}">${fmtCount(r.wan_dropped)}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <h2 class="card-title">GPON Optical</h2>
          <span class="badge ${rxState.cls === 'text-ok' ? 'badge-ok' : rxState.cls === 'text-warn' ? 'badge-warn' : rxState.cls === 'text-bad' ? 'badge-bad' : 'badge-muted'}">${esc(rxState.label)}</span>
        </div>
        <div class="card-body">
          <div class="kv-grid">
            <div class="kv-item">
              <span class="kv-k">Optical RX</span>
              <span class="kv-v mono ${rxState.cls}">${r.gpon_rx_dbm !== null ? `${r.gpon_rx_dbm.toFixed(2)} dBm` : '—'}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Optical TX</span>
              <span class="kv-v mono">${r.gpon_tx_dbm !== null ? `${r.gpon_tx_dbm.toFixed(2)} dBm` : '—'}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Temperature</span>
              <span class="kv-v mono">${r.gpon_temp_c !== null ? `${r.gpon_temp_c.toFixed(1)} °C` : '—'}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Voltage</span>
              <span class="kv-v mono">${r.gpon_voltage_v !== null ? `${r.gpon_voltage_v.toFixed(2)} V` : '—'}</span>
            </div>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <h2 class="card-title">LAN Ports</h2>
          <span class="card-meta mono">${fmtCount(r.active_devices)} active</span>
        </div>
        <div class="card-body">
          <div class="kv-grid">
            <div class="kv-item">
              <span class="kv-k">Port 1 RX</span>
              <span class="kv-v mono">${fmtBytes(r.lan1_rx_bytes)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Port 1 TX</span>
              <span class="kv-v mono">${fmtBytes(r.lan1_tx_bytes)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Port 2 RX</span>
              <span class="kv-v mono">${fmtBytes(r.lan2_rx_bytes)}</span>
            </div>
            <div class="kv-item">
              <span class="kv-k">Port 2 TX</span>
              <span class="kv-v mono">${fmtBytes(r.lan2_tx_bytes)}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // Collectors
  els.collectorsMeta.textContent = `${data.collectors.length} registered`;
  if (!data.collectors.length) {
    els.collectorsList.innerHTML = '<div class="empty">No collectors have checked in yet.</div>';
  } else {
    els.collectorsList.innerHTML = data.collectors
      .map((c) => {
        const d = parseUtc(c.last_seen);
        const ageSec = d ? Math.max(0, (Date.now() - d.getTime()) / 1000) : Infinity;
        const stateCls = ageSec < 120 ? 'badge-ok' : ageSec < 900 ? 'badge-warn' : 'badge-muted';
        const stateLabel = ageSec < 120 ? 'Live' : ageSec < 900 ? 'Delayed' : 'Offline';

        let metaBadges = '';
        if (c.meta_json) {
          try {
            const parsed = JSON.parse(c.meta_json) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const tags = Object.entries(parsed)
                .slice(0, 10)
                .map(([k, v]) => {
                  const valStr = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
                  return `<span class="badge badge-muted mono">${esc(k)}: ${esc(valStr)}</span>`;
                })
                .join('');
              if (tags) metaBadges = `<div class="collector-meta-tags">${tags}</div>`;
            }
          } catch {
            metaBadges = `<div class="collector-meta-tags"><span class="badge badge-muted mono">${esc(c.meta_json)}</span></div>`;
          }
        }

        return `
          <div class="collector-row">
            <div>
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <span class="cell-primary">${esc(c.label || c.id)}</span>
                <span class="badge badge-accent mono">${esc(c.kind)}</span>
                <span class="mono muted" style="font-size:0.75rem;">${esc(c.id)}</span>
              </div>
              ${metaBadges}
            </div>
            <div style="text-align:right;">
              <span class="badge ${stateCls}">${stateLabel}</span>
              <span class="cell-sub mono" title="${esc(fmtIstDateTime(c.last_seen))}">${esc(fmtRelative(c.last_seen))}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Syslog
  const syslogFiltered = data.syslog.filter((row) => {
    if (state.syslogSev === 'all') return true;
    return syslogSeverityGroup(row.severity) === state.syslogSev;
  });
  els.syslogMeta.textContent = `${fmtCount(syslogFiltered.length)} / ${fmtCount(data.syslog.length)}`;

  if (!syslogFiltered.length) {
    els.syslogWrap.innerHTML = `<div class="empty">${
      data.syslog.length ? 'No syslog lines match this severity filter.' : 'No router syslog entries recorded on this day.'
    }</div>`;
    return;
  }

  const rows = syslogFiltered
    .map(
      (s) => `
      <tr>
        <td class="mono muted" style="white-space:nowrap;" title="${esc(fmtIstDateTime(s.at))}">${esc(fmtIstTime(s.at))}</td>
        <td>${severityBadge(s.severity)}</td>
        <td class="mono muted" style="white-space:nowrap;">${esc(s.facility || '—')}</td>
        <td class="mono cell-wrap" style="font-size:0.8rem;">${esc(s.message)}</td>
      </tr>
    `
    )
    .join('');

  els.syslogWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Time IST</th>
          <th>Severity</th>
          <th>Facility</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Rendering: Device Inspector Drawer ───────────────────────────────────────

function openDeviceDrawer(mac: string): void {
  state.openMac = mac;
  state.deviceDetail = null;
  els.drawerBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';

  const cached = state.data?.devices.find((d) => d.mac === mac);
  els.drawerTitle.innerHTML = `
    <span class="status-dot ${cached?.online ? 'online' : 'offline'}"></span>
    <span>${esc(cached ? deviceLabel(cached) : mac)}</span>
  `;
  els.drawerSub.innerHTML = `<span class="mono">${esc(mac)}</span>${
    cached?.ip ? `<span>·</span><span class="mono">${esc(cached.ip)}</span>` : ''
  }`;
  els.drawerBody.innerHTML = '<div class="loading-note">Loading device inspector…</div>';

  void fetchDeviceDetail(mac);
}

function closeDeviceDrawer(): void {
  state.openMac = null;
  state.deviceDetail = null;
  els.drawerBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function renderDrawer(detail: DeviceDetailPayload): void {
  const d = detail.device;
  if (!d) {
    els.drawerBody.innerHTML = '<div class="empty">Device not found.</div>';
    return;
  }

  const display = deviceLabel(d);
  els.drawerTitle.innerHTML = `
    <span class="status-dot ${d.online ? 'online' : 'offline'}"></span>
    <span>${esc(display)}</span>
  `;
  els.drawerSub.innerHTML = `
    <span class="mono">${esc(d.mac)}</span>
    ${d.ip ? `<span>·</span><span class="mono">${esc(d.ip)}</span>` : ''}
    ${connectionBadge(d.connection)}
  `;

  const topDomainsHtml = renderTopDomainsList(detail.top_domains.slice(0, 10), false);

  const eventsHtml = detail.events.length
    ? `<ul class="event-list">${detail.events
        .slice(0, 20)
        .map((ev) => {
          const info = [ev.ip, ev.detail].filter(Boolean).join(' · ');
          return `
            <li class="event-item">
              <div class="event-main">
                ${eventBadge(ev.event)}
                <span class="event-text mono">${esc(info || 'State change')}</span>
              </div>
              <span class="event-time mono" title="${esc(fmtIstDateTime(ev.at))}">${esc(fmtIstTime(ev.at))}</span>
            </li>
          `;
        })
        .join('')}</ul>`
    : '<div class="empty">No connectivity events for this device on this day.</div>';

  const recentDnsHtml = detail.recent_dns.length
    ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Time IST</th><th>Domain</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>${detail.recent_dns
          .slice(0, 30)
          .map(
            (q) => `
            <tr>
              <td class="mono muted">${esc(fmtIstTime(q.at))}</td>
              <td class="mono cell-wrap">${esc(q.domain)}${q.answer ? `<span class="cell-sub">${esc(q.answer)}</span>` : ''}</td>
              <td class="mono">${esc(q.qtype)}</td>
              <td>${rcodeBadge(q.rcode)}</td>
            </tr>
          `
          )
          .join('')}</tbody>
      </table></div>`
    : '<div class="empty">No DNS queries recorded for this device today.</div>';

  const recentFlowsHtml = detail.recent_flows.length
    ? `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Time IST</th><th>Destination</th><th>Proto</th><th>Traffic</th></tr></thead>
        <tbody>${detail.recent_flows
          .slice(0, 30)
          .map((f) => {
            const ipPort = `${f.dst_ip}:${f.dst_port}`;
            return `
              <tr>
                <td class="mono muted">${esc(fmtIstTime(f.at))}</td>
                <td class="mono cell-wrap">${
                  f.sni_or_host
                    ? `${esc(f.sni_or_host)}<span class="cell-sub">${esc(ipPort)}</span>`
                    : esc(ipPort)
                }</td>
                <td><span class="badge badge-muted mono">${esc(f.proto.toUpperCase())}</span></td>
                <td class="mono">${f.bytes_rx || f.bytes_tx ? `↓${fmtBytes(f.bytes_rx)} ↑${fmtBytes(f.bytes_tx)}` : `${fmtCompact(f.packets)} pkt`}</td>
              </tr>
            `;
          })
          .join('')}</tbody>
      </table></div>`
    : '<div class="empty">No flows recorded for this device today.</div>';

  els.drawerBody.innerHTML = `
    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Nickname</h3>
        <span class="rename-status" id="drawer-rename-status"></span>
      </div>
      <div class="card-body">
        <form class="rename-form" id="drawer-rename-form">
          <input
            id="drawer-name-input"
            class="input"
            type="text"
            maxlength="64"
            value="${esc(d.custom_name ?? '')}"
            placeholder="${esc(d.hostname ? `Default: ${d.hostname}` : 'Give this device a name…')}"
            aria-label="Device nickname"
          />
          <button class="btn btn-primary btn-sm" type="submit" id="drawer-rename-submit">Save</button>
          ${d.custom_name ? '<button class="btn btn-sm btn-ghost" type="button" id="drawer-rename-clear">Reset</button>' : ''}
        </form>
      </div>
    </article>

    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Connection &amp; Metadata</h3>
        <div class="drawer-actions">
          <button type="button" class="btn btn-sm" data-jump-dns="${esc(d.mac)}">View DNS</button>
          <button type="button" class="btn btn-sm" data-jump-flows="${esc(d.mac)}">View Flows</button>
        </div>
      </div>
      <div class="card-body">
        <div class="kv-grid">
          <div class="kv-item"><span class="kv-k">IP Address</span><span class="kv-v mono">${esc(d.ip || '—')}</span></div>
          <div class="kv-item"><span class="kv-k">MAC Address</span><span class="kv-v mono">${esc(d.mac)}</span></div>
          <div class="kv-item"><span class="kv-k">Hostname</span><span class="kv-v mono">${esc(d.hostname || '—')}</span></div>
          <div class="kv-item"><span class="kv-k">SSID / Link</span><span class="kv-v">${connectionBadge(d.connection)} ${d.ssid ? `<span class="mono" style="font-size:0.82rem;margin-left:0.25rem;">${esc(d.ssid)}</span>` : ''}</span></div>
          <div class="kv-item"><span class="kv-k">RSSI</span><span class="kv-v mono ${rssiClass(d.rssi)}">${d.rssi !== null ? `${d.rssi} dBm` : '—'}</span></div>
          <div class="kv-item"><span class="kv-k">TX Rate</span><span class="kv-v mono">${d.tx_rate_mbps !== null ? `${Math.round(d.tx_rate_mbps)} Mbps` : '—'}</span></div>
          <div class="kv-item"><span class="kv-k">Packets (TX / RX)</span><span class="kv-v mono">${fmtCount(d.tx_packets)} / ${fmtCount(d.rx_packets)}</span></div>
          <div class="kv-item"><span class="kv-k">Activity (${esc(detail.day)})</span><span class="kv-v mono">${fmtCount(d.dns_today)} DNS · ${fmtCount(d.flows_today)} flows</span></div>
          <div class="kv-item"><span class="kv-k">First Seen</span><span class="kv-v mono" style="font-size:0.8rem;">${esc(fmtIstDateTime(d.first_seen))}</span></div>
          <div class="kv-item"><span class="kv-k">Last Seen</span><span class="kv-v mono" style="font-size:0.8rem;">${esc(fmtRelative(d.last_seen))} (${esc(fmtIstTime(d.last_seen))})</span></div>
        </div>
      </div>
    </article>

    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Top Domains</h3>
        <span class="card-meta mono">${detail.top_domains.length}</span>
      </div>
      <div class="card-body">${topDomainsHtml}</div>
    </article>

    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Event Timeline</h3>
        <span class="card-meta mono">${detail.events.length}</span>
      </div>
      <div class="card-body card-body-flush">${eventsHtml}</div>
    </article>

    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Recent DNS Queries</h3>
        <span class="card-meta mono">${detail.recent_dns.length}</span>
      </div>
      <div class="card-body card-body-flush">${recentDnsHtml}</div>
    </article>

    <article class="card" style="margin-bottom:0;">
      <div class="card-head">
        <h3 class="card-title">Recent Connections</h3>
        <span class="card-meta mono">${detail.recent_flows.length}</span>
      </div>
      <div class="card-body card-body-flush">${recentFlowsHtml}</div>
    </article>
  `;

  const renameForm = document.getElementById('drawer-rename-form') as HTMLFormElement | null;
  const nameInput = document.getElementById('drawer-name-input') as HTMLInputElement | null;
  const statusEl = document.getElementById('drawer-rename-status') as HTMLSpanElement | null;
  const submitBtn = document.getElementById('drawer-rename-submit') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('drawer-rename-clear') as HTMLButtonElement | null;

  const performSave = async (nextName: string) => {
    if (!statusEl || !submitBtn) return;
    submitBtn.disabled = true;
    statusEl.className = 'rename-status muted';
    statusEl.textContent = 'Saving…';
    try {
      await saveDeviceName(d.mac, nextName);
      if (state.deviceDetail) {
        renderDrawer(state.deviceDetail);
        const freshStatus = document.getElementById('drawer-rename-status');
        if (freshStatus) {
          freshStatus.className = 'rename-status text-ok';
          freshStatus.textContent = 'Saved';
        }
      }
    } catch (err) {
      submitBtn.disabled = false;
      statusEl.className = 'rename-status text-bad';
      statusEl.textContent = err instanceof Error ? err.message : 'Save failed';
    }
  };

  renameForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    void performSave(nameInput?.value.trim() ?? '');
  });

  clearBtn?.addEventListener('click', () => {
    void performSave('');
  });
}

// ── Full Render Dispatch ─────────────────────────────────────────────────────

function renderAll(): void {
  const data = state.data;
  if (!data) return;
  renderCollectorPill(data.collectors);
  renderDaySelect(data);
  renderTabBadges(data);
  renderDeviceSelects(data.devices);
  renderOverview(data);
  renderDevices(data);
  renderDnsTab(data);
  renderFlowsTab(data);
  renderRouterTab(data);
}

// ── Tab Switching & Auto-Refresh ─────────────────────────────────────────────

function switchTab(next: TabId): void {
  state.tab = next;
  document.querySelectorAll<HTMLButtonElement>('.tab[data-tab]').forEach((btn) => {
    const selected = btn.dataset.tab === next;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  const panels: TabId[] = ['overview', 'devices', 'dns', 'flows', 'router'];
  for (const id of panels) {
    const panel = document.getElementById(`panel-${id}`);
    if (panel) panel.hidden = id !== next;
  }

  const { key } = buildOverviewUrl();
  if (key !== state.lastQueryKey) {
    void fetchOverview(false);
  }
}

function syncAutoTimer(): void {
  if (autoTimer !== null) {
    window.clearInterval(autoTimer);
    autoTimer = null;
  }
  if (state.autoRefresh) {
    els.autoBtn.classList.add('btn-active');
    els.autoBtn.setAttribute('aria-pressed', 'true');
    els.autoBtn.textContent = 'Auto 15s: On';
    autoTimer = window.setInterval(() => {
      if (!document.hidden) {
        void fetchOverview(false);
      }
    }, AUTO_REFRESH_MS);
  } else {
    els.autoBtn.classList.remove('btn-active');
    els.autoBtn.setAttribute('aria-pressed', 'false');
    els.autoBtn.textContent = 'Auto 15s: Off';
  }
}

// ── Event Wiring ─────────────────────────────────────────────────────────────

function init(): void {
  // Tabs
  document.querySelectorAll<HTMLButtonElement>('.tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tab as TabId | undefined;
      if (id) switchTab(id);
    });
  });

  // Header controls
  els.daySelect.addEventListener('change', () => {
    state.day = els.daySelect.value;
    void fetchOverview(false);
    if (state.openMac) void fetchDeviceDetail(state.openMac);
  });

  els.autoBtn.addEventListener('click', () => {
    state.autoRefresh = !state.autoRefresh;
    syncAutoTimer();
  });

  els.refreshBtn.addEventListener('click', () => {
    void fetchOverview(true);
    if (state.openMac) void fetchDeviceDetail(state.openMac);
  });

  els.bannerRetry.addEventListener('click', () => {
    void fetchOverview(true);
  });

  els.logoutBtn.addEventListener('click', () => {
    void logout(false);
  });

  els.logoutAllBtn.addEventListener('click', () => {
    if (window.confirm('Sign out of all active /net sessions across devices?')) {
      void logout(true);
    }
  });

  // Devices client-side filter
  els.devSearch.addEventListener('input', () => {
    state.devSearch = els.devSearch.value;
    if (state.data) renderDevices(state.data);
  });

  els.devOnlineOnly.addEventListener('change', () => {
    state.devOnlineOnly = els.devOnlineOnly.checked;
    if (state.data) renderDevices(state.data);
  });

  // DNS server-side filter
  els.dnsFilterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.dnsQ = els.dnsSearch.value.trim();
    state.dnsMac = els.dnsMacSelect.value;
    void fetchOverview(false);
  });

  els.dnsMacSelect.addEventListener('change', () => {
    state.dnsMac = els.dnsMacSelect.value;
    state.dnsQ = els.dnsSearch.value.trim();
    void fetchOverview(false);
  });

  els.dnsClearBtn.addEventListener('click', () => {
    state.dnsQ = '';
    state.dnsMac = '';
    els.dnsSearch.value = '';
    els.dnsMacSelect.value = '';
    void fetchOverview(false);
  });

  // Flows server-side filter
  els.flowFilterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.flowQ = els.flowSearch.value.trim();
    state.flowMac = els.flowMacSelect.value;
    void fetchOverview(false);
  });

  els.flowMacSelect.addEventListener('change', () => {
    state.flowMac = els.flowMacSelect.value;
    state.flowQ = els.flowSearch.value.trim();
    void fetchOverview(false);
  });

  els.flowClearBtn.addEventListener('click', () => {
    state.flowQ = '';
    state.flowMac = '';
    els.flowSearch.value = '';
    els.flowMacSelect.value = '';
    void fetchOverview(false);
  });

  // Syslog severity pills
  els.syslogSevPills.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sev-pill[data-sev]');
    if (!btn) return;
    const sev = btn.dataset.sev as AppState['syslogSev'] | undefined;
    if (!sev) return;
    state.syslogSev = sev;
    els.syslogSevPills.querySelectorAll('.sev-pill').forEach((p) => {
      p.classList.toggle('active', p === btn);
    });
    if (state.data) renderRouterTab(state.data);
  });

  // Delegated clicks: open device inspector, jump to DNS/Flows filter
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const jumpDns = target.closest<HTMLElement>('[data-jump-dns]');
    if (jumpDns?.dataset.jumpDns) {
      state.dnsMac = jumpDns.dataset.jumpDns;
      state.dnsQ = '';
      els.dnsSearch.value = '';
      els.dnsMacSelect.value = state.dnsMac;
      closeDeviceDrawer();
      switchTab('dns');
      return;
    }

    const jumpFlows = target.closest<HTMLElement>('[data-jump-flows]');
    if (jumpFlows?.dataset.jumpFlows) {
      state.flowMac = jumpFlows.dataset.jumpFlows;
      state.flowQ = '';
      els.flowSearch.value = '';
      els.flowMacSelect.value = state.flowMac;
      closeDeviceDrawer();
      switchTab('flows');
      return;
    }

    const filterDns = target.closest<HTMLElement>('[data-filter-dns]');
    if (filterDns?.dataset.filterDns) {
      state.dnsQ = filterDns.dataset.filterDns;
      els.dnsSearch.value = state.dnsQ;
      switchTab('dns');
      return;
    }

    const filterFlow = target.closest<HTMLElement>('[data-filter-flow]');
    if (filterFlow?.dataset.filterFlow) {
      state.flowQ = filterFlow.dataset.filterFlow;
      els.flowSearch.value = state.flowQ;
      switchTab('flows');
      return;
    }

    const openMacEl = target.closest<HTMLElement>('[data-open-mac]');
    if (openMacEl?.dataset.openMac) {
      openDeviceDrawer(openMacEl.dataset.openMac);
    }
  });

  // Drawer close controls
  els.drawerClose.addEventListener('click', closeDeviceDrawer);
  els.drawerBackdrop.addEventListener('click', (e) => {
    if (e.target === els.drawerBackdrop) closeDeviceDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.openMac) closeDeviceDrawer();
  });

  // Refresh when returning to tab if auto-refresh is enabled
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.autoRefresh) {
      void fetchOverview(false);
    }
  });

  syncAutoTimer();
  void fetchOverview(false);
}

init();
