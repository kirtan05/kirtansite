# /goldbill: gold bill calculator

Live at https://kirtanjain.com/goldbill. Built for Mummy and Papa (Shridarshan Jewellers).

## What it is for

The shop buys gold from the supplier (Nishitbhai) by paying a round amount by RTGS,
for a round number of grams of 24K gold: usually 100 g, at most 200 g. The supplier
then sends a bill. That bill has to come to exactly the amount we paid, to the rupee
(within 50 paise). Working out a rate and weight that land on that exact total
by hand is tedious, so this page does it.

## The business rule

- We pay **A** rupees (by RTGS) for **G** grams of 24K gold.
- The bill is written as **22K** gold. G grams of 24K is about G ÷ 0.92 grams of 22K
  (100 g becomes 108.7 g).
- The bill has **no wastage line**. The roughly 3% wastage is taken off the weight
  instead, so for 100 g the bill shows about **105.5 g**, not 108.7 g.
- **GST is 3%**, written as CGST 1.5% + SGST 1.5%.
- Rate and weight both have **2 decimals**.
- The bill total must be within **±₹0.50** of A. The small gap goes on a round-off line
  (`Less −0.16` or `Add +0.31`) so the net amount equals the RTGS amount exactly.
- The weight must **not be the same every time**. Every 200 g order coming out at
  211.06 g would look odd, so the weight is varied a little per order and the rate
  absorbs the difference.

## The formula

```
Starting rate (per gram, 22KT)  R0 = A ÷ G × 0.92
Centre weight                   W0 = G ÷ (0.92 × 1.03)     ≈ 1.0553 × G

Bill:
  value  = rate × weight                    (rounded to paise)
  CGST   = 1.5% of value                    (rounded to paise)
  SGST   = 1.5% of value                    (rounded to paise)
  total  = value + CGST + SGST
  round-off = A − total                     ("Less" if negative, "Add" if positive)
  net    = A
```

Why W0: with the rate exactly R0, `R0 × W × 1.03 = A` solves to `W = G ÷ (0.92 × 1.03)`.
So at the starting rate, 100 g always gives 105.53 g and 200 g always gives 211.06 g.
That is the repetition we avoid.

| G (24K) | W0 (centre) | Weight range used (±0.4%) | Slider range (±0.5%) |
|---|---|---|---|
| 100 g | 105.53 g | 105.11 – 105.95 g | 105.00 – 106.06 g |
| 150 g | 158.29 g | 157.66 – 158.93 g | 157.50 – 159.09 g |
| 200 g | 211.06 g | 210.22 – 211.90 g | 210.00 – 212.11 g |

Moving the weight by ±0.4% moves the rate by about ±0.4% the other way: up to roughly
±₹45–50 per gram at today's prices.

### Worked example

A = ₹13,00,000, G = 100 g:

```
R0 = 13,00,000 ÷ 100 × 0.92   = 11,960.00
W0 = 100 ÷ 0.9476             = 105.53 g
Picked weight (automatic)     = 105.85 g
Rate = 13,00,000 ÷ (1.03 × 105.85), to 2 decimals, chosen so the total fits
                              = 11,923.82
value  = 11,923.82 × 105.85   = 12,62,136.35
CGST + SGST                   = 37,864.10
total                         = 13,00,000.45
Less                          = −0.45
Net amount (RTGS)             = 13,00,000.00
```

## How the code finds the numbers

All the maths is in [`src/scripts/goldbill/calc.ts`](../../src/scripts/goldbill/calc.ts)
and runs in the browser. Nothing is sent to a server.

### 1. Pick a weight: `autoBill(paid, fine, n)`

```
w = round2( W0 × (1 + 0.004 × wobble(paid, fine, n)) )
```

`wobble` is a small hash of the amount, the grams and `n`, giving a number from −1 to 1.
The same order always gets the same weight, so reloading the page or sharing again
gives the same bill. A different amount gives a different weight. `n` is the
"Try another weight" counter: each press adds 1 and gives a new weight.

### 2. Fit the rate to that weight: `rateForWeight(paid, weight)`

```
rate ≈ A ÷ (1.03 × weight)       → try the nearest 2-decimal rate and its neighbours (±1 paisa)
```

A bill **fits** when both of these are within ₹0.50 of A:
- the line-by-line bill (each line rounded to paise, as written on paper), and
- the plain product `rate × weight × 1.03`.

Checking both means it fits however the supplier's billing rounds.

