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
