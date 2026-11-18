"""The slug rule, and the ids built from it.

Ids are library-assigned, not official — this dataset has no ONS or Journal
Officiel code for a daira or a commune. They are synthesized deterministically
from ``nom_fr``, which means the slug rule *is* the id contract: change it and
every id a consumer stored in a database column stops joining.

The rule is also the single easiest thing in this package to reimplement subtly
wrongly, which is why the fixture and the exhaustive id check both live here.
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from algeria_wilayas_communes import get_communes, get_dairas, get_wilayas
from algeria_wilayas_communes._slug import slug

#: What a well-formed id fragment may contain. Anything else means the
#: ``[a-z0-9-]`` filter stopped running.
SLUG_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def test_slug_fixture(slug_fixture: dict[str, Any]) -> None:
    """Every case the generator recorded, so both languages agree case by case."""
    for case in slug_fixture["cases"]:
        assert slug(case["input"]) == case["expected"], case["input"]


def test_apostrophes_are_deleted_not_hyphenated() -> None:
    """``M'Sila`` is one word.

    Turning the apostrophe into a separator would give ``m-sila`` and
    ``sidi-m-hamed`` — ids nobody would guess, and which do not match how people
    type these names either.
    """
    assert slug("M'Sila") == "msila"
    assert slug("Sidi M'hamed") == "sidi-mhamed"
    # The typographic apostrophe is handled identically; text pasted from a word
    # processor arrives with U+2019 rather than U+0027.
    assert slug("M’Sila") == "msila"


def test_punctuation_is_dropped_not_turned_into_a_separator() -> None:
    """The two records a prose reimplementation gets wrong.

    Read as English, the rule is "lowercase, strip accents, drop apostrophes,
    turn separators into hyphens, collapse, trim" — which omits the step that
    deletes everything outside ``[a-z0-9-]`` *after* the whitespace pass. That
    omission produces ``b.-b.-arreridj`` and ``zbarbar-(el-isseri-)`` for these
    two real records: 2 wrong ids out of 2126, nothing crashes, no test in
    either package fails on its own, and a consumer joining the two datasets on
    id gets two silent mismatches.
    """
    assert slug("B. B. Arreridj") == "b-b-arreridj"
    assert slug("Z'barbar (El Isseri )") == "zbarbar-el-isseri"


def test_diacritics_are_folded() -> None:
    """NFD plus a combining-mark strip.

    No French name in the dataset actually carries an accent today, so this
    protects the rule against a future record that does — and it is what lets an
    accented *query* reach an unaccented record.
    """
    assert slug("Béjaïa") == "bejaia"
    assert slug("Aïn Témouchent") == "ain-temouchent"


def test_existing_hyphens_survive() -> None:
    """A hyphen is already a separator, unlike in the search normalizer.

    This is the point where slug() and normalize() deliberately disagree:
    ``Abi-Youcef`` slugs to ``abi-youcef`` but normalizes to ``abi youcef``.
    Using one where the other belongs breaks either every id or every lookup.
    """
    assert slug("Abi-Youcef") == "abi-youcef"


def test_separators_collapse_and_trim() -> None:
    assert slug("Alger   Centre") == "alger-centre"
    assert slug("  Ain Azel  ") == "ain-azel"
    assert slug("--Ain--Azel--") == "ain-azel"
    assert slug("Ain_Azel") == "ainazel"


def test_slug_is_idempotent() -> None:
    """Slugging an id fragment again must not change it.

    Ids get round-tripped through URLs, filenames and database columns; a rule
    that is not a fixed point would corrupt them somewhere along that path.
    """
    for name in {c.name.fr for c in get_communes()}:
        once = slug(name)
        assert slug(once) == once, name


def test_arabic_only_input_slugs_to_empty() -> None:
    """Documented, because it is the failure mode ids must never hit.

    ``slug()`` strips everything outside ``[a-z0-9-]``, so an Arabic string
    mistakenly entered in a ``nom_fr`` field reduces to ``""`` — which would
    mint ids like ``19-`` and ``19--x``. The build has a hard assertion against
    that; this records why it exists.
    """
    assert slug("سطيف") == ""
    assert slug("...") == ""


def test_daira_ids_are_unique() -> None:
    """585 ids, 0 collisions.

    Only ``(wilaya, nom_fr)`` is unique — 585 daires share just 545 distinct
    names — so the wilaya prefix is what makes the id safe, not decoration.
    """
    ids = [d.id for d in get_dairas()]
    assert len(ids) == 585
    assert len(set(ids)) == 585


def test_commune_ids_are_unique() -> None:
    """1541 ids, 0 collisions, despite 33 shared French names."""
    ids = [c.id for c in get_communes()]
    assert len(ids) == 1541
    assert len(set(ids)) == 1541


def test_no_id_is_empty_or_malformed() -> None:
    """Every one of the 2126 ids, not a sample.

    A malformed id ships silently: it looks like a string, serializes fine, and
    only fails when someone tries to route on it or join against it.
    """
    for daira in get_dairas():
        assert SLUG_PATTERN.match(daira.id), daira.id
    for commune in get_communes():
        assert SLUG_PATTERN.match(commune.id), commune.id


def test_ids_are_composed_from_the_padded_wilaya_code() -> None:
    """``01-aoulef``, not ``1-aoulef``.

    Ids use ``code_text`` while lookups take the number. Building an id from the
    unpadded code would change 9 wilayas' worth of ids without touching the
    other 60 — a partial break that is easy to miss in review.
    """
    for wilaya in get_wilayas():
        prefix = f"{wilaya.code_text}-"
        for daira in get_dairas():
            if daira.wilaya == wilaya.code:
                assert daira.id.startswith(prefix), daira.id


def test_daira_id_is_wilaya_plus_slug_of_its_name() -> None:
    for daira in get_dairas():
        wilaya = next(w for w in get_wilayas() if w.code == daira.wilaya)
        assert daira.id == f"{wilaya.code_text}-{slug(daira.name.fr)}"


def test_commune_id_is_daira_id_plus_slug_of_its_name() -> None:
    """The nesting is what disambiguates the 38 duplicated commune names."""
    for commune in get_communes():
        assert commune.id == f"{commune.daira}-{slug(commune.name.fr)}"


def test_the_canonical_row(slug_fixture: dict[str, Any]) -> None:
    """The example used throughout the docs (ADR-006), built from parts."""
    assert slug("Ain Azel") == "ain-azel"
    assert slug("Ain Lahdjar") == "ain-lahdjar"
    assert "19-ain-azel" in {d.id for d in get_dairas()}
    assert "19-ain-azel-ain-lahdjar" in {c.id for c in get_communes()}


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Alger Centre", "alger-centre"),
        ("Bordj Bou Arreridj", "bordj-bou-arreridj"),
        ("Ain Azel", "ain-azel"),
    ],
)
def test_worked_examples(name: str, expected: str) -> None:
    assert slug(name) == expected
