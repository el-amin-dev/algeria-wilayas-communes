"""v1 compatibility: the ``legacy`` module and the three root shims.

Two promises are under test.

``algeria_wilayas_communes.legacy`` is frozen at the v1 contract and silent, so
a consumer who is not ready to migrate can pin it with one import change instead
of suppressing DeprecationWarning globally and losing the signal everywhere else.

The three root shims - the v1 names that do not collide with a v2 name - still
work and say so. The other four v1 names mean v2 at the root, because one module
cannot export ``get_communes`` twice with different return types.

The sharpest test here is ``test_find_commune_was_not_upgraded``. Routing that
shim through ``search()`` would change the order, the length and the element
type of a list that existing code already iterates, slices and indexes: a silent
breakage dressed up as an improvement.

``pyproject.toml`` sets ``filterwarnings = ["error::DeprecationWarning"]`` so any
*accidental* internal use of a shim fails the suite. These tests opt back in with
``pytest.warns``, which is what they should be asserting anyway.
"""

from __future__ import annotations

import warnings
from typing import Any, Callable, ClassVar

import pytest

import algeria_wilayas_communes as package
from algeria_wilayas_communes import legacy

#: The v1 flat row shapes, frozen. The asymmetry is real: a daira row carries no
#: `wilaya_ar` while a commune row does - an oversight in the original jq filter
#: that is now a published contract, reproduced rather than fixed.
WILAYA_FIELDS = 7
DAIRA_FIELDS = 8
COMMUNE_FIELDS = 12


class TestLegacyIsSilent:
    """The whole point of the module: opt in deliberately, hear nothing."""

    @pytest.mark.parametrize(
        ("name", "args"),
        [
            ("get_all", ()),
            ("get_wilayas", ()),
            ("get_dairas", ()),
            ("get_communes", ()),
            ("by_wilaya", (19,)),
            ("find_by_postal_code", ("19018",)),
            ("find_commune", ("ain lahdjar",)),
        ],
    )
    def test_no_warning(self, name: str, args: tuple) -> None:
        # error::DeprecationWarning is already configured, so a warning here
        # would raise rather than merely be recorded.
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            getattr(legacy, name)(*args)

    def test_exports_exactly_the_seven_v1_names(self) -> None:
        assert sorted(legacy.__all__) == [
            "by_wilaya",
            "find_by_postal_code",
            "find_commune",
            "get_all",
            "get_communes",
            "get_dairas",
            "get_wilayas",
        ]


class TestV1Shapes:
    """Plain dicts with the original French keys, not dataclasses."""

    def test_counts(self) -> None:
        assert len(legacy.get_wilayas()) == 69
        assert len(legacy.get_dairas()) == 566
        assert len(legacy.get_communes()) == 1541

    def test_rows_are_plain_dicts(self) -> None:
        assert all(isinstance(row, dict) for row in legacy.get_communes())

    def test_wilaya_row_shape(self) -> None:
        row = legacy.get_wilayas()[18]
        assert len(row) == WILAYA_FIELDS
        assert row["nom_fr"] == "Setif"
        # v1's `code` was the padded string; v2's is the number 19.
        assert row["code"] == "19"

    def test_daira_row_has_no_wilaya_ar(self) -> None:
        # A future "cleanup" adding wilaya_ar for symmetry would change a
        # published file that jq and CDN consumers already depend on.
        row = legacy.get_dairas()[0]
        assert len(row) == DAIRA_FIELDS
        assert "wilaya_ar" not in row

    def test_commune_row_has_wilaya_ar(self) -> None:
        row = legacy.get_communes()[0]
        assert len(row) == COMMUNE_FIELDS
        assert "wilaya_ar" in row

    def test_get_all_is_the_nested_tree(self) -> None:
        tree = legacy.get_all()
        assert tree["nb_wilayas"] == 69
        assert len(tree["wilayas"]) == 69


class TestByWilaya:
    """v1's coercion, preserved exactly - including its looseness."""

    def test_by_number(self) -> None:
        assert legacy.by_wilaya(19)["nom_fr"] == "Setif"

    def test_by_string(self) -> None:
        assert legacy.by_wilaya("19")["code"] == "19"

    def test_out_of_range_is_none_not_an_error(self) -> None:
        assert legacy.by_wilaya(70) is None

    def test_unparseable_is_none_not_an_error(self) -> None:
        # v1 caught ValueError and returned None rather than raising, and
        # callers may be relying on that.
        assert legacy.by_wilaya("nope") is None

    def test_none_is_none(self) -> None:
        assert legacy.by_wilaya(None) is None


class TestFindByPostalCode:
    def test_finds_the_canonical_record(self) -> None:
        assert legacy.find_by_postal_code("19018")[0]["nom_fr"] == "Ain Lahdjar"

    def test_miss_is_an_empty_list(self) -> None:
        assert legacy.find_by_postal_code("00000") == []

    def test_the_none_trap_is_preserved(self) -> None:
        # A genuine v1 quirk: it compares with == and 48 communes have a null
        # code, so passing None returns those 27 instead of nothing. Preserved
        # because it is v1's behaviour, not because it is a good idea.
        assert len(legacy.find_by_postal_code(None)) == 48


