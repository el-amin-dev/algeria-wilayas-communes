"""The Loi 26-06 reform - a port of ``packages/js/src/reform.ts`` and ``asof.ts``.

The normative description is ``shared/contract/reform.md``.

Today is mid-transition: both the 58-wilaya map and the 69-wilaya map are real
and in simultaneous administrative use. That is the entire reason an ``as_of``
view exists.

**The parent mapping is not published in the dataset and is never guessed.**
``data/raw/reform.json`` ships as a stub with all 11 ``parentCode`` values null.
Two independent heuristics were tried - postal-prefix inference and shared-daira
inference - and they agree on 3 of 11, contradict on 2, and six new wilayas share
no daira name at all. Two heuristics agreeing a quarter of the time is the
strongest possible argument for shipping neither.

So the derived API **raises** while the stub is unfilled. It does not return
``None``: a ``None`` the caller cannot explain is worse than the missing data
itself, and the exception message names the file to fill and the flag to branch
on. That matches the JavaScript package exactly (decision ADR-005).
"""

from __future__ import annotations

from dataclasses import dataclass

from ._loader import load

__all__ = [
    "Reform",
    "ReformMappingUnavailableError",
    "ReformNewWilaya",
    "get_reform",
    "resolve_current_wilaya",
    "resolve_legacy_wilaya",
    "wilayas_as_of",
]

#: Codes 1..58 are the pre-reform wilayas; 59..69 were created by Loi 26-06.
LAST_PRE_REFORM_WILAYA = 58

_reform: Reform | None = None
_forward: dict[int, int] | None = None
_reverse: dict[int, tuple[int, ...]] | None = None


class ReformMappingUnavailableError(RuntimeError):
    """Raised when an answer would require the unpublished parent mapping.

    Check :attr:`Reform.mapping_complete` before calling the resolvers or
    ``as_of="58"``, rather than catching this.
    """

    def __init__(self) -> None:
        super().__init__(
            "Reform mapping not yet supplied: the 58->69 wilaya parent mapping in "
            "data/raw/reform.json has not been filled in from Loi 26-06 / JO n25. "
            "REFORM.mapping_complete is False. Check REFORM.mapping_complete before "
            "calling get_wilayas(as_of=...), resolve_legacy_wilaya or "
            "resolve_current_wilaya. See "
            "https://github.com/el-amin-dev/algeria-wilayas-communes#the-2026-reform"
        )


@dataclass(frozen=True)
class ReformNewWilaya:
    """One of the 11 wilayas created by Loi 26-06.

    Attributes:
        code: 59..69.
        parent_code: The pre-reform wilaya it was carved out of, or ``None``
            while unpublished. Never a guess.
        source: The citation for ``parent_code``. Supplying a parent is what
            costs a citation (ADR-007).
        confidence: ``"confirmed"``, ``"probable"`` or ``"unverified"``.
    """

    code: int
    parent_code: int | None
    source: str | None
    confidence: str


@dataclass(frozen=True)
class Reform:
    """Metadata for the 2025/2026 administrative reform.

    Example:
        >>> from algeria_wilayas_communes import REFORM
        >>> REFORM.law
        'Loi 26-06'
        >>> REFORM.operational_from
        '2027-01-01'
        >>> len(REFORM.new_wilayas)
        11
        >>> REFORM.mapping_complete
        False
    """

    law: str
    journal_officiel: str
    published_on: str
    transition_deadline: str
    operational_from: str
    previous_wilaya_count: int
    current_wilaya_count: int

    #: Computed, never read from the file. See :func:`_mapping_complete`.
    mapping_complete: bool

    new_wilayas: tuple[ReformNewWilaya, ...]


def _mapping_complete(rows: tuple[ReformNewWilaya, ...]) -> bool:
    """Whether every row is filled AND cited AND confirmed.

    Computed here rather than read from ``reform.json``, deliberately: the stub
    has no ``mappingComplete`` key at all, so a maintainer cannot flip the gate
    by editing one boolean over a table that is still empty. This mirrors
    ``reformMappingComplete`` in ``scripts/build-data.ts``.
    """
    if len(rows) != 11:
        return False
    return all(
        row.parent_code is not None
        and 1 <= row.parent_code <= LAST_PRE_REFORM_WILAYA
        and row.source is not None
        and row.source.strip() != ""
        and row.confidence == "confirmed"
        for row in rows
    )


