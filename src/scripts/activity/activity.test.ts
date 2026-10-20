import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize,
  hostOf,
  istDay,
  istHour,
  summariseDay,
  validateEvent,
  eventKey,
  mergeIntervals,
  subtractIntervals,
  dur,
  type CleanEvent,
  type Interval,
} from '../../lib/learning/activity.ts';

// Helper to build a window/afk/web CleanEvent tersely.
function ev(bucket: 'window' | 'afk' | 'web', startedAt: string, dur_s: number, extra: Partial<CleanEvent> = {}): CleanEvent {
  return {
    bucket,
    started_at: startedAt,
    duration_s: dur_s,
    app: extra.app ?? null,
    title: extra.title ?? null,
    url: extra.url ?? null,
    host: extra.host ?? null,
    status: extra.status ?? null,
    day: extra.day ?? istDay(startedAt),
  };
}

test('hostOf strips www and lowercases, null on junk', () => {
  assert.equal(hostOf('https://www.YouTube.com/watch?v=x'), 'youtube.com');
  assert.equal(hostOf('https://roblox.com/'), 'roblox.com');
  assert.equal(hostOf('not a url'), null);
  assert.equal(hostOf(null), null);
});

test('categorize by host wins, with subdomains', () => {
  assert.equal(categorize({ host: 'youtube.com' }), 'video');
  assert.equal(categorize({ host: 'm.youtube.com' }), 'video');
  assert.equal(categorize({ host: 'kirtanjain.com' }), 'study');
  assert.equal(categorize({ host: 'some-random-blog.com' }), 'browsing');
});

test('categorize by app when no host', () => {
  assert.equal(categorize({ app: 'RobloxPlayerBeta.exe' }), 'games');
  assert.equal(categorize({ app: 'Code.exe' }), 'study');
  assert.equal(categorize({ app: 'chrome.exe' }), 'browsing');
  assert.equal(categorize({ app: 'SomethingElse.exe' }), 'other');
});

test('categorize a browser by window title when there is no URL (Edge case)', () => {
  // Edge without the web extension: no host, but the window title carries it.
  assert.equal(categorize({ app: 'msedge.exe', title: 'Funny cats compilation - YouTube' }), 'video');
  assert.equal(categorize({ app: 'msedge.exe', title: 'Roblox' }), 'games');
  assert.equal(categorize({ app: 'msedge.exe', title: 'Khan Academy | Free Online Courses' }), 'study');
  assert.equal(categorize({ app: 'msedge.exe', title: 'Some random news site' }), 'browsing');
  // A real URL still wins over the title.
  assert.equal(categorize({ app: 'msedge.exe', host: 'youtube.com', title: 'whatever' }), 'video');
});

test('istDay and istHour use Asia/Kolkata', () => {
  // 2026-10-13T20:00Z is 2026-10-14 01:30 IST (UTC+5:30)
  assert.equal(istDay('2026-10-13T20:00:00Z'), '2026-10-14');
  assert.equal(istHour('2026-10-13T20:00:00Z'), 1);
  // 2026-10-13T16:45Z is 22:15 IST, same calendar day
  assert.equal(istDay('2026-10-13T16:45:00Z'), '2026-10-13');
  assert.equal(istHour('2026-10-13T16:45:00Z'), 22);
});

test('validateEvent rejects bad bucket, time, duration', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(validateEvent({ bucket: 'nope', timestamp: '2026-10-13T10:00:00Z', duration: 5 }, now), null);
  assert.equal(validateEvent({ bucket: 'window', timestamp: 'garbage', duration: 5 }, now), null);
  assert.equal(validateEvent({ bucket: 'window', timestamp: '2026-10-13T10:00:00Z', duration: -1 }, now), null);
  assert.equal(validateEvent({ bucket: 'window', timestamp: '2026-10-13T10:00:00Z', duration: 90000 }, now), null);
  // future beyond skew
  assert.equal(validateEvent({ bucket: 'window', timestamp: '2026-10-13T13:00:00Z', duration: 5 }, now), null);
});

test('validateEvent normalises a good window event', () => {
  const now = new Date('2026-10-13T20:00:00Z');
  const c = validateEvent(
    { bucket: 'window', timestamp: '2026-10-13T16:45:00.000Z', duration: 12.5, data: { app: 'chrome.exe', title: 'x' } },
    now,
  );
  assert.ok(c);
  assert.equal(c!.bucket, 'window');
  assert.equal(c!.duration_s, 12.5);
  assert.equal(c!.app, 'chrome.exe');
  assert.equal(c!.day, '2026-10-13');
  assert.equal(c!.host, null);
});

test('validateEvent derives host for web events', () => {
  const now = new Date('2026-10-13T20:00:00Z');
  const c = validateEvent(
    { bucket: 'web', timestamp: '2026-10-13T16:00:00Z', duration: 30, data: { url: 'https://www.youtube.com/watch?v=a' } },
    now,
  );
  assert.equal(c!.host, 'youtube.com');
});

