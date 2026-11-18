"""Accessor behaviour: what a hit returns, and what a miss returns.

Two conventions are held without exception, and most of this file exists to keep
them that way:

* a singular lookup returns ``None`` on a miss;
* a plural lookup returns an empty tuple, never ``None``.

No sentinels, no ``(ok, value)`` pairs, no exceptions. A caller should never have
to remember which accessor signals a miss which way.
"""

from __future__ import annotations

from algeria_wilayas_communes import (
    find_by_postal_code,
    find_communes_by_name,
    get_commune,
    get_communes,
    get_communes_of_wilaya,
    get_daira,
    get_dairas_of_wilaya,
    get_wilaya,
    get_wilayas,
)

CANONICAL_COMMUNE = "19-ain-azel-ain-lahdjar"
CANONICAL_DAIRA = "19-ain-azel"
CANONICAL_POSTAL = "19018"


def test_get_wilaya_by_number_and_string() -> None:
    """Both forms work, because both occur in the wild.

    Users have ``19`` from a form ``<select>`` and ``"19"`` from a JSON body.
    Making them convert is friction with no benefit.
    """
    assert get_wilaya(19) is not None
    assert get_wilaya(19) == get_wilaya("19")
    assert get_wilaya(19).name.fr == "Setif"  # type: ignore[union-attr]


def test_get_wilaya_code_text_is_the_padded_form() -> None:
    """Wilaya 6 is where the two representations visibly differ.

    ``code`` is the number 6; ``code_text`` is ``"06"``, which is what appears
    in every record id and every published JSON file. Conflating them breaks id
    construction for the nine single-digit wilayas.
    """
    wilaya = get_wilaya(6)
    assert wilaya is not None
    assert wilaya.code == 6
    assert wilaya.code_text == "06"


def test_the_single_english_exonym() -> None:
    """Wilaya 16 is the one record in 2176 where ``en`` differs from ``fr``."""
    wilaya = get_wilaya(16)
    assert wilaya is not None
    assert wilaya.name.fr == "Alger"
    assert wilaya.name.en == "Algiers"


def test_singular_lookups_return_none_on_a_miss() -> None:
    """A miss is ``None``, and nothing raises.

    Raising here would push try/except into every call site for what is an
    ordinary, expected answer.
    """
    assert get_wilaya(70) is None
    assert get_wilaya(0) is None
    assert get_wilaya(-1) is None
    assert get_wilaya("nope") is None
    assert get_wilaya("") is None
    assert get_commune("nope") is None
    assert get_daira("nope") is None


def test_padded_wilaya_string_is_not_a_lookup_key() -> None:
    """``"019"`` parses as 19 because the coercion is ``int()``.

    Recorded rather than argued over: the v2 accessor is deliberately liberal in
    what it accepts, and this documents where that lands. It differs from the v1
    ``by_wilaya`` shim's behaviour in the JavaScript package, which pads a string
    instead of parsing it.
    """
    assert get_wilaya("019") == get_wilaya(19)


def test_get_commune_and_daira_by_id() -> None:
    commune = get_commune(CANONICAL_COMMUNE)
    daira = get_daira(CANONICAL_DAIRA)
    assert commune is not None and daira is not None

    assert commune.name.fr == "Ain Lahdjar"
    assert commune.postal_code == CANONICAL_POSTAL
    assert commune.daira == CANONICAL_DAIRA
    assert daira.name.fr == "Ain Azel"
    assert daira.commune_count == 4


def test_lookups_return_the_same_objects_as_the_bulk_accessors() -> None:
    """Identity, not just equality.

    The indexes are projections of the one cached tuple. If a lookup ever
    started building its own records, memory would quietly double and two
    records for the same place could drift apart.
    """
    commune = get_commune(CANONICAL_COMMUNE)
    assert any(c is commune for c in get_communes())
    assert any(w is get_wilaya(19) for w in get_wilayas())


def test_find_by_postal_code_always_returns_a_tuple() -> None:
    """Never a bare record, even when exactly one commune matches.

    38 of the 1479 distinct codes are shared, so a single-record return type
    would be wrong for those and would force callers to handle two shapes.
    """
    hit = find_by_postal_code(CANONICAL_POSTAL)
    assert isinstance(hit, tuple)
    assert len(hit) == 1
    assert hit[0].name.fr == "Ain Lahdjar"
    assert hit[0].wilaya == 19

    assert find_by_postal_code("00000") == ()
    assert find_by_postal_code("not-a-code") == ()
    assert find_by_postal_code("") == ()


