export const prerender = false;

/**
 * GET /net/api/overview?day=YYYY-MM-DD&q=&mac=
 *
 * Returns everything the /net dashboard needs in a single batched D1 round-trip.
 */
import type { APIRoute } from 'astro';
import { istDay, json, requireApi } from '../../../lib/netmon/guard';

export const GET: APIRoute = async (ctx) => {
  const gate = await requireApi(ctx);
  if (!gate.ok) return gate.response;
  const { db } = gate;

  const url = ctx.url;
  const rawDay = url.searchParams.get('day') ?? '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : istDay();
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 120);
  const macFilter = (url.searchParams.get('mac') ?? '').trim().toLowerCase();

  try {
    const [
      collectors,
      devices,
      latestRouter,
      routerSeries,
      deviceEvents,
      dnsCountsByMac,
      flowCountsByMac,
      topDomains,
      topDnsClients,
      topDestinations,
      dnsTotal,
      flowTotal,
      syslogRows,
      availableDays,
    ] = await db.batch([
      db.prepare('SELECT id, label, kind, last_seen, meta_json FROM net_collector ORDER BY last_seen DESC LIMIT 10'),
      db.prepare(
        `SELECT mac, hostname, custom_name, ip, connection, ssid, rssi, tx_rate_mbps,
                tx_packets, rx_packets, online, first_seen, last_seen
         FROM net_device
         ORDER BY online DESC, last_seen DESC`,
      ),
      db.prepare('SELECT * FROM net_router_sample ORDER BY at DESC LIMIT 1'),
      db.prepare(
        `SELECT at, wan_rx_rate_bps, wan_tx_rate_bps, gpon_rx_dbm, gpon_temp_c, active_devices,
                wan_rx_bytes, wan_tx_bytes, lan1_rx_bytes, lan1_tx_bytes, lan2_rx_bytes, lan2_tx_bytes
         FROM net_router_sample
         WHERE day = ?
         ORDER BY at ASC
         LIMIT 360`,
      ).bind(day),
      db.prepare(
        `SELECT e.id, e.mac, e.event, e.ip, e.detail, e.at,
                COALESCE(d.custom_name, d.hostname, e.mac) AS device_name
         FROM net_device_event e
         LEFT JOIN net_device d ON d.mac = e.mac
         WHERE e.day = ?
         ORDER BY e.at DESC
         LIMIT 60`,
      ).bind(day),
      db.prepare(
        `SELECT client_mac AS mac, COUNT(*) AS cnt
         FROM net_dns_query
         WHERE day = ? AND client_mac IS NOT NULL
         GROUP BY client_mac`,
      ).bind(day),
      db.prepare(
        `SELECT client_mac AS mac, COUNT(*) AS cnt
         FROM net_flow
         WHERE day = ? AND client_mac IS NOT NULL
         GROUP BY client_mac`,
      ).bind(day),
      db.prepare(
        `SELECT domain, COUNT(*) AS hits, COUNT(DISTINCT client_ip) AS clients, MAX(at) AS last_at
         FROM net_dns_query
         WHERE day = ?
         GROUP BY domain
         ORDER BY hits DESC
         LIMIT 30`,
      ).bind(day),
      db.prepare(
        `SELECT client_ip, COALESCE(MAX(client_name), client_ip) AS client_name,
                MAX(client_mac) AS client_mac, COUNT(*) AS hits, COUNT(DISTINCT domain) AS unique_domains
         FROM net_dns_query
         WHERE day = ?
         GROUP BY client_ip
         ORDER BY hits DESC
         LIMIT 20`,
      ).bind(day),
      db.prepare(
        `SELECT COALESCE(NULLIF(sni_or_host, ''), dst_ip) AS target, dst_ip, dst_port, proto,
                COUNT(*) AS hits, SUM(bytes_tx) AS bytes_tx, SUM(bytes_rx) AS bytes_rx, MAX(at) AS last_at
         FROM net_flow
         WHERE day = ?
         GROUP BY target, dst_port, proto
         ORDER BY hits DESC
         LIMIT 30`,
      ).bind(day),
      db.prepare('SELECT COUNT(*) AS cnt, COUNT(DISTINCT domain) AS uniq FROM net_dns_query WHERE day = ?').bind(day),
      db.prepare('SELECT COUNT(*) AS cnt FROM net_flow WHERE day = ?').bind(day),
      db.prepare('SELECT id, at, severity, facility, message FROM net_syslog WHERE day = ? ORDER BY at DESC LIMIT 100').bind(day),
      db.prepare(
        `SELECT day FROM (
           SELECT DISTINCT day FROM net_router_sample
           UNION SELECT DISTINCT day FROM net_dns_query
           UNION SELECT DISTINCT day FROM net_flow
         ) ORDER BY day DESC LIMIT 14`,
      ),
    ]);

    // Filtered DNS & flow logs
    const dnsConds = ['day = ?'];
    const dnsBinds: unknown[] = [day];
    if (macFilter) {
      dnsConds.push('(client_mac = ? OR client_ip = ?)');
      dnsBinds.push(macFilter, macFilter);
    }
    if (q) {
      dnsConds.push('(LOWER(domain) LIKE ? OR LOWER(COALESCE(client_name, "")) LIKE ? OR client_ip LIKE ? OR LOWER(COALESCE(answer, "")) LIKE ?)');
      const like = `%${q}%`;
      dnsBinds.push(like, like, like, like);
    }

    const flowConds = ['day = ?'];
    const flowBinds: unknown[] = [day];
    if (macFilter) {
      flowConds.push('(client_mac = ? OR client_ip = ?)');
      flowBinds.push(macFilter, macFilter);
    }
    if (q) {
      flowConds.push('(LOWER(COALESCE(sni_or_host, "")) LIKE ? OR dst_ip LIKE ? OR CAST(dst_port AS TEXT) LIKE ? OR LOWER(COALESCE(client_name, "")) LIKE ?)');
      const like = `%${q}%`;
      flowBinds.push(like, like, like, like);
    }

    const [dnsLogs, flowLogs] = await db.batch([
      db
        .prepare(
          `SELECT id, at, client_ip, client_mac, client_name, domain, qtype, rcode, answer, source
           FROM net_dns_query
           WHERE ${dnsConds.join(' AND ')}
           ORDER BY at DESC
           LIMIT 150`,
        )
        .bind(...dnsBinds),
      db
        .prepare(
          `SELECT id, at, client_ip, client_mac, client_name, dst_ip, dst_port, proto, sni_or_host, bytes_tx, bytes_rx, packets, source
           FROM net_flow
           WHERE ${flowConds.join(' AND ')}
           ORDER BY at DESC
           LIMIT 150`,
        )
        .bind(...flowBinds),
    ]);

    const dnsCountMap = new Map<string, number>();
    for (const r of (dnsCountsByMac.results ?? []) as Array<{ mac: string; cnt: number }>) {
      dnsCountMap.set(r.mac, r.cnt);
    }
    const flowCountMap = new Map<string, number>();
    for (const r of (flowCountsByMac.results ?? []) as Array<{ mac: string; cnt: number }>) {
      flowCountMap.set(r.mac, r.cnt);
    }

    const enrichedDevices = ((devices.results ?? []) as any[]).map((d) => ({
      ...d,
      dns_today: dnsCountMap.get(d.mac) ?? 0,
      flows_today: flowCountMap.get(d.mac) ?? 0,
    }));

    const dnsStat = ((dnsTotal.results ?? [])[0] as any) ?? { cnt: 0, uniq: 0 };
    const flowStat = ((flowTotal.results ?? [])[0] as any) ?? { cnt: 0 };

    return json({
      day,
      today: istDay(),
      days: ((availableDays.results ?? []) as Array<{ day: string }>).map((d) => d.day),
      collectors: collectors.results ?? [],
      router: (latestRouter.results ?? [])[0] ?? null,
      router_series: routerSeries.results ?? [],
      devices: enrichedDevices,
      device_events: deviceEvents.results ?? [],
      summary: {
        devices_total: enrichedDevices.length,
        devices_online: enrichedDevices.filter((d) => d.online === 1).length,
        dns_queries_today: dnsStat.cnt ?? 0,
        dns_unique_domains: dnsStat.uniq ?? 0,
        flows_today: flowStat.cnt ?? 0,
      },
      top_domains: topDomains.results ?? [],
      top_dns_clients: topDnsClients.results ?? [],
      top_destinations: topDestinations.results ?? [],
      dns_logs: dnsLogs.results ?? [],
      flow_logs: flowLogs.results ?? [],
      syslog: syslogRows.results ?? [],
    });
  } catch (err) {
    return json({ error: 'query failed', detail: String(err) }, 500);
  }
};
