import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoBill, baseRate, bill, fit, rateForWeight, solve } from './calc.ts';

const twoDp = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('100 g comes out near 105.5 g on the bill', () => {
  const [b] = fit(1300000, 100);
  assert.ok(b.weight > 105 && b.weight < 106, `weight ${b.weight}`);
  assert.ok(Math.abs(b.rate - baseRate(1300000, 100)) <= 4);
});

test('solve always fits orders up to 200 g, rate and weight to 2 decimals', () => {
  let widened = 0;
  for (let i = 0; i < 2000; i++) {
    const fine = [50, 100, 100, 100, 150, 200][Math.floor(rnd() * 6)];
    const paid = Math.round(fine * (11000 + rnd() * 3000));
    const a = solve(paid, fine);
    assert.ok(a.exact, `no fit for ${paid}/${fine}`);
    if (a.spread > 4) widened++;
    const base = baseRate(paid, fine);
    for (const b of a.bills) {
      assert.ok(Math.abs(b.diff) <= 0.5);
      assert.ok(Math.abs(b.rate - base) <= a.spread + 1e-9);
      assert.ok(twoDp(b.weight) && twoDp(b.rate));
      assert.deepEqual(bill(b.rate, b.weight, paid), b);
    }
  }
  assert.ok(widened < 20, `widened ${widened} times`);
});

test('rateForWeight fits a chosen weight, nudging it by at most 0.25 g', () => {
  for (let i = 0; i < 2000; i++) {
    const fine = [100, 100, 150, 200][Math.floor(rnd() * 4)];
    const paid = Math.round(fine * (11000 + rnd() * 3000));
    const weight = Math.round((fine / (0.92 * 1.03)) * (0.98 + rnd() * 0.04));
    const a = rateForWeight(paid, weight)!;
    assert.ok(a.exact, `no fit for ${paid} @ ${weight} g`);
    assert.ok(Math.abs(a.bill.diff) <= 0.5);
    assert.ok(Math.abs(a.bill.weight - weight) <= 0.25 + 1e-9);
    assert.ok(twoDp(a.bill.rate));
  }
});

test('bad input gives nothing', () => {
  assert.deepEqual(fit(0, 100), []);
  assert.deepEqual(solve(NaN, 100).bills, []);
  assert.equal(rateForWeight(100000, 0), null);
});

test('autoBill varies the weight, repeatably, and always fits', () => {
  const weights = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const fine = [100, 150, 200][Math.floor(rnd() * 3)];
    const paid = Math.round(fine * (11000 + rnd() * 3000));
    const a = autoBill(paid, fine)!;
    assert.ok(a.exact, `no fit for ${paid}/${fine}`);
    assert.ok(Math.abs(a.bill.diff) <= 0.5);
    const c = fine / (0.92 * 1.03);
    assert.ok(Math.abs(a.bill.weight / c - 1) <= 0.0045, `weight ${a.bill.weight} for ${fine}`);
    assert.deepEqual(autoBill(paid, fine), a);
    if (fine === 200) weights.add(a.bill.weight);
  }
  assert.ok(weights.size > 50, `only ${weights.size} different 200 g weights`);
  assert.notEqual(autoBill(3032000, 200)!.bill.weight, autoBill(2864600, 200)!.bill.weight);
  assert.notEqual(autoBill(3032000, 200, 0)!.bill.weight, autoBill(3032000, 200, 1)!.bill.weight);
});
