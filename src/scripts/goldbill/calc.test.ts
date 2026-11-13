import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseRate, bill, fit, solve } from './calc.ts';

test('every result fits within 50 paise and 4 rupees of the base rate', () => {
  for (const [paid, fine] of [
    [1300000, 100],
    [1287654, 100],
    [2575000, 200],
    [650321, 50],
  ]) {
    const results = fit(paid, fine);
    assert.ok(results.length > 0, `no fit for ${paid}/${fine}`);
    const base = baseRate(paid, fine);
    for (const b of results) {
      assert.ok(Math.abs(b.diff) <= 0.5, `diff ${b.diff}`);
      assert.ok(Math.abs(b.rate - base) <= 4 + 1e-9);
      assert.ok(Math.abs(Math.round(b.weight * 100) - b.weight * 100) < 1e-6);
      assert.ok(Math.abs(Math.round(b.rate * 100) - b.rate * 100) < 1e-6);
      assert.deepEqual(bill(b.rate, b.weight, paid), b);
    }
  }
});

test('prefers whole-rupee rates when one fits', () => {
  const results = fit(1300000, 100);
  const whole = results.filter((b) => Number.isInteger(b.rate));
  if (whole.length) assert.ok(Number.isInteger(results[0].rate));
});

test('bad input gives nothing', () => {
  assert.deepEqual(fit(0, 100), []);
  assert.deepEqual(fit(100000, 0), []);
  assert.deepEqual(fit(NaN, 100), []);
});

test('solve always fits orders up to 200 g, weight to 2 decimals', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let widened = 0;
  for (let i = 0; i < 2000; i++) {
    const fine = [50, 100, 100, 100, 150, 200][Math.floor(rnd() * 6)];
    const paid = Math.round(fine * (11000 + rnd() * 3000));
    const a = solve(paid, fine);
    assert.ok(a.exact, `no fit for ${paid}/${fine}`);
    if (a.spread > 4) widened++;
    for (const b of a.bills) {
      assert.ok(Math.abs(b.diff) <= 0.5);
      assert.ok(Math.abs(Math.round(b.weight * 100) - b.weight * 100) < 1e-6);
    }
  }
  assert.ok(widened < 60, `widened ${widened} times`);
});
