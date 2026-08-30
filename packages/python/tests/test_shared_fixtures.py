"""Conformance against ``shared/fixtures/`` - the primary anti-drift gate.

These are the tests that make two packages one product. Everything here is also
asserted on the JavaScript side by ``tests/shared-fixtures.test.ts`` against the
very same files, so a divergence between the two implementations fails a build
somewhere rather than reaching a consumer who joined the datasets on ``id`` and
got silent mismatches.

Unlike ``test_cross_language.py`` this needs no Node and no built JS package, so
it runs everywhere - which is what makes it the primary gate and the live diff
the belt-and-braces.

Nothing in this file hardcodes an expected value. Every number and string comes
out of the fixture files; a constant copied into this directory would be a
second source of truth, free to drift.
"""

from __future__ import annotations

import hashlib
from typing import Any

import pytest
from conftest import load_fixture

from algeria_wilayas_communes import get_communes, get_dairas, get_wilayas, search
from algeria_wilayas_communes._normalize import normalize
from algeria_wilayas_communes._search import _build_index
from algeria_wilayas_communes._slug import slug


def _result_rows(results: Any) -> list[dict[str, Any]]:
    """Project results into the fixture's shape.

    A wilaya is identified by ``code_text`` and the other two kinds by ``id``,
    which is what the generator emits: it keeps every row's identity a string,
    so the comparison is uniform.
    """
    return [
        {
            "kind": result.kind,
            "id": result.item.code_text if result.kind == "wilaya" else result.item.id,
            "wilaya": result.wilaya.code,
            "score": result.score,
            "matched": result.matched,
        }
        for result in results
    ]


class TestIdsFixture:
    """``ids.json`` - the exhaustive proof of the slug rule.

    All 2132 synthesized ids, in document order. A port that gets the slug rule
    even slightly wrong diverges here on a named record instead of silently
    minting a database column that will not join.
    """

    def test_daira_ids_match_in_order(self) -> None:
        assert [daira.id for daira in get_dairas()] == load_fixture("ids")["dairas"]

    def test_commune_ids_match_in_order(self) -> None:
        assert [commune.id for commune in get_communes()] == load_fixture("ids")["communes"]

    def test_ids_are_unique(self) -> None:
        # Uniqueness is what makes a synthesized id safe to use as a key at all,
        # and it holds only because (wilaya, nom_fr) is unique at both levels.
        ids = load_fixture("ids")
        assert len(set(ids["dairas"])) == len(ids["dairas"])
        assert len(set(ids["communes"])) == len(ids["communes"])


class TestSlugFixture:
    """``slug.json`` - the rule's named edge cases."""

    def test_every_case(self) -> None:
        failures = [
            (case["input"], slug(case["input"]), case["expected"])
            for case in load_fixture("slug")["cases"]
            if slug(case["input"]) != case["expected"]
        ]
        assert failures == []

    def test_punctuation_is_dropped_not_turned_into_a_separator(self) -> None:
        # The step a reimplementation loses. Writing the rule the way it reads in
        # prose - lowercase, strip accents, drop apostrophes, separators become
        # hyphens - omits the [a-z0-9-] filter and produces `b.-b.-arreridj` and
        # `zbarbar-(el-isseri-)` for two real records. Nothing crashes; the ids
        # are just wrong.
        assert slug("B. B. Arreridj") == "b-b-arreridj"
        assert slug("Z'barbar (El Isseri )") == "zbarbar-el-isseri"


class TestNormalizeFixture:
    """``normalize.json`` - the search-key rule, case by case and in bulk."""

    def test_every_case(self) -> None:
        failures = [
            (case["input"], normalize(case["input"]), case["expected"])
            for case in load_fixture("normalize")["cases"]
            if normalize(case["input"]) != case["expected"]
        ]
        assert failures == []

    def test_whole_key_set_matches_by_digest(self) -> None:
        """All 4402 keys, proven identical without shipping a second copy.

        The digest is over the keys sorted by ``(key, ref)`` and joined on
        ``\\n`` - the same ordering the runtime binary search relies on, so this
        pins the sort as well as the folding.
        """
        expected = load_fixture("normalize")["keys"]
        keys, _refs, _exact, _overrides = _build_index()

        assert len(keys) == expected["count"]
        assert len(set(keys)) == expected["distinct"]
        digest = hashlib.sha256("\n".join(keys).encode("utf-8")).hexdigest()
        assert digest == expected["sha256"]

    def test_ref_packing_matches_by_digest(self) -> None:
        # The packed refs encode (index, kind, lang). If Python packed them
        # differently the keys could still match while every result pointed at
        # the wrong record.
        expected = load_fixture("normalize")["refs"]
        _keys, refs, _exact, _overrides = _build_index()

        assert len(refs) == expected["count"]
        digest = hashlib.sha256(",".join(str(ref) for ref in refs).encode("utf-8")).hexdigest()
        assert digest == expected["sha256"]

    def test_arabic_folds_that_nfd_alone_cannot_do(self) -> None:
        # Lossy on purpose: phone keyboards produce ha for ta marbuta and ya for
        # alef maqsura, and both spellings must reach the same record.
        assert normalize("بجاية") == normalize("بجايه")
        assert normalize("الجزائر الوسطى") == normalize("الجزاير الوسطي")
        # These four fall out of NFD plus the combining-mark strip rather than an
        # explicit character map. An implementation that adds an explicit alef
        # fold AFTER NFD gets a silent no-op, which is what this catches.
        for spelling in ("أدرار", "إدرار", "آدرار", "ٱدرار"):
            assert normalize(spelling) == normalize("ادرار")


