# /title Pitch Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `kirtanjain.com/title`, a static pitch page for the Title File service, together with an anonymised sample file (PDF and Word) built from one real land record.

**Architecture:** A Python builder in `scripts/title-sample/` does four things:
- reads a record fetched by the land-records app (`irmsc`);
- replaces every real name, identifying number and place using a gitignored private map, then proves none survive;
- renders the sample PDF, the OG image and the Word draft through headless Chrome and python-docx;
- writes a small excerpt JSON.

The Astro page at `src/pages/title/index.astro` is prerendered and has no client JS. It reads that JSON and links the generated files. `scripts/check-title.mjs` checks the built page.

**Tech Stack:**
- Astro 5 (static route inside the Cloudflare Pages site).
- Plain CSS with the Cadastre tokens.
- Python 3 stdlib plus Pillow; python-docx and fontTools run through `uv run --with`.
- Google Chrome headless (`/opt/google/chrome/chrome`).
- Node `assert` for page checks; `unittest` for the builder.

**Spec:** `docs/superpowers/specs/2026-10-01-title-pitch-page-design.md`

## Global Constraints

- **Route and URLs:**
  - `kirtanjain.com/title`, a standalone prerendered page with its own `<html>`, like `/major`.
  - The page has no personal-site nav and is not linked from the nav. Indexing is allowed.
  - Never touch `/land/*`.
- **Contact:**
  - Call: `tel:+916360357636`, shown as `63603 57636`.
  - Email: `mailto:kirtanjain0504@gmail.com`, subject `Title file request`, body template lines `District:`, `Taluka:`, `Village:`, `Survey / block no.:`, `Bank format (Bank of Baroda / SBI / Canara / housing finance / other):`, `Your name:`, `Mobile:`.
- **Price:** "First 3 survey numbers free. Then ₹199 per survey number, paid by UPI after you get the file."
- **Tokens (light):** bg `#E9EEEC`, surface `#FBFCFB`, surfaceAlt `#DFE6E4`, ink `#0F1614`, ink2 `#4B5754`, ink3 `#7C8785`, line `#C9D3D0`, hair `#DCE3E1`, accent `#B4531B`, accentSoft `#F7E7DA`, onAccent `#FFF9F4`.
- **Tokens (dark):** bg `#0D1214`, surface `#151B1E`, surfaceAlt `#1E2629`, ink `#E9EEEE`, ink2 `#A2AFB0`, ink3 `#6F7C7E`, line `#283336`, hair `#212A2D`, accent `#E58A55`, accentSoft `#2A1C13`, onAccent `#150D07`.
- **Fonts:** Space Grotesk (text), IBM Plex Mono (numbers and labels), Noto Sans Gujarati (all Gujarati). Self-hosted woff2 in `public/fonts/title/`.
- **Layout:** mobile first from 360px; one column, at most 760px wide.
- **Copy rules:**
  - No gradients, stock images, icon grids, animation, testimonials, invented numbers or hype words.
  - Say nothing about how records are fetched: no captcha, scraping, bots, automation or AI.
- **Gujarati markup:** every Gujarati text run sits inside an element with `lang="gu"`.
- **Page restrictions:** no analytics, cookies, forms or `<script>`.
- **Sample labelling:** "Real record. Names, village and survey number changed."; watermark "SAMPLE: names changed" on every PDF page.
- **Names and identifiers:**
  - The village becomes `નમૂના ગામ` / `Sample village`, and the survey becomes `412 પૈકી 1`.
  - Entry numbers and dates are kept.
  - The UPIN, the deed document number and revenue order numbers are replaced or masked.
  - Handwritten scans appear only blurred.
- **Privacy of the source:** nothing committed may name the real village, the survey, the source path or any real person. The real-to-fictional map and the source path live only in `scripts/title-sample/names.private.json`, which is gitignored.
- **Deploy:** Kirtan approves locally first, then `git push` to `origin main`; Cloudflare Pages builds from GitHub. Nothing is pushed before that approval.

## Review Focus

1. **A real identity leaks.** Possible routes: a spelling variant (ઇ/ઈ, િ/ી), a person who appears only in an old scan, an English transliteration in the draft, a UPIN, or an order or deed number. A reasonable person expects the public sample to identify no one.
   - Tests: Task 1 (`test_find_leaks_*`), and Task 3 (`test_outputs_have_no_leaks`, which runs over every generated artefact).
2. **The WhatsApp preview fails.** Causes: a relative `og:image`, or a PNG that is too large or the wrong size. A forwarded link should show a large preview card.
   - Test: Task 4, `check-title.mjs` asserts an absolute URL and a 1200×630 PNG under 300 KB.
3. **The email template arrives as one line** in the Android Gmail app because the line breaks weren't encoded.
   - Test: Task 4, `check-title.mjs` asserts `%0D%0A` in the mailto body.
4. **Gujarati falls back to a system font or breaks conjuncts** on phones.
   - Tests: Task 4 checks every Gujarati run is under `lang="gu"`; Task 5 reviews screenshots at 360px.
5. **Look-alike digits corrupt numbers.** Legacy e-Dhara text types પ for ૫ and ર for ૨ (`૧૧૩૮પ`, `ર૦રર`), so entry numbers or dates in the excerpt could come out wrong.
   - Tests: Task 2, `test_gu_num_*` and `test_content_rows_match_record`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `scripts/title-sample/anon.py` | Folding, name replacement, leak detection, `check` CLI |
| `scripts/title-sample/record.py` | Parses one `irmsc` survey folder into a plain dict; `gu_num`; `names`/`dump` CLI |
| `scripts/title-sample/build.py` | Renders the sample HTML → PDF, OG HTML → PNG, the draft .docx, and the page excerpt JSON |
| `scripts/title-sample/content.json` | Hand-written English: entry summaries, BoB draft items, points to check, excerpt choice (fictional names only) |
| `scripts/title-sample/names.private.json` | **Gitignored.** Real→fictional people, places and numbers, plus `source` path |
| `scripts/title-sample/tests/` | `unittest` suites: `test_anon.py`, `test_record.py`, `test_content.py`, `test_build.py` |
| `public/fonts/title/*.woff2` | Five self-hosted fonts |
| `public/title/title-file-sample.pdf`, `title-file-sample-draft.docx`, `og.png` | Generated artefacts served by the page |
| `src/data/title-sample.json` | Generated excerpt the page renders |
| `src/styles/title.css` | Tokens, font faces, page styles |
| `src/pages/title/index.astro` | The page |
| `scripts/check-title.mjs` | Post-build checks on `dist/` |
| `.gitignore`, `package.json` | Ignore private and build files; `check:title` script |

All builder commands run from `scripts/title-sample/`. Tests run with `python3 -m unittest discover -s tests -t . -v` from that directory; `tests/` is a package (empty `__init__.py`) so suites can share the fixture.

---

### Task 1: Anonymiser and leak detector

**Files:**
- Create: `scripts/title-sample/anon.py`
- Create: `scripts/title-sample/tests/__init__.py` (empty)
- Create: `scripts/title-sample/tests/test_anon.py`
- Modify: `.gitignore` (append three lines)

**Interfaces:**
- Produces:
  - `fold(s: str) -> str`
  - `load_map(path) -> dict` with keys `people: dict[str,str]`, `places: dict[str,str]`, `source: str`
  - `anonymise(text: str, m: dict) -> str`
  - `anonymise_obj(obj, m: dict)`, which recurses through dicts and lists and skips the key `scans`
  - `find_leaks(text: str, m: dict) -> list[str]`
  - `text_of(path) -> str`, which reads .docx XML text or plain files
  - CLI: `python3 anon.py check --map MAP FILE...`, exiting 1 on leaks

- [ ] **Step 1: Ignore private and build files**

Append to `.gitignore`:

```
# /title sample builder: the name map pairs real people with a real record (public repo)
scripts/title-sample/names.private.json
scripts/title-sample/build/
scripts/title-sample/**/__pycache__/
```

- [ ] **Step 2: Write the failing tests** (all names here are invented)

`scripts/title-sample/tests/test_anon.py`:

```python
import json
import tempfile
import unittest
from pathlib import Path

from anon import anonymise, anonymise_obj, find_leaks, fold, load_map, text_of

MAP = {
    "people": {
        "હરેશભાઇ જયંતિભાઇ પટેલ": "રમેશભાઇ નટુભાઇ પટેલ",
        "હરેશભાઇ": "રમેશભાઇ",
        "Hareshbhai Jayantibhai Patel": "Rameshbhai Natubhai Patel",
    },
    "places": {"ધોળીપુરા": "નમૂના ગામ", "૧૭૭": "૪૧૨", "177": "412", "GJ831234567890": "GJ83XXXXXXXXXX"},
    "source": "/tmp/nowhere",
}


class Fold(unittest.TestCase):
    def test_fold_merges_i_variants(self):
        self.assertEqual(fold("ભાઈ"), fold("ભાઇ"))

    def test_fold_merges_long_short_vowels(self):
        self.assertEqual(fold("દીપ"), fold("દિપ"))


class Anonymise(unittest.TestCase):
    def test_replaces_spelling_variant(self):
        self.assertEqual(anonymise("હરેશભાઈ જયંતિભાઈ પટેલ", MAP), "રમેશભાઇ નટુભાઇ પટેલ")

    def test_longest_key_wins(self):
        self.assertEqual(anonymise("હરેશભાઇ જયંતિભાઇ પટેલ ના ખાતે", MAP), "રમેશભાઇ નટુભાઇ પટેલ ના ખાતે")

    def test_digit_keys_respect_boundaries(self):
        self.assertEqual(anonymise("સ.નં.૧૭૭/પૈકી અને ૧૭૭૮", MAP), "સ.નં.૪૧૨/પૈકી અને ૧૭૭૮")

    def test_obj_skips_scan_paths(self):
        rec = {"village": "ધોળીપુરા", "old_entries": [{"number": "894", "scans": ["/x/ધોળીપુરા/e.png"]}]}
        out = anonymise_obj(rec, MAP)
        self.assertEqual(out["village"], "નમૂના ગામ")
        self.assertEqual(out["old_entries"][0]["scans"], ["/x/ધોળીપુરા/e.png"])

    def test_load_map_rejects_fictional_value_containing_real_key(self):
        bad = {"people": {"હરેશભાઇ": "હરેશભાઇ મહેતા"}, "places": {}}
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "m.json")
            p.write_text(json.dumps(bad), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_map(p)


class Leaks(unittest.TestCase):
    def test_find_leaks_flags_real_token_alone(self):
        self.assertIn("જયંતિભાઇ", find_leaks("વારસ જયંતીભાઈ દાખલ", MAP))

    def test_find_leaks_flags_unmapped_name_shape(self):
        self.assertIn("સુરેશભાઇ", find_leaks("સુરેશભાઇ એ અરજી કરી", MAP))

    def test_find_leaks_flags_unmapped_english_name(self):
        self.assertIn("Sureshbhai", find_leaks("sold to Sureshbhai Patel", MAP))

    def test_find_leaks_flags_upin(self):
        self.assertIn("GJ831234567899", find_leaks("UPIN GJ831234567899", MAP))

    def test_find_leaks_flags_place_key(self):
        self.assertIn("ધોળીપુરા", find_leaks("મોજે ધોળીપુરા", MAP))

    def test_text_of_drops_data_uris(self):
        # Base64 fonts and images are random text; left in, they trip the name checks.
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "a.html")
            p.write_text('<img src="data:image/png;base64,QUJDaareshbhaiRA==">ok', encoding="utf-8")
            self.assertEqual(text_of(p).strip(), '<img src=" ">ok')

    def test_find_leaks_allows_fictional_and_shared_surname(self):
        self.assertEqual(find_leaks("રમેશભાઇ નટુભાઇ પટેલ, Rameshbhai Natubhai Patel, પટેલ, નમૂના ગામ", MAP), [])
```