test('summariseDay totals window time and attributes web hosts/categories', () => {
  const ev: CleanEvent[] = [
    { bucket: 'window', started_at: '2026-10-13T12:00:00Z', duration_s: 600, app: 'chrome.exe', title: '', url: null, host: null, status: null, day: '2026-10-13' },
    { bucket: 'window', started_at: '2026-10-13T17:00:00Z', duration_s: 300, app: 'RobloxPlayerBeta.exe', title: '', url: null, host: null, status: null, day: '2026-10-13' },
    { bucket: 'web', started_at: '2026-10-13T12:00:00Z', duration_s: 400, app: null, title: '', url: 'https://youtube.com', host: 'youtube.com', status: null, day: '2026-10-13' },
  ];
  const s = summariseDay(ev);
  assert.equal(s.activeSeconds, 900); // only window events
  assert.equal(s.byApp[0].key, 'chrome.exe'); // 600 > 300
  assert.equal(s.byHost[0].key, 'youtube.com');
  // 17:00Z is 22:30 IST → counts as late night
  assert.equal(s.lateNightSeconds, 300);
  const video = s.byCategory.find((c) => c.key === 'video');
  assert.ok(video && video.seconds >= 400);
});

test('summariseDay on empty day is all zeros', () => {
  const s = summariseDay([]);
  assert.equal(s.activeSeconds, 0);
  assert.equal(s.firstAt, null);
  assert.equal(s.sampleCount, 0);
});

test('mergeIntervals coalesces overlaps and touching', () => {
  const m = mergeIntervals([[0, 10], [5, 15], [20, 25], [25, 30]]);
  assert.deepEqual(m, [[0, 15], [20, 30]]);
});

test('subtractIntervals removes overlapping parts', () => {
  assert.deepEqual(subtractIntervals([[0, 100]], [[20, 40]]), [[0, 20], [40, 100]]);
  assert.deepEqual(subtractIntervals([[0, 100]], [[0, 100]]), []);
  assert.deepEqual(subtractIntervals([[0, 100]], [[-10, 10], [90, 110]]), [[10, 90]]);
  assert.deepEqual(subtractIntervals([[0, 100]], []), [[0, 100]]);
});

test('summariseDay removes AFK time from active and app totals', () => {
  // A 1-hour window event, but the middle 40 min is AFK → 20 min active.
  const start = '2026-10-13T06:00:00Z'; // 11:30 IST
  const events: CleanEvent[] = [
    ev('window', start, 3600, { app: 'RobloxPlayerBeta.exe' }),
    ev('afk', '2026-10-13T06:10:00Z', 2400, { status: 'afk' }), // 10min..50min
  ];
  const s = summariseDay(events);
  assert.equal(Math.round(s.activeSeconds), 1200); // 60 - 40 = 20 min
  assert.equal(Math.round(s.byApp[0].seconds), 1200);
  assert.equal(s.byApp[0].key, 'RobloxPlayerBeta.exe');
});

test('summariseDay late-night covers 22:00–06:00 across midnight', () => {
  // 01:00 IST = 2026-10-12T19:30Z belongs to IST day 2026-10-13, and is late.
  const events: CleanEvent[] = [ev('window', '2026-10-12T19:30:00Z', 1800, { app: 'chrome.exe', day: '2026-10-13' })];
  const s = summariseDay(events);
  assert.equal(Math.round(s.lateNightSeconds), 1800);
});

test('summariseDay category totals never exceed active (clamped browsing)', () => {
  // 10 min of browser window, but 30 min of web says youtube — only 10 can move.
  const events: CleanEvent[] = [
    ev('window', '2026-10-13T06:00:00Z', 600, { app: 'chrome.exe' }),
    ev('web', '2026-10-13T06:00:00Z', 1800, { host: 'youtube.com', url: 'https://youtube.com' }),
  ];
  const s = summariseDay(events);
  const catTotal = s.byCategory.reduce((a, c) => a + c.seconds, 0);
  assert.ok(catTotal <= s.activeSeconds + 0.5, `categories ${catTotal} should be <= active ${s.activeSeconds}`);
  const video = s.byCategory.find((c) => c.key === 'video');
  assert.equal(Math.round(video!.seconds), 600); // only the measured browser time
});

test('eventKey is deterministic', () => {
  assert.equal(eventKey('dev1', 'window', '2026-10-13T06:00:00.000Z'), 'dev1|window|2026-10-13T06:00:00.000Z');
});

test('dur formats sensibly', () => {
  assert.equal(dur(30), '30s');
  assert.equal(dur(90), '2m');
  assert.equal(dur(3900), '1h 05m');
});
