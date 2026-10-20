/**
 * /learning activity monitor — pure logic shared by the ingest endpoint and
 * the coach day view. No I/O here, so it can be unit-tested without a
 * database (see src/scripts/activity/activity.test.ts).
 *
 * This is visible monitoring inside a family, not covert surveillance: the
 * tracker's tray icon stays on the laptop, and the system reports rather than
 * blocks. See docs/superpowers/specs/2026-10-14-learning-activity-monitor-design.md.
 */

export type Bucket = 'window' | 'afk' | 'web';
export type Category = 'games' | 'video' | 'social' | 'study' | 'browsing' | 'other';

/** A raw ActivityWatch event as the uploader sends it. Everything is a claim. */
export interface RawEvent {
  bucket?: unknown;
  timestamp?: unknown; // ISO
  duration?: unknown; // seconds
  data?: Record<string, unknown>;
}

/** A validated, normalised event ready to insert. */
export interface CleanEvent {
  bucket: Bucket;
  started_at: string; // ISO UTC, normalised
  duration_s: number;
  app: string | null;
  title: string | null;
  url: string | null;
  host: string | null;
  status: string | null;
  day: string; // IST YYYY-MM-DD
}

const ZONE = 'Asia/Kolkata';
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE });
const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour12: false, hour: '2-digit' });

/** IST calendar date ('YYYY-MM-DD') for an instant. */
export function istDay(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return DAY_FMT.format(d);
}

/** IST hour (0–23) for an instant. */
export function istHour(iso: string | Date): number {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number(HOUR_FMT.format(d));
}

/** Hostname of a url, lowercased, with a leading www. removed. Null if unparseable. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return null;
  }
}

// Keyword tables. Matched against host first, then app/title. Deliberately
// small and readable — the point is a rough split a parent can glance at, not
// a classifier. Add entries as real usage shows what is miscategorised.
const HOST_RULES: Array<[Category, string[]]> = [
  ['study', ['kirtanjain.com', 'khanacademy.org', 'scratch.mit.edu', 'wikipedia.org', 'brilliant.org', 'desmos.com', 'geogebra.org']],
  ['video', ['youtube.com', 'youtu.be', 'netflix.com', 'primevideo.com', 'hotstar.com', 'twitch.tv', 'dailymotion.com']],
  ['games', ['roblox.com', 'minecraft.net', 'epicgames.com', 'steampowered.com', 'poki.com', 'crazygames.com', 'coolmathgames.com']],
  ['social', ['instagram.com', 'facebook.com', 'snapchat.com', 'discord.com', 'reddit.com', 'tiktok.com', 'whatsapp.com', 'x.com', 'twitter.com']],
];

const APP_RULES: Array<[Category, string[]]> = [
  ['games', ['roblox', 'minecraft', 'steam', 'epicgames', 'fortnite', 'valorant', 'leagueoflegends']],
  ['video', ['vlc', 'netflix', 'youtube', 'mpc-hc', 'potplayer']],
  ['social', ['discord', 'whatsapp', 'telegram', 'instagram', 'snapchat']],
  ['study', ['code', 'scratch', 'word', 'excel', 'powerpoint', 'acrobat', 'typing']],
];

const BROWSERS = ['chrome', 'firefox', 'msedge', 'edge', 'brave', 'opera'];

// Keywords matched against a browser window TITLE when there is no URL — the
// case for Edge on a non-domain machine, where the web extension can't be
// force-installed but the window watcher still captures titles like
// "… - YouTube" or "Roblox". Lets browser time still split by category.
const TITLE_RULES: Array<[Category, string[]]> = [
  ['video', ['youtube', 'netflix', 'prime video', 'hotstar', 'twitch', 'disney+']],
  ['games', ['roblox', 'minecraft', 'fortnite', 'valorant', 'poki', 'crazygames', 'coolmath']],
  ['social', ['instagram', 'facebook', 'snapchat', 'discord', 'reddit', 'tiktok', 'whatsapp']],
  ['study', ['khan academy', 'scratch', 'wikipedia', 'brilliant', 'desmos', 'geogebra', 'google docs', 'kirtanjain']],
];

/** Rough category for a window or web event. */
export function categorize(e: { app?: string | null; host?: string | null; title?: string | null }): Category {
  const host = (e.host ?? '').toLowerCase();
  if (host) {
    for (const [cat, keys] of HOST_RULES) if (keys.some((k) => host === k || host.endsWith('.' + k))) return cat;
    return 'browsing';
  }
  const app = (e.app ?? '').toLowerCase().replace(/\.exe$/, '');
  if (app) {
    for (const [cat, keys] of APP_RULES) if (keys.some((k) => app.includes(k))) return cat;
    if (BROWSERS.some((b) => app.includes(b))) {
      // No URL (e.g. Edge without the extension) — fall back to the title.
      const title = (e.title ?? '').toLowerCase();
      if (title) for (const [cat, keys] of TITLE_RULES) if (keys.some((k) => title.includes(k))) return cat;
      return 'browsing';
    }
  }
  return 'other';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * Validate and normalise one raw event. Returns null for anything we will not
 * store: unknown bucket, unparseable or absurd timestamp, negative or
 * implausibly long duration (a single event longer than a day is a bug, not a
 * fact). The clock on the laptop is not trusted beyond sanity bounds.
 */
export function validateEvent(raw: RawEvent, now: Date = new Date()): CleanEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const bucket = raw.bucket;
  if (bucket !== 'window' && bucket !== 'afk' && bucket !== 'web') return null;

  const ts = typeof raw.timestamp === 'string' ? new Date(raw.timestamp) : null;
  if (!ts || Number.isNaN(ts.getTime())) return null;
  // Reject the future (past a small skew) and anything older than two years.
  const t = ts.getTime();
  if (t > now.getTime() + 10 * 60_000) return null;
  if (t < now.getTime() - 730 * 86_400_000) return null;

  // Duration must be an actual number; Number('') / Number(null) coerce to 0
  // and would otherwise be accepted as a zero-length event.
  if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration)) return null;
  const dur = raw.duration;
  if (dur < 0 || dur > 86_400) return null;

  const data = (raw.data ?? {}) as Record<string, unknown>;
  const url = str(data.url);
  const cap = (v: string | null, n: number) => (v ? v.slice(0, n) : v);

  return {
    bucket,
    started_at: ts.toISOString(),
    duration_s: dur,
    app: cap(str(data.app), 200),
    title: cap(str(data.title), 500),
    url: cap(url, 2000),
    host: hostOf(url),
    status: bucket === 'afk' ? str(data.status) : null,
    day: istDay(ts),
  };
}