- [ ] **Step 3: Run the tests and check they fail**

Run: `cd scripts/title-sample && python3 -m unittest discover -s tests -t . -v`
Expected: `ModuleNotFoundError: No module named 'anon'`

- [ ] **Step 4: Implement `anon.py`**

```python
"""Replace real names in the /title sample, and prove none survive.

names.private.json pairs the real people in the source record with invented
ones, and holds the source path. It is gitignored: kirtansite is a public repo,
and that file is the only place where this record and those people meet.
"""
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

# The same name is spelled differently from entry to entry: ઇ/ઈ, િ/ી, ુ/ૂ, joiners.
_FOLD = str.maketrans({"ઈ": "ઇ", "ી": "િ", "ૂ": "ુ", "ઊ": "ઉ", "‌": None, "‍": None, "઼": None})
_CLASS = {"ઇ": "[ઇઈ]", "ઈ": "[ઇઈ]", "િ": "[િી]", "ી": "[િી]", "ુ": "[ુૂ]", "ૂ": "[ુૂ]", "ઉ": "[ઉઊ]", "ઊ": "[ઉઊ]"}
_HONORIFICS = ("ભાઇ", "બેન", "કુમાર", "બીબી", "bhai", "ben", "kumar", "bibi")
_COMMON = {"પટેલ", "શ્રી", "વિગેરે", "patel", "shri"}
_UPIN = re.compile(r"GJ\d{8,}")
_SKIP_KEYS = {"scans"}
_DATA_URI = re.compile(r"data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+")


def fold(s: str) -> str:
    return unicodedata.normalize("NFC", s).translate(_FOLD).lower()


def _tokens(s: str) -> list[str]:
    return [t for t in re.split(r"[\s,.;:()\-/|'\"“”‘’]+", s) if t]


def _pattern(key: str) -> re.Pattern:
    parts = []
    for ch in key:
        if ch.isspace():
            parts.append(r"\s+")
            continue
        parts.append(_CLASS.get(ch, re.escape(ch)))
        parts.append("[‌‍]?")
    pat = "".join(parts)
    if key.isdigit():
        pat = rf"(?<![0-9૦-૯]){pat}(?![0-9૦-૯])"
    return re.compile(pat, re.IGNORECASE)


def load_map(path) -> dict:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    m = {"people": raw.get("people", {}), "places": raw.get("places", {}), "source": raw.get("source", "")}
    for real in list(m["people"]) + list(m["places"]):
        for fake in list(m["people"].values()) + list(m["places"].values()):
            if fold(real) in fold(fake):
                raise ValueError(f"fictional value {fake!r} contains real key {real!r}")
    return m


def anonymise(text: str, m: dict) -> str:
    pairs = {**m["people"], **m["places"]}
    for real in sorted(pairs, key=len, reverse=True):
        text = _pattern(real).sub(lambda _m, v=pairs[real]: v, text)
    return text


def anonymise_obj(obj, m: dict):
    if isinstance(obj, str):
        return anonymise(obj, m)
    if isinstance(obj, list):
        return [anonymise_obj(x, m) for x in obj]
    if isinstance(obj, dict):
        return {k: (v if k in _SKIP_KEYS else anonymise_obj(v, m)) for k, v in obj.items()}
    return obj


def find_leaks(text: str, m: dict) -> list[str]:
    folded = fold(text)
    fictional = {fold(t) for v in list(m["people"].values()) + list(m["places"].values()) for t in _tokens(v)}
    leaks = set()
    for real in list(m["people"]) + list(m["places"]):
        if _pattern(real).search(text):
            leaks.add(real)
    for real in m["people"]:
        for tok in _tokens(real):
            f = fold(tok)
            if len(f) >= 3 and f not in _COMMON and f not in fictional and f in folded:
                leaks.add(tok)
    for tok in _tokens(text):
        f = fold(tok)
        if len(f) > 4 and f.endswith(_HONORIFICS) and f not in fictional:
            leaks.add(tok)
    leaks.update(_UPIN.findall(text))
    return sorted(leaks)


def text_of(path) -> str:
    path = Path(path)
    if path.suffix == ".docx":
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8")
        return re.sub(r"<[^>]+>", " ", xml)
    return _DATA_URI.sub(" ", path.read_text(encoding="utf-8"))


def main(argv: list[str]) -> int:
    if len(argv) < 4 or argv[0] != "check" or argv[1] != "--map":
        print("usage: anon.py check --map names.private.json FILE...", file=sys.stderr)
        return 2
    m = load_map(argv[2])
    bad = 0
    for f in argv[3:]:
        leaks = find_leaks(text_of(f), m)
        if leaks:
            bad += 1
            print(f"LEAK {f}: {', '.join(leaks)}")
    print("no leaks" if not bad else f"{bad} file(s) leak")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd scripts/title-sample && python3 -m unittest discover -s tests -t . -v`
Expected: 14 tests, `OK`

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/title-sample/anon.py scripts/title-sample/tests/__init__.py scripts/title-sample/tests/test_anon.py
git commit -m "feat(title): anonymiser and leak detector for the sample file"
```

---

### Task 2: Record parser, private map and hand-written content

**Files:**
- Create: `scripts/title-sample/record.py`
- Create: `scripts/title-sample/tests/test_record.py`
- Create: `scripts/title-sample/tests/test_content.py`
- Create: `scripts/title-sample/content.json`
- Create, never committed: `scripts/title-sample/names.private.json`

**Interfaces:**
- Consumes: `anon.load_map`, `anon.anonymise_obj`, `anon.find_leaks` (Task 1).
- Produces:
  - `gu_num(s: str) -> str`: Gujarati digits (plus the look-alikes પ/ર inside digit runs) to ASCII.
  - `load_record(src: Path) -> dict` with keys:
    - `district`, `taluka`, `village`, `survey`, `area`, `assessment`, `tenure`, `land_use`, `as_of` (dd/mm/yyyy), `upin`, `khata`;
    - `owners: [{name, entry}]`, `boja_entries: [str]`, `boja_notes: [str]`, `tenants: [str]`;
    - `entries: [{number, date, type, status, text, related, remark}]`, oldest first;
    - `old_entries: [{number, scans: [str]}]`;
    - `deeds: [{sro, year, doc_no, date, amount, parties: [{role, name}]}]`.
  - CLI: `python3 record.py names SRC` lists candidate names; `python3 record.py dump --map MAP` prints the anonymised record as JSON (the source comes from the map).
  - `content.json` schema:
    - `summaries: {entry_no: str}` for every typed entry;
    - `old_summaries: {entry_no: str}` for every scanned entry;
    - `draft: [{item, heading, text}]` for items `1, 2, 5, 6, 7, 8, 9, 14, 15`;
    - `points: [{title, detail, entries: [str]}]`, at least 2;
    - `excerpt_rows: [entry_no × 6]`;
    - `excerpt_points: [index × 2]`;
    - `chain_excerpt: str`, a substring of item 15's text.

- [ ] **Step 1: Write the failing parser tests** (the fixture is invented and built in a temp dir)

`scripts/title-sample/tests/test_record.py`:

```python
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from record import gu_num, load_record

HTML = """<html><body><table>
<tr><td>UPIN (Unique Property Identification Number)</td><td>GJ830000000001</td></tr>
<tr><td>Ownership Details (ખાતેદારની વિગતો)</td></tr>
<tr><td>ખાતા નંબર </td><td>ક્ષેત્રફળ</td><td>આકાર</td><td>નોંધ નંબરો તથા ખાતેદાર</td></tr>
<tr><td>૧,૯૦૧,</td></tr><tr><td>-----------</td></tr>
<tr><td>૫૦૧</td><td>૦-૫૦-૦૦</td><td>૬.પ૦</td><td>પટેલ રમેશભાઇ નટુભાઇ(૯૦૧)</td></tr>
<tr><td>Boja and Other Rights Details (બોજા અને બીજા હક્ક ની વિગતો)</td></tr>
<tr><td>બોજા અને બીજા હક્ક ની વિગતો</td></tr>
<tr><td>૮૯૪,૯૦૨,</td></tr><tr><td>-----------</td></tr>
<tr><td>બેંક ઓફ બરોડાનો બોજો&lt;૦&gt;</td></tr>
<tr><td>Tenant Details (ગણોતિયાની વિગતો)</td></tr><tr><td>ગણોતિયા</td></tr>
<tr><td>Crop Details (પાક ની વિગતો)</td></tr>
</table></body></html>"""

REC = {
    "survey": "900", "token": "T", "district": "આણંદ", "taluka": "ઉમરેઠ", "village": "નમૂના",
    "survey_label": "૯૦૦", "total_area": "૦-૫૦-૦૦", "total_assessment": "૬.પ૦",
    "tenure": "જુની શરત (જુ.શ)", "land_use": "ખેતીલાયક ઉપયોગ", "as_of": "01/01/2026 10:00:00",
    "computerised_entries": [
        ["11385 01/03/2022 વેચાણ નામંજૂર", "વેચાણ નોંધ", "900(501)", "નામંજૂર"],
        ["901 02/03/2005 હયાતીમા હક દાખલ પ્રમાણિત", "વારસ દાખલ", "900(501)", "પ્રમાણિત"],
    ],
    "deeds": [],
    "entry_index": [{"index": 0, "number": "1", "red": True}],
}
DEEDS = [
    ["S.R.O - UMRETH", "900/પૈકી", "2022", "438", "24/02/2022", "આપનાર", "રમેશભાઇ નટુભાઇ પટેલ", "753900", "View Deed"],
    ["S.R.O - UMRETH", "900/પૈકી", "2022", "438", "24/02/2022", "લેનાર", "મહેશભાઇ કાંતિભાઇ શાહ", "753900", "View Deed"],
]


