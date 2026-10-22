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
import { summariseDay, type CleanEvent } from '../../../../lib/learning/activity';
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
  // "current device" pointer — see the ingest route's blast-radius note.
  const device = await db
    .prepare('SELECT label, MAX(last_seen) AS last_seen FROM activity_device')
    .first<{ label: string | null; last_seen: string | null }>();

  const evRes = await db
    .prepare(
      `SELECT bucket, started_at, duration_s, app, title, url, host, status, day
         FROM activity_event WHERE day = ? ORDER BY started_at`,
    )
    .bind(date)
    .all<CleanEvent>();

  const stops = await db
    .prepare(`SELECT at FROM activity_tracker_event WHERE day = ? AND kind = 'stopped' ORDER BY at`)
    .bind(date)
    .all<{ at: string }>();

  const all = (evRes.results ?? []) as CleanEvent[];
  const s = summariseDay(all);

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
    stops: (stops.results ?? []).map((r) => r.at),
    sampleCount: s.sampleCount,
  });
};