def test_find_by_postal_code_returns_every_sharer() -> None:
    """A shared code returns all of its communes, each with its own wilaya."""
    shared = [
        code
        for code in {c.postal_code for c in get_communes() if c.postal_code}
        if len(find_by_postal_code(code)) > 1
    ]
    assert len(shared) == 17

    sample = find_by_postal_code(sorted(shared)[0])
    assert len({c.id for c in sample}) == len(sample)


def test_find_communes_by_name_disambiguates_by_wilaya() -> None:
    """``Sidi Ameur`` is two different communes.

    Returning one of them — whichever the iteration order happened to reach
    first — would be a silent data loss that no type error catches.
    """
    matches = find_communes_by_name("Sidi Ameur")
    assert [c.wilaya for c in matches] == [32, 64]

    assert [c.wilaya for c in find_communes_by_name("Souk El Had")] == [35, 48]


def test_find_communes_by_name_normalizes_the_query() -> None:
    """Case, accents, apostrophes and Arabic spelling variants all resolve.

    The query goes through the same fold as the corpus. If the two ever used
    different rules, every lookup would miss silently.
    """
    assert find_communes_by_name("ain lahdjar")[0].id == CANONICAL_COMMUNE
    assert find_communes_by_name("AIN LAHDJAR")[0].id == CANONICAL_COMMUNE
    assert find_communes_by_name("  Ain  Lahdjar  ")[0].id == CANONICAL_COMMUNE

    # Apostrophes are deleted rather than split on: M'Sila is one word.
    assert find_communes_by_name("m'sila") == find_communes_by_name("msila")
    assert find_communes_by_name("msila") != ()


def test_the_arabic_layer_collides_more_than_the_french_one() -> None:
    """Three communes share one Arabic name across two French names.

    ``عين الحجر`` is the Arabic name of ``Ain Lahdjar`` (wilaya 19) and of
    ``Ain El Hadjar`` (wilayas 10 and 20) — the French forms transliterate the
    same Arabic differently. So an Arabic query is legitimately less selective
    than the French one, and returning only the first match would drop two real
    records.

    This is why the name index maps to a tuple rather than a single record, and
    why it is keyed on the normalized form of BOTH languages rather than French
    alone.
    """
    matches = find_communes_by_name("عين الحجر")
    assert [c.id for c in matches] == [
        "10-ain-bessem-ain-el-hadjar",
        "19-ain-azel-ain-lahdjar",
        # Re-parented from the phantom daira ``Ain Bessem`` to Saida's real
        # ``Ain El Hadjar``, which changed its id. See docs/DECISIONS.md ADR-018.
        "20-ain-el-hadjar-ain-el-hadjar",
    ]
    assert {c.name.fr for c in matches} == {"Ain El Hadjar", "Ain Lahdjar"}
    # Document order, matching every other accessor.
    assert [c.wilaya for c in matches] == [10, 19, 20]


def test_find_communes_by_name_misses_are_empty_tuples() -> None:
    assert find_communes_by_name("nowhere") == ()
    assert find_communes_by_name("") == ()
    assert find_communes_by_name("   ") == ()


def test_plural_lookups_never_return_none() -> None:
    """An empty result is a normal answer to a plural question."""
    assert get_communes_of_wilaya(70) == ()
    assert get_dairas_of_wilaya(70) == ()
    assert get_communes_of_wilaya("nope") == ()
    assert get_dairas_of_wilaya("nope") == ()


def test_per_wilaya_accessors() -> None:
    communes = get_communes_of_wilaya(19)
    dairas = get_dairas_of_wilaya(19)

    assert len(communes) == 60
    assert len(dairas) == 20
    assert all(c.wilaya == 19 for c in communes)
    assert all(d.wilaya == 19 for d in dairas)
    assert any(c.id == CANONICAL_COMMUNE for c in communes)
    assert get_communes_of_wilaya("19") == communes


def test_every_commune_is_reachable_through_its_wilaya() -> None:
    """The per-wilaya index partitions the corpus — no record lost, none double
    counted."""
    regrouped = sum(len(get_communes_of_wilaya(w.code)) for w in get_wilayas())
    assert regrouped == len(get_communes())


def test_boolean_is_not_a_wilaya_code() -> None:
    """``True`` must not resolve to wilaya 1.

    ``bool`` is a subclass of ``int`` in Python, so ``isinstance(True, int)`` is
    True and a naive coercion turns ``True`` into 1. A JSON body carrying
    ``{"wilaya": true}`` would then silently look up Adrar.
    """
    assert get_wilaya(True) is None
    assert get_wilaya(False) is None
    assert get_communes_of_wilaya(True) == ()
    assert get_dairas_of_wilaya(True) == ()