def make_fixture(d: Path) -> Path:
    (d / "entries").mkdir()
    (d / "anyror_T.json").write_text(json.dumps(REC, ensure_ascii=False), encoding="utf-8")
    (d / "anyror_T.html").write_text(HTML, encoding="utf-8")
    (d / "deeds.json").write_text(json.dumps(DEEDS, ensure_ascii=False), encoding="utf-8")
    for n, p in [("894", 1), ("894", 2), ("1474", 1)]:
        Image.new("RGB", (40, 20), "white").save(d / "entries" / f"entry_{n}_p{p}.png")
    return d


class GuNum(unittest.TestCase):
    def test_gu_num_plain_digits(self):
        self.assertEqual(gu_num("૧૩૪૩૯"), "13439")

    def test_gu_num_lookalike_pa_for_five(self):
        self.assertEqual(gu_num("૧૧૩૮પ"), "11385")

    def test_gu_num_lookalike_ra_for_two(self):
        self.assertEqual(gu_num("ર૦રર"), "2022")

    def test_gu_num_leaves_words_alone(self):
        self.assertEqual(gu_num("સ.નં.૧૭૪/પૈકી"), "સ.નં.174/પૈકી")


class LoadRecord(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.rec = load_record(make_fixture(Path(self.tmp.name)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_fields(self):
        r = self.rec
        self.assertEqual((r["survey"], r["area"], r["assessment"], r["as_of"]), ("૯૦૦", "0-50-00", "6.50", "01/01/2026"))
        self.assertEqual((r["upin"], r["khata"]), ("GJ830000000001", "501"))

    def test_owners_and_boja(self):
        self.assertEqual(self.rec["owners"], [{"name": "પટેલ રમેશભાઇ નટુભાઇ", "entry": "901"}])
        self.assertEqual(self.rec["boja_entries"], ["894", "902"])
        self.assertEqual(self.rec["boja_notes"], ["બેંક ઓફ બરોડાનો બોજો"])
        self.assertEqual(self.rec["tenants"], [])

    def test_entries_sorted_oldest_first_with_status(self):
        e = self.rec["entries"]
        self.assertEqual([x["number"] for x in e], ["901", "11385"])
        self.assertEqual((e[0]["type"], e[0]["status"]), ("હયાતીમા હક દાખલ", "પ્રમાણિત"))
        self.assertEqual((e[1]["type"], e[1]["status"]), ("વેચાણ", "નામંજૂર"))

    def test_old_entries_group_scan_pages(self):
        old = self.rec["old_entries"]
        self.assertEqual([o["number"] for o in old], ["894", "1474"])
        self.assertEqual(len(old[0]["scans"]), 2)

    def test_deeds_group_parties(self):
        d = self.rec["deeds"]
        self.assertEqual(len(d), 1)
        self.assertEqual((d[0]["year"], d[0]["doc_no"], d[0]["amount"]), ("2022", "438", "753900"))
        self.assertEqual([p["role"] for p in d[0]["parties"]], ["આપનાર", "લેનાર"])
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `cd scripts/title-sample && python3 -m unittest tests.test_record -v`
Expected: `ModuleNotFoundError: No module named 'record'`

- [ ] **Step 3: Implement `record.py`**

```python
"""Read one survey folder saved by the land-records app (irmsc) into a plain dict.

The folder holds anyror_<token>.json (header fields + typed entries), the saved
detail page anyror_<token>.html (owners, charges, tenants, UPIN), deeds.json and
entries/entry_<no>_p<page>.png scans of the old handwritten entries.
"""
import html
import json
import re
import sys
from pathlib import Path

_DIGITS = str.maketrans("૦૧૨૩૪૫૬૭૮૯", "0123456789")
_LOOKALIKE = re.compile(r"(?<=[૦-૯0-9])[પર]|[પર](?=[૦-૯0-9])")
_AREA = re.compile(r"^[૦-૯પર]+-[૦-૯પર]+-[૦-૯પર]+$")
_HEADER = re.compile(r"^(\S+)\s+(\d{2}/\d{2}/\d{4})\s+(.+)\s+(\S+)$")


def gu_num(s: str) -> str:
    """Gujarati digits to ASCII. e-Dhara text types ૫ as પ and ૨ as ર; those are
    swapped only where they touch a digit, repeatedly, so ર૦રર becomes 2022."""
    while True:
        swapped = _LOOKALIKE.sub(lambda m: "૫" if m.group() == "પ" else "૨", s)
        if swapped == s:
            return s.translate(_DIGITS)
        s = swapped


def _lines(page: str) -> list[str]:
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", page, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
    return [ln.strip() for ln in t.split("\n") if ln.strip()]


def _block(lines: list[str], start: str, stop: str) -> list[str]:
    i = next(k for k, ln in enumerate(lines) if ln.startswith(start))
    j = next(k for k in range(i + 1, len(lines)) if lines[k].startswith(stop))
    return lines[i + 1:j]


def _number_list(ln: str) -> list[str] | None:
    parts = [p for p in ln.split(",") if p.strip()]
    if parts and all(re.fullmatch(r"[૦-૯પર0-9]+#?", p.strip()) for p in parts):
        return [gu_num(p.strip().rstrip("#")) for p in parts]
    return None


def _date_key(d: str) -> tuple:
    dd, mm, yy = d.split("/")
    return int(yy), int(mm), int(dd)


def load_record(src: Path) -> dict:
    src = Path(src)
    raw = json.loads(next(src.glob("anyror_*.json")).read_text(encoding="utf-8"))
    lines = _lines(next(src.glob("anyror_*.html")).read_text(encoding="utf-8"))

    upin = lines[lines.index("UPIN (Unique Property Identification Number)") + 1]
    own = _block(lines, "Ownership Details", "Boja and Other Rights Details")
    a = next(k for k, ln in enumerate(own) if _AREA.match(ln))
    owners = []
    for ln in own[a + 2:]:
        m = re.match(r"^(.*?)\(([૦-૯પર0-9]+)\)$", ln)
        owners.append({"name": m.group(1).strip(), "entry": gu_num(m.group(2))} if m else {"name": ln, "entry": ""})

    boja_entries, boja_notes = [], []
    for ln in _block(lines, "Boja and Other Rights Details", "Tenant Details")[1:]:
        nums = _number_list(ln)
        if nums:
            boja_entries += nums
        elif not set(ln) <= {"-"}:
            boja_notes.append(ln.replace("<૦>", "").strip())
    tenants = [ln for ln in _block(lines, "Tenant Details", "Crop Details") if ln != "ગણોતિયા"]

    entries = []
    for head, text, related, remark in raw.get("computerised_entries", []):
        m = _HEADER.match(head.strip())
        entries.append({"number": gu_num(m.group(1)), "date": m.group(2), "type": m.group(3).strip(),
                        "status": m.group(4), "text": text, "related": related, "remark": remark})
    entries.sort(key=lambda e: _date_key(e["date"]))

    scans: dict[str, list[str]] = {}
    for p in sorted((src / "entries").glob("entry_*_p*.png")):
        n = re.match(r"entry_(\d+)_p(\d+)\.png", p.name).group(1)
        scans.setdefault(n, []).append(str(p))
    old_entries = [{"number": n, "scans": scans[n]} for n in sorted(scans, key=int)]

    deeds: dict[tuple, dict] = {}
    deeds_path = src / "deeds.json"
    for row in json.loads(deeds_path.read_text(encoding="utf-8")) if deeds_path.exists() else []:
        sro, _survey, year, doc_no, date, role, name, amount = row[:8]
        d = deeds.setdefault((year, doc_no), {"sro": sro, "year": year, "doc_no": doc_no, "date": date,
                                               "amount": amount, "parties": []})
        d["parties"].append({"role": role, "name": name})

    return {
        "district": raw["district"], "taluka": raw["taluka"], "village": raw["village"],
        "survey": raw["survey_label"], "area": gu_num(raw["total_area"]),
        "assessment": gu_num(raw["total_assessment"]), "tenure": raw["tenure"],
        "land_use": raw["land_use"], "as_of": raw["as_of"].split()[0],
        "upin": upin, "khata": gu_num(own[a - 1]),
        "owners": owners, "boja_entries": boja_entries, "boja_notes": boja_notes, "tenants": tenants,
        "entries": entries, "old_entries": old_entries, "deeds": list(deeds.values()),
    }


def _name_candidates(rec: dict) -> list[str]:
    text = json.dumps({k: v for k, v in rec.items() if k != "old_entries"}, ensure_ascii=False)
    found = re.findall(r"[઀-૿]+(?:ભાઇ|ભાઈ|બેન|કુમાર|બીબી)", text)
    found += [o["name"] for o in rec["owners"]] + [p["name"] for d in rec["deeds"] for p in d["parties"]]
    return sorted(set(found))


def main(argv: list[str]) -> int:
    if argv[:1] == ["names"] and len(argv) == 2:
        rec = load_record(Path(argv[1]))
        print("\n".join(_name_candidates(rec)))
        print(f"\nUPIN {rec['upin']} | village {rec['village']} | survey {rec['survey']}")
        print("Also read every scan in entries/ and add the people named there.")
        return 0
    if argv[:2] == ["dump", "--map"] and len(argv) == 3:
        from anon import anonymise_obj, load_map
        m = load_map(argv[2])
        print(json.dumps(anonymise_obj(load_record(Path(m["source"])), m), ensure_ascii=False, indent=1))
        return 0
    print("usage: record.py names SRC | record.py dump --map names.private.json", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd scripts/title-sample && python3 -m unittest tests.test_record -v`
Expected: 9 tests, `OK`

- [ ] **Step 5: Commit the parser**

```bash
git add scripts/title-sample/record.py scripts/title-sample/tests/test_record.py
git commit -m "feat(title): parse a saved survey folder into a record"
```

- [ ] **Step 6: Build the private map.** This step has no code and nothing from it is committed.

Run `python3 record.py names <source folder>` with the source folder Kirtan named in chat. Then view every scan under `<source>/entries/`.

Write `names.private.json`:
- `"source"`: the absolute source path.
- `"people"`: every real person to a fictional name. Include:
  - Gujarati forms, including the "surname first" order used in owner lines;
  - English transliterations as they will appear in the draft;
  - revenue officials named in remarks.

  Fictional names must not reuse any real first name or father's name. Only `પટેલ`/`Patel` may be shared.
- `"places"`:
  - the village (Gujarati and English) → `નમૂના ગામ` / `Sample village`;
  - the survey number in Gujarati and ASCII digits → `૪૧૨` / `412`;
  - the UPIN → `GJ83XXXXXXXXXX`;
  - each revenue order or case number as written (with both ર/૨ spellings) → `…/૦૦૦/…` with the year kept.

Verify it loads: `python3 -c "import anon; anon.load_map('names.private.json')"` must print nothing.

- [ ] **Step 7: Dump the anonymised record and read it**

Run: `mkdir -p build && python3 record.py dump --map names.private.json > build/record.anon.json`

Then: `python3 anon.py check --map names.private.json build/record.anon.json`
Expected: `no leaks`. If a name is listed, add it to the map and repeat.

- [ ] **Step 8: Write the failing content tests**

`scripts/title-sample/tests/test_content.py`:

```python
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
CONTENT = json.loads((HERE / "content.json").read_text(encoding="utf-8"))
MAP = HERE / "names.private.json"
DRAFT_ITEMS = ["1", "2", "5", "6", "7", "8", "9", "14", "15"]


class Content(unittest.TestCase):
    def test_draft_items_are_the_bob_revenue_items(self):
        self.assertEqual([d["item"] for d in CONTENT["draft"]], DRAFT_ITEMS)
        for d in CONTENT["draft"]:
            self.assertTrue(d["heading"] and d["text"], d["item"])

    def test_chain_excerpt_is_from_item_15(self):
        item15 = next(d for d in CONTENT["draft"] if d["item"] == "15")
        self.assertIn(CONTENT["chain_excerpt"], item15["text"])
        self.assertGreater(len(CONTENT["chain_excerpt"]), 200)

    def test_excerpt_shape(self):
        self.assertEqual(len(CONTENT["excerpt_rows"]), 6)
        self.assertEqual(len(CONTENT["excerpt_points"]), 2)
        self.assertGreaterEqual(len(CONTENT["points"]), 2)

    def test_no_placeholder_text(self):
        blob = json.dumps(CONTENT, ensure_ascii=False)
        for bad in ("TODO", "TBD", "XXX", "lorem"):
            self.assertNotIn(bad, blob)


@unittest.skipUnless(MAP.exists(), "names.private.json is local-only")
class ContentAgainstRecord(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from anon import anonymise_obj, load_map
        from record import load_record
        cls.m = load_map(MAP)
        cls.rec = anonymise_obj(load_record(Path(cls.m["source"])), cls.m)

    def test_every_typed_entry_has_a_summary(self):
        self.assertEqual(set(CONTENT["summaries"]), {e["number"] for e in self.rec["entries"]})

    def test_every_scanned_entry_has_a_summary(self):
        self.assertEqual(set(CONTENT["old_summaries"]), {o["number"] for o in self.rec["old_entries"]})

    def test_content_rows_match_record(self):
        numbers = {e["number"] for e in self.rec["entries"]}
        for n in CONTENT["excerpt_rows"]:
            self.assertIn(n, numbers)
        for p in CONTENT["points"]:
            for n in p["entries"]:
                self.assertIn(n, numbers | set(CONTENT["old_summaries"]))

    def test_content_has_no_leaks(self):
        from anon import find_leaks
        self.assertEqual(find_leaks(json.dumps(CONTENT, ensure_ascii=False), self.m), [])
```

- [ ] **Step 9: Run the tests and check they fail**

Run: `cd scripts/title-sample && python3 -m unittest tests.test_content -v`
Expected: `FileNotFoundError` for `content.json`

- [ ] **Step 10: Write `content.json`** from `build/record.anon.json` and the scans. This is writing, not code.

Rules:
- Use fictional names only.
- Write one plain English line per entry: who, what, which bank, and whether it was certified or rejected.
- Write the draft in the register of a Kheda Bank of Baroda report. Item 15 must trace from the earliest entry using the pattern "Effect is shown in revenue records by Entry No. N dated D, certified on C". C comes from the certifying officer's remark.
- Item 14 lists the revenue records examined (Village Form 7/12, Form 8-A, Form 6 entries with numbers).
- The **points** name what an advocate must follow up, and cite the entry numbers.
- Pick 6 excerpt rows that show different kinds of entry: charge, release, sale, rejected sale, Collector's order, relinquishment.
- Pick the 2 points most useful to an advocate.

Shape (the values shown are illustrative; the real text is written from the record):

```json
{
  "summaries": {"4032": "Charge of Bank of Baroda, Anand branch, entered against the holders' khata. Certified."},
  "old_summaries": {"894": "Handwritten entry: …"},
  "draft": [
    {"item": "1", "heading": "Description and area of the property", "text": "Agricultural land bearing Survey No. 412 પૈકી 1 …"},
    {"item": "2", "heading": "Nature of property", "text": "Agricultural land …"},
    {"item": "5", "heading": "Freehold or leasehold", "text": "…"},
    {"item": "6", "heading": "Source of property", "text": "…"},
    {"item": "7", "heading": "Co-owners and partition", "text": "…"},
    {"item": "8", "heading": "Possession", "text": "…"},
    {"item": "9", "heading": "Mutation in revenue records", "text": "…"},
    {"item": "14", "heading": "Documents examined (revenue records)", "text": "…"},
    {"item": "15", "heading": "Tracing of chain of title", "text": "Originally the land … Effect is shown in revenue records by Entry No. … dated …, certified on …."}
  ],
  "points": [{"title": "Sale entry rejected in 2022", "detail": "…", "entries": ["11385"]}],
  "excerpt_rows": ["4032", "5164", "10582", "11385", "13191", "13439"],
  "excerpt_points": [0, 1],
  "chain_excerpt": "…"
}
```

- [ ] **Step 11: Run all builder tests and check they pass**

Run: `cd scripts/title-sample && python3 -m unittest discover -s tests -t . -v`
Expected: all pass, including `ContentAgainstRecord` (the map is present locally).

- [ ] **Step 12: Commit**

```bash
git add scripts/title-sample/content.json scripts/title-sample/tests/test_content.py
git status --short scripts/title-sample   # names.private.json and build/ must NOT be listed
git commit -m "feat(title): sample file content (fictional names)"
```

---

### Task 3: Sample builder (PDF, Word draft, OG image, page excerpt) and fonts

**Files:**
- Create: `public/fonts/title/space-grotesk.woff2`, `ibm-plex-mono-400.woff2`, `ibm-plex-mono-500.woff2`, `noto-sans-gujarati-400.woff2`, `noto-sans-gujarati-600.woff2`
- Create: `scripts/title-sample/build.py`
- Create: `scripts/title-sample/tests/test_build.py`
- Generated: `public/title/title-file-sample.pdf`, `public/title/title-file-sample-draft.docx`, `public/title/og.png`, `src/data/title-sample.json`

**Interfaces:**
- Consumes: `load_record`, `gu_num` (Task 2); `load_map`, `anonymise_obj`, `find_leaks`, `text_of` (Task 1); `content.json` (Task 2).
- Produces:
  - `src/data/title-sample.json`:
    ```
    {survey, village, taluka, district, as_of, pdf_pages, chain_excerpt,
     rows: [{number, date, type, status, status_en, summary}] × 6,
     points: [{title, detail}] × 2}
    ```
  - Functions in `build.py`:
    - `font_css(font_dir: Path) -> str`
    - `blur_thumb(path: str, width=300) -> str` (a data URI)
    - `status_en(s: str) -> str`
    - `area_en(a: str) -> str`
    - `render_sample_html(rec, content, fonts, thumbs) -> str`
    - `render_og_html(rec, content, fonts) -> str`
    - `excerpt(rec, content, pdf_pages) -> dict`
    - `write_docx(path, rec, content)`

- [ ] **Step 1: Convert the app's fonts to woff2**

```bash
mkdir -p public/fonts/title
uv run --with fonttools --with brotli python - <<'EOF'
from fontTools.ttLib import TTFont
src = '/home/kirtan/Desktop/projects/irmsc/apps/android/app/src/main/res/font/'
for a, b in [('space_grotesk.ttf', 'space-grotesk.woff2'), ('ibm_plex_mono_regular.ttf', 'ibm-plex-mono-400.woff2'),
             ('ibm_plex_mono_medium.ttf', 'ibm-plex-mono-500.woff2'), ('noto_sans_gujarati_regular.ttf', 'noto-sans-gujarati-400.woff2'),
             ('noto_sans_gujarati_semibold.ttf', 'noto-sans-gujarati-600.woff2')]:
    f = TTFont(src + a)
    print(a, 'variable' if 'fvar' in f else 'static')
    f.flavor = 'woff2'
    f.save('public/fonts/title/' + b)
EOF
ls -la public/fonts/title
```

Expected: five `.woff2` files. Note whether Space Grotesk printed `variable`. If it printed `static`, change `font-weight: 300 700` to `font-weight: 500` in both font CSS blocks (here and in Task 4).

- [ ] **Step 2: Write the failing builder tests**

`scripts/title-sample/tests/test_build.py`:

```python
import json
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

from build import area_en, blur_thumb, excerpt, render_sample_html, status_en
from record import load_record
from tests.test_record import make_fixture

HERE = Path(__file__).resolve().parent.parent
SITE = HERE.parent.parent
MAP = HERE / "names.private.json"
CONTENT = {
    "summaries": {"901": "Heirs added.", "11385": "Sale rejected."},
    "old_summaries": {"894": "Old charge.", "1474": "Old sale."},
    "draft": [{"item": i, "heading": f"Heading {i}", "text": f"Text {i}."} for i in ["1", "2", "5", "6", "7", "8", "9", "14", "15"]],
    "points": [{"title": "P1", "detail": "D1", "entries": ["11385"]}, {"title": "P2", "detail": "D2", "entries": ["901"]}],
    "excerpt_rows": ["901", "11385"], "excerpt_points": [0, 1], "chain_excerpt": "Text 15.",
}


class Units(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.rec = load_record(make_fixture(Path(self.tmp.name)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_status_en(self):
        self.assertEqual([status_en(s) for s in ["પ્રમાણિત", "નામંજૂર", "નામંજુર", "રદ"]], ["Certified", "Rejected", "Rejected", "Cancelled"])

    def test_area_en(self):
        self.assertEqual(area_en("0-69-80"), "0-69-80 H-A-Sq.m (6,980 sq m)")

    def test_blur_thumb_is_small_png_data_uri(self):
        uri = blur_thumb(self.rec["old_entries"][0]["scans"][0], width=30)
        self.assertTrue(uri.startswith("data:image/png;base64,"))

    def test_sample_html_has_watermark_items_and_masked_deed(self):
        page = render_sample_html(self.rec, CONTENT, fonts="", thumbs={"894": ["data:,"], "1474": ["data:,"]})
        self.assertIn("SAMPLE: names changed", page)
        for i in ["1", "2", "5", "6", "7", "8", "9", "14", "15"]:
            self.assertIn(f"Heading {i}", page)
        self.assertNotIn(">438<", page)
        self.assertIn("••••/2022", page)

    def test_excerpt_shape(self):
        ex = excerpt(self.rec, CONTENT, pdf_pages=9)
        self.assertEqual([r["number"] for r in ex["rows"]], ["901", "11385"])
        self.assertEqual(ex["rows"][1]["status_en"], "Rejected")
        self.assertEqual(ex["pdf_pages"], 9)
        self.assertEqual(len(ex["points"]), 2)


@unittest.skipUnless(MAP.exists(), "names.private.json is local-only")
class Outputs(unittest.TestCase):
    def test_outputs_exist_and_fit(self):
        pdf = SITE / "public/title/title-file-sample.pdf"
        self.assertTrue(pdf.read_bytes().startswith(b"%PDF"))
        self.assertLess(pdf.stat().st_size, 3_000_000)
        png = (SITE / "public/title/og.png").read_bytes()
        self.assertEqual(struct.unpack(">II", png[16:24]), (1200, 630))
        self.assertLess(len(png), 300_000)
        with zipfile.ZipFile(SITE / "public/title/title-file-sample-draft.docx") as z:
            self.assertIn("Tracing of chain of title", z.read("word/document.xml").decode())
        ex = json.loads((SITE / "src/data/title-sample.json").read_text(encoding="utf-8"))
        self.assertEqual((len(ex["rows"]), len(ex["points"])), (6, 2))

    def test_outputs_have_no_leaks(self):
        from anon import find_leaks, load_map, text_of
        m = load_map(MAP)
        for f in [HERE / "build/sample.html", HERE / "build/og.html", SITE / "public/title/title-file-sample-draft.docx",
                  SITE / "src/data/title-sample.json"]:
            self.assertEqual(find_leaks(text_of(f), m), [], f.name)
```

- [ ] **Step 3: Run the tests and check they fail**

Run: `cd scripts/title-sample && python3 -m unittest tests.test_build -v`
Expected: `ModuleNotFoundError: No module named 'build'`

- [ ] **Step 4: Implement `build.py`**

```python
"""Build the /title sample file from one saved survey and the hand-written content.

  cd scripts/title-sample
  uv run --with python-docx --with pillow python build.py --map names.private.json

Writes public/title/{title-file-sample.pdf, title-file-sample-draft.docx, og.png} and
src/data/title-sample.json, then refuses to finish if any real name survives.
"""
import argparse
import base64
import html
import io
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter

from anon import anonymise_obj, find_leaks, load_map, text_of
from record import load_record

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent
CHROME = os.environ.get("CHROME", "/opt/google/chrome/chrome")
FONTS = [("Space Grotesk", "space-grotesk.woff2", "300 700"), ("IBM Plex Mono", "ibm-plex-mono-400.woff2", "400"),
         ("IBM Plex Mono", "ibm-plex-mono-500.woff2", "500"), ("Noto Sans Gujarati", "noto-sans-gujarati-400.woff2", "400"),
         ("Noto Sans Gujarati", "noto-sans-gujarati-600.woff2", "600 700")]
_STATUS = {"પ્રમાણિત": "Certified", "નામંજૂર": "Rejected", "નામંજુર": "Rejected", "રદ": "Cancelled", "પડતર": "Pending"}
e = html.escape


def status_en(s: str) -> str:
    return _STATUS.get(s, s)


def area_en(a: str) -> str:
    h, ar, m = (int(x) for x in a.split("-"))
    return f"{a} H-A-Sq.m ({h * 10000 + ar * 100 + m:,} sq m)"


def font_css(font_dir: Path) -> str:
    # Inlined as data URIs: Chrome refuses cross-file font loads from file:// pages.
    out = []
    for family, name, weight in FONTS:
        b64 = base64.b64encode((font_dir / name).read_bytes()).decode()
        out.append(f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{b64}) format('woff2');font-weight:{weight}}}")
    return "\n".join(out)


def blur_thumb(path: str, width: int = 300) -> str:
    im = Image.open(path).convert("L")
    im = im.resize((width, max(1, im.height * width // im.width)))
    im = im.filter(ImageFilter.GaussianBlur(radius=max(2, width // 60)))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


BASE_CSS = """
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #0F1614; font: 10.5pt/1.5 'Space Grotesk', 'Noto Sans Gujarati', sans-serif; }
[lang=gu] { font-family: 'Noto Sans Gujarati', sans-serif; line-height: 1.7; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.page { break-after: page; }
.page:last-child { break-after: auto; }
.wm { position: fixed; top: 42%; left: -10%; right: -10%; text-align: center; transform: rotate(-24deg);
      font: 600 44pt 'Space Grotesk', sans-serif; color: rgba(180, 83, 27, .09); pointer-events: none; }
.foot { position: fixed; bottom: -10mm; left: 0; right: 0; font: 8pt 'IBM Plex Mono', monospace; color: #4B5754;
        display: flex; justify-content: space-between; }
h1 { font-size: 22pt; margin: 0 0 4mm; letter-spacing: -.01em; }
h2 { font-size: 13pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #C9D3D0; }
h3 { font-size: 10.5pt; margin: 4mm 0 1mm; }
.label { font: 500 8pt 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: .08em; color: #4B5754; }
.tile { border: 1px solid #C9D3D0; border-radius: 3mm; padding: 4mm; position: relative; margin: 0 0 4mm; }
.tile::after { content: ''; position: absolute; inset: 1.3mm; border: 1px dashed #DCE3E1; border-radius: 2mm; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { text-align: left; vertical-align: top; padding: 1.6mm 2mm; border-bottom: 1px solid #DCE3E1; }
th { font: 500 7.5pt 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: .06em; color: #4B5754; }
.draft p { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; margin: 0 0 2mm; }
.rejected { color: #B4531B; font-weight: 600; }
.entry { break-inside: avoid; border-bottom: 1px solid #DCE3E1; padding: 2mm 0; }
.scans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.scans figure { margin: 0; break-inside: avoid; }
.scans img { width: 100%; border: 1px solid #C9D3D0; }
.scans figcaption { font-size: 8pt; margin-top: 1mm; }
.toc li { margin: 1mm 0; }
.note { color: #4B5754; font-size: 9pt; }
"""


def _entry_row(x: dict, content: dict) -> str:
    cls = ' class="rejected"' if status_en(x["status"]) == "Rejected" else ""
    return (f'<tr><td class="mono">{e(x["number"])}</td><td class="mono">{e(x["date"])}</td>'
            f'<td lang="gu">{e(x["type"])}</td><td{cls}>{e(status_en(x["status"]))}</td>'
            f'<td>{e(content["summaries"][x["number"]])}</td></tr>')


def render_sample_html(rec: dict, content: dict, fonts: str, thumbs: dict) -> str:
    where = (f'Survey <span lang="gu">{e(rec["survey"])}</span>, <span lang="gu">{e(rec["village"])}</span>, '
             f'Ta. <span lang="gu">{e(rec["taluka"])}</span>, Dist. <span lang="gu">{e(rec["district"])}</span>')
    points = "".join(f'<div class="tile"><h3>{e(p["title"])}</h3><p>{e(p["detail"])}</p>'
                     f'<p class="label">Entries {e(", ".join(p["entries"]))}</p></div>' for p in content["points"])
    draft = "".join(f'<h3>{e(d["item"])}. {e(d["heading"])}</h3>' + "".join(f"<p>{e(par)}</p>" for par in d["text"].split("\n\n"))
                    for d in content["draft"])
    owners = "".join(f'<li><span lang="gu">{e(o["name"])}</span> <span class="mono">(entry {e(o["entry"])})</span></li>' for o in rec["owners"])
    boja = "".join(f'<li lang="gu">{e(n)}</li>' for n in rec["boja_notes"]) or "<li>None recorded</li>"
    rows = "".join(_entry_row(x, content) for x in rec["entries"])
    full = "".join(f'<div class="entry"><p class="label">Entry {e(x["number"])} · {e(x["date"])} · {e(status_en(x["status"]))}</p>'
                   f'<p lang="gu"><b>{e(x["type"])}</b> — {e(x["text"])}</p><p lang="gu" class="note">{e(x["remark"])}</p></div>'
                   for x in rec["entries"])
    scans = "".join(f'<figure><img src="{src}" alt="Handwritten entry {e(o["number"])}, blurred">'
                    f'<figcaption><span class="mono">Entry {e(o["number"])}</span>: {e(content["old_summaries"][o["number"]])}</figcaption></figure>'
                    for o in rec["old_entries"] for src in thumbs[o["number"]][:1])
    deeds = "".join(f'<tr><td>{e(d["sro"])}</td><td class="mono">••••/{e(d["year"])}</td><td class="mono">{e(d["date"])}</td>'
                    f'<td lang="gu">{"<br>".join(e(p["role"] + ": " + p["name"]) for p in d["parties"])}</td></tr>' for d in rec["deeds"])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Title File sample</title>
<style>{fonts}{BASE_CSS}</style></head><body>
<div class="wm" aria-hidden="true">SAMPLE: names changed</div>
<div class="foot"><span>Title File · sample · names, village and survey number changed</span><span>kirtanjain.com/title</span></div>

<section class="page">
<p class="label">Title File · <span lang="gu">ટાઇટલ ફાઇલ</span></p>
<h1>Revenue file and draft</h1>
<p>{where}</p>
<p>Records as of <span class="mono">{e(rec["as_of"])}</span> · Bank format: Bank of Baroda, Title Opinion Report</p>
<div class="tile"><p class="label">Contents</p><ol class="toc">
<li>Summary and points to check</li><li>Draft: revenue-record items 1, 2, 5–9, 14 and 15</li>
<li>Annex A: current record</li><li>Annex B: Village Form 6 entries, with English summaries</li>
<li>Annex C: full text of typed entries</li><li>Annex D: handwritten entries (blurred in this sample)</li>
<li>Annex E: registered documents</li></ol></div>
<p class="note">Real record. Names, village and survey number changed. A records and drafting service, not legal advice.</p>
</section>

<section class="page"><h2>Summary and points to check</h2>
<p>{len(rec["entries"])} typed entries from {e(rec["entries"][0]["date"])} to {e(rec["entries"][-1]["date"])}, and {len(rec["old_entries"])} handwritten entries.
Current holder{"s" if len(rec["owners"]) > 1 else ""}: {", ".join(f'<span lang="gu">{e(o["name"])}</span>' for o in rec["owners"])}.</p>
{points}</section>

<section class="page draft"><h2>Draft for the advocate's review</h2>
<p class="note">Revenue-record items of the Bank of Baroda Title Opinion Report. Items 3, 4, 10–13 and 16–20 need the originals, the sub-registrar search and your opinion.</p>
{draft}</section>

<section class="page"><h2>Annex A: current record</h2><table>
<tr><th>District</th><td lang="gu">{e(rec["district"])}</td></tr><tr><th>Taluka</th><td lang="gu">{e(rec["taluka"])}</td></tr>
<tr><th>Village</th><td lang="gu">{e(rec["village"])}</td></tr><tr><th>Survey</th><td lang="gu">{e(rec["survey"])}</td></tr>
<tr><th>UPIN</th><td class="mono">{e(rec["upin"])}</td></tr><tr><th>Khata</th><td class="mono">{e(rec["khata"])}</td></tr>
<tr><th>Area</th><td class="mono">{e(area_en(rec["area"]))}</td></tr><tr><th>Assessment</th><td class="mono">Rs. {e(rec["assessment"])}</td></tr>
<tr><th>Tenure</th><td lang="gu">{e(rec["tenure"])}</td></tr><tr><th>Land use</th><td lang="gu">{e(rec["land_use"])}</td></tr>
<tr><th>Holders</th><td><ul>{owners}</ul></td></tr><tr><th>Charges and other rights</th><td><ul>{boja}</ul>
<p class="mono">Entries {e(", ".join(rec["boja_entries"]))}</p></td></tr>
<tr><th>Tenants</th><td>{e(", ".join(rec["tenants"])) or "None recorded"}</td></tr>
<tr><th>Form 8-A</th><td>Included in real files</td></tr></table></section>

<section class="page"><h2>Annex B: Village Form 6 entries</h2><table>
<tr><th>Entry</th><th>Date</th><th>Type</th><th>Status</th><th>Summary</th></tr>{rows}</table></section>

<section class="page"><h2>Annex C: full text of typed entries</h2>{full}</section>

<section class="page"><h2>Annex D: handwritten entries</h2>
<p class="note">Real files include the full scans. They are blurred here because they show real names.</p>
<div class="scans">{scans}</div></section>

<section class="page"><h2>Annex E: registered documents</h2><table>
<tr><th>Office</th><th>Doc. no.</th><th>Date</th><th>Parties</th></tr>{deeds}</table>
<p class="note">Registered transactions from 2007 onward (Index-2): included in real files. Document numbers are masked in this sample.</p>
</section></body></html>"""


def render_og_html(rec: dict, content: dict, fonts: str) -> str:
    quote = content["chain_excerpt"][:230].rsplit(" ", 1)[0] + " …"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{fonts}
* {{ box-sizing: border-box; }}
body {{ margin: 0; width: 1200px; height: 630px; background: #E9EEEC; color: #0F1614; font-family: 'Space Grotesk', sans-serif;
       display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 64px; }}
[lang=gu] {{ font-family: 'Noto Sans Gujarati', sans-serif; }}
.label {{ font: 500 20px 'IBM Plex Mono', monospace; letter-spacing: .08em; text-transform: uppercase; color: #4B5754; }}
h1 {{ font-size: 54px; line-height: 1.08; margin: 18px 0 20px; letter-spacing: -.02em; }}
.gu {{ font-size: 26px; line-height: 1.5; color: #4B5754; }}
.price {{ margin-top: 28px; font: 500 28px 'IBM Plex Mono', monospace; color: #B4531B; }}
.tile {{ background: #FBFCFB; border: 2px solid #C9D3D0; border-radius: 16px; padding: 30px; position: relative; align-self: center; }}
.tile::after {{ content: ''; position: absolute; inset: 7px; border: 2px dashed #DCE3E1; border-radius: 11px; }}
.tile p {{ font: 22px/1.5 Georgia, serif; margin: 12px 0 0; }}
</style></head><body>
<div><div class="label">Title File · <span lang="gu">ટાઇટલ ફાઇલ</span></div>
<h1>30-year revenue file and draft chain of title</h1>
<div class="gu" lang="gu">સરવે નંબર આપો, બીજા દિવસે સાંજ સુધીમાં ફાઇલ.</div>
<div class="price">₹199 · first 3 free</div></div>
<div class="tile"><div class="label">Item 15 · chain of title</div><p>{e(quote)}</p></div>
</body></html>"""


def excerpt(rec: dict, content: dict, pdf_pages: int) -> dict:
    by_no = {x["number"]: x for x in rec["entries"]}
    rows = [{"number": n, "date": by_no[n]["date"], "type": by_no[n]["type"], "status": by_no[n]["status"],
             "status_en": status_en(by_no[n]["status"]), "summary": content["summaries"][n]} for n in content["excerpt_rows"]]
    points = [{"title": content["points"][i]["title"], "detail": content["points"][i]["detail"]} for i in content["excerpt_points"]]
    return {"survey": rec["survey"], "village": rec["village"], "taluka": rec["taluka"], "district": rec["district"],
            "as_of": rec["as_of"], "pdf_pages": pdf_pages, "chain_excerpt": content["chain_excerpt"], "rows": rows, "points": points}


def write_docx(path: Path, rec: dict, content: dict) -> None:
    from docx import Document  # only the full build needs python-docx
    from docx.shared import Pt

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name, normal.font.size = "Times New Roman", Pt(11)
    doc.sections[0].header.paragraphs[0].text = "SAMPLE: names changed. Draft for the advocate's review."
    doc.add_heading("Revenue-record items: Bank of Baroda Title Opinion Report", level=1)
    doc.add_paragraph(f"Survey {rec['survey']}, {rec['village']}, Ta. {rec['taluka']}, Dist. {rec['district']}. "
                      f"Revenue records as of {rec['as_of']}.")
    for d in content["draft"]:
        doc.add_heading(f"{d['item']}. {d['heading']}", level=2)
        for par in d["text"].split("\n\n"):
            doc.add_paragraph(par)
    doc.save(path)


def _chrome(*args: str) -> None:
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                    "--virtual-time-budget=4000", *args], check=True, capture_output=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default=str(HERE / "names.private.json"))
    args = ap.parse_args()
    m = load_map(args.map)
    content = json.loads((HERE / "content.json").read_text(encoding="utf-8"))
    raw = load_record(Path(m["source"]))
    rec = anonymise_obj(raw, m)
    fonts = font_css(SITE / "public/fonts/title")
    thumbs = {o["number"]: [blur_thumb(s) for s in o["scans"]] for o in raw["old_entries"]}

    build, out = HERE / "build", SITE / "public/title"
    build.mkdir(exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    (build / "sample.html").write_text(render_sample_html(rec, content, fonts, thumbs), encoding="utf-8")
    (build / "og.html").write_text(render_og_html(rec, content, fonts), encoding="utf-8")

    pdf, png, docx = out / "title-file-sample.pdf", out / "og.png", out / "title-file-sample-draft.docx"
    _chrome("--no-pdf-header-footer", f"--print-to-pdf={pdf}", (build / "sample.html").as_uri())
    _chrome("--window-size=1200,630", f"--screenshot={png}", (build / "og.html").as_uri())
    write_docx(docx, rec, content)
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    data = SITE / "src/data/title-sample.json"
    data.write_text(json.dumps(excerpt(rec, content, pages), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    leaks = {f.name: find_leaks(text_of(f), m) for f in [build / "sample.html", build / "og.html", docx, data]}
    leaks = {k: v for k, v in leaks.items() if v}
    if leaks:
        for f in (pdf, png, docx, data):
            f.unlink(missing_ok=True)
        print("LEAKS, outputs deleted:", json.dumps(leaks, ensure_ascii=False), file=sys.stderr)
        return 1
    print(f"ok: {pdf.name} ({pages} pages, {pdf.stat().st_size // 1024} KB), {png.name} ({png.stat().st_size // 1024} KB), {docx.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run the unit tests and check they pass**

Run: `cd scripts/title-sample && python3 -m unittest tests.test_build.Units -v`
Expected: 5 tests, `OK`

- [ ] **Step 6: Run the build**

Run: `cd scripts/title-sample && uv run --with python-docx --with pillow python build.py`
Expected: `ok: title-file-sample.pdf (N pages, … KB), og.png (… KB), title-file-sample-draft.docx`, with N between 8 and 20.

If a leak is reported, add the name to `names.private.json` and run the build again.

- [ ] **Step 7: Run all tests, including the output tests**

Run: `cd scripts/title-sample && python3 -m unittest discover -s tests -t . -v`
Expected: all pass. `Outputs.test_outputs_have_no_leaks` checks every generated artefact.

- [ ] **Step 8: Look at the PDF and the OG image**

Open `public/title/title-file-sample.pdf` and `public/title/og.png` and check:
- the watermark and footer appear on every page;
- Gujarati has no boxes;
- the scans are unreadable;
- no page is nearly empty.

Fix the layout in `BASE_CSS` if needed, then rebuild.

- [ ] **Step 9: Commit**

```bash
git add public/fonts/title scripts/title-sample/build.py scripts/title-sample/tests/test_build.py \
        public/title/title-file-sample.pdf public/title/title-file-sample-draft.docx public/title/og.png src/data/title-sample.json
git status --short   # names.private.json and scripts/title-sample/build/ must NOT be listed
git commit -m "feat(title): anonymised sample file, Word draft and link-preview image"
```

---

### Task 4: The page and its post-build checks

**Files:**
- Create: `src/styles/title.css`
- Create: `src/pages/title/index.astro`
- Create: `scripts/check-title.mjs`
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Consumes: `src/data/title-sample.json` (Task 3), `public/title/*` (Task 3), `public/fonts/title/*` (Task 3).
- Produces: `dist/title/index.html` after `npm run build`, and `npm run check:title`.

- [ ] **Step 1: Write the failing check script**

`scripts/check-title.mjs`:

```js
// Post-build checks for /title (docs/superpowers/specs/2026-10-01-title-pitch-page-design.md).
// Run after `npm run build`: node scripts/check-title.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const pagePath = [join(DIST, 'title/index.html'), join(DIST, 'title.html')].find((p) => existsSync(p));
if (!pagePath) {
  console.error('FAIL: no built /title page in dist/');
  process.exit(1);
}
const html = readFileSync(pagePath, 'utf8');
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// Contact
check(html.includes('href="tel:+916360357636"'), 'Call link must be tel:+916360357636');
const mailto = (html.match(/href="(mailto:[^"]+)"/)?.[1] ?? '').replaceAll('&amp;', '&');
check(mailto.startsWith('mailto:kirtanjain0504@gmail.com?subject=Title%20file%20request&body='), 'mailto must carry the subject and a body');
check(mailto.includes('%0D%0A'), 'mailto body lines must be separated by encoded CRLF');
check(mailto.includes(encodeURIComponent('Survey / block no.:')), 'mailto body must ask for the survey number');

// Link preview
const meta = (p) => html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]+)"`))?.[1];
check(meta('og:image') === 'https://kirtanjain.com/title/og.png', 'og:image must be the absolute https URL');
check(!!meta('og:title') && !!meta('og:description'), 'og:title and og:description are required');
const png = join(DIST, 'title/og.png');
if (existsSync(png)) {
  const b = readFileSync(png);
  check(b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630, 'og.png must be 1200x630');
  check(b.length < 300_000, `og.png must be under 300 KB (is ${b.length})`);
} else check(false, 'dist/title/og.png missing');

// Every local asset the page or its CSS points at exists
const cssFiles = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => join(DIST, m[1]));
const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n');
const refs = [
  ...[...html.matchAll(/(?:href|src|content)="(?:https:\/\/kirtanjain\.com)?(\/(?:title|fonts\/title)\/[^"]+)"/g)].map((m) => m[1]),
  ...[...css.matchAll(/url\(['"]?(\/fonts\/title\/[^'")]+)['"]?\)/g)].map((m) => m[1]),
];
check(refs.some((r) => r.endsWith('.woff2')), 'page must load the /fonts/title woff2 files');
for (const r of new Set(refs)) {
  const p = r.endsWith('/') ? join(DIST, r, 'index.html') : join(DIST, r);
  check(existsSync(p), `referenced file missing from dist: ${r}`);
}
check(html.includes('/title/title-file-sample.pdf') && html.includes('/title/title-file-sample-draft.docx'), 'page must link the sample PDF and Word draft');

// No scripts, forms or tracking
check(!/<script\b/i.test(html), 'page must not ship <script>');
check(!/<form\b/i.test(html), 'page must not have a form');

// Copy rules, checked against visible text
const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
const banned = [/captcha/i, /scrap(e|ing|er)/i, /\bbots?\b/i, /automat/i, /\bAI\b/, /seamless/i, /unlock/i, /revolution/i,
  /cutting[- ]edge/i, /effortless/i, /game[- ]chang/i, /leverag/i, /empower/i, /streamlin/i, /hassle[- ]free/i, /one[- ]stop/i];
for (const re of banned) check(!re.test(text), `banned word in copy: ${re}`);
check(text.includes('Names, village and survey number changed'), 'sample must be labelled as changed');
check(text.includes('₹199') && /First 3 survey numbers free/.test(text), 'price line must be present');

// Every Gujarati text run sits under lang="gu"
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<title>[\s\S]*?<\/title>/i, '');
const stack = [];
const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
let m;
while ((m = re.exec(body))) {
  if (m[3] !== undefined) {
    if (/[઀-૿]/.test(m[3]) && (stack.at(-1)?.lang ?? 'en') !== 'gu') failures.push(`Gujarati outside lang="gu": "${m[3].trim().slice(0, 40)}"`);
    continue;
  }
  const tag = m[1].toLowerCase();
  if (m[0].startsWith('</')) {
    const i = stack.findLastIndex((s) => s.tag === tag);
    if (i >= 0) stack.length = i;
    continue;
  }
  if (VOID.has(tag) || m[2].trim().endsWith('/')) continue;
  stack.push({ tag, lang: m[2].match(/\blang="([^"]+)"/)?.[1] ?? stack.at(-1)?.lang ?? 'en' });
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  process.exit(1);
}
console.log(`check-title: ok (${pagePath})`);
```

Add to `package.json` `"scripts"`: `"check:title": "node scripts/check-title.mjs"`.

- [ ] **Step 2: Run the check and confirm it fails**

Run: `npm run build && npm run check:title`
Expected: `FAIL: no built /title page in dist/`

- [ ] **Step 3: Write `src/styles/title.css`**

```css
/* /title. "Cadastre" tokens from irmsc/design/README.md.
   Contrast: ochre text is used only on --surface (4.9:1). On --bg it falls to 4.2:1,
   so there the accent is limited to borders and fills. --ink3 is never used for text. */
@font-face { font-family: 'Space Grotesk'; src: url('/fonts/title/space-grotesk.woff2') format('woff2'); font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'IBM Plex Mono'; src: url('/fonts/title/ibm-plex-mono-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'IBM Plex Mono'; src: url('/fonts/title/ibm-plex-mono-500.woff2') format('woff2'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'Noto Sans Gujarati'; src: url('/fonts/title/noto-sans-gujarati-400.woff2') format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Noto Sans Gujarati'; src: url('/fonts/title/noto-sans-gujarati-600.woff2') format('woff2'); font-weight: 600 700; font-display: swap; }

:root {
  --bg: #E9EEEC; --surface: #FBFCFB; --surface-alt: #DFE6E4;
  --ink: #0F1614; --ink2: #4B5754; --ink3: #7C8785;
  --line: #C9D3D0; --hair: #DCE3E1;
  --accent: #B4531B; --accent-soft: #F7E7DA; --on-accent: #FFF9F4;
  --sans: 'Space Grotesk', 'Noto Sans Gujarati', system-ui, sans-serif;
  --gu: 'Noto Sans Gujarati', 'Space Grotesk', sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, monospace;
  --serif: Georgia, 'Times New Roman', serif;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0D1214; --surface: #151B1E; --surface-alt: #1E2629;
    --ink: #E9EEEE; --ink2: #A2AFB0; --ink3: #6F7C7E;
    --line: #283336; --hair: #212A2D;
    --accent: #E58A55; --accent-soft: #2A1C13; --on-accent: #150D07;
  }
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.55 var(--sans); }
:lang(gu) { font-family: var(--gu); line-height: 1.7; }
a { color: inherit; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 16px; }
.num { font-family: var(--mono); font-weight: 500; }

.mast { background: var(--surface); border-bottom: 1px solid var(--line); }
.mast .wrap { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 16px; padding-top: 14px; padding-bottom: 14px; }
.brand { font-weight: 700; letter-spacing: -0.01em; }
.brand [lang=gu] { font-weight: 600; color: var(--ink2); margin-left: 6px; }
.for { font-size: 14px; color: var(--ink2); margin: 0; }

section { padding: 36px 0; border-bottom: 1px solid var(--line); }
.eyebrow { font: 500 12px/1.2 var(--mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink2); margin: 0 0 12px; }
h1 { font-size: clamp(28px, 7.4vw, 42px); line-height: 1.14; letter-spacing: -0.02em; margin: 0 0 14px; }
.lead-gu { font-size: 19px; margin: 0 0 10px; }
.when { color: var(--ink2); margin: 0 0 22px; font-size: 15px; }
h2 { font-size: 23px; line-height: 1.25; margin: 0; }
h2 + .sub { display: block; color: var(--ink2); font-weight: 600; margin: 2px 0 0; }

.cta { display: flex; flex-wrap: wrap; gap: 10px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 20px; border-radius: 10px;
       font-weight: 600; text-decoration: none; border: 1px solid var(--accent); }
.btn.primary { background: var(--accent); color: var(--on-accent); }
.btn.secondary { background: var(--surface); color: var(--accent); }

.tiles { display: grid; gap: 14px; margin-top: 18px; }
@media (min-width: 720px) { .tiles { grid-template-columns: repeat(3, 1fr); } }
.tile { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 16px; }
.tile::after { content: ''; position: absolute; inset: 5px; border: 1px dashed var(--hair); border-radius: 8px; pointer-events: none; }
.tile h3 { margin: 0; font-size: 17px; }
.tile .kind { font: 400 13px/1.4 var(--mono); color: var(--ink2); margin: 2px 0 10px; }
.tile ul { margin: 0; padding-left: 18px; font-size: 15px; }
.tile li + li { margin-top: 6px; }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; margin-top: 16px; overflow: hidden; }
.card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--ink2); }
.card-block { padding: 16px; border-bottom: 1px solid var(--line); }
.card-block:last-child { border-bottom: 0; }
.quote { font: 16px/1.65 var(--serif); margin: 8px 0 0; }
table.entries { width: 100%; border-collapse: collapse; font-size: 14px; }
.entries th, .entries td { text-align: left; vertical-align: top; padding: 10px 16px; border-bottom: 1px solid var(--hair); }
.entries th { font: 500 12px/1.2 var(--mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink2); }
.entries .rejected { color: var(--accent); font-weight: 600; }
@media (max-width: 560px) {
  .entries thead { display: none; }
  .entries tr { display: block; padding: 10px 16px; border-bottom: 1px solid var(--hair); }
  .entries td { display: block; padding: 1px 0; border: 0; }
}
.points { margin: 0; padding: 0; list-style: none; }
.points li + li { margin-top: 12px; }
.points b { display: block; }
.files { display: flex; flex-wrap: wrap; gap: 10px 20px; }
.files a { color: var(--accent); font-weight: 600; }

