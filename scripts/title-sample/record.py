"""Read one survey folder saved by the land-records app into a plain dict.

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
_KHATA = re.compile(r"^([૦-૯પર]+)\s*\|\s*[૦-૯પર]+-[૦-૯પર]+-[૦-૯પર]+\s*\|")
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
    a = next(k for k, ln in enumerate(own) if _KHATA.match(ln))
    owners = []
    for ln in own[a + 1:]:
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
        "upin": upin, "khata": gu_num(_KHATA.match(own[a]).group(1)),
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
