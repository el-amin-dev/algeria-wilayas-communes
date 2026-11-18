"""The Loi 26-06 reform, and the honesty of the unfilled stub.

Two things are under test. The metadata, which is knowable from the law text and
so is fully populated today. And the parent mapping, which is **not** published
anywhere in the dataset and is therefore not shipped - the derived API raises
rather than guessing or returning an unexplainable ``None``.

The last test in this file is the one that matters most: it proves no candidate
parent mapping leaked into executable code. Two independent heuristics were
tried and they agree on only 3 of 11, so shipping either would be inventing
administrative fact.

This module uses wilayas 17/68/69 rather than the canonical Setif row, because
``parent_wilaya`` only exists on codes 59..69 - a documented ADR-006 exception.
"""

from __future__ import annotations

import copy
import re
from pathlib import Path

import pytest

from algeria_wilayas_communes import (
    REFORM,
    ReformMappingUnavailableError,
    _api,
    _indexes,
    _loader,
    _reform,
    get_wilayas,
    resolve_current_wilaya,
    resolve_legacy_wilaya,
)

SRC = Path(__file__).resolve().parents[1] / "src" / "algeria_wilayas_communes"


class TestMetadata:
    """Knowable from the law, so fully populated - unlike the mapping."""

    def test_legal_instrument(self) -> None:
        assert REFORM.law == "Loi 26-06"
        assert REFORM.journal_officiel == "JO n°25"
        assert REFORM.published_on == "2026-04-05"

    def test_transition_dates(self) -> None:
        # Both maps are administratively real between these two dates, which is
        # the entire reason an as_of view exists at all.
        assert REFORM.transition_deadline == "2026-12-31"
        assert REFORM.operational_from == "2027-01-01"

    def test_wilaya_counts(self) -> None:
        assert REFORM.previous_wilaya_count == 58
        assert REFORM.current_wilaya_count == 69

    def test_the_eleven_new_wilayas(self) -> None:
        assert [row.code for row in REFORM.new_wilayas] == list(range(59, 70))


class TestTheStubStaysAStub:
    """Nothing here may quietly acquire a value."""

    def test_no_parent_is_filled(self) -> None:
        assert all(row.parent_code is None for row in REFORM.new_wilayas)

    def test_no_row_claims_a_source(self) -> None:
        # Supplying a parentCode is what costs a citation (ADR-007). A row with
        # a parent and no source would be a guess wearing a fact's clothes.
        assert all(row.source is None for row in REFORM.new_wilayas)

    def test_every_row_is_marked_unverified(self) -> None:
        assert all(row.confidence == "unverified" for row in REFORM.new_wilayas)

    def test_mapping_complete_is_false(self) -> None:
        # Computed from the rows, never read from the file - the stub has no
        # such key, so a maintainer cannot flip the gate over an empty table.
        assert REFORM.mapping_complete is False


class TestAsOf:
    """A two-value enum, and one of the two values is currently unavailable."""

    def test_the_current_map_is_the_default(self) -> None:
        assert len(get_wilayas()) == 69
        assert get_wilayas(as_of="69") == get_wilayas()

    def test_the_legacy_view_needs_the_mapping(self) -> None:
        # Not an empty list and not a silent 69: rebuilding the 58-wilaya view
        # requires knowing which parent each new wilaya came from.
        with pytest.raises(ReformMappingUnavailableError):
            get_wilayas(as_of="58")

    def test_an_unknown_as_of_is_a_programmer_error(self) -> None:
        with pytest.raises(TypeError):
            get_wilayas(as_of="57")

    def test_the_numeric_trap(self) -> None:
        # `as_of=58` instead of `as_of="58"` is the mistake this guards. A
        # silent coercion would hide it, and the two failures are deliberately
        # different exception types.
        with pytest.raises(TypeError):
            get_wilayas(as_of=58)  # type: ignore[arg-type]


class TestResolvers:
    """Both directions raise while the mapping is unavailable."""

    def test_resolve_legacy_wilaya_raises(self) -> None:
        # 63 is Barika, one of the 11. Which of the 58 it was carved out of is
        # only in the JO n°25 text, which nobody has transcribed.
        with pytest.raises(ReformMappingUnavailableError):
            resolve_legacy_wilaya(63)

    def test_resolve_current_wilaya_raises(self) -> None:
        # 17 is Djelfa, the candidate parent of two new wilayas by one heuristic
        # and of none by the other.
        with pytest.raises(ReformMappingUnavailableError):
            resolve_current_wilaya(17)

    def test_even_a_pre_reform_code_raises(self) -> None:
        # 19 needs no mapping to answer, but gating per-argument would make the
        # failure depend on the input and teach callers to probe rather than to
        # branch on REFORM.mapping_complete.
        with pytest.raises(ReformMappingUnavailableError):
            resolve_legacy_wilaya(19)

    def test_the_error_names_the_file_and_the_flag(self) -> None:
        # A None the caller cannot explain is worse than the missing data. The
        # message has to be enough to act on from a stack trace alone.
        with pytest.raises(ReformMappingUnavailableError) as excinfo:
            resolve_legacy_wilaya(63)
        message = str(excinfo.value)
        assert "data/raw/reform.json" in message
        assert "mapping_complete" in message


