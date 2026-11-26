export const prerender = false;

/**
 * POST /net/api/ingest — write-only collector ingest endpoint.
 *
 * Designed to be called every ~30s by any collector (Linux/ThinkPad Python
 * script today; ESP32, Raspberry Pi, or OpenWrt later).
 *
 * Authenticates with Bearer NETMON_INGEST_TOKEN (constant-time compare).
 * Writes are batched to stay safely inside Cloudflare D1 parameter & statement
 * budgets.
 */
import type { APIRoute } from 'astro';
import { env as getEnv, hostAllowed, istDay, json, normMac, sameString, stableKey } from '../../../lib/netmon/guard';

const MAX_DEVICES = 80;
const MAX_DNS = 120;
const MAX_FLOWS = 90;
const MAX_SYSLOG = 60;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function asInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function asNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asStr(v: unknown, maxLen: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, maxLen) : null;
}

function parseAt(raw: unknown, fallback: Date): { iso: string; day: string } {
  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && Math.abs(d.getTime() - fallback.getTime()) < 7 * 86400_000) {
      return { iso: d.toISOString(), day: istDay(d) };
    }
  }
  return { iso: fallback.toISOString(), day: istDay(fallback) };
}

export const POST: APIRoute = async (ctx) => {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });

  const e = getEnv(ctx);
  const db = e.NETMON_DB;
  const token = e.NETMON_INGEST_TOKEN;
  if (!db || !token) return json({ error: 'netmon not configured' }, 503);

  const auth = ctx.request.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!presented || !sameString(presented, token)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const today = istDay(now);

  const stats = { devices: 0, events: 0, router: 0, dns: 0, flows: 0, syslog: 0 };

  try {
    // 1. Collector heartbeat
    const col = body?.collector;
    if (col && typeof col === 'object') {
      const cid = asStr(col.id, 64) ?? 'default';
      const label = asStr(col.label, 80) ?? cid;
      const kind = asStr(col.kind, 32) ?? 'linux';
      const meta = col.meta ? JSON.stringify(col.meta).slice(0, 1000) : null;
      await db
        .prepare(
          `INSERT INTO net_collector (id, label, kind, last_seen, meta_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             label = excluded.label, kind = excluded.kind,
             last_seen = excluded.last_seen, meta_json = excluded.meta_json`,
        )
        .bind(cid, label, kind, nowIso, meta)
        .run();
    }

    // Load current known devices so we can diff online/offline/ip changes and enrich DNS/flows
    const existingRows = await db
      .prepare('SELECT mac, ip, hostname, custom_name, online FROM net_device')
      .all<{ mac: string; ip: string | null; hostname: string | null; custom_name: string | null; online: number }>();

    const byMac = new Map<string, { ip: string | null; hostname: string | null; custom_name: string | null; online: number }>();
    const byIp = new Map<string, { mac: string; name: string }>();
    for (const r of existingRows.results ?? []) {
      byMac.set(r.mac, r);
      if (r.ip) byIp.set(r.ip, { mac: r.mac, name: r.custom_name || r.hostname || r.mac });
    }

    // 2. Devices + automatic join/leave/new-device events
    const rawDevices: any[] = Array.isArray(body?.devices) ? body.devices.slice(0, MAX_DEVICES) : [];
    const deviceEvents: Array<{ id: string; mac: string; event: string; ip: string | null; detail: string | null }> = [];
    const seenOnlineMacs = new Set<string>();
    const cleanDevices: Array<{
      mac: string;
      hostname: string | null;
      ip: string | null;
      connection: string;
      ssid: string | null;
      rssi: number | null;
      tx_rate_mbps: number | null;
      tx_packets: number;
      rx_packets: number;
      online: number;
    }> = [];

    for (const d of rawDevices) {
      const mac = normMac(d?.mac);
      if (!mac) continue;
      const ip = asStr(d.ip, 45);
      const hostname = asStr(d.hostname, 96);
      const conn = ['wifi_5g', 'wifi_2g', 'lan', 'unknown'].includes(d.connection) ? d.connection : 'unknown';
      const ssid = asStr(d.ssid, 64);
      const rssi = asNumOrNull(d.rssi) !== null ? asInt(d.rssi) : null;
      const txRate = asNumOrNull(d.tx_rate_mbps) !== null ? asInt(d.tx_rate_mbps) : null;
      const txPkts = Math.max(0, asInt(d.tx_packets, 0));
      const rxPkts = Math.max(0, asInt(d.rx_packets, 0));
      const online = d.online ? 1 : 0;

      if (online) seenOnlineMacs.add(mac);

      const prev = byMac.get(mac);
      if (!prev) {
        deviceEvents.push({
          id: stableKey('ev', mac, 'new', nowIso),
          mac,
          event: 'new',
          ip,
          detail: hostname || ssid || conn,
        });
      } else {
        if (online === 1 && prev.online === 0) {
          deviceEvents.push({
            id: stableKey('ev', mac, 'online', nowIso),
            mac,
            event: 'online',
            ip,
            detail: ssid ? `${conn} (${ssid})` : conn,
          });
        } else if (online === 0 && prev.online === 1) {
          deviceEvents.push({
            id: stableKey('ev', mac, 'offline', nowIso),
            mac,
            event: 'offline',
            ip: prev.ip,
            detail: prev.hostname,
          });
        }
        if (ip && prev.ip && ip !== prev.ip) {
          deviceEvents.push({
            id: stableKey('ev', mac, 'ip_change', nowIso),
            mac,
            event: 'ip_change',
            ip,
            detail: `${prev.ip} -> ${ip}`,
          });
        }
      }

      cleanDevices.push({
        mac,
        hostname,
        ip,
        connection: conn,
        ssid,
        rssi,
        tx_rate_mbps: txRate,
        tx_packets: txPkts,
        rx_packets: rxPkts,
        online,
      });

      if (ip) {
        const displayName = prev?.custom_name || hostname || prev?.hostname || mac;
        byIp.set(ip, { mac, name: displayName });
      }
    }

    // If a full router device snapshot was sent, mark previously-online devices missing from snapshot as offline
    const fullSnapshot = Boolean(body?.full_device_snapshot) && cleanDevices.length > 0;
    const wentOfflineMacs: string[] = [];
    if (fullSnapshot) {
      const inPayload = new Set(cleanDevices.map((d) => d.mac));
      for (const [mac, prev] of byMac.entries()) {
        if (prev.online === 1 && !inPayload.has(mac)) {
          wentOfflineMacs.push(mac);
          deviceEvents.push({
            id: stableKey('ev', mac, 'offline', nowIso),
            mac,
            event: 'offline',
            ip: prev.ip,
            detail: prev.hostname,
          });
        }
      }
    }

    // Batch upsert devices (7 rows × 13 cols = 91 params)
    for (const group of chunk(cleanDevices, 7)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((d) => [
        d.mac,
        d.hostname,
        null, // custom_name preserved on conflict
        d.ip,
        d.connection,
        d.ssid,
        d.rssi,
        d.tx_rate_mbps,
        d.tx_packets,
        d.rx_packets,
        d.online,
        nowIso,
        nowIso,
      ]);
      await db
        .prepare(
          `INSERT INTO net_device
             (mac, hostname, custom_name, ip, connection, ssid, rssi, tx_rate_mbps, tx_packets, rx_packets, online, first_seen, last_seen)
           VALUES ${ph}
           ON CONFLICT(mac) DO UPDATE SET
             hostname     = COALESCE(excluded.hostname, net_device.hostname),
             ip           = COALESCE(excluded.ip, net_device.ip),
             connection   = CASE WHEN excluded.connection != 'unknown' THEN excluded.connection ELSE net_device.connection END,
             ssid         = COALESCE(excluded.ssid, net_device.ssid),
             rssi         = COALESCE(excluded.rssi, net_device.rssi),
             tx_rate_mbps = COALESCE(excluded.tx_rate_mbps, net_device.tx_rate_mbps),
             tx_packets   = CASE WHEN excluded.tx_packets > 0 THEN excluded.tx_packets ELSE net_device.tx_packets END,
             rx_packets   = CASE WHEN excluded.rx_packets > 0 THEN excluded.rx_packets ELSE net_device.rx_packets END,
             online       = excluded.online,
             last_seen    = CASE WHEN excluded.online = 1 THEN excluded.last_seen ELSE net_device.last_seen END`,
        )
        .bind(...binds)
        .run();
      stats.devices += group.length;
    }

    if (wentOfflineMacs.length > 0) {
      const ph = wentOfflineMacs.map(() => '?').join(', ');
      await db.prepare(`UPDATE net_device SET online = 0 WHERE mac IN (${ph})`).bind(...wentOfflineMacs).run();
    }

    // Batch insert device events (12 rows × 7 cols = 84 params)
    for (const group of chunk(deviceEvents.slice(0, 36), 12)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((ev) => [ev.id, ev.mac, ev.event, ev.ip, ev.detail, nowIso, today]);
      await db
        .prepare(
          `INSERT INTO net_device_event (id, mac, event, ip, detail, at, day)
           VALUES ${ph}
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(...binds)
        .run();
      stats.events += group.length;
    }

    // 3. Router sample (WAN / GPON / LAN ports)
    const r = body?.router;
    if (r && typeof r === 'object') {
      const { iso, day } = parseAt(r.at, now);
      const id = stableKey('rs', iso, asStr(r.wan_ip, 45) ?? '');
      await db
        .prepare(
          `INSERT INTO net_router_sample
             (id, at, day, wan_ip, wan_rx_bytes, wan_tx_bytes, wan_rx_rate_bps, wan_tx_rate_bps,
              wan_rx_packets, wan_tx_packets, wan_dropped, gpon_rx_dbm, gpon_tx_dbm, gpon_temp_c,
              gpon_voltage_v, lan1_rx_bytes, lan1_tx_bytes, lan2_rx_bytes, lan2_tx_bytes,
              active_devices, uptime_str)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          iso,
          day,
          asStr(r.wan_ip, 45),
          Math.max(0, asInt(r.wan_rx_bytes, 0)),
          Math.max(0, asInt(r.wan_tx_bytes, 0)),
          Math.max(0, asInt(r.wan_rx_rate_bps, 0)),
          Math.max(0, asInt(r.wan_tx_rate_bps, 0)),
          Math.max(0, asInt(r.wan_rx_packets, 0)),
          Math.max(0, asInt(r.wan_tx_packets, 0)),
          Math.max(0, asInt(r.wan_dropped, 0)),
          asNumOrNull(r.gpon_rx_dbm),
          asNumOrNull(r.gpon_tx_dbm),
          asNumOrNull(r.gpon_temp_c),
          asNumOrNull(r.gpon_voltage_v),
          Math.max(0, asInt(r.lan1_rx_bytes, 0)),
          Math.max(0, asInt(r.lan1_tx_bytes, 0)),
          Math.max(0, asInt(r.lan2_rx_bytes, 0)),
          Math.max(0, asInt(r.lan2_tx_bytes, 0)),
          Math.max(0, asInt(r.active_devices, seenOnlineMacs.size)),
          asStr(r.uptime_str, 64),
        )
        .run();
      stats.router = 1;
    }

    // 4. DNS queries (8 rows × 11 cols = 88 params)
    const rawDns: any[] = Array.isArray(body?.dns) ? body.dns.slice(0, MAX_DNS) : [];
    const cleanDns = rawDns
      .map((q, idx) => {
        const domain = asStr(q?.domain, 253)?.toLowerCase().replace(/\.$/, '');
        const clientIp = asStr(q?.client_ip, 45);
        if (!domain || !clientIp) return null;
        const { iso, day } = parseAt(q.at, now);
        const mapped = byIp.get(clientIp);
        const mac = normMac(q.client_mac) ?? mapped?.mac ?? null;
        const cname = asStr(q.client_name, 96) ?? mapped?.name ?? null;
        const qtype = (asStr(q.qtype, 16) ?? 'A').toUpperCase();
        const rcode = asStr(q.rcode, 24);
        const answer = asStr(q.answer, 128);
        const source = asStr(q.source, 32) ?? 'dns';
        const id = asStr(q.id, 40) ?? stableKey('dns', iso, clientIp, domain, qtype, String(idx));
        return { id, iso, day, clientIp, mac, cname, domain, qtype, rcode, answer, source };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    for (const group of chunk(cleanDns, 8)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((q) => [
        q.id,
        q.iso,
        q.day,
        q.clientIp,
        q.mac,
        q.cname,
        q.domain,
        q.qtype,
        q.rcode,
        q.answer,
        q.source,
      ]);
      await db
        .prepare(
          `INSERT INTO net_dns_query
             (id, at, day, client_ip, client_mac, client_name, domain, qtype, rcode, answer, source)
           VALUES ${ph}
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(...binds)
        .run();
      stats.dns += group.length;
    }

    // 5. Connections / Flows (6 rows × 14 cols = 84 params)
    const rawFlows: any[] = Array.isArray(body?.flows) ? body.flows.slice(0, MAX_FLOWS) : [];
    const cleanFlows = rawFlows
      .map((f, idx) => {
        const clientIp = asStr(f?.client_ip, 45);
        const dstIp = asStr(f?.dst_ip, 45);
        if (!clientIp || !dstIp) return null;
        const { iso, day } = parseAt(f.at, now);
        const mapped = byIp.get(clientIp);
        const mac = normMac(f.client_mac) ?? mapped?.mac ?? null;
        const cname = asStr(f.client_name, 96) ?? mapped?.name ?? null;
        const dstPort = Math.max(0, Math.min(65535, asInt(f.dst_port, 0)));
        const proto = (asStr(f.proto, 12) ?? 'TCP').toUpperCase();
        const sni = asStr(f.sni_or_host, 253);
        const bytesTx = Math.max(0, asInt(f.bytes_tx, 0));
        const bytesRx = Math.max(0, asInt(f.bytes_rx, 0));
        const packets = Math.max(0, asInt(f.packets, 0));
        const source = asStr(f.source, 32) ?? 'host';
        // Deduplicate same flow within the same minute so polling ss/conntrack doesn't explode rows
        const bucketMin = iso.slice(0, 16);
        const id = asStr(f.id, 40) ?? stableKey('fl', bucketMin, clientIp, dstIp, String(dstPort), proto, String(idx));
        return { id, iso, day, clientIp, mac, cname, dstIp, dstPort, proto, sni, bytesTx, bytesRx, packets, source };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    for (const group of chunk(cleanFlows, 6)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((f) => [
        f.id,
        f.iso,
        f.day,
        f.clientIp,
        f.mac,
        f.cname,
        f.dstIp,
        f.dstPort,
        f.proto,
        f.sni,
        f.bytesTx,
        f.bytesRx,
        f.packets,
        f.source,
      ]);
      await db
        .prepare(
          `INSERT INTO net_flow
             (id, at, day, client_ip, client_mac, client_name, dst_ip, dst_port, proto, sni_or_host, bytes_tx, bytes_rx, packets, source)
           VALUES ${ph}
           ON CONFLICT(id) DO UPDATE SET
             at          = excluded.at,
             sni_or_host = COALESCE(excluded.sni_or_host, net_flow.sni_or_host),
             bytes_tx    = MAX(net_flow.bytes_tx, excluded.bytes_tx),
             bytes_rx    = MAX(net_flow.bytes_rx, excluded.bytes_rx),
             packets     = MAX(net_flow.packets, excluded.packets)`,
        )
        .bind(...binds)
        .run();
      stats.flows += group.length;
    }

    // 6. Router syslog (15 rows × 6 cols = 90 params)
    const rawSyslog: any[] = Array.isArray(body?.syslog) ? body.syslog.slice(0, MAX_SYSLOG) : [];
    const cleanSyslog = rawSyslog
      .map((s, idx) => {
        const msg = asStr(s?.message, 500);
        if (!msg) return null;
        const { iso, day } = parseAt(s.at, now);
        const sev = asStr(s.severity, 24) ?? 'info';
        const fac = asStr(s.facility, 32) ?? 'router';
        const id = stableKey('sys', iso, msg, String(idx));
        return { id, iso, day, sev, fac, msg };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    for (const group of chunk(cleanSyslog, 15)) {
      const ph = group.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const binds = group.flatMap((s) => [s.id, s.iso, s.day, s.sev, s.fac, s.msg]);
      await db
        .prepare(
          `INSERT INTO net_syslog (id, at, day, severity, facility, message)
           VALUES ${ph}
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(...binds)
        .run();
      stats.syslog += group.length;
    }

    // 7. Occasional lightweight pruning (~2% of calls) so D1 stays compact
    if (Math.random() < 0.02) {
      const cut14 = istDay(new Date(now.getTime() - 14 * 86400_000));
      const cut30 = istDay(new Date(now.getTime() - 30 * 86400_000));
      await db.batch([
        db.prepare('DELETE FROM net_dns_query WHERE day < ?').bind(cut14),
        db.prepare('DELETE FROM net_flow WHERE day < ?').bind(cut14),
        db.prepare('DELETE FROM net_syslog WHERE day < ?').bind(cut14),
        db.prepare('DELETE FROM net_router_sample WHERE day < ?').bind(cut30),
        db.prepare('DELETE FROM net_device_event WHERE day < ?').bind(cut30),
      ]);
    }
  } catch (err) {
    return json({ error: 'ingest failed', detail: String(err) }, 500);
  }

  return json({ ok: true, ...stats });
};
