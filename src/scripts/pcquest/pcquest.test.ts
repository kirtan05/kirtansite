import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEvents,
  foldProgress,
  verifyPackSig,
  rungSummary,
  summariseIssues,
  validatePackPut,
  b64Decode,
  pubkeyUsable,
  chunk,
  MAX_ASSET_BYTES,
  MAX_WIRE_BYTES,
  type CleanPqEvent,
} from '../../lib/learning/pcquest.ts';

const NOW = new Date('2026-11-13T10:00:00Z');
const DEV = 'dev-0123456789abcdef';

function body(events: unknown[]) {
  return { device_id: DEV, device: 'Monit laptop', app_version: '1.0.0', events };
}

let n = 0;
function ev(kind: CleanPqEvent['kind'], at: string, extra: Partial<CleanPqEvent> = {}): CleanPqEvent {
  return {
    id: extra.id ?? `e${++n}`,
    at,
    kind,
    task: extra.task === undefined ? 't1' : extra.task,
    rev: extra.rev === undefined ? 1 : extra.rev,
    step: extra.step ?? null,
    detail: extra.detail ?? null,
  };
}

test('validate_rejects_unknown_kind', () => {
  const r = validateEvents(
    body([
      { id: 'a', at: NOW.toISOString(), kind: 'explode', task: 't1' },
      { id: 'b', at: NOW.toISOString(), kind: 'start', task: 't1', rev: 1 },
      'junk',
      { id: 'c', at: 'garbage', kind: 'hint', task: 't1' },
    ]),
    NOW,
  );
  assert.notEqual(typeof r, 'string');
  const ok = r as Exclude<typeof r, string>;
  assert.deepEqual(ok.events.map((e) => e.id), ['b']);
  assert.deepEqual(ok.rejected, [
    { index: 0, id: 'a', reason: 'unknown kind' },
    { index: 2, id: null, reason: 'not an object' },
    { index: 3, id: 'c', reason: 'bad at' },
  ]);
});

test('validate_rejects_missing_device_and_non_object', () => {
  assert.equal(typeof validateEvents(null, NOW), 'string');
  assert.equal(typeof validateEvents({ events: [] }, NOW), 'string');
  assert.equal(typeof validateEvents({ device_id: DEV, events: 'x' }, NOW), 'string');
  const noLabel = validateEvents({ device_id: DEV, events: [] }, NOW);
  assert.equal((noLabel as Exclude<typeof noLabel, string>).device, null);
});

test('validate_clamps_future_at', () => {
  const future = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
  const soon = new Date(NOW.getTime() + 3_600_000).toISOString();
  const r = validateEvents(
    body([
      { id: 'a', at: future, kind: 'start', task: 't1', rev: 1 },
      { id: 'b', at: future, kind: 'hint', task: 't1', rev: 1, step: 's1', detail: { x: 1 } },
      { id: 'c', at: soon, kind: 'step', task: 't1', rev: 1, step: 's1' },
      { id: 'd', at: NOW.toISOString(), kind: 'heartbeat' },
    ]),
    NOW,
  );
  assert.notEqual(typeof r, 'string');
  const { events, device_id, device, app_version, rejected } = r as Exclude<typeof r, string>;
  assert.equal(device_id, DEV);
  assert.equal(device, 'Monit laptop');
  assert.equal(app_version, '1.0.0');
  assert.deepEqual(rejected, []);
  assert.equal(events[0].at, NOW.toISOString());
  assert.deepEqual(events[0].detail, { clamped: true });
  assert.deepEqual(events[1].detail, { x: 1, clamped: true });
  assert.equal(events[2].at, soon);
  assert.equal(events[2].detail, null);
  assert.equal(events[3].task, null);
});

test('validate_keeps_old_past_at', () => {
  const old = new Date(NOW.getTime() - 90 * 86_400_000).toISOString();
  const r = validateEvents(body([{ id: 'a', at: old, kind: 'start', task: 't1', rev: 1 }]), NOW);
  const { events } = r as Exclude<typeof r, string>;
  assert.equal(events[0].at, old);
  assert.equal(events[0].detail, null);
});