class TestNoGuessedMappingShips:
    """The gate on inventing administrative fact.

    Postal-prefix inference and shared-daira inference agree on 3 of 11,
    contradict on 2, and six new wilayas share no daira name at all. Two
    independent heuristics agreeing a quarter of the time is the strongest
    argument for shipping neither.
    """

    #: Candidate parents from the postal-prefix heuristic. If any of these
    #: appears in the source, someone has started writing the table down.
    CANDIDATES = ("Laghouat", "El Bayadh", "Tlemcen", "Biskra", "Batna", "Djelfa")

    @pytest.mark.parametrize("candidate", CANDIDATES)
    def test_no_candidate_parent_name_appears_in_source(self, candidate: str) -> None:
        hits = [
            f"{path.name}:{number}"
            for path in sorted(SRC.glob("*.py"))
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
            if candidate in line
        ]
        assert hits == []

    def test_no_parent_code_literal_is_hardcoded(self) -> None:
        # A mapping could also be smuggled in as bare numbers. Any dict literal
        # pairing a new code with a pre-reform one would match.
        pattern = re.compile(r"\b6[0-9]\s*:\s*[0-9]{1,2}\b")
        hits = [
            f"{path.name}:{number}"
            for path in sorted(SRC.glob("*.py"))
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
            if pattern.search(line)
        ]
        assert hits == []


class TestAFilledMapping:
    """What happens once a maintainer transcribes JO n°25.

    Every other reform test asserts the *stub* behaviour, which is a state the
    package is meant to leave. Nothing exercised the filled path, so two real
    defects sat behind the gate that raises: ``parent_wilaya`` was hardcoded to
    ``None`` and would have stayed ``None`` forever while JavaScript populated
    it, and ``get_wilayas(as_of="58")`` returned all 69 records. Both are
    invisible until the day the mapping lands, which is the worst possible time
    to find them.
    """

    @pytest.fixture()
    def filled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Serve a filled reform stub without touching data/raw/reform.json."""
        real = _loader.load
        parents = {
            "59": "03",
            "60": "32",
            "61": "13",
            "62": "07",
            "63": "05",
            "64": "28",
            "65": "12",
            "66": "26",
            "67": "14",
            "68": "17",
            "69": "17",
        }

        def fake(filename: str) -> object:
            document = real(filename)
            if filename != "raw/reform.json":
                return document
            document = copy.deepcopy(document)
            for entry in document["newWilayas"]:
                entry["parentCode"] = parents[entry["code"]]
                entry["source"] = "TEST FIXTURE, NOT A REAL CITATION"
                entry["confidence"] = "confirmed"
            return document

        _indexes.__reset_indexes__()
        _reform.__reset_reform__()
        # Three names, because both consumers do `from ._loader import load`
        # and therefore hold their own binding. Patching only _loader would
        # leave the real stub in play and the test would silently assert
        # nothing.
        monkeypatch.setattr(_loader, "load", fake)
        monkeypatch.setattr(_indexes, "load", fake)
        monkeypatch.setattr(_reform, "load", fake)
        yield
        _indexes.__reset_indexes__()
        _reform.__reset_reform__()

    def test_the_gate_opens(self, filled: None) -> None:
        assert _reform.get_reform().mapping_complete is True

    def test_parent_wilaya_is_populated_not_hardcoded(self, filled: None) -> None:
        # The regression this exists for: a hardcoded None passes every
        # stub-state test forever while JS returns the real parent.
        assert _api.get_wilaya(63).parent_wilaya == 5
        assert _api.get_wilaya(69).parent_wilaya == 17

    def test_pre_reform_wilayas_still_have_no_parent(self, filled: None) -> None:
        # None means two different things, and `code <= 58` is what tells them
        # apart in Python, where a dataclass field cannot simply be absent.
        for wilaya in _api.get_wilayas():
            if _indexes.is_pre_reform_wilaya(wilaya.code):
                assert wilaya.parent_wilaya is None
            else:
                assert wilaya.parent_wilaya is not None

    def test_as_of_58_returns_58_not_69(self, filled: None) -> None:
        legacy_view = _api.get_wilayas(as_of="58")
        assert len(legacy_view) == 58
        assert not any(w.code > 58 for w in legacy_view)

    def test_the_58_view_re_aggregates_counts_onto_the_parent(self, filled: None) -> None:
        current = {w.code: w for w in _api.get_wilayas()}
        legacy_view = {w.code: w for w in _api.get_wilayas(as_of="58")}
        # 68 Ain Oussara and 69 Messaad were both carved out of 17 Djelfa.
        assert legacy_view[17].daira_count == (
            current[17].daira_count + current[68].daira_count + current[69].daira_count
        )
        assert legacy_view[17].commune_count == (
            current[17].commune_count + current[68].commune_count + current[69].commune_count
        )

    def test_the_58_view_conserves_every_daira_and_commune(self, filled: None) -> None:
        # Only wilaya attribution is rewritten. Nothing is created or lost, and
        # the daira and commune tables are not touched at all.
        current = _api.get_wilayas()
        legacy_view = _api.get_wilayas(as_of="58")
        assert sum(w.daira_count for w in legacy_view) == sum(w.daira_count for w in current)
        assert sum(w.commune_count for w in legacy_view) == sum(w.commune_count for w in current)
        assert len(_api.get_dairas()) == 566
        assert len(_api.get_communes()) == 1541
        assert _api.get_commune("19-ain-azel-ain-lahdjar").postal_code == "19018"

    def test_the_resolvers_answer_in_both_directions(self, filled: None) -> None:
        assert _reform.resolve_legacy_wilaya(63) == 5
        assert _reform.resolve_legacy_wilaya(19) == 19  # 1..58 map to themselves
        assert _reform.resolve_current_wilaya(17) == (17, 68, 69)
        assert _reform.resolve_current_wilaya(19) == (19,)
