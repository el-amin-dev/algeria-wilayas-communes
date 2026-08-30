"""Record shapes, immutability, and the frozen quirks of the published files."""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest

from algeria_wilayas_communes import (
    Commune,
    Daira,
    Name,
    Wilaya,
    get_commune,
    get_communes,
    get_communes_of_wilaya,
    get_daira,
    get_dairas,
    get_dairas_of_wilaya,
    get_wilaya,
    get_wilayas,
)

CANONICAL_COMMUNE = "19-ain-azel-ain-lahdjar"
CANONICAL_DAIRA = "19-ain-azel"


def test_bulk_accessors_return_tuples() -> None:
    """Tuples, not lists.

    v1 returned its live cached list, so ``get_communes().clear()`` corrupted
    the dataset for every other consumer in the process. A tuple of frozen
    dataclasses is immutable end to end, which is what lets these accessors hand
    back the cached object with no defensive copy.
    """
    assert isinstance(get_wilayas(), tuple)
    assert isinstance(get_dairas(), tuple)
    assert isinstance(get_communes(), tuple)
    assert isinstance(get_communes_of_wilaya(19), tuple)
    assert isinstance(get_dairas_of_wilaya(19), tuple)


def test_bulk_accessors_do_not_copy() -> None:
    """The same object every call.

    Copying 1541 records per call would be the wrong way to buy safety that
    immutability already provides for free.
    """
    assert get_communes() is get_communes()
    assert get_wilayas() is get_wilayas()
    assert get_dairas() is get_dairas()


def test_records_are_frozen() -> None:
    """Mutating a record raises rather than silently corrupting the cache.

    This is the single strongest argument for the dataclass model, ahead of
    autocomplete and ahead of mypy: under v1 this assignment succeeded and
    poisoned the shared cache.
    """
    commune = get_commune(CANONICAL_COMMUNE)
    assert commune is not None

    with pytest.raises(dataclasses.FrozenInstanceError):
        commune.postal_code = "99999"  # type: ignore[misc]

    with pytest.raises(dataclasses.FrozenInstanceError):
        commune.name.fr = "oops"  # type: ignore[misc]


def test_replace_produces_a_new_record() -> None:
    """Frozen does not mean uneditable — it means edits cannot be in place."""
    commune = get_commune(CANONICAL_COMMUNE)
    assert commune is not None

    amended = dataclasses.replace(commune, postal_code="00000")
    assert amended.postal_code == "00000"
    assert amended.id == commune.id
    # The cached record is untouched, which is the property that matters.
    assert get_commune(CANONICAL_COMMUNE) == commune


def test_records_are_hashable_and_comparable() -> None:
    """``frozen=True`` gives ``__eq__`` and ``__hash__`` for free.

    Both are load-bearing: the tests here put records in sets, and consumers
    reasonably expect two lookups of the same id to compare equal.
    """
    first = get_commune(CANONICAL_COMMUNE)
    second = get_commune(CANONICAL_COMMUNE)
    assert first == second
    assert len({first, second}) == 1


def test_record_field_names() -> None:
    """The v2 naming convention, which v1 got backwards.

    v1's real design flaw was English function names returning French keys —
    ``get_communes()`` handing back ``nom_fr`` and ``code_postal``. Here the
    attribute names are English and the language lives in the value.
    """
    assert [f.name for f in dataclasses.fields(Name)] == ["ar", "fr", "en"]
    assert [f.name for f in dataclasses.fields(Wilaya)] == [
        "code",
        "code_text",
        "name",
        "daira_count",
        "commune_count",
        "parent_wilaya",
    ]
    assert [f.name for f in dataclasses.fields(Daira)] == [
        "id",
        "wilaya",
        "name",
        "commune_count",
    ]
    assert [f.name for f in dataclasses.fields(Commune)] == [
        "id",
        "wilaya",
        "daira",
        "name",
        "postal_code",
    ]


def test_parent_references_are_scalars_that_resolve() -> None:
    """Parents are carried by id/code, and every one of them resolves.

    Denormalizing parent names into each record would be 2201 chances for a copy
    to go stale. A dangling reference is the failure this rules out.
    """
    daira = get_daira(CANONICAL_DAIRA)
    commune = get_commune(CANONICAL_COMMUNE)
    assert daira is not None and commune is not None

    assert commune.wilaya == 19
    assert commune.daira == CANONICAL_DAIRA
    assert daira.wilaya == 19

    wilaya_codes = {w.code for w in get_wilayas()}
    daira_ids = {d.id for d in get_dairas()}
    assert {c.wilaya for c in get_communes()} <= wilaya_codes
    assert {c.daira for c in get_communes()} <= daira_ids
    assert {d.wilaya for d in get_dairas()} <= wilaya_codes


