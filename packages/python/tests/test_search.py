"""Ranked multilingual search.

``test_shared_fixtures.py`` already pins 35 queries against the JavaScript
package's exact answers. This file covers the reasoning behind those answers:
which folding rule makes a query work, which tier a score came from, and the
behaviours a refactor is most likely to break quietly - the limit short-circuit,
the deterministic tie-break, and the fact that an empty query costs nothing.

The canonical example is the Setif row (ADR-006). Alger appears only where it is
itself the fact under test: the one English exonym, and the fuzzy target whose
distances the max-distance table was corrected for.
"""

from __future__ import annotations

import pytest

from algeria_wilayas_communes import search
from algeria_wilayas_communes._search import (
    __reset_search__,
    __search_state__,
    bounded_levenshtein,
)


def _wilayas(query: str, **options: object) -> list[int]:
    return [result.wilaya.code for result in search(query, **options)]  # type: ignore[arg-type]


class TestMultilingual:
    """One record, reachable from every spelling a person actually types."""

    # The dataset spells wilaya 06 "Bejaia", with no accents anywhere in any
    # French name. So these prove the QUERY is folded - a corpus-only fold would
    # pass the first three and fail the last two.
    @pytest.mark.parametrize(
        "query", ["bejaia", "Bejaia", "BEJAIA", "bejaïa", "Béjaïa", "بجاية", "بجايه"]
    )
    def test_bejaia_is_reachable_from_every_spelling(self, query: str) -> None:
        assert search(query)[0].wilaya.code == 6

    # v1 found none of these: no diacritic folding, no apostrophe handling, and
    # no Arabic at all.
    @pytest.mark.parametrize("query", ["msila", "M'Sila", "المسيلة"])
    def test_msila_survives_the_apostrophe(self, query: str) -> None:
        assert search(query)[0].wilaya.code == 28

    def test_apostrophe_inside_a_commune_name(self) -> None:
        # `Sidi M'hamed` -> `sidi mhamed`: the apostrophe is deleted rather than
        # turned into a separator, because the name is one word.
        assert any(r.item.name.fr == "Sidi M'hamed" for r in search("sidi mhamed"))

    @pytest.mark.parametrize("query", ["بَجَايَة", "بجـاية"])
    def test_tashkeel_and_tatweel_are_stripped(self, query: str) -> None:
        # Vocalized text and kashida elongation are display decoration; neither
        # changes which record is meant.
        assert search(query)[0].wilaya.code == 6

    def test_hamza_carrier_and_alef_maqsura_fold(self) -> None:
        # الجزائر is very commonly typed الجزاير, and ى for ي is routine on a
        # phone keyboard. Both must find Alger Centre.
        assert search("الجزائر الوسطى")[0].item.name.fr == "Alger Centre"
        assert search("الجزاير الوسطي")[0].item.name.fr == "Alger Centre"

    def test_the_canonical_record_in_both_scripts(self) -> None:
        assert search("setif")[0].wilaya.code == 19
        assert search("سطيف")[0].matched == "ar"


class TestDuplicatedNames:
    """Why every result carries its wilaya."""

    def test_sidi_ameur_exists_twice(self) -> None:
        # 38 commune names are shared across wilayas. Returning one record, or
        # returning two that cannot be told apart, are both wrong answers.
        assert _wilayas("sidi ameur", kinds=["commune"]) == [32, 64]

    def test_souk_el_had_exists_twice(self) -> None:
        assert _wilayas("souk el had", kinds=["commune"]) == [35, 48]


class TestScoring:
    """The score is public API, so the formulas are pinned numerically.

    Consumers threshold on it (``[r for r in results if r.score >= 0.7]``), and
    the bands must not overlap or that threshold means nothing.
    """

    def test_exact_match_scores_one(self) -> None:
        assert search("setif")[0].score == 1.0

    def test_prefix_score(self) -> None:
        # 0.7 + 0.2 * (3/5) against "alger", and 0.7 + 0.2 * (3/12) against
        # "alger centre" - so a shorter key ranks higher for the same query.
        results = search("alg", limit=5)
        assert results[0].score == pytest.approx(0.82)
        assert results[1].score == pytest.approx(0.75)

    def test_substring_score(self) -> None:
        # 0.4 + 0.2 * (6/12) against "alger centre".
        assert search("centre", wilaya=16)[0].score == pytest.approx(0.5)

    def test_fuzzy_scores_sit_below_every_other_tier(self) -> None:
        # 0.35 - 0.05 * (d - 1): distance 1 scores 0.35, distance 2 scores 0.30.
        assert search("algier", fuzzy=True)[0].score == pytest.approx(0.35)
        assert search("algeirs", fuzzy=True)[0].score == pytest.approx(0.30)

    def test_tiers_do_not_overlap(self) -> None:
        assert search("alg", limit=5)[0].score > search("centre", wilaya=16)[0].score
        assert search("centre", wilaya=16)[0].score > search("algeirs", fuzzy=True)[0].score