class TestFindCommuneKeepsV1Behaviour:
    """The hard rule: v1's search, unchanged."""

    @pytest.mark.parametrize(
        "query", ["ain lahdjar", "ain", "setif", "el", "a", "zzzz", "SETIF", "Ain"]
    )
    def test_shim_and_legacy_agree_element_for_element(self, query: str) -> None:
        with pytest.warns(DeprecationWarning):
            shimmed = package.find_commune(query)
        assert shimmed == legacy.find_commune(query)

    def test_results_are_dicts_not_dataclasses(self) -> None:
        # search() returns SearchResult objects. If the shim were routed through
        # it, every `c["nom_fr"]` in existing code would raise TypeError.
        assert all(isinstance(row, dict) for row in legacy.find_commune("ain"))

    def test_it_is_unlimited(self) -> None:
        # search() caps at 20 by default. v1 never did, and code that slices the
        # result itself would silently start seeing a truncated list.
        assert len(legacy.find_commune("ain")) > 20

    def test_it_is_french_substring_only(self) -> None:
        # No normalization: v1 compared raw lowercased strings, so an Arabic
        # query found nothing and an accent had to match exactly.
        assert legacy.find_commune("سطيف") == []

    def test_it_is_unranked_document_order(self) -> None:
        # Ranking would reorder a list that callers index into positionally.
        results = legacy.find_commune("ain")
        wilayas = [row["wilaya_num"] for row in results]
        assert wilayas == sorted(wilayas)

    def test_case_insensitive(self) -> None:
        assert legacy.find_commune("SETIF") == legacy.find_commune("setif")


class TestRootShims:
    """The three v1 names that survive at the root, each announcing itself."""

    SHIMS: ClassVar[list[tuple]] = [
        ("get_all", ()),
        ("by_wilaya", (19,)),
        ("find_commune", ("ain lahdjar",)),
    ]

    @pytest.mark.parametrize(("name", "args"), SHIMS)
    def test_each_warns(self, name: str, args: tuple) -> None:
        with pytest.warns(DeprecationWarning) as record:
            getattr(package, name)(*args)
        message = str(record[0].message)
        assert "Removed in v3." in message
        assert "Use " in message

    @pytest.mark.parametrize(("name", "args"), SHIMS)
    def test_the_warning_points_at_the_caller(self, name: str, args: tuple) -> None:
        """stacklevel must name the user's line, not the library's.

        With the default stacklevel=1 the warning points inside the package and
        the user has no idea which of their call sites is deprecated - which
        makes the warning worthless for the one job it has.
        """
        with pytest.warns(DeprecationWarning) as record:
            getattr(package, name)(*args)
        assert record[0].filename == __file__

    @pytest.mark.parametrize(("name", "args"), SHIMS)
    def test_the_shim_returns_the_v1_value(self, name: str, args: tuple) -> None:
        with pytest.warns(DeprecationWarning):
            shimmed = getattr(package, name)(*args)
        assert shimmed == getattr(legacy, name)(*args)

    def test_the_four_colliding_names_are_v2_at_the_root(self) -> None:
        # This is the whole reason the split exists: these four cannot be v1 and
        # v2 at once, so at the root they are v2 and return frozen dataclasses.
        assert isinstance(package.get_communes(), tuple)
        assert isinstance(package.get_wilayas(), tuple)
        assert isinstance(package.get_dairas(), tuple)
        assert isinstance(package.find_by_postal_code("19018"), tuple)
        assert not isinstance(package.get_communes()[0], dict)


class TestLegacyDoesNotLeakTheCache:
    """v1's real hazard, deliberately closed.

    v1 handed out the live lru_cached objects, so one consumer could run
    ``get_communes().clear()`` and permanently corrupt the dataset for every
    other consumer in the process. Only legacy callers pay for the copy, and the
    v2 API avoids the problem entirely with frozen dataclasses in tuples.
    """

    def test_clearing_a_returned_list_does_not_empty_the_dataset(self) -> None:
        legacy.get_communes().clear()
        assert len(legacy.get_communes()) == 1541

    def test_mutating_a_returned_row_does_not_corrupt_the_dataset(self) -> None:
        legacy.get_communes()[0]["nom_fr"] = "oops"
        assert legacy.get_communes()[0]["nom_fr"] != "oops"

    def test_the_nested_tree_is_also_isolated(self) -> None:
        tree = legacy.get_all()
        tree["wilayas"][0]["nom_fr"] = "oops"
        assert legacy.get_all()["wilayas"][0]["nom_fr"] != "oops"

    def test_a_mutated_subtree_does_not_corrupt_the_dataset(self) -> None:
        subtree = legacy.by_wilaya(19)
        subtree["dairas"].clear()
        assert len(legacy.by_wilaya(19)["dairas"]) == 20

    def test_the_v2_api_is_unaffected_by_legacy_mutation(self) -> None:
        # The two layers read the same files; corrupting one must not reach the
        # other.
        legacy.get_communes().clear()
        assert len(package.get_communes()) == 1541


def test_no_v1_helper_is_missing() -> None:
    """Every v1 name is reachable somewhere, so no call site is stranded."""
    v1_names: dict[str, Callable[..., Any]] = {
        name: getattr(legacy, name) for name in legacy.__all__
    }
    assert len(v1_names) == 7
    # Three at the root, and all seven in .legacy.
    assert {"get_all", "by_wilaya", "find_commune"} <= set(dir(package))
