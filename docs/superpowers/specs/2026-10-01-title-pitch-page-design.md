# /title — pitch page for the Title File service

Date: 2026-10-01. Status: design approved in chat; this build is the pitch page only.

## Why

Kirtan is visiting Nadiad (Kheda district) soon. He wants something to show advocates who
prepare title reports for banks and housing lenders, and a link they can forward. The
service already works by hand: the land-records app (`irmsc`) fetches every revenue record
for a survey number. The page sells the result of that service and says nothing about how it
is produced.

**Success:** at least one advocate calls or emails in a real survey number.

## The offer (approved)

For each survey number, delivered within 24 hours (requests in by 8 pm are delivered by
8 pm the next day):

1. **Revenue file**, as one indexed PDF:
   - current 7/12 and 8-A;
   - every Village Form 6 (હક્કપત્રક) entry, both typed and old handwritten, with number,
     date, type and status;
   - old 7/12 scans back to the earliest year available;
   - 135-D notices;
   - revenue court (iRCMS) cases;
   - registered transactions from 2007 onward.
2. **English draft**, as a Word file: the record-based items of the advocate's bank format,
   filled in. For Bank of Baroda's 20-item Title Opinion Report these are items 1, 2, 5–9, 14
   and 15, with the chain of title written in the Kheda style: "Effect is shown in revenue
   records by Entry No. __ dated __, certified on __".
3. **Points to check**, one page:
   - new or restricted tenure;
   - charges (બોજો) with no recorded release;
   - pending or rejected entries;
   - open 135-D notices;
   - revenue cases;
   - tenant entries;
   - heirs who don't appear in the record.

**Formats supported:** Bank of Baroda Title Opinion Report (20 items), SBI TIR (Annex B),
Canara LSR, and housing-lender LSRs.

**What stays with the advocate:** the sub-registrar search for years before 2007, checking
the originals, the opinion, and the signature. Kirtan never contacts the bank or the
borrower.

**Price:** the first 3 survey numbers are free. After that it is ₹199 per survey number,
paid by UPI after the file arrives.

## This build: the page

**Route:** `kirtanjain.com/title`, a standalone prerendered Astro page in `kirtansite`.
- It has its own `<html>`, like `/major`, and none of the personal site's nav or styles.
- `/land/*` belongs to the land-worker; this page touches none of it.
- The page is not linked from the personal site's nav. Indexing is allowed.

**Look:** the land app's approved "Cadastre" tokens (`irmsc/design/README.md`).
- Colour: field `#E9EEEC`, surface `#FBFCFB`, ink `#0F1614`, ochre accent `#B4531B`, and
  1px `#C9D3D0` borders. Dark mode uses the dark set, following the system setting.
- Parcel tiles: 1px border, radius 12, and a 1px dashed inset at 5px.
- Fonts: Space Grotesk for text, IBM Plex Mono for survey and entry numbers, Noto Sans
  Gujarati for Gujarati. All are OFL-licensed and self-hosted as woff2 under
  `public/fonts/title/`.
- Leave out: gradients, stock images, icon grids, animation, testimonials, invented numbers,
  and hype words.

**Layout and language:**
- Mobile first (360px up); on desktop it is one column of at most 760px.
- English carries the detail. Gujarati appears as the headline and section titles, and as
  the key lines, beside the English.
- Kirtan or his father reads the Gujarati copy before it deploys.

**Sections, top to bottom:**
1. **Masthead:** "Title File · ટાઇટલ ફાઇલ", then "For advocates preparing bank title reports
   in Kheda and Anand."
2. **Headline:** "Give a survey number today. Get the 30-year revenue file and a draft
   chain of title by tomorrow evening." Below it:
   - the Gujarati version;
   - two buttons: **Call** (`tel:+916360357636`) and **Email a request** (`mailto:`
     kirtanjain0504@gmail.com). The email opens with the subject "Title file request" and
     a blank template: district, taluka, village, survey/block no., bank format, name,
     mobile.
3. **What you get:** three parcel tiles (revenue file, English draft, points to check),
   listing the concrete contents from "The offer".
4. **Sample:** an excerpt shown on the page, not as an image. It has the chain-of-title
   paragraph, six rows of the entries table, and two points to check.
   - Below it: "Open the full sample (PDF)" and "Word draft (.docx)".
   - Labelled: "Real record. Names, village and survey number changed."
