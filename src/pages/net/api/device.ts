export const prerender = false;

/**
 * GET  /net/api/device?mac=...&day=YYYY-MM-DD — per-device drilldown
 * POST /net/api/device { mac, custom_name }   — set or clear a friendly device nickname
 */
import type { APIRoute } from 'astro';
import { istDay, json, normMac, requireApi } from '../../../lib/netmon/guard';

export const GET: APIRoute = async (ctx) => {
  const gate = await requireApi(ctx);
  if (!gate.ok) return gate.response;
  const { db } = gate;

  const mac = normMac(ctx.url.searchParams.get('mac'));
  if (!mac) return json({ error: 'invalid mac' }, 400);
  const rawDay = ctx.url.searchParams.get('day') ?? '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : istDay();

  const device = await db.prepare('SELECT * FROM net_device WHERE mac = ?').bind(mac).first<any>();
  if (!device) return json({ error: 'device not found' }, 404);

  const ip = device.ip ?? '';

  const [events, topDomains, recentDns, recentFlows] = await db.batch([
    db
      .prepare('SELECT id, event, ip, detail, at, day FROM net_device_event WHERE mac = ? ORDER BY at DESC LIMIT 40')
      .bind(mac),
    db
      .prepare(
        `SELECT domain, COUNT(*) AS hits, MAX(at) AS last_at
         FROM net_dns_query
         WHERE day = ? AND (client_mac = ? OR (client_mac IS NULL AND client_ip = ?))
         GROUP BY domain
         ORDER BY hits DESC
         LIMIT 30`,
      )
      .bind(day, mac, ip),
    db
      .prepare(
        `SELECT id, at, domain, qtype, rcode, answer, source
         FROM net_dns_query
         WHERE day = ? AND (client_mac = ? OR (client_mac IS NULL AND client_ip = ?))
         ORDER BY at DESC
         LIMIT 100`,
      )
      .bind(day, mac, ip),
    db
      .prepare(
        `SELECT id, at, dst_ip, dst_port, proto, sni_or_host, bytes_tx, bytes_rx, packets, source
         FROM net_flow
         WHERE day = ? AND (client_mac = ? OR (client_mac IS NULL AND client_ip = ?))
         ORDER BY at DESC
         LIMIT 100`,
      )
      .bind(day, mac, ip),
  ]);

  return json({
    day,
    device,
    events: events.results ?? [],
    top_domains: topDomains.results ?? [],
    recent_dns: recentDns.results ?? [],
    recent_flows: recentFlows.results ?? [],
  });
};

export const POST: APIRoute = async (ctx) => {
  const gate = await requireApi(ctx);
  if (!gate.ok) return gate.response;
  const { db } = gate;

  let body: any;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const mac = normMac(body?.mac);
  if (!mac) return json({ error: 'invalid mac' }, 400);

  const rawName = typeof body?.custom_name === 'string' ? body.custom_name.trim().slice(0, 64) : '';
  const customName = rawName || null;

  await db.prepare('UPDATE net_device SET custom_name = ? WHERE mac = ?').bind(customName, mac).run();
  return json({ ok: true, mac, custom_name: customName });
};