.formats { margin: 16px 0 0; }
.formats dt { font-weight: 700; margin-top: 14px; }
.formats dd { margin: 2px 0 0; color: var(--ink2); }
.stays { margin: 14px 0 0; padding-left: 20px; }
.stays li + li { margin-top: 6px; }
.promise { margin: 16px 0 0; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--surface); }
.promise p { margin: 0; }
.price { font: 500 30px/1.2 var(--mono); margin: 12px 0 6px; }
.price-note { margin: 0 0 22px; color: var(--ink2); }

footer { padding: 28px 0 40px; font-size: 14px; color: var(--ink2); }
footer p { margin: 0 0 6px; }
footer a { text-decoration: none; }
```

- [ ] **Step 4: Write `src/pages/title/index.astro`**

```astro
---
/**
 * /title: the pitch page for Title File, a records-and-drafting service for
 * advocates preparing bank title reports in Kheda and Anand.
 * Spec: docs/superpowers/specs/2026-10-01-title-pitch-page-design.md
 *
 * Static, no client JS. Every Gujarati run sits under lang="gu" so it gets the
 * Gujarati face; scripts/check-title.mjs enforces that after each build. The
 * sample excerpt comes from src/data/title-sample.json, which
 * scripts/title-sample/build.py writes.
 */