def get_reform() -> Reform:
    """The reform metadata, loaded once. Not read at import time."""
    global _reform
    if _reform is None:
        raw = load("raw/reform.json")
        rows = tuple(
            ReformNewWilaya(
                code=int(entry["code"]),
                parent_code=None if entry["parentCode"] is None else int(entry["parentCode"]),
                source=entry["source"],
                confidence=entry["confidence"],
            )
            for entry in raw["newWilayas"]
        )
        _reform = Reform(
            law=raw["law"],
            journal_officiel=raw["journalOfficiel"],
            published_on=raw["publishedOn"],
            transition_deadline=raw["transitionDeadline"],
            operational_from=raw["operationalFrom"],
            previous_wilaya_count=raw["previousWilayaCount"],
            current_wilaya_count=raw["currentWilayaCount"],
            mapping_complete=_mapping_complete(rows),
            new_wilayas=rows,
        )
    return _reform


def _assert_mapping_available() -> None:
    if not get_reform().mapping_complete:
        raise ReformMappingUnavailableError()


def _forward_index() -> dict[int, int]:
    """Every current code -> the legacy code it belongs to.

    Codes 1..58 map to themselves. A 59..69 row whose ``parent_code`` is still
    ``None`` is **omitted** rather than self-mapped - claiming a new wilaya is
    its own parent would be a quiet falsehood.
    """
    global _forward
    if _forward is None:
        mapping: dict[int, int] = {code: code for code in range(1, LAST_PRE_REFORM_WILAYA + 1)}
        for row in get_reform().new_wilayas:
            if row.parent_code is not None:
                mapping[row.code] = row.parent_code
        _forward = mapping
    return _forward


def _reverse_index() -> dict[int, tuple[int, ...]]:
    """Every legacy code -> itself plus the current codes carved out of it."""
    global _reverse
    if _reverse is None:
        mapping: dict[int, list[int]] = {
            code: [code] for code in range(1, LAST_PRE_REFORM_WILAYA + 1)
        }
        for row in get_reform().new_wilayas:
            if row.parent_code is not None:
                mapping.setdefault(row.parent_code, []).append(row.code)
        _reverse = {code: tuple(sorted(children)) for code, children in mapping.items()}
    return _reverse


def _coerce(code: int | str) -> int | None:
    if isinstance(code, bool):
        return None
    try:
        return int(code)
    except (TypeError, ValueError):
        return None


def resolve_legacy_wilaya(code: int | str) -> int | None:
    """The pre-reform (58-map) wilaya that ``code`` belongs to.

    The name describes what comes back, not what goes in: pass a **current**
    code, get the **legacy** one. For codes 1..58 that is the code itself.

    Args:
        code: A current wilaya code, ``63`` or ``"63"``.

    Returns:
        The legacy code, or ``None`` if ``code`` is not a wilaya at all.

    Raises:
        ReformMappingUnavailableError: While the mapping stub is unfilled, which
            is the case today. Check ``REFORM.mapping_complete`` first.
    """
    _assert_mapping_available()
    resolved = _coerce(code)
    if resolved is None:
        return None
    return _forward_index().get(resolved)


def resolve_current_wilaya(code: int | str) -> tuple[int, ...] | None:
    """Every current (69-map) wilaya carved out of pre-reform ``code``, plus itself.

    The mirror of :func:`resolve_legacy_wilaya`: pass a **legacy** code, get the
    **current** ones, ascending.

    Args:
        code: A pre-reform wilaya code, ``17`` or ``"17"``.

    Returns:
        The codes, or ``None`` if ``code`` is not a pre-reform wilaya. A miss is
        ``None``, never an empty tuple.

    Raises:
        ReformMappingUnavailableError: While the mapping stub is unfilled.
    """
    _assert_mapping_available()
    resolved = _coerce(code)
    if resolved is None:
        return None
    return _reverse_index().get(resolved)


def wilayas_as_of(as_of: str) -> bool:
    """Validate an ``as_of`` value and report whether the legacy view is wanted.

    Args:
        as_of: ``"58"`` or ``"69"``. Strings only - the numeric ``58`` is the
            trap this guards against.

    Returns:
        True for the 58-wilaya view, False for the current 69.

    Raises:
        TypeError: For anything other than those two strings. This is a
            programmer error at a two-value enum, not user input, so it is a
            distinct failure from the mapping being unavailable.
        ReformMappingUnavailableError: For ``"58"`` while the stub is unfilled.
    """
    if as_of == "69":
        return False
    if as_of != "58":
        raise TypeError(
            f'Invalid as_of option: {as_of!r}. Expected the string "58" '
            '(the pre-reform map) or "69" (the current map).'
        )
    # Gated BEFORE any cache check, so the failure is the same on every call.
    _assert_mapping_available()
    return True


def __reset_reform__() -> None:
    """Drop the reform caches. For tests only, not public API."""
    global _reform, _forward, _reverse
    _reform = _forward = _reverse = None