test('validate_caps_50', () => {
  const mk = (i: number) => ({ id: `id${i}`, at: NOW.toISOString(), kind: 'hint', task: 't1', rev: 1, step: 's' });
  const fifty = validateEvents(body(Array.from({ length: 50 }, (_, i) => mk(i))), NOW);
  assert.notEqual(typeof fifty, 'string');
  assert.equal((fifty as Exclude<typeof fifty, string>).events.length, 50);
  const fiftyOne = validateEvents(body(Array.from({ length: 51 }, (_, i) => mk(i))), NOW);
  assert.equal(typeof fiftyOne, 'string');
});

test('fold_done_after_steps', () => {
  const p = foldProgress([
    ev('step', '2026-11-10T10:02:00Z', { step: 's1' }),
    ev('start', '2026-11-10T10:00:00Z'),
    ev('step', '2026-11-10T10:05:00Z', { step: 's2', detail: { selfReported: true } }),
    ev('done', '2026-11-10T10:06:00Z', { rev: 2 }),
  ]);
  assert.equal(p.t1.state, 'done');
  assert.equal(p.t1.rev, 2);
  assert.equal(p.t1.startedAt, '2026-11-10T10:00:00Z');
  assert.equal(p.t1.doneAt, '2026-11-10T10:06:00Z');
  assert.deepEqual(p.t1.steps.s1, { at: '2026-11-10T10:02:00Z', selfReported: false, pointed: false });
  assert.equal(p.t1.steps.s2.selfReported, true);
});

test('fold_reset_clears', () => {
  const p = foldProgress([
    ev('start', '2026-11-10T10:00:00Z'),
    ev('step', '2026-11-10T10:01:00Z', { step: 's1' }),
    ev('hint', '2026-11-10T10:01:30Z', { step: 's2' }),
    ev('done', '2026-11-10T10:02:00Z'),
    ev('start', '2026-11-10T09:00:00Z', { task: 't2' }),
    ev('reset', '2026-11-11T10:00:00Z'),
  ]);
  // t1 was done, so the reset keeps it (not_started, everDone); its attempt is cleared.
  assert.equal(p.t1.state, 'not_started');
  assert.deepEqual(p.t1.steps, {});
  assert.equal(p.t1.hints, 0);
  assert.equal(p.t2.state, 'in_progress');

  const again = foldProgress([
    ev('start', '2026-11-10T10:00:00Z'),
    ev('done', '2026-11-10T10:02:00Z'),
    ev('reset', '2026-11-11T10:00:00Z'),
    ev('start', '2026-11-12T10:00:00Z'),
  ]);
  assert.equal(again.t1.state, 'in_progress');
  assert.equal(again.t1.startedAt, '2026-11-12T10:00:00Z');
  assert.equal(again.t1.doneAt, null);
  assert.equal(again.t1.hints, 0);
});

test('fold_hints_and_pointed_counted', () => {
  const p = foldProgress([
    ev('start', '2026-11-10T10:00:00Z'),
    ev('hint', '2026-11-10T10:00:10Z', { step: 's1' }),
    ev('hint', '2026-11-10T10:00:20Z', { step: 's1' }),
    ev('pointed', '2026-11-10T10:00:30Z', { step: 's1' }),
    ev('wrong', '2026-11-10T10:00:40Z', { step: 's1' }),
    ev('step', '2026-11-10T10:01:00Z', { step: 's1' }),
    ev('step', '2026-11-10T10:02:00Z', { step: 's2' }),
    ev('pointed', '2026-11-10T10:03:00Z', { step: 's2' }),
    ev('heartbeat', '2026-11-10T10:03:00Z', { task: null }),
    ev('blocked_caps', '2026-11-10T10:03:00Z'),
  ]);
  assert.equal(p.t1.hints, 2);
  assert.equal(p.t1.wrong, 1);
  assert.equal(p.t1.steps.s1.pointed, true);
  assert.equal(p.t1.steps.s2.pointed, true);
  assert.equal(Object.keys(p).length, 1);
});