import '../../styles/title.css';
import sample from '../../data/title-sample.json';

export const prerender = true;

const SITE = 'https://kirtanjain.com';
const PHONE = '+916360357636';
const PHONE_SHOWN = '63603 57636';
const EMAIL = 'kirtanjain0504@gmail.com';
const template = [
  'District:', 'Taluka:', 'Village:', 'Survey / block no.:',
  'Bank format (Bank of Baroda / SBI / Canara / housing finance / other):',
  'Your name:', 'Mobile:',
].join('\r\n') + '\r\n';
const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent('Title file request')}&body=${encodeURIComponent(template)}`;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Title File: 30-year revenue file for a survey number</title>
    <meta name="description" content="For advocates preparing bank title reports in Kheda and Anand. Give a survey number today; get the 30-year revenue file and a draft chain of title by tomorrow evening. ₹199 per survey number, first 3 free." />
    <link rel="canonical" href={`${SITE}/title/`} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={`${SITE}/title/`} />
    <meta property="og:title" content="Title File: 30-year revenue file for a survey number, ₹199" />
    <meta property="og:description" content="આજે સરવે નંબર આપો. આવતીકાલ સાંજ સુધીમાં ૩૦ વર્ષની રેવન્યુ ફાઇલ અને ટાઇટલ ચેઇનનો ડ્રાફ્ટ." />
    <meta property="og:image" content={`${SITE}/title/og.png`} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#FBFCFB" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#151B1E" media="(prefers-color-scheme: dark)" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preload" href="/fonts/title/space-grotesk.woff2" as="font" type="font/woff2" crossorigin />
  </head>
  <body>
    <header class="mast">
      <div class="wrap">
        <span class="brand">Title File<span lang="gu">ટાઇટલ ફાઇલ</span></span>
        <p class="for">For advocates preparing bank title reports in Kheda and Anand</p>
      </div>
    </header>

    <main>
      <section>
        <div class="wrap">
          <h1>Give a survey number today. Get the 30-year revenue file and a draft chain of title by tomorrow evening.</h1>
          <p class="lead-gu" lang="gu">આજે સરવે નંબર આપો. આવતીકાલ સાંજ સુધીમાં ૩૦ વર્ષની રેવન્યુ ફાઇલ અને ટાઇટલ ચેઇનનો ડ્રાફ્ટ મેળવો.</p>
          <p class="when">Requests in by 8 pm are delivered by 8 pm the next day.</p>
          <div class="cta">
            <a class="btn primary" href={`tel:${PHONE}`}>Call <span class="num">{PHONE_SHOWN}</span></a>
            <a class="btn secondary" href={mailto}>Email a request</a>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <p class="eyebrow">For each survey number</p>
          <h2>What you get</h2><span class="sub" lang="gu">શું મળશે</span>
          <div class="tiles">
            <div class="tile">
              <h3>Revenue file</h3>
              <p class="kind">One indexed PDF</p>
              <ul>
                <li>Current 7/12 and 8-A</li>
                <li>Every Village Form 6 entry, typed and handwritten, with number, date, type and status</li>
                <li>Old 7/12 scans back to the earliest year on record</li>
                <li>135-D notices and revenue court cases</li>
                <li>Registered transactions from 2007 onward</li>
              </ul>
            </div>
            <div class="tile">
              <h3>English draft</h3>
              <p class="kind">Word file for your letterhead</p>
              <ul>
                <li>The record-based items of your bank's format, filled in</li>
                <li>Chain of title written entry by entry: "Effect is shown in revenue records by Entry No. … dated …, certified on …"</li>
                <li>Description, area, tenure and co-owners from the current record</li>
              </ul>
            </div>
            <div class="tile">
              <h3>Points to check</h3>
              <p class="kind">One page</p>
              <ul>
                <li>New or restricted tenure</li>
                <li>Charges (<span lang="gu">બોજો</span>) with no recorded release</li>
                <li>Pending or rejected entries, open 135-D notices</li>
                <li>Revenue cases and tenant entries</li>
                <li>Heirs who do not appear in the record</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <p class="eyebrow">Sample</p>
          <h2>A real file</h2><span class="sub" lang="gu">નમૂનો</span>
          <p>Real record. Names, village and survey number changed.</p>
          <div class="card">
            <div class="card-head">
              <span>Survey <span lang="gu">{sample.survey}</span>, <span lang="gu">{sample.village}</span>, Ta. <span lang="gu">{sample.taluka}</span></span>
              <span>Records as of <span class="num">{sample.as_of}</span></span>
            </div>
            <div class="card-block">
              <p class="eyebrow">Item 15 · Tracing of chain of title</p>
              <p class="quote">{sample.chain_excerpt}</p>
            </div>
            <table class="entries">
              <thead><tr><th>Entry</th><th>Date</th><th>Type</th><th>What it records</th></tr></thead>
              <tbody>
                {sample.rows.map((r) => (
                  <tr>
                    <td class="num">{r.number}</td>
                    <td class="num">{r.date}</td>
                    <td><span lang="gu">{r.type}</span> · <span class={r.status_en === 'Rejected' ? 'rejected' : ''}>{r.status_en}</span></td>
                    <td>{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="card-block">
              <p class="eyebrow">Points to check</p>
              <ul class="points">
                {sample.points.map((p) => <li><b>{p.title}</b>{p.detail}</li>)}
              </ul>
            </div>
            <div class="card-block files">
              <a href="/title/title-file-sample.pdf">Full sample (PDF, {sample.pdf_pages} pages)</a>
              <a href="/title/title-file-sample-draft.docx">Word draft (.docx)</a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <h2>In your bank's format</h2><span class="sub" lang="gu">તમારી બેંકના ફોર્મેટમાં</span>
          <dl class="formats">
            <dt>Bank of Baroda: Title Opinion Report</dt>
            <dd>Items 1, 2, 5–9, 14 and 15 come filled in.</dd>
            <dt>SBI: Report of Investigation of Title</dt>
            <dd>Property description, documents scrutinised, chain of title, revenue records and mutation.</dd>
            <dt>Canara Bank: Legal Scrutiny Report</dt>
            <dd>Description, tracing of title for 13 or 30 years, and the UPIN.</dd>
            <dt>Housing finance lenders</dt>
            <dd>Property details and devolution of title for the 13-year search.</dd>
          </dl>
        </div>
      </section>

      <section>
        <div class="wrap">
          <h2>What stays with you</h2><span class="sub" lang="gu">તમારી પાસે રહેશે</span>
          <ul class="stays">
            <li>The sub-registrar search for years before 2007</li>
            <li>Checking the original documents</li>
            <li>The opinion, the certificate and your signature</li>
          </ul>
          <div class="promise">
            <p>I never contact the bank or the borrower. The file comes only to you.</p>
            <p lang="gu">હું બેંક કે લોન લેનારનો સંપર્ક કરતો નથી. ફાઇલ ફક્ત તમને જ મળે છે.</p>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <h2>Price</h2><span class="sub" lang="gu">કિંમત</span>
          <p class="price">₹199 <span class="for">per survey number</span></p>
          <p class="price-note">First 3 survey numbers free. Then ₹199 per survey number, paid by UPI after you get the file.</p>
          <p class="price-note" lang="gu">પહેલા ૩ સરવે નંબર મફત. પછી દરેક સરવે નંબરના ₹૧૯૯, ફાઇલ મળ્યા પછી UPI થી.</p>
          <div class="cta">
            <a class="btn primary" href={`tel:${PHONE}`}>Call <span class="num">{PHONE_SHOWN}</span></a>
            <a class="btn secondary" href={mailto}>Email a request</a>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <div class="wrap">
        <p>Kirtan Jain · <a href={`tel:${PHONE}`}>{PHONE_SHOWN}</a> · <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        <p>Copies are taken from Government of Gujarat online land records. This is a records and drafting service, not legal advice.</p>
      </div>
    </footer>
  </body>
</html>
```