5. **In your bank's format:** the four formats in plain text, with the Bank of Baroda item
   numbers that come pre-filled. No bank logos.
6. **What stays with you:** the pre-2007 sub-registrar search, the originals, the opinion,
   the signature; and "I never contact the bank or the borrower."
7. **Price:** "First 3 survey numbers free. Then ₹199 per survey number, paid by UPI after
   you get the file."
8. **Footer:** Kirtan Jain, the mobile, the email, and one line: "Copies are taken from
   Government of Gujarat online land records. This is a records and drafting service, not
   legal advice."

**Link preview:**
- `og:title`: "Title File: 30-year revenue file for a survey number, ₹199".
- `og:description`: the Gujarati headline.
- `og:image`: a 1200×630 PNG of the sample's chain-of-title excerpt, in the page's styling.

**The page contains none of:** analytics, cookies, forms, or client-side JavaScript beyond
what the theme needs (none is planned).

## The sample file

**Source:** a real agricultural survey in Umreth taluka, Anand district, taken from the
`irmsc` corpus. The source path appears only in `names.private.json`: this repo is
public, and naming the village or survey here would undo the anonymising. The record
has:
- old tenure (જુની શરત);
- 16 typed Village Form 6 entries from 2005 to 2025: four Bank of Baroda charges and five
  releases, a certified sale in 2021, a sale rejected in 2022, two correction orders, a
  Collector's revision order in 2025, an entry adding heirs during the holder's lifetime
  (હયાતીમા હક દાખલ), and a relinquishment (હક કમી);
- 8 old handwritten entries;
- 1 deed row (sub-registrar, 2022).

**Anonymising:**
- Every person's name is replaced with a consistent fictional one.
- The village becomes "નમૂના ગામ / Sample village", and the survey becomes 412 પૈકી 1.
- The UPIN, the deed document number and revenue case/order numbers are replaced or
  masked: each one can be looked up on a government portal.
- Entry numbers and dates are kept.
- Bank names, branches and officials' designations are kept. Officials' names are replaced.
- Handwritten scans show real names. The sample includes them only as blurred thumbnails,
  marked "included in real files".
- Every page carries the watermark "SAMPLE: names changed".

**Contents:**
1. PDF (A4):
   - cover;
   - summary and points to check;
   - English draft laid out as Bank of Baroda items 1, 2, 5–9, 14 and 15;
   - annexures:
     - the 7/12, re-rendered from the stored HTML with the names substituted;
     - an entries table with a one-line English summary of each entry;
     - the full text of each typed entry (Gujarati, names changed);
     - blurred old scans;
     - the deed row.
2. The same draft as .docx.

The stored record has no 8-A and no GARVI (post-2007) registration search, so the sample marks
those two items "included in real files" rather than inventing them.

Both files are served from `public/title/`.

**Accuracy:**
- Kirtan checks every English summary against the Gujarati entry before the sample goes
  public.
- The draft says "draft for the advocate's review" at the top.

## Testing

- `astro build` passes.
- Check the page at 360px, 768px and 1280px, in light and dark mode.
- Gujarati renders with no missing-glyph boxes.
- The `tel:` and `mailto:` links open correctly on Android.
- The PDF and .docx open.
- OG tags are verified with a link-preview check after deploy.
- The Lighthouse accessibility score is at least 95.

## Deploy

Kirtan approves the page locally first. Then commit to `kirtansite` main and `git push`;
Cloudflare Pages builds from GitHub. Pushing publishes the mobile number and email on a
public page.

## Later (not in this build; agreed 2026-09-30)

**Request form on `/title`:**
- Fields: name, mobile, email; district, taluka and village chosen from the `irmsc`
  catalogue; one or more survey numbers; bank format; a note.
- No borrower details.

**Private request page:** `/title/r/<token>`.
- Shows the status: Received, then Being prepared, then Ready.
- When the file is ready: PDF and Word downloads, plus either "Free (n of 3)", counted per
  mobile, or ₹199 with a UPI QR code and intent link.

**Admin page:** `/title/admin`, password-gated like `/learning`.
- Lists requests.
- Upload files to R2.
- Mark a request Ready, which emails the advocate.
- Mark a request Paid.

**Email:** the site emails Kirtan on each new request and emails the advocate when the file
is ready.

**Out of scope even then:** accounts, payment gateways, and document uploads.