// ────────────────────────────────────────────────── intervals

/** Half-open [start, end) in epoch ms. */
export type Interval = [number, number];

/** Union of intervals, sorted and coalesced. */
export function mergeIntervals(ivs: Interval[]): Interval[] {
  const sorted = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** `a` with every part that overlaps any interval in `b` removed. `b` need not be merged. */
export function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
  const cuts = mergeIntervals(b);
  const out: Interval[] = [];
  for (let [s, e] of a) {
    for (const [cs, ce] of cuts) {
      if (ce <= s || cs >= e) continue; // no overlap
      if (cs > s) out.push([s, Math.min(cs, e)]); // keep the bit before the cut
      s = Math.max(s, ce); // advance past the cut
      if (s >= e) break;
    }
    if (s < e) out.push([s, e]);
  }
  return out.filter(([x, y]) => y > x);
}

const totalSeconds = (ivs: Interval[]) => ivs.reduce((sum, [a, b]) => sum + (b - a), 0) / 1000;

// ────────────────────────────────────────────────── day-view aggregation

export interface DaySummary {
  activeSeconds: number; // window time with AFK periods removed
  firstAt: string | null; // ISO of first window activity
  lastAt: string | null; // ISO of last window activity
  byApp: Array<{ key: string; seconds: number }>;
  byHost: Array<{ key: string; seconds: number }>;
  byCategory: Array<{ key: Category; seconds: number }>;
  lateNightSeconds: number; // active time in 22:00–06:00 IST (across the day boundary)
  sampleCount: number;
}

/** IST midnight (epoch ms) of a 'YYYY-MM-DD' IST date. */
function istMidnight(day: string): number {
  return new Date(`${day}T00:00:00+05:30`).getTime();
}