test('sig_valid_and_tampered', async () => {
  const { subtle } = globalThis.crypto;
  const kp = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = Buffer.from(await subtle.exportKey('spki', kp.publicKey)).toString('base64');
  const payload = JSON.stringify({ pack: 'starter', format: 1, title: 'Starter — मेरा', tasks: [] });
  const sig = Buffer.from(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(payload)),
  ).toString('base64');

  assert.equal(await verifyPackSig(JSON.stringify({ payload, sig }), spki), true);
  assert.equal(await verifyPackSig(JSON.stringify({ payload: payload.replace('starter', 'startex'), sig }), spki), false);

  const other = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const otherSpki = Buffer.from(await subtle.exportKey('spki', other.publicKey)).toString('base64');
  assert.equal(await verifyPackSig(JSON.stringify({ payload, sig }), otherSpki), false);
  assert.equal(await verifyPackSig('not json', spki), false);
  assert.equal(await verifyPackSig(JSON.stringify({ payload, sig }), 'REPLACE_WITH_QUEST_KEYGEN_OUTPUT'), false);
});

test('rung_summary_counts', () => {
  const progress = foldProgress([
    ev('start', '2026-11-10T10:00:00Z', { task: 'a' }),
    ev('step', '2026-11-10T10:01:00Z', { task: 'a', step: 's1', detail: { selfReported: true } }),
    ev('done', '2026-11-10T10:02:00Z', { task: 'a' }),
    ev('start', '2026-11-10T10:00:00Z', { task: 'b' }),
    ev('done', '2026-11-10T10:02:00Z', { task: 'b' }),
    ev('start', '2026-11-10T10:00:00Z', { task: 'c' }),
    ev('start', '2026-11-10T10:00:00Z', { task: 'r' }),
    ev('done', '2026-11-10T10:02:00Z', { task: 'r' }),
  ]);
  const meta = [
    { id: 'a', rung: 'C2' },
    { id: 'b', rung: 'C2' },
    { id: 'c', rung: 'C2' },
    { id: 'd', rung: 'C10' },
    { id: 'r', rung: 'C10', retired: true },
    { id: 'x', rung: 'C10', retired: true },
    { id: 'n' },
  ];
  assert.deepEqual(rungSummary(progress, meta), [
    { rung: 'C2', done: 2, total: 3, selfReported: 1 },
    { rung: 'C10', done: 1, total: 2, selfReported: 0 },
  ]);
});

test('pack_put_limits', () => {
  const b64 = (n: number) => Buffer.alloc(n, 7).toString('base64');
  const ok = validatePackPut({ wire: '{}', assets: [{ path: 'assets/a.png', b64: b64(10) }] });
  assert.notEqual(typeof ok, 'string');
  assert.deepEqual([...(ok as any).assets[0].bytes], Array(10).fill(7));
  assert.deepEqual((validatePackPut({ wire: '{}' }) as any).assets, []);

  assert.equal(validatePackPut({}), 'missing wire');
  assert.match(validatePackPut({ wire: 'x'.repeat(MAX_WIRE_BYTES + 1) }) as string, /wire larger/);
  const many = Array.from({ length: 21 }, (_, i) => ({ path: `a${i}.png`, b64: b64(1) }));
  assert.match(validatePackPut({ wire: '{}', assets: many }) as string, /too many assets/);
  assert.notEqual(typeof validatePackPut({ wire: '{}', assets: many.slice(0, 20) }), 'string');
  assert.match(validatePackPut({ wire: '{}', assets: [{ path: 'big.png', b64: b64(MAX_ASSET_BYTES + 1) }] }) as string, /larger than/);
  assert.notEqual(typeof validatePackPut({ wire: '{}', assets: [{ path: 'max.png', b64: b64(MAX_ASSET_BYTES) }] }), 'string');
  assert.match(validatePackPut({ wire: '{}', assets: [{ path: 'x.png', b64: '!!notb64' }] }) as string, /bad base64/);
  assert.match(
    validatePackPut({ wire: '{}', assets: [{ path: 'x.png', b64: b64(1) }, { path: 'x.png', b64: b64(2) }] }) as string,
    /duplicate path/,
  );
});