- [ ] **Step 5: Build and run the checks**

Run: `npm run build && npm run check:title`
Expected: `check-title: ok (dist/title/index.html)`. Fix any `FAIL:` line in the page, not in the check.

- [ ] **Step 6: Commit**

```bash
git add src/styles/title.css src/pages/title/index.astro scripts/check-title.mjs package.json
git commit -m "feat(title): pitch page for the Title File service"
```

---

### Task 5: Visual and accessibility pass

**Files:**
- Modify (only if needed): `src/styles/title.css`, `src/pages/title/index.astro`
- QA scripts and screenshots go in the session scratchpad and are not committed.

- [ ] **Step 1: Serve the build**

Run (in the background): `python3 -m http.server 4322 -d dist`

- [ ] **Step 2: Take screenshots at 360 / 768 / 1280 in light and dark**

Scratchpad script `qa-title.mjs`:

```js
import pw from '/home/kirtan/Desktop/projects/irmsc/node_modules/playwright-core/index.js';
const { chromium } = pw;
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true });
for (const width of [360, 768, 1280]) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
    await page.goto('http://localhost:4322/title/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.screenshot({ path: `${out}/title-${width}-${colorScheme}.png`, fullPage: true });
    console.log(width, colorScheme, overflow ? 'HORIZONTAL OVERFLOW' : 'ok');
    await page.close();
  }
}
await browser.close();
```

