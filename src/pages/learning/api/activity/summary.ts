export const prerender = false;

/**
 * Aggregates-only day summary, for the nightly report on Kirtan's box.
 *
 * Authenticated by ACTIVITY_READ_TOKEN (distinct from the ingest token: a
 * reader cannot write, a writer cannot read). It returns totals only — active
 * time, the category/app/host splits, the late-night slice, tracker status —
 * and never raw window titles or full URLs. The detail stays on the coach
 * page behind the cookie; the WhatsApp message is a summary with a link, by
 * design.
 */
import type { APIRoute } from 'astro';
import { hostAllowed } from '../../../../lib/learning/guard';
import { isPhoneLabel, mediaTotals, splitByDevice, summariseDay, type CleanEvent } from '../../../../lib/learning/activity';
import { today } from '../../../../lib/learning/dates';

function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const GET: APIRoute = async (ctx) => {
  if (!hostAllowed(ctx)) return new Response('Not found', { status: 404 });

  const env = (ctx.locals as App.Locals)?.runtime?.env ?? ({} as Env);
  const db = env.ACTIVITY_DB;
  const token = env.ACTIVITY_READ_TOKEN;
  if (!db || !token) return new Response('not configured', { status: 503 });

  const auth = ctx.request.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || !sameString(presented, token)) return new Response('no', { status: 401 });

  const date = ctx.url.searchParams.get('date') ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response('bad date', { status: 400 });

  // Aggregate across every device for the day rather than trusting a single
  // "current device" pointer — see the ingest route's blast-radius note. Laptop
  // and phone are summarised separately (by device label), never added together.
  const devices = ((await db.prepare('SELECT label, last_seen FROM activity_device').all<{
    label: string | null;
    last_seen: string | null;
  }>()).results ?? []) as Array<{ label: string | null; last_seen: string | null }>;
  const latest = (rows: typeof devices) =>
    rows.reduce<{ label: string | null; last_seen: string | null } | null>(
      (best, r) => (r.last_seen && (!best?.last_seen || r.last_seen > best.last_seen) ? r : best),
      null,
    );
  const device = latest(devices.filter((d) => !isPhoneLabel(d.label)));
  const phoneDevice = latest(devices.filter((d) => isPhoneLabel(d.label)));

  const evRes = await db
    .prepare(
      `SELECT e.bucket, e.started_at, e.duration_s, e.app, e.title, e.url, e.host, e.status, e.day, d.label
         FROM activity_event e JOIN activity_device d ON d.id = e.device_id
        WHERE e.day = ? ORDER BY e.started_at`,
    )
    .bind(date)
    .all<CleanEvent & { label: string | null }>();

  const stopRes = await db
    .prepare(
      `SELECT t.at, t.detail, d.label FROM activity_tracker_event t JOIN activity_device d ON d.id = t.device_id
        WHERE t.day = ? AND t.kind = 'stopped' ORDER BY t.at`,
    )
    .bind(date)
    .all<{ at: string; detail: string | null; label: string | null }>();
  const stopSplit = splitByDevice(stopRes.results ?? []);

  const split = splitByDevice((evRes.results ?? []) as Array<CleanEvent & { label: string | null }>);
  const all = split.laptop as CleanEvent[];
  const s = summariseDay(all);
  const ps = summariseDay(split.phone);

  // YouTube video names, from window titles (works for Edge, which has no
  // extension) — plus any real youtube URLs seen via the web watcher (Chrome).
  const ytByName = new Map<string, number>();
  const ytLinks = new Set<string>();
  for (const e of all) {
    const title = e.title ?? '';
    const onYt = /youtube/i.test(title) || /youtube\.com|youtu\.be/.test(e.host ?? '');
    if (!onYt) continue;
    if (e.bucket === 'window') {
      const name = title.replace(/\s*[-–]\s*(YouTube|Google Chrome|Microsoft.?\s?Edge).*$/gi, '').trim();
      if (name) ytByName.set(name, (ytByName.get(name) ?? 0) + e.duration_s);
    }
    if (e.url && /youtube\.com\/watch|youtu\.be\//.test(e.url)) ytLinks.add(e.url);
  }
  const youtube = [...ytByName.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .filter((r) => r.seconds > 5)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);

  return Response.json({
    youtube,
    youtubeLinks: [...ytLinks].slice(0, 8),
    date,
    device: device?.label ?? null,
    lastSeen: device?.last_seen ?? null,
    activeSeconds: s.activeSeconds,
    firstAt: s.firstAt,
    lastAt: s.lastAt,
    lateNightSeconds: s.lateNightSeconds,
    byCategory: s.byCategory,
    topApps: s.byApp.slice(0, 5),
    topHosts: s.byHost.slice(0, 5),
    stops: stopSplit.laptop.map((r) => r.at),
    sampleCount: s.sampleCount,
    // His Android phone (aw-android + Termux uploader). null = no phone set up yet.
    phone: phoneDevice
      ? {
          device: phoneDevice.label,
          lastSeen: phoneDevice.last_seen,
          activeSeconds: ps.activeSeconds,
          firstAt: ps.firstAt,
          lastAt: ps.lastAt,
          lateNightSeconds: ps.lateNightSeconds,
          byCategory: ps.byCategory,
          topApps: ps.byApp.slice(0, 5),
          topHosts: ps.byHost.slice(0, 5),
          media: mediaTotals(split.phone).slice(0, 8),
          stops: stopSplit.phone.map((r) => ({ at: r.at, detail: r.detail })),
          sampleCount: ps.sampleCount,
        }
      : null,
  });
};