test('b64_decode_and_chunk', () => {
  assert.deepEqual([...b64Decode(Buffer.from('héllo').toString('base64'))!], [...Buffer.from('héllo')]);
  assert.equal(b64Decode('a'), null);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('pubkey_usable_rejects_placeholder', async () => {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', kp.publicKey)).toString('base64');
  assert.equal(await pubkeyUsable(spki), true);
  assert.equal(await pubkeyUsable('REPLACE_WITH_QUEST_KEYGEN_OUTPUT'), false);
  assert.equal(await pubkeyUsable(undefined), false);
});

test('fold_ever_done_survives_reset', () => {
  const p = foldProgress([
    ev('start', '2026-11-10T10:00:00Z', { detail: { vars: { name: 'Cricket' } } }),
    ev('step', '2026-11-10T10:01:00Z', { step: 's1' }),
    ev('done', '2026-11-10T10:02:00Z'),
    ev('reset', '2026-11-11T10:00:00Z'),
    ev('start', '2026-11-10T09:00:00Z', { task: 'never' }),
    ev('reset', '2026-11-11T10:00:00Z', { task: 'never' }),
  ]);
  // Done once, then reset with no new attempt: kept, as not_started.
  assert.deepEqual(p.t1, {
    state: 'not_started', rev: 1, startedAt: null, doneAt: null, steps: {}, hints: 0, wrong: 0,
    vars: null, everDone: true, firstDoneAt: '2026-11-10T10:02:00Z',
  });
  // Never done, then reset: gone, as before.
  assert.equal(p.never, undefined);

  const replay = foldProgress([
    ev('start', '2026-11-10T10:00:00Z'),
    ev('done', '2026-11-10T10:02:00Z'),
    ev('reset', '2026-11-11T10:00:00Z'),
    ev('start', '2026-11-12T10:00:00Z', { detail: { vars: { name: 'School' } } }),
    ev('hint', '2026-11-12T10:01:00Z', { step: 's1' }),
  ]);
  assert.equal(replay.t1.state, 'in_progress');
  assert.equal(replay.t1.startedAt, '2026-11-12T10:00:00Z');
  assert.equal(replay.t1.hints, 1);
  assert.deepEqual(replay.t1.vars, { name: 'School' });
  assert.equal(replay.t1.everDone, true);
  assert.equal(replay.t1.firstDoneAt, '2026-11-10T10:02:00Z');

  const fresh = foldProgress([ev('start', '2026-11-10T10:00:00Z')]);
  assert.equal(fresh.t1.everDone, false);
  assert.equal(fresh.t1.firstDoneAt, null);

  // The rung summary counts a replayed task as done.
  assert.deepEqual(rungSummary(replay, [{ id: 't1', rung: 'C1' }]), [{ rung: 'C1', done: 1, total: 1, selfReported: 0 }]);
});

test('issues_deduped_with_counts', () => {
  const issues = summariseIssues([
    ev('blocked_caps', '2026-11-10T10:00:00Z', { task: 'a', rev: 2, detail: { caps: ['newCheck'] } }),
    ev('blocked_caps', '2026-11-11T10:00:00Z', { task: 'a', rev: 2, detail: { caps: ['newCheck'] } }),
    ev('blocked_caps', '2026-11-09T10:00:00Z', { task: 'a', rev: 1 }),
    ev('point_miss', '2026-11-12T10:00:00Z', { task: 'b', step: 's2', detail: { well: 'startButton' } }),
    ev('bad_sig', '2026-11-08T10:00:00Z', { task: null, rev: null, detail: { pack: 'extra', error: 'bad_json' } }),
  ]);
  assert.deepEqual(issues, [
    { kind: 'point_miss', task: 'b', rev: 1, step: 's2', count: 1, lastAt: '2026-11-12T10:00:00Z', detail: { well: 'startButton' } },
    { kind: 'blocked_caps', task: 'a', rev: 2, step: null, count: 2, lastAt: '2026-11-11T10:00:00Z', detail: { caps: ['newCheck'] } },
    { kind: 'blocked_caps', task: 'a', rev: 1, step: null, count: 1, lastAt: '2026-11-09T10:00:00Z', detail: null },
    { kind: 'bad_sig', task: null, rev: null, step: null, count: 1, lastAt: '2026-11-08T10:00:00Z', detail: { pack: 'extra', error: 'bad_json' } },
  ]);
});