/**
 * Summarise one IST day.
 *
 * Window events are assumed non-overlapping (the currentwindow watcher reports
 * one focused window at a time). Active time is window time with the AFK
 * intervals cut out, so a game left open while the laptop is idle does not
 * count. App/category/late-night totals are attributed from the *active* part
 * of each window event only, so they never exceed activeSeconds. Web events
 * refine the category split, clamped to the browser window time actually
 * measured, and inform the host list (which is informational and may exceed).
 */
export function summariseDay(events: CleanEvent[]): DaySummary {
  const windows = events.filter((e) => e.bucket === 'window');
  const webs = events.filter((e) => e.bucket === 'web');
  const afkCuts: Interval[] = events
    .filter((e) => e.bucket === 'afk' && e.status === 'afk')
    .map((e) => {
      const s = new Date(e.started_at).getTime();
      return [s, s + e.duration_s * 1000] as Interval;
    });

  // Late-night ranges *within* this IST day: 00:00–06:00 and 22:00–24:00.
  // Events are bucketed by their own IST day, so an event at 01:00 belongs to
  // this day's early-hours slice, and one at 23:00 to its late slice.
  const anchorDay = (windows[0] ?? events[0])?.day;
  const m = anchorDay ? istMidnight(anchorDay) : 0;
  const H = 3_600_000;
  const lateCuts: Interval[] = anchorDay
    ? [
        [m, m + 6 * H],
        [m + 22 * H, m + 24 * H],
      ]
    : [];

  const byApp = new Map<string, number>();
  const byCat = new Map<Category, number>();
  let active = 0;
  let late = 0;
  let firstT = Infinity;
  let lastT = -Infinity;

  for (const e of windows) {
    const s = new Date(e.started_at).getTime();
    const full: Interval = [s, s + e.duration_s * 1000];
    const liveParts = subtractIntervals([full], afkCuts); // the not-AFK portion
    const secs = totalSeconds(liveParts);
    if (secs <= 0) continue;

    active += secs;
    byApp.set(e.app ?? 'Unknown', (byApp.get(e.app ?? 'Unknown') ?? 0) + secs);
    const cat = categorize(e);
    byCat.set(cat, (byCat.get(cat) ?? 0) + secs);
    late += totalSeconds(liveParts.flatMap((p) => subtractIntervals([p], subtractIntervals([p], lateCuts))));

    if (liveParts[0][0] < firstT) firstT = liveParts[0][0];
    const endOfLast = liveParts[liveParts.length - 1][1];
    if (endOfLast > lastT) lastT = endOfLast;
  }

  // Web events: host totals, and a clamped reclassification of browser time.
  const byHost = new Map<string, number>();
  let browsingLeft = byCat.get('browsing') ?? 0;
  for (const e of webs) {
    if (!e.host) continue;
    byHost.set(e.host, (byHost.get(e.host) ?? 0) + e.duration_s);
    const cat = categorize(e);
    if (cat === 'browsing') continue;
    const move = Math.min(e.duration_s, browsingLeft);
    if (move <= 0) continue;
    byCat.set(cat, (byCat.get(cat) ?? 0) + move);
    byCat.set('browsing', (byCat.get('browsing') ?? 0) - move);
    browsingLeft -= move;
  }

  const rank = <K extends string>(m: Map<K, number>) =>
    [...m.entries()]
      .map(([key, seconds]) => ({ key, seconds }))
      .filter((r) => r.seconds > 0.5)
      .sort((a, b) => b.seconds - a.seconds);

  return {
    activeSeconds: active,
    firstAt: firstT === Infinity ? null : new Date(firstT).toISOString(),
    lastAt: lastT === -Infinity ? null : new Date(lastT).toISOString(),
    byApp: rank(byApp),
    byHost: rank(byHost),
    byCategory: rank(byCat),
    lateNightSeconds: late,
    sampleCount: events.length,
  };
}

/**
 * Deterministic primary key for an event, so re-sending the same event (which
 * the uploader does on purpose, because AW grows an open event's duration in
 * place) upserts rather than duplicates. (device, bucket, start) identifies a
 * merged AW event uniquely.
 */
export function eventKey(deviceId: string, bucket: string, startedAt: string): string {
  return `${deviceId}|${bucket}|${startedAt}`;
}

/** Human "2h 05m" / "45m" / "30s". */
export function dur(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}
