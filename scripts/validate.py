#!/usr/bin/env python3
"""Integrity checks for the Algeria divisions dataset.
Run: python3 scripts/validate.py   (exit 0 = ok, 1 = failure)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

EXPECTED_WILAYAS = 69
EXPECTED_COMMUNES = 1541
PC_RE = re.compile(r"^\d{5}$")

errors = []


def err(msg):
    errors.append(msg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def check_source():
    d = load(DATA / "algeria.json")

    # top-level counts
    if d["nb_wilayas"] != EXPECTED_WILAYAS:
        err(f"nb_wilayas = {d['nb_wilayas']}, expected {EXPECTED_WILAYAS}")
    if d["nb_communes"] != EXPECTED_COMMUNES:
        err(f"nb_communes = {d['nb_communes']}, expected {EXPECTED_COMMUNES}")
    if len(d["wilayas"]) != EXPECTED_WILAYAS:
        err(f"wilayas array has {len(d['wilayas'])} items, expected {EXPECTED_WILAYAS}")

    seen_nums = set()
    total_communes = 0
    total_dairas = 0

    for w in d["wilayas"]:
        n = w["wilaya_num"]
        if n in seen_nums:
            err(f"duplicate wilaya_num {n}")
        seen_nums.add(n)

        if w["code"] != f"{n:02d}":
            err(f"wilaya {n}: code '{w['code']}' != '{n:02d}'")

        w_communes = sum(da["nb_communes"] for da in w["dairas"])
        if w_communes != w["nb_communes"]:
            err(f"wilaya {n}: nb_communes {w['nb_communes']} != sum of dairas {w_communes}")
        if len(w["dairas"]) != w["nb_dairas"]:
            err(f"wilaya {n}: nb_dairas {w['nb_dairas']} != actual {len(w['dairas'])}")

        total_dairas += len(w["dairas"])
        for da in w["dairas"]:
            if len(da["communes"]) != da["nb_communes"]:
                err(f"wilaya {n} / daira {da['nom_fr']}: nb_communes mismatch")
            for c in da["communes"]:
                total_communes += 1
                pc = c["code_postal"]
                if pc is not None and not PC_RE.match(pc):
                    err(f"bad postal code '{pc}' in commune {c['nom_fr']}")

    if seen_nums != set(range(1, EXPECTED_WILAYAS + 1)):
        missing = set(range(1, EXPECTED_WILAYAS + 1)) - seen_nums
        err(f"wilaya numbers not contiguous 1..69, missing: {sorted(missing)}")

    if total_communes != EXPECTED_COMMUNES:
        err(f"walked {total_communes} communes, expected {EXPECTED_COMMUNES}")
    if total_dairas != d["nb_dairas"]:
        err(f"nb_dairas {d['nb_dairas']} != actual {total_dairas}")

    return d


def check_derived(src):
    # communes.json
    if (DATA / "communes.json").exists():
        c = load(DATA / "communes.json")
        if len(c["communes"]) != EXPECTED_COMMUNES:
            err(f"communes.json has {len(c['communes'])}, expected {EXPECTED_COMMUNES}")

    # wilayas.json
    if (DATA / "wilayas.json").exists():
        w = load(DATA / "wilayas.json")
        if len(w["wilayas"]) != EXPECTED_WILAYAS:
            err(f"wilayas.json has {len(w['wilayas'])}, expected {EXPECTED_WILAYAS}")

    # by-wilaya files
    bw = DATA / "by-wilaya"
    if bw.exists():
        files = sorted(bw.glob("*.json"))
        if len(files) != EXPECTED_WILAYAS:
            err(f"by-wilaya has {len(files)} files, expected {EXPECTED_WILAYAS}")
        total = sum(load(f)["nb_communes"] for f in files)
        if total != EXPECTED_COMMUNES:
            err(f"by-wilaya communes sum {total}, expected {EXPECTED_COMMUNES}")


def main():
    src = check_source()
    check_derived(src)

    if errors:
        print(f"FAIL — {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    print(f"OK — {EXPECTED_WILAYAS} wilayas, {src['nb_dairas']} dairas, "
          f"{EXPECTED_COMMUNES} communes. All counts consistent.")
    sys.exit(0)


if __name__ == "__main__":
    main()
