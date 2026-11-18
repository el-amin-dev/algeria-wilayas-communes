"""Boundary guards.

These are the functions people reach for first: validating a wilaya code out of
a form ``<select>``, or a postal code out of a JSON body, before touching the
data. They take ``object`` rather than a narrow type precisely because the value
has not been validated yet — so most of what is worth testing is the input that
is *not* the happy path.
"""

from __future__ import annotations

import pytest

from algeria_wilayas_communes import (
    assert_wilaya_code,
    get_wilayas,
    is_postal_code,
    is_wilaya_code,
)


def test_every_real_wilaya_code_passes() -> None:
    """Not a sample — all 69, so an off-by-one at either end cannot hide."""
    assert all(is_wilaya_code(w.code) for w in get_wilayas())
    assert sum(1 for n in range(-10, 200) if is_wilaya_code(n)) == 69


def test_wilaya_code_boundaries() -> None:
    assert is_wilaya_code(1) is True
    assert is_wilaya_code(69) is True
    assert is_wilaya_code(0) is False
    assert is_wilaya_code(70) is False
    assert is_wilaya_code(-1) is False


def test_a_string_is_not_a_wilaya_code() -> None:
    """The guard is about the value's type as well as its range.

    ``get_wilaya`` deliberately accepts ``"19"`` for ergonomics; the guard
    deliberately does not. It answers "is this already a code?", and a caller
    who wants coercion should coerce first — otherwise the two would disagree
    about what a validated value looks like.
    """
    assert is_wilaya_code("19") is False
    assert is_wilaya_code("") is False


def test_a_bool_is_not_a_wilaya_code() -> None:
    """``True`` must not pass as wilaya 1.

    ``bool`` is a subclass of ``int`` in Python, so ``isinstance(True, int)`` is
    True and ``1 <= True <= 69`` is also True. Without an explicit exclusion a
    JSON body carrying ``{"wilaya": true}`` would validate cleanly and then
    silently resolve to Adrar. This trap has no JavaScript equivalent, so it is
    exactly the kind of thing a port inherits nothing about.
    """
    assert is_wilaya_code(True) is False
    assert is_wilaya_code(False) is False


def test_a_float_is_not_a_wilaya_code() -> None:
    """``16.0`` comes back from plenty of JSON and CSV parsers.

    Accepting it would mean the "validated" value can still be a float
    downstream, which breaks any dict keyed on the integer code.
    """
    assert is_wilaya_code(16.0) is False
    assert is_wilaya_code(19.5) is False


def test_other_types_are_rejected() -> None:
    for value in (None, [], {}, (), object(), b"19"):
        assert is_wilaya_code(value) is False


def test_the_guard_does_not_touch_the_data() -> None:
    """Range arithmetic, not a lookup.

    Deciding membership by consulting the wilaya index would parse
    ``wilayas.json`` and build a 69-entry dict just to check a number — which
    defeats the point of a guard meant to run at the edge, before any data is
    needed.
    """
    from algeria_wilayas_communes import _indexes

    _indexes.__reset_indexes__()
    assert is_wilaya_code(19) is True
    assert is_wilaya_code(70) is False
    assert _indexes.__index_state__()["wilayas"] is False


def test_assert_wilaya_code_is_silent_on_success() -> None:
    assert assert_wilaya_code(19) is None


def test_assert_wilaya_code_names_the_offending_value() -> None:
    """The message has to carry the value.

    A bare "invalid wilaya code" in a log leaves you guessing which of the
    thousand rows in the batch was wrong.
    """
    with pytest.raises(TypeError, match="70"):
        assert_wilaya_code(70)

    with pytest.raises(TypeError) as excinfo:
        assert_wilaya_code(70)
    assert "1..69" in str(excinfo.value)


def test_assert_wilaya_code_rejects_the_same_things_the_predicate_does() -> None:
    """The two must never disagree, or "validate then trust" is unsound."""
    for value in ("19", 70, 0, 16.0, True, None, []):
        assert is_wilaya_code(value) is False
        with pytest.raises(TypeError):
            assert_wilaya_code(value)


def test_every_real_postal_code_is_well_formed() -> None:
    """All 1493 non-null codes in the dataset, not a sample."""
    from algeria_wilayas_communes import get_communes

    present = [c for c in get_communes() if c.postal_code is not None]
    assert len(present) == 1493
    assert all(is_postal_code(c.postal_code) for c in present)


def test_postal_code_shape() -> None:
    assert is_postal_code("19018") is True
    # A leading zero is meaningful and must survive as a string.
    assert is_postal_code("05000") is True
    assert is_postal_code("00000") is True

    assert is_postal_code("1901") is False
    assert is_postal_code("190180") is False
    assert is_postal_code("") is False


def test_postal_code_rejects_embedded_and_surrounding_whitespace() -> None:
    """Never trims. A code with whitespace around it is not a code.

    Trimming here would quietly accept malformed input from a CSV and push the
    problem to whoever later compares the untrimmed original against the data.
    """
    assert is_postal_code("16 00") is False
    assert is_postal_code(" 19018") is False
    assert is_postal_code("19018 ") is False
    assert is_postal_code("19018\n") is False


def test_postal_code_rejects_non_ascii_digits() -> None:
    """Arabic-Indic digits are digits to Python, and must still be rejected.

    Python's ``\\d`` is Unicode-aware, so ``re.match(r"\\d{5}", "١٦٠٠٠")``
    succeeds — and ``"١٦٠٠٠".isdigit()`` is True as well, which is why
    ``str.isdigit()`` is not a substitute. This library is used with Arabic
    input, so this is a realistic value to receive, not a contrived one. The
    JavaScript side gets ASCII-only behaviour from ``\\d`` for free.
    """
    assert is_postal_code("١٦٠٠٠") is False
    assert is_postal_code("١٩٠١٨") is False
    # Superscripts and other numeric forms are rejected for the same reason.
    assert is_postal_code("¹²³⁴⁵") is False


def test_postal_code_rejects_non_strings() -> None:
    """``19018`` as an int is a common shape from a spreadsheet import.

    Accepting it would also lose the leading zero that ``"05000"`` depends on.
    """
    for value in (19018, None, [], {}, True, 19018.0, b"19018"):
        assert is_postal_code(value) is False
