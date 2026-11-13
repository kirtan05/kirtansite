/**
 * Gold bill fitter for /goldbill.
 *
 * We send the supplier `paid` rupees by RTGS for `fine` grams of 24K gold.
 * The bill comes back as 22K jewellery:
 *
 *   value   = rate x weight
 *   wastage = 3% of value
 *   GST     = 3% of (value + wastage)
 *   total   = value + wastage + GST          must equal `paid`, within 50 paise
 *
 * The rate starts at paid / fine x 22/24 and may move a few rupees; rate and
 * weight both have at most 2 decimals. We pick the rate with the fewest
 * decimals, then the one closest to the starting rate, then the smallest gap.
 */

export const WASTAGE = 0.03;
export const GST = 0.03;

const r2 = (n: number) => Math.round(n * 100 + Number.EPSILON * Math.sign(n)) / 100;

export interface Bill {
  rate: number;
  weight: number;
  value: number;
  wastage: number;
  taxable: number;
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
  const wastage = r2(value * WASTAGE);
  const taxable = r2(value + wastage);
  const cgst = r2(taxable * (GST / 2));
  const sgst = r2(taxable * (GST / 2));
  const gst = r2(cgst + sgst);
  const total = r2(taxable + gst);
  return { rate, weight, value, wastage, taxable, cgst, sgst, gst, total, diff: r2(total - paid) };
}

export const baseRate = (paid: number, fine: number) => (paid / fine) * (22 / 24);

const decimals = (n: number) => (Number.isInteger(n) ? 0 : Number.isInteger(r2(n * 10)) ? 1 : 2);

export interface FitOptions {
  /** How far the rate may move from the base rate, in rupees. */
  spread?: number;
  /** Largest allowed |total - paid|, in rupees. */
  tolerance?: number;
}

/** All bills that fit, best first. Empty if nothing fits. */
export function fit(paid: number, fine: number, opts: FitOptions = {}): Bill[] {
  const spread = opts.spread ?? 4;
  const tol = opts.tolerance ?? 0.5;
  if (!(paid > 0) || !(fine > 0)) return [];
  const base = baseRate(paid, fine);
  const factor = (1 + WASTAGE) * (1 + GST);
  const out: Bill[] = [];
  const lo = Math.ceil((base - spread) * 100);
  const hi = Math.floor((base + spread) * 100);
  for (let p = lo; p <= hi; p++) {
    const rate = p / 100;
    const w0 = Math.round((paid / (rate * factor)) * 100);
    for (const w of [w0 - 1, w0, w0 + 1]) {
      const b = bill(rate, w / 100, paid);
      // Both the line-by-line bill and the plain formula must land within tolerance,
      // so it fits however the bill book rounds.
      const plain = rate * (1 + WASTAGE) * b.weight * (1 + GST);
      if (Math.abs(b.diff) <= tol && Math.abs(plain - paid) <= tol + 1e-9) out.push(b);
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
 * Weight always has 2 decimals. Try a rate within 4 rupees of the base rate;
 * on the rare order where nothing fits (about 2 in 100 at 150-200 g), widen a
 * rupee at a time up to 10, and failing that return the closest bill.
 */
export function solve(paid: number, fine: number): Answer {
  if (!(paid > 0) || !(fine > 0)) return { bills: [], spread: 4, exact: false };
  for (let spread = 4; spread <= 10; spread++) {
    const bills = fit(paid, fine, { spread });
    if (bills.length) return { bills, spread, exact: true };
  }
  const near = fit(paid, fine, { spread: 4, tolerance: Infinity });
  near.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  return { bills: near.slice(0, 1), spread: 4, exact: false };
}
