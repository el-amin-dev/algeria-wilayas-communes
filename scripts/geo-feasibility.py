"""Can this dataset be joined to open commune boundaries? Measure, do not guess.

WHY THIS SCRIPT EXISTS RATHER THAN A geo/ DIRECTORY

Adding coordinates and GeoJSON is the largest single gap against the competing
packages, so it was attempted. It is NOT shipped, and this script is the
evidence for that decision (docs/DECISIONS.md ADR-020). Re-run it before
re-opening the question; the upstream data changes.

Requires `shapely` (not a project dependency -- `pip install shapely`) and
network access. Writes nothing into the repo.

WHAT IT MEASURES

geoBoundaries is the only open source of Algerian commune boundaries with a
usable licence, and its ADM3 layer carries NO wilaya attribute -- only
`shapeName`. So a join must be by name, which is precisely the failure mode
ADR-018 documents: 1541 communes share only 1494 distinct normalized names, and
the repeats are the same ones that were already corrupted once (El Marsa x3,
Larbaa x3, Timezrit x2).

Two strategies are measured:

  1. NAME ONLY           -- what a naive join would do
  2. SPATIAL + NAME      -- assign every polygon to a pre-2019 wilaya by
                            point-in-polygon against ADM1, then match on
                            (wilaya, name)

Strategy 2 is the interesting one, and the result is worth stating plainly: it
removes ambiguity ENTIRELY (97 -> 0), because a name repeats across wilayas but
never within one. The blocker is coverage, not correctness -- and the coverage
gap is structural, not a matter of trying harder. See the ADR.
"""

from __future__ import annotations

import collections
import json
import sys
import urllib.request

REF = "9469f09"
BASE = f"https://github.com/wmgeolab/geoBoundaries/raw/{REF}/releaseData/gbOpen/DZA"
ADM3 = f"{BASE}/ADM3/geoBoundaries-DZA-ADM3_simplified.geojson"
ADM1 = f"{BASE}/ADM1/geoBoundaries-DZA-ADM1_simplified.geojson"

sys.path.insert(0, "packages/python/src")
from algeria_wilayas_communes import get_communes, get_wilayas
from algeria_wilayas_communes._normalize import normalize


def fetch(url: str) -> dict:
    print(f"  fetching {url.rsplit('/', 1)[-1]} ...", flush=True)
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.load(r)


def main() -> None:
    try:
        from shapely.geometry import shape
        from shapely.strtree import STRtree
    except ImportError:
        print("needs shapely:  pip install shapely")
        raise SystemExit(2) from None

    adm3 = fetch(ADM3)
    adm1 = fetch(ADM1)
    communes = get_communes()
    wilaya_name = {w.code: normalize(w.name.fr) for w in get_wilayas()}

    unnamed = sum(1 for f in adm3["features"] if not f["properties"].get("shapeName"))
    print(f"\nADM3 polygons: {len(adm3['features'])} ({unnamed} with no shapeName)")
    print(f"ADM1 polygons: {len(adm1['features'])}  <-- the pre-2019 48-wilaya map")
    print(f"our communes : {len(communes)}\n")

    # --- strategy 1: name only ---------------------------------------------
    poly_names = collections.Counter(
        normalize(f["properties"]["shapeName"])
        for f in adm3["features"]
        if f["properties"].get("shapeName")
    )
    our_names = collections.Counter(normalize(c.name.fr) for c in communes)
    uniq = sum(1 for k, n in our_names.items() if n == 1 and poly_names.get(k, 0) == 1)
    ambiguous = sum(
        max(n, poly_names[k])
        for k, n in our_names.items()
        if poly_names.get(k, 0) and (n > 1 or poly_names[k] > 1)
    )
    print("STRATEGY 1 — name only")
    print(f"  unambiguous 1:1 : {uniq}")
    print(f"  AMBIGUOUS       : {ambiguous}  <-- would be silently misassigned")

    # --- strategy 2: spatial + name ----------------------------------------
    geoms = [shape(f["geometry"]) for f in adm1["features"]]
    names = [normalize(f["properties"]["shapeName"] or "") for f in adm1["features"]]
    tree = STRtree(geoms)

    keyed: collections.Counter = collections.Counter()
    for f in adm3["features"]:
        name = f["properties"].get("shapeName")
        if not name:
            continue
        point = shape(f["geometry"]).representative_point()
        parent = None
        for idx in tree.query(point):
            if geoms[idx].contains(point):
                parent = names[idx]
                break
        if parent is None:
            parent = names[tree.nearest(point)]
        keyed[(parent, normalize(name))] += 1

    bands = {"01-48": [0, 0], "49-69": [0, 0]}
    exact = still_ambiguous = 0
    for c in communes:
        band = "01-48" if c.wilaya <= 48 else "49-69"
        n = keyed.get((wilaya_name[c.wilaya], normalize(c.name.fr)), 0)
        if n == 1:
            exact += 1
            bands[band][0] += 1
        else:
            if n > 1:
                still_ambiguous += 1
            bands[band][1] += 1

    print("\nSTRATEGY 2 — point-in-polygon against ADM1, then match (wilaya, name)")
    print(f"  keys holding >1 polygon : {sum(1 for v in keyed.values() if v > 1)}")
    print(f"  EXACT 1:1               : {exact}  ({exact / len(communes) * 100:.1f}%)")
    print(f"  still ambiguous         : {still_ambiguous}")
    for band, (ok, miss) in bands.items():
        total = ok + miss
        print(
            f"  wilayas {band}: matched {ok}/{total} ({ok / total * 100:.1f}%), unmatched {miss}"
        )

    print(
        "\nREAD THE ADR BEFORE ACTING ON THIS. Strategy 2 eliminates ambiguity, because a\n"
        "name repeats ACROSS wilayas but never within one. What it cannot fix is that ADM1\n"
        "is the pre-2019 48-wilaya map, so every commune now in wilayas 49-69 lands in its\n"
        "PARENT wilaya -- and which parent that is, is exactly the mapping this project\n"
        "refuses to guess (ADR-005). That is why the 49-69 band scores 0%."
    )


if __name__ == "__main__":
    main()