Run: `node <scratchpad>/qa-title.mjs <scratchpad>`
Expected: six `ok` lines with no `HORIZONTAL OVERFLOW`.

View each PNG and check:
- no Gujarati boxes and no broken conjuncts;
- buttons are at least 48px tall;
- the table stacks at 360px;
- dark mode is legible;
- nothing looks templated.

- [ ] **Step 3: Accessibility audit**

Run Lighthouse on `http://localhost:4322/title/` in mobile mode, using the chrome-devtools MCP `lighthouse_audit` or `npx lighthouse --only-categories=accessibility`.
Expected: accessibility score ≥ 95. Fix each flagged item in `title.css` or the page.

- [ ] **Step 4: Re-run the checks and commit any fixes**

```bash
npm run build && npm run check:title
git add src/styles/title.css src/pages/title/index.astro
git commit -m "fix(title): layout and accessibility fixes from the visual pass"
```

Skip the commit if nothing changed.

---

### Task 6: Kirtan's review, then deploy

Nothing in this task runs until Kirtan says yes.

- [ ] **Step 1: Hand over for review.** Give Kirtan:
  - the six screenshots;
  - `public/title/title-file-sample.pdf` and the `.docx`;
  - `http://localhost:4322/title/` if he is on this machine;
  - every Gujarati string on the page, so he or his father can correct them;
  - the English entry summaries, to check against the Gujarati originals.
- [ ] **Step 2: Apply corrections.** Rebuild the sample if `content.json` changes, then run `python3 -m unittest discover -s tests -t .` (in `scripts/title-sample/`), `npm run build` and `npm run check:title`, and commit.
- [ ] **Step 3: Deploy on approval.** Run `git log origin/main..HEAD --stat` and check that no private file is listed. Then run `git push origin main`.
- [ ] **Step 4: Verify live**
  - `curl -sI https://kirtanjain.com/title/` returns `200` once the Pages build finishes.
  - `curl -s https://kirtanjain.com/title/ | grep og:image` shows the absolute URL.
  - `curl -sI https://kirtanjain.com/title/og.png` returns `200` with `content-type: image/png`.
  - Kirtan pastes the link into a WhatsApp chat and sees the large preview card.
  - On his Android phone, **Call** opens the dialler with 63603 57636, and **Email a request** opens Gmail with the subject and the seven template lines on separate lines.