class TestGroundTruthFixture:
    """``ground-truth.json`` - the measured dataset facts."""

    def test_counts(self, ground_truth: dict[str, Any]) -> None:
        counts = ground_truth["counts"]
        assert len(get_wilayas()) == counts["wilayas"]
        assert len(get_dairas()) == counts["dairas"]
        assert len(get_communes()) == counts["communes"]
        assert (
            len(get_wilayas()) + len(get_dairas()) + len(get_communes())
            == counts["searchableRecords"]
        )

    def test_postal_codes(self, ground_truth: dict[str, Any]) -> None:
        expected = ground_truth["postalCodes"]
        communes = get_communes()
        with_code = [c for c in communes if c.postal_code is not None]

        assert len(with_code) == expected["present"]
        assert len(communes) - len(with_code) == expected["missing"]
        assert len({c.postal_code for c in with_code}) == expected["distinct"]

    def test_missing_postal_codes_are_the_same_27_records(
        self, ground_truth: dict[str, Any]
    ) -> None:
        # By id, not merely by count: a different set of 27 would pass a count
        # check while describing different places.
        from algeria_wilayas_communes import COMMUNES_MISSING_POSTAL_CODE

        assert list(COMMUNES_MISSING_POSTAL_CODE) == ground_truth["communesMissingPostalCode"]

    def test_one_exonym_in_2201_records(self, ground_truth: dict[str, Any]) -> None:
        exonyms = [w.name.fr for w in get_wilayas() if w.name.en != w.name.fr]
        exonyms += [d.name.fr for d in get_dairas() if d.name.en != d.name.fr]
        exonyms += [c.name.fr for c in get_communes() if c.name.en != c.name.fr]
        assert exonyms == ground_truth["exonyms"]

    def test_duplicated_commune_names_by_wilaya(self, ground_truth: dict[str, Any]) -> None:
        # These are real data, not a defect, and they are why every search result
        # carries its wilaya: a result that is only a name cannot be told apart.
        for expected in ground_truth["duplicatedCommuneNameExamples"]:
            wilayas = [c.wilaya for c in get_communes() if c.name.fr == expected["name"]]
            assert wilayas == expected["wilayas"]


class TestSearchFixture:
    """``search.json`` - full ordered results, scores included, for 35 queries.

    The ordering is compared, not just the set. The tie-break is part of the
    contract: a flaky order is untestable and looks broken in a UI.
    """

    @pytest.mark.parametrize(
        "case",
        load_fixture("search")["cases"],
        ids=lambda case: f"{case['query']!r}-{sorted(case['options'])}",
    )
    def test_case_reproduces_the_fixture(self, case: dict[str, Any]) -> None:
        actual = _result_rows(search(case["query"], **case["options"]))
        assert actual == case["results"]

    def test_the_fixture_covers_every_fold_and_tier(self) -> None:
        # Guards against the fixture being quietly trimmed to whatever still
        # passes - the failure mode that makes a conformance file worthless.
        assert len(load_fixture("search")["cases"]) >= 30


class TestTheFixturesAreNotEmpty:
    """Every other test here iterates a fixture's cases and asserts no failures.

    All of them pass vacuously against ``{"cases": []}``. A regeneration that
    silently emitted nothing — a renamed key, a filter that matched none, an
    emitter that threw and was caught — would turn the entire conformance suite
    green while checking nothing at all, in both languages at once. That is the
    one failure mode the shared tier cannot afford, because it is the tier
    everything else trusts.

    Counts are lower bounds, not exact: adding a case should never fail a test.
    """

    def test_slug_fixture_has_its_cases(self) -> None:
        assert len(load_fixture("slug")["cases"]) >= 11

    def test_normalize_fixture_has_its_cases(self) -> None:
        fixture = load_fixture("normalize")
        assert len(fixture["cases"]) >= 25
        # The digests are what make the fixture exhaustive rather than a sample,
        # so an empty or truncated key set has to fail here too.
        assert fixture["keys"]["count"] == 4402
        assert fixture["keys"]["distinct"] == 3055
        assert len(fixture["keys"]["sha256"]) == 64
        assert len(fixture["refs"]["sha256"]) == 64

    def test_ids_fixture_has_every_id(self) -> None:
        fixture = load_fixture("ids")
        assert len(fixture["dairas"]) == 591
        assert len(fixture["communes"]) == 1541

    def test_ground_truth_fixture_is_populated(self) -> None:
        truth = load_fixture("ground-truth")
        assert truth["counts"]["communes"] == 1541
        assert len(truth["communesMissingPostalCode"]) == 27
        assert len(truth["exonyms"]) == 1
        assert len(truth["duplicatedCommuneNameExamples"]) == 2

    def test_search_fixture_has_its_cases(self) -> None:
        assert len(load_fixture("search")["cases"]) >= 30