def test_declared_child_counts_match_reality() -> None:
    """``daira_count`` / ``commune_count`` are carried in the data, not derived.

    Which means they can disagree with the records actually present, and nothing
    else would notice.
    """
    for wilaya in get_wilayas():
        assert len(get_dairas_of_wilaya(wilaya.code)) == wilaya.daira_count
        assert len(get_communes_of_wilaya(wilaya.code)) == wilaya.commune_count

    for daira in get_dairas():
        actual = sum(1 for c in get_communes() if c.daira == daira.id)
        assert actual == daira.commune_count, daira.id


def test_postal_code_is_optional_not_absent() -> None:
    """``None`` says *published as absent*; a missing attribute would say
    *we did not look*. That distinction is worth carrying."""
    commune = get_commune(CANONICAL_COMMUNE)
    assert commune is not None
    assert commune.postal_code == "19018"

    missing = get_commune("29-tizi-tizi")
    assert missing is not None
    assert missing.postal_code is None
    assert hasattr(missing, "postal_code")


def test_parent_wilaya_absence_is_exactly_the_pre_reform_range() -> None:
    """The two-state deviation from the JavaScript model, pinned.

    JavaScript distinguishes three states: the field is *absent* for wilayas
    1..58 (no parent exists) and *present-but-null* for 59..69 (a parent exists
    but is not published yet). A frozen dataclass cannot omit a field, so Python
    collapses both to ``None`` and the "absent" case is exactly ``code <= 58``.

    That equivalence is only safe while the mapping stub is unfilled. When it is
    filled, 59..69 gain real parents and this assertion changes shape — which is
    the point of pinning it here rather than leaving it in a comment.
    """
    # While the stub is unfilled, every parent is None — so the field alone
    # cannot tell "has no parent" from "parent not published yet". The code
    # range is the only thing separating them, which is the deviation.
    assert all(w.parent_wilaya is None for w in get_wilayas())

    pre_reform = [w for w in get_wilayas() if w.code <= 58]
    new_wilayas = [w for w in get_wilayas() if w.code >= 59]
    assert len(pre_reform) == 58
    assert len(new_wilayas) == 11
    assert [w.code for w in new_wilayas] == list(range(59, 70))


def test_frozen_flat_file_asymmetry(raw_dairas: Any, raw_communes: Any) -> None:
    """``dairas.json`` has no ``wilaya_ar``; ``communes.json`` does.

    An oversight in the original jq filter that generated these files, now a
    published contract that jq, CDN and Java consumers depend on. It is
    reproduced deliberately, and this test exists so that a well-meaning
    "cleanup" adding the missing field fails loudly instead of silently breaking
    every downstream parser. It is a candidate v3 break, not a bug to fix now.
    """
    daira_row = raw_dairas["dairas"][0]
    assert len(daira_row) == 8
    assert "wilaya_ar" not in daira_row
    assert set(daira_row) == {
        "wilaya_num",
        "wilaya_code",
        "wilaya_fr",
        "wilaya_en",
        "nom_ar",
        "nom_fr",
        "nom_en",
        "nb_communes",
    }

    commune_row = raw_communes["communes"][0]
    assert len(commune_row) == 12
    assert "wilaya_ar" in commune_row
    assert set(commune_row) == {
        "wilaya_num",
        "wilaya_code",
        "wilaya_ar",
        "wilaya_fr",
        "wilaya_en",
        "daira_ar",
        "daira_fr",
        "daira_en",
        "nom_ar",
        "nom_fr",
        "nom_en",
        "code_postal",
    }


def test_asymmetry_matches_the_shared_fixture(ground_truth: dict[str, Any]) -> None:
    """The same quirk, as the JavaScript suite sees it."""
    counts = ground_truth["flatFileFieldCounts"]
    assert counts == {
        "daira": 8,
        "commune": 12,
        "dairaHasWilayaAr": False,
        "communeHasWilayaAr": True,
    }


def test_daira_arabic_names_survive_the_asymmetry() -> None:
    """A daira's own Arabic name is populated for all 591.

    ``dairas.json`` carries ``nom_ar`` but no ``wilaya_ar``, so building the
    daira index from that file alone would leave a hole the moment anything
    needed the parent's Arabic name. The projection reads the nested source
    instead; this is the check that the choice actually paid off.
    """
    blank = [d.id for d in get_dairas() if not d.name.ar.strip()]
    assert blank == []


def test_wilaya_lookup_shapes() -> None:
    """The canonical row (ADR-006), end to end."""
    wilaya = get_wilaya(19)
    assert wilaya is not None
    assert wilaya.name.fr == "Setif"
    assert wilaya.code == 19
    assert wilaya.code_text == "19"
    assert wilaya.daira_count == 20
    assert wilaya.commune_count == 60
