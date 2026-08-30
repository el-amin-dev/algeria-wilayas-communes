"""The dataset facts, asserted against the shared fixture.

Every number here is measured from ``data/`` by ``scripts/build-data.ts`` and
written into ``shared/fixtures/ground-truth.json``, which the JavaScript suite
reads too. A count that drifts in one language fails in both.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from algeria_wilayas_communes import (
    COMMUNE_COUNT,
    COMMUNES_MISSING_POSTAL_CODE,
    DAIRA_COUNT,
    MISSING_POSTAL_CODE_COUNT,
    POSTAL_CODE_COUNT,
    WILAYA_COUNT,
    get_communes,
    get_dairas,
    get_wilayas,
)

POSTAL_CODE_PATTERN = re.compile(r"[0-9]{5}\Z")


def test_record_counts(ground_truth: dict[str, Any]) -> None:
    counts = ground_truth["counts"]
    assert len(get_wilayas()) == counts["wilayas"]
    assert len(get_dairas()) == counts["dairas"]
    assert len(get_communes()) == counts["communes"]
    assert (
        len(get_wilayas()) + len(get_dairas()) + len(get_communes())
        == (counts["searchableRecords"])
    )


def test_exported_counts_agree_with_the_data() -> None:
    """The provenance constants are hand-written; the data is not.

    ``WILAYA_COUNT`` and friends exist so a consumer can assert on the shape of
    the dataset without loading it. That only helps if they are true, and
    nothing but this test connects the two.
    """
    assert len(get_wilayas()) == WILAYA_COUNT
    assert len(get_dairas()) == DAIRA_COUNT
    assert len(get_communes()) == COMMUNE_COUNT
    assert sum(1 for c in get_communes() if c.postal_code is not None) == POSTAL_CODE_COUNT
    assert sum(1 for c in get_communes() if c.postal_code is None) == MISSING_POSTAL_CODE_COUNT


def test_wilaya_codes_are_contiguous() -> None:
    """1..69 with no gaps, and ``code_text`` is the zero-padded ``code``.

    A gap would mean a wilaya was dropped in projection; a mismatch between the
    two representations would break every record id, since ids are built from
    the padded form while lookups take the number.
    """
    codes = [w.code for w in get_wilayas()]
    assert codes == list(range(1, 70))
    assert all(w.code_text == str(w.code).zfill(2) for w in get_wilayas())


def test_postal_code_shape(ground_truth: dict[str, Any]) -> None:
    postal = ground_truth["postalCodes"]
    communes = get_communes()
    present = [c for c in communes if c.postal_code is not None]

    assert len(present) == postal["present"]
    assert len(communes) - len(present) == postal["missing"]

    malformed = [c for c in present if not POSTAL_CODE_PATTERN.match(c.postal_code or "")]
    assert malformed == [], f"malformed postal codes: {[c.id for c in malformed]}"
    assert len(malformed) == postal["malformed"]


def test_postal_codes_are_not_unique(ground_truth: dict[str, Any]) -> None:
    """38 codes are shared by more than one commune.

    This is the fact that forces ``find_by_postal_code`` to return a tuple. If
    the count ever reached zero someone would be entitled to "simplify" that API
    into a single-record lookup, which would silently drop records for every
    shared code.
    """
    postal = ground_truth["postalCodes"]
    buckets = Counter(c.postal_code for c in get_communes() if c.postal_code is not None)

    assert len(buckets) == postal["distinct"]
    assert sum(1 for n in buckets.values() if n > 1) == postal["sharedByMoreThanOneCommune"]


def test_missing_postal_codes_are_the_exact_documented_set(ground_truth: dict[str, Any]) -> None:
    """The 27 communes published without a postal code.

    Asserted as a set, not a count: a count alone would stay green if one
    commune quietly gained a fabricated code while another lost a real one. No
    source has these 27, and inventing one would say something false about a
    real place.
    """
    expected = tuple(ground_truth["communesMissingPostalCode"])
    assert expected == COMMUNES_MISSING_POSTAL_CODE
    assert len(COMMUNES_MISSING_POSTAL_CODE) == 27

    from_records = tuple(c.id for c in get_communes() if c.postal_code is None)
    assert from_records == expected


def test_commune_wilaya_name_pairs_are_unique(ground_truth: dict[str, Any]) -> None:
    """(wilaya, name) is unique even though name alone is not.

    This is what makes the synthesized ids safe. Lose it and two communes
    collide on one id, which no test downstream would necessarily catch.
    """
    unique = ground_truth["nameUniqueness"]
    communes = get_communes()

    assert len({(c.wilaya, c.name.fr) for c in communes}) == unique["communeWilayaNamePairs"]
    assert len({c.name.fr for c in communes}) == unique["distinctCommuneNames"]


def test_daira_wilaya_name_pairs_are_unique(ground_truth: dict[str, Any]) -> None:
    """591 pairs, 545 distinct names.

    A daira split by the 2026 reform appears under every wilaya it now spans,
    which is why the two numbers differ and why a daira id carries its wilaya.
    """
    unique = ground_truth["nameUniqueness"]
    dairas = get_dairas()

    assert len({(d.wilaya, d.name.fr) for d in dairas}) == unique["dairaWilayaNamePairs"]
    assert len({d.name.fr for d in dairas}) == unique["distinctDairaNames"]


def test_duplicated_commune_names_by_wilaya(ground_truth: dict[str, Any]) -> None:
    """Named duplicates, not just a count.

    A result carrying only a name is undisambiguable, which is why every search
    result carries its wilaya. These two rows are the concrete proof that the
    problem is real rather than theoretical.
    """
    for example in ground_truth["duplicatedCommuneNameExamples"]:
        matching = [c.wilaya for c in get_communes() if c.name.fr == example["name"]]
        assert matching == example["wilayas"], example["name"]


def test_arabic_names_are_present_everywhere() -> None:
    """Every commune has a non-empty ``nom_ar``.

    Search indexes the Arabic layer for all 2201 records. A blank name would
    normalize to the empty key and quietly make that record unreachable in
    Arabic while every count still looked right.
    """
    blank = [c.id for c in get_communes() if not c.name.ar.strip()]
    assert blank == []


def test_english_differs_from_french_exactly_once(ground_truth: dict[str, Any]) -> None:
    """One exonym in 2201 records: wilaya 16, Alger -> Algiers.

    This is why the search index has no third ``en`` key layer — a full layer
    would add 2201 keys to serve one record. If a second exonym is ever added,
    the one-entry override table stops being the right design and this fails.
    """
    differing = (
        [w.name.fr for w in get_wilayas() if w.name.en != w.name.fr]
        + [d.name.fr for d in get_dairas() if d.name.en != d.name.fr]
        + [c.name.fr for c in get_communes() if c.name.en != c.name.fr]
    )
    assert differing == ground_truth["exonyms"] == ["Alger"]
