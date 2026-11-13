/**
 * Gold bill fitter for /goldbill.
 *
 * We send the supplier `paid` rupees by RTGS for `fine` grams of 24K gold.
 * The bill comes back as 22K, with the wastage absorbed into a lower weight
 * (100 g of 24K is about 108.7 g of 22K; the bill shows about 105.5 g):
 *
 *   value = rate x weight
 *   GST   = 3% of value (CGST 1.5% + SGST 1.5%)
 *   total = value + GST                  must equal `paid`, within 50 paise
 *
 * Rate and weight both have 2 decimals. The page uses autoBill(): pick a
 * weight a little off the centre (so it varies per order), then fit the rate
 * with rateForWeight(). fit()/solve() are the older fixed-rate approach.
 * Full explanation: docs/goldbill/README.md
 */

export const GST = 0.03;
export const PURITY = 0.92;

const r2 = (n: number) => Math.round(n * 100 + Number.EPSILON * Math.sign(n)) / 100;

export interface Bill {
  rate: number;
  weight: number;
  value: number;
  cgst: number;
  sgst: number;
  gst: number;
  total: number;
  /** total - paid, in rupees */
  diff: number;
}

/** The bill as each line would be written, every line rounded to paise. */
export function bill(rate: number, weight: number, paid: number): Bill {
  const value = r2(rate * weight);
  const cgst = r2(value * (GST / 2));
  const sgst = r2(value * (GST / 2));
  const gst = r2(cgst + sgst);
  const total = r2(value + gst);
  return { rate, weight, value, cgst, sgst, gst, total, diff: r2(total - paid) };
}

export const baseRate = (paid: number, fine: number) => (paid / fine) * PURITY;

const decimals = (n: number) => (Number.isInteger(n) ? 0 : Number.isInteger(r2(n * 10)) ? 1 : 2);

/** Fits within tolerance whether the bill rounds each line or not. */
const fits = (b: Bill, paid: number, tol: number) =>
  Math.abs(b.diff) <= tol && Math.abs(b.rate * b.weight * (1 + GST) - paid) <= tol + 1e-9;

/** All bills with a rate within `spread` rupees of the base rate, best first. */
export function fit(paid: number, fine: number, spread = 4, tol = 0.5): Bill[] {
  if (!(paid > 0) || !(fine > 0)) return [];
  const base = baseRate(paid, fine);
  const out: Bill[] = [];
  const lo = Math.ceil((base - spread) * 100);
  const hi = Math.floor((base + spread) * 100);
  for (let p = lo; p <= hi; p++) {
    const rate = p / 100;
    const w0 = Math.round((paid / (rate * (1 + GST))) * 100);
    for (const w of [w0 - 1, w0, w0 + 1]) {
      const b = bill(rate, w / 100, paid);
      if (fits(b, paid, tol)) out.push(b);
    }
  }
  out.sort(
    (a, b) =>
      decimals(a.rate) - decimals(b.rate) ||
      Math.abs(a.rate - base) - Math.abs(b.rate - base) ||
      Math.abs(a.diff) - Math.abs(b.diff),
  );
  return out;
}

export interface Answer {
  bills: Bill[];
  /** How far the rate had to move from the base rate (4 normally, more if nothing fit). */
  spread: number;
  /** False when nothing fit and `bills` holds only the closest bill. */
  exact: boolean;
}

/**
 * Rate within 4 rupees of the base rate; if nothing fits, widen a rupee at a
 * time up to 10, and failing that return the closest bill.
 */
export function solve(paid: number, fine: number): Answer {
  if (!(paid > 0) || !(fine > 0)) return { bills: [], spread: 4, exact: false };
  for (let spread = 4; spread <= 10; spread++) {
    const bills = fit(paid, fine, spread);
    if (bills.length) return { bills, spread, exact: true };
  }
  const near = fit(paid, fine, 4, Infinity);
  near.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  return { bills: near.slice(0, 1), spread: 4, exact: false };
}

export interface WeightAnswer {
  bill: Bill;
  /** The weight asked for; `bill.weight` differs only if it had to be nudged. */
  asked: number;
  exact: boolean;
}

/**
 * The weight is chosen by us (e.g. 105.00); find the rate that fits. If no
 * 2-decimal rate fits that exact weight, nudge the weight, nearest first,
 * (up to 0.25 g; 0.20 was the worst seen) and say so.
 */
export function rateForWeight(paid: number, weight: number): WeightAnswer | null {
  if (!(paid > 0) || !(weight > 0)) return null;
  weight = r2(weight);
  let closest: Bill | null = null;
  for (let i = 0; i <= 50; i++) {
    const step = i % 2 ? (i + 1) / 2 : -i / 2;
    const w = r2(weight + step / 100);
    const p0 = Math.round((paid / (w * (1 + GST))) * 100);
    const found = [p0, p0 - 1, p0 + 1]
      .map((p) => bill(p / 100, w, paid))
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    const ok = found.find((b) => fits(b, paid, 0.5));
    if (ok) return { bill: ok, asked: weight, exact: true };
    if (!closest || Math.abs(found[0].diff) < Math.abs(closest.diff)) closest = found[0];
  }
  return { bill: closest!, asked: weight, exact: false };
}

/** The weight the bill lands on if the rate is exactly the starting rate. */
export const centreWeight = (fine: number) => fine / (PURITY * (1 + GST));

/** A number in [-1, 1] that is always the same for the same inputs. */
function wobble(paid: number, fine: number, n: number): number {
  let h = 2166136261;
  for (const ch of `${paid}|${fine}|${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

/** Up to this fraction either side of the centre weight. */
export const WEIGHT_SPREAD = 0.004;

/**
 * Every 200 g order would otherwise come out at 211.06 g. Pick a weight a
 * little off the centre (the same one each time for the same amount, a new
 * one for each `n`) and fit the rate to it.
 */
export function autoBill(paid: number, fine: number, n = 0): WeightAnswer | null {
  if (!(paid > 0) || !(fine > 0)) return null;
  const w = r2(centreWeight(fine) * (1 + WEIGHT_SPREAD * wobble(paid, fine, n)));
  return rateForWeight(paid, w);
}
