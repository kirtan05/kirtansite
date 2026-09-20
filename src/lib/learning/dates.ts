/**
 * /learning — dates.
 *
 * Everything in the system is keyed to a calendar date, never to a "week
 * number". An Indian school year yields roughly 34 usable Saturdays, not 52,
 * and a plan that counts weeks will quietly report failure every exam season.
 *
 * Workers run in UTC. Sessions happen on Saturday evenings in Asia/Kolkata,
 * which is UTC+5:30 — so an evening session is the same calendar day in both
 * zones, but a late-night upload is not. All "today" logic therefore uses IST
 * explicitly rather than relying on the runtime's clock zone.
 */

export const ZONE = 'Asia/Kolkata';

export type IsoDate = string; // 'YYYY-MM-DD'

export function today(now: Date = new Date()): IsoDate {
  // en-CA renders as YYYY-MM-DD, which is the one thing it is reliably good for.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(now);
}

export function parse(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const t = parse(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function addWeeks(d: IsoDate, n: number): IsoDate {
  return addDays(d, n * 7);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

export function weeksBetween(a: IsoDate, b: IsoDate): number {
  return Math.floor(daysBetween(a, b) / 7);
}

export function human(d: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parse(d));
}

export function weekday(d: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' }).format(parse(d));
}

/** "3 weeks ago", "yesterday", "today". Used wherever staleness is shown. */
export function ago(from: IsoDate, to: IsoDate = today()): string {
  const d = daysBetween(from, to);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  const w = Math.floor(d / 7);
  if (w < 9) return `${w} weeks ago`;
  const m = Math.round(d / 30.4);
  return `${m} months ago`;
}

export interface Break {
  start_on: IsoDate;
  end_on: IsoDate;
  reason: string;
}

export function breakCovering(d: IsoDate, breaks: Break[]): Break | undefined {
  return breaks.find((b) => b.start_on <= d && d <= b.end_on);
}

/** Days between two dates that are NOT inside a declared break. A fortnight of
 *  exams must not read as a fortnight of neglect. */
export function activeDaysBetween(a: IsoDate, b: IsoDate, breaks: Break[]): number {
  let n = 0;
  for (let d = a; d < b; d = addDays(d, 1)) if (!breakCovering(d, breaks)) n++;
  return n;
}

/**
 * The re-test ladder: three weeks, then ten, then six months.
 *
 * Deliberately cheap — one or two extra problems in a week. Anything more
 * expensive gets skipped in November, and a scheduler that gets skipped is
 * worse than no scheduler, because the gaps it leaves still look like data.
 */
export const RETEST_STAGES = [21, 70, 182] as const;

export function retestDue(from: IsoDate, stage: number): IsoDate {
  return addDays(from, RETEST_STAGES[Math.min(stage, RETEST_STAGES.length - 1)]);
}

/** The next occurrence of a weekday (0 = Sunday … 6 = Saturday), on or after d. */
export function nextWeekday(d: IsoDate, target: number): IsoDate {
  let t = parse(d);
  while (t.getUTCDay() !== target) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
