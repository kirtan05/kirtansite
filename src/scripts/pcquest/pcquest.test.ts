import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEvents,
  foldProgress,
  verifyPackSig,
  rungSummary,
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
    rev: extra.rev ?? 1,
    step: extra.step ?? null,
    detail: extra.detail ?? null,
  };
}

test('validate_rejects_unknown_kind', () => {
  const r = validateEvents(body([{ id: 'a', at: NOW.toISOString(), kind: 'explode', task: 't1' }]), NOW);
  assert.equal(typeof r, 'string');
  assert.match(r as string, /kind/);
});

test('validate_rejects_missing_device_and_non_object', () => {
  assert.equal(typeof validateEvents(null, NOW), 'string');
  assert.equal(typeof validateEvents({ events: [] }, NOW), 'string');
});

test('validate_clamps_future_at', () => {
  const future = new Date(NOW.getTime() + 3 * 86_400_000).toISOString();
  const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();
  const ok = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
  const r = validateEvents(
    body([
      { id: 'a', at: future, kind: 'start', task: 't1', rev: 1 },
      { id: 'b', at: old, kind: 'hint', task: 't1', rev: 1, step: 's1', detail: { x: 1 } },
      { id: 'c', at: ok, kind: 'step', task: 't1', rev: 1, step: 's1' },
      { id: 'd', at: 'garbage', kind: 'heartbeat' },
    ]),
    NOW,
  );
  assert.notEqual(typeof r, 'string');
  const { events, device_id, device, app_version } = r as Exclude<typeof r, string>;
  assert.equal(device_id, DEV);
  assert.equal(device, 'Monit laptop');
  assert.equal(app_version, '1.0.0');
  assert.equal(events[0].at, NOW.toISOString());
  assert.deepEqual(events[0].detail, { clamped: true });
  assert.equal(events[1].at, NOW.toISOString());
  assert.deepEqual(events[1].detail, { x: 1, clamped: true });
  assert.equal(events[2].at, ok);
  assert.equal(events[2].detail, null);
  assert.equal(events[3].at, NOW.toISOString());
  assert.equal(events[3].task, null);
});

test('validate_caps_50', () => {
  const mk = (i: number) => ({ id: `id${i}`, at: NOW.toISOString(), kind: 'hint', task: 't1', rev: 1, step: 's' });
  const fifty = validateEvents(body(Array.from({ length: 50 }, (_, i) => mk(i))), NOW);
  assert.notEqual(typeof fifty, 'string');
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
  assert.equal(p.t1, undefined);
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