At 200 g, one paisa of rate moves the total by about ₹2.17, so a given weight
sometimes has no 2-decimal rate within 50 paise. Then the weight is moved by
0.01 g steps, nearest first (+0.01, −0.01, +0.02, …), up to ±0.25 g, until one fits.
In testing (20,000 random orders) the most it ever moved was 0.20 g, and about
two-thirds needed no move at all. If nothing fits (never seen), the closest bill
is returned and the page shows a warning at the bottom.

Moving 0.01 g at a time works but is not fast: neighbouring weights land on almost
the same total, so a miss usually takes several steps to clear.

### 3. `bill(rate, weight, paid)`

Builds the bill lines exactly as shown: value, CGST, SGST and total, each rounded to
paise, plus `diff = total − paid`.

### Other exports

- `baseRate(paid, fine)` is R0, shown under "How this is worked out".
- `centreWeight(fine)` is W0, used for the slider range.
- `fit()` and `solve()` are the first version: they keep the rate within ±₹4 of R0 and
  let the weight fall where it does. The page no longer uses them, because that always
  gives the same weight. They are kept, with tests, in case a fixed-rate mode is wanted.

## The page

[`src/pages/goldbill/index.astro`](../../src/pages/goldbill/index.astro) is a standalone
prerendered page with no shared layout and no login.

| Part | What it does |
|---|---|
| Amount paid (₹) | A. Commas and ₹ are ignored, so `13,00,000` works. |
| Gold bought (grams, 24K) | G. Quick buttons for 50/100/150/200 g. |
| Weight on bill (optional) | Type an exact weight and only the rate is fitted. This hides the slider. |
| Rate / Weight boxes | The two numbers for the bill, each with a Copy button. |
| Change the weight | Slider over W0 ± 0.5%, plus a **Try another weight** button. Changing the amount or grams resets both to the automatic weight. |
| Bill table | rate × weight, CGST, SGST, Bill total, Less/Add, Net amount (RTGS). |
| Share bill as image | Draws the bill on a canvas: "Gold bill", today's date, rate, weight and the bill lines. No notes, no site name. Opens the phone's share sheet (WhatsApp); on a laptop the image downloads instead. |
| How this is worked out | Collapsed explanation, so it is not visible when the page is shown or screenshotted for the supplier. |
| Warnings | Shown only when something is off, in small text at the very bottom. There is no "it matches" message, because the page gets shown to the supplier. |

### Privacy

- `<meta name="robots" content="noindex, nofollow, noarchive">`
- `Disallow: /goldbill` in `public/robots.txt`
- Excluded from the sitemap by the filter in `astro.config.mjs`

## Tests

```
node --test src/scripts/goldbill/calc.test.ts
```

[`calc.test.ts`](../../src/scripts/goldbill/calc.test.ts) checks:
- Automatic weights for 2,000 random orders (100–200 g, ₹11,000–14,000 per gram) all
  fit within 50 paise, stay within ±0.45% of W0, come back the same when asked again,
  and vary: more than 50 distinct weights at 200 g, and ₹30,32,000 vs ₹28,64,600 differ.
- A typed weight always fits, moving it by at most 0.25 g.
- Rate and weight always have 2 decimals.
- The old `solve()` still fits every order up to 200 g.
- Bad input (0, empty, NaN) returns nothing instead of crashing.

## Changing things

| To change | Edit |
|---|---|
| Purity factor (0.92) | `PURITY` in `calc.ts` |
| GST rate | `GST` in `calc.ts`. The CGST/SGST split is half each. |
| How much the automatic weight varies | `WEIGHT_SPREAD` in `calc.ts` (0.004 = ±0.4%) |
| Slider range | `SLIDE` in the page script (0.005 = ±0.5%) |
| Tolerance (50 paise) | the `0.5` passed to `fits()` in `rateForWeight` |
| Labels and bill lines | the page, and `billImage()` for the shared picture |

After changing the maths, run the tests. Deploying is a push to `main`; Cloudflare
Pages builds the site.

## History

- v1: rate ≈ A ÷ G × 22/24 with a separate 3% wastage line; rate kept within ±₹4.
- v2: rate factor 0.92; no wastage line (taken off the weight instead); optional typed
  weight; Less/Add round-off line.
- v3: Share as image; the "matches" note removed; explanation collapsed.
- v4: the weight varies per order (repeatable), with a slider and "Try another weight";
  rate labelled "per gram 22KT".