class TestOrdering:
    """Identical input must always produce identical output."""

    def test_two_identical_calls_agree(self) -> None:
        # A flaky order is untestable and looks broken in a UI, so the sort key
        # is an explicit total order rather than a reliance on sort stability.
        first = [(r.kind, r.wilaya.code, r.score) for r in search("ain")]
        second = [(r.kind, r.wilaya.code, r.score) for r in search("ain")]
        assert first == second

    def test_kind_breaks_a_score_tie(self) -> None:
        # wilaya < daira < commune. "bejaia" matches all three at score 1.0.
        assert [r.kind for r in search("bejaia")] == ["wilaya", "daira", "commune"]

    def test_wilaya_code_breaks_a_kind_tie(self) -> None:
        assert _wilayas("sidi ameur", kinds=["commune"]) == [32, 64]


class TestOptions:
    def test_limit_caps_the_result_count(self) -> None:
        assert len(search("ain", limit=5)) == 5

    def test_default_limit_is_twenty(self) -> None:
        assert len(search("ain")) == 20

    def test_wilaya_scoping_restricts_every_result(self) -> None:
        # The cheapest big win: the candidate set drops from 2201 records to the
        # few dozen in one wilaya before a single key comparison runs.
        assert all(r.wilaya.code == 19 for r in search("ain azel", wilaya=19))

    def test_kinds_filter(self) -> None:
        assert {r.kind for r in search("bejaia", kinds=["commune"])} == {"commune"}

    def test_unknown_kind_is_skipped_not_treated_as_wilaya(self) -> None:
        # The mask is built by lookup, so an unrecognized name contributes no
        # bit. Falling back to 0 would silently mean "wilaya".
        assert search("setif", kinds=["nope"]) == ()

    def test_lang_en_finds_the_one_exonym(self) -> None:
        # `Algiers` lives in a one-entry override table rather than a third full
        # key layer, because it is the only record in 2201 where en != fr.
        results = search("algiers", lang="en")
        assert results[0].wilaya.code == 16
        assert results[0].matched == "en"

    def test_the_override_is_consulted_only_for_lang_en(self) -> None:
        # Without lang="en" the exonym is not in the index at all, so a bare
        # search for it correctly finds nothing.
        assert search("algiers") == ()


class TestFuzzy:
    """Off by default, and the max-distance table is not the naive one."""

    # All three are Alger. `algeirs` is length 7 at distance 2, which a table
    # jumping to 2 only at length 8 would miss - that is why the jump is at 6.
    @pytest.mark.parametrize("query", ["algier", "alget", "algeirs"])
    def test_typos_resolve(self, query: str) -> None:
        assert search(query, fuzzy=True)[0].item.name.fr == "Alger"

    def test_fuzzy_is_off_by_default(self) -> None:
        assert search("algeirs") == ()

    def test_short_queries_get_no_fuzzy_budget(self) -> None:
        # Three characters or fewer would match far too much to be useful.
        assert search("alg", fuzzy=True)[0].score >= 0.7

    def test_bounded_levenshtein_distances(self) -> None:
        assert bounded_levenshtein("algier", "alger", 2) == 1
        assert bounded_levenshtein("alget", "alger", 1) == 1
        assert bounded_levenshtein("algeirs", "alger", 2) == 2

    def test_bounded_levenshtein_reports_the_cap_not_the_true_distance(self) -> None:
        # The early exit abandons a hopeless pair rather than filling the table,
        # so anything over budget comes back as max_distance + 1.
        assert bounded_levenshtein("completely", "different", 2) == 3
        assert bounded_levenshtein("a", "abcdefgh", 2) == 3

    def test_bounded_levenshtein_is_symmetric_and_zero_for_equal(self) -> None:
        assert bounded_levenshtein("setif", "setif", 2) == 0
        assert bounded_levenshtein("alger", "algier", 2) == bounded_levenshtein(
            "algier", "alger", 2
        )


class TestEmptyAndMissing:
    def test_empty_query_returns_empty_without_building_an_index(self) -> None:
        """The most common accidental call deserves the cheapest answer.

        An empty search box on mount fires this on every page load. Returning
        before the index is touched is the difference between free and ~150 ms.
        """
        __reset_search__()
        assert search("") == ()
        assert search("   ") == ()
        assert __search_state__()["keys"] is False

    def test_a_query_that_normalizes_to_nothing_is_also_empty(self) -> None:
        # Punctuation-only input folds away to "", which is the same case.
        assert search("---") == ()

    def test_search_never_returns_none(self) -> None:
        assert search("zzzzznowhere") == ()

    @pytest.mark.parametrize("query", ["", "   ", "zzzz", "!!!", "بجاية", "a", "19018", "-" * 200])
    def test_search_never_raises(self, query: str) -> None:
        # It sits behind a text input, so every possible string reaches it.
        assert isinstance(search(query), tuple)

    def test_odd_options_do_not_raise(self) -> None:
        assert isinstance(search("setif", limit=0), tuple)
        assert isinstance(search("setif", wilaya="nope"), tuple)
        assert isinstance(search("setif", kinds=[]), tuple)
