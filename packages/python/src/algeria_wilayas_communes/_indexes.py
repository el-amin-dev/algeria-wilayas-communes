"""Lazy record projection and the four lookup indexes.

**Nothing here runs at import time.** ``import algeria_wilayas_communes`` must
read zero bytes of data, and a caller who only wants :func:`get_wilayas` must
never parse the 592 KB ``communes.json``. That is a hard rule, gated by
``tests/test_hard_rules.py``, not a style preference.

The anti-pattern this module exists to avoid::

    # runs on import; every consumer pays for it
    POSTAL_INDEX = _build_postal_index()

A module-level ``X = build()`` executes on import. A user who only wanted
``get_wilayas()`` would parse ``communes.json`` and allocate 1541 dataclasses
for nothing.

Each index has its **own** builder. A single ``_init_all()`` would re-couple
them and defeat the point.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from . import _loader
from ._loader import load
from ._models import Commune, Daira, Name, Wilaya
from ._normalize import normalize
from ._slug import slug

__all__ = [
    "all_communes",
    "all_dairas",
    "all_wilayas",
    "coerce_wilaya_code",
    "commune_index",
    "commune_name_index",
    "communes_missing_postal_code",
    "communes_of_wilaya",
    "daira_index",
    "dairas_of_wilaya",
    "is_pre_reform_wilaya",
    "postal_index",
    "wilaya_index",
    "wilayas_pre_reform",
]

# The reform created wilayas 59..69. A wilaya at or below this code has no
# parent at all, which is a different statement from "its parent is not yet
# known". See Wilaya.parent_wilaya and shared/contract/reform.md.
_LAST_PRE_REFORM_WILAYA = 58

_wilayas: tuple[Wilaya, ...] | None = None
_dairas: tuple[Daira, ...] | None = None
_communes: tuple[Commune, ...] | None = None

_wilaya_by_code: dict[int, Wilaya] | None = None
_daira_by_id: dict[str, Daira] | None = None
_commune_by_id: dict[str, Commune] | None = None
_commune_by_postal: dict[str, tuple[Commune, ...]] | None = None
_dairas_by_wilaya: dict[int, tuple[Daira, ...]] | None = None
_communes_by_wilaya: dict[int, tuple[Commune, ...]] | None = None
_commune_by_name: dict[str, tuple[Commune, ...]] | None = None
_wilayas_58: tuple[Wilaya, ...] | None = None
_missing_postal: tuple[str, ...] | None = None


def coerce_wilaya_code(code: object) -> int | None:
    """Accept ``19`` or ``"19"`` and return the int, or ``None`` if it is neither.

    Users have ``19`` from a form ``<select>`` and ``"19"`` from a JSON body;
    forcing them to convert is friction with no benefit. Lives here, once,
    because both the accessors and the search's ``wilaya=`` scope need it and
    two copies would be free to drift - which they did: search briefly accepted
    ``True`` as wilaya 1 while the accessors rejected it, and the JavaScript
    package returns nothing for that input.

    ``bool`` is rejected explicitly. It is an ``int`` subclass, so without the
    check ``True`` resolves to wilaya 1 and ``False`` to a miss, which is a
    silent wrong answer rather than an error.
    """
    if isinstance(code, bool) or code is None:
        return None
    if isinstance(code, int):
        return code
    if not isinstance(code, str):
        return None
    try:
        return int(code)
    except ValueError:
        return None


def _name(record: Any, prefix: str = "nom") -> Name:
    return Name(ar=record[f"{prefix}_ar"], fr=record[f"{prefix}_fr"], en=record[f"{prefix}_en"])


def all_wilayas() -> tuple[Wilaya, ...]:
    """The 69 wilayas, in code order.

    Reads ``wilayas.json`` plus the 2.8 KB ``raw/reform.json``, because
    ``parent_wilaya`` is attached here — exactly as the JavaScript package
    attaches ``parentWilaya`` in ``indexes.ts``. Hardcoding the field to
    ``None`` would make it a permanent lie the moment a maintainer fills the
    mapping from JO n°25: JS callers would get the parent and Python callers
    would not, with no test able to notice.
    """
    global _wilayas
    # `is None`, NOT `if not _wilayas`: an empty tuple is falsy and would make
    # this rebuild forever. Same rule as the JS side's `=== undefined`.
    if _wilayas is None:
        # Imported here rather than at module scope purely to keep the import
        # graph acyclic; _reform imports only _loader.
        from ._reform import get_reform

        parents = {
            entry.code: entry.parent_code
            for entry in get_reform().new_wilayas
            if entry.parent_code is not None
        }
        rows = load("wilayas.json")["wilayas"]
        _wilayas = tuple(
            Wilaya(
                code=int(row["wilaya_num"]),
                code_text=row["code"],
                name=_name(row),
                daira_count=row["nb_dairas"],
                commune_count=row["nb_communes"],
                # None for 1..58, which have no parent at all, AND for 59..69
                # while the mapping stub is unfilled. Python cannot omit a
                # dataclass field the way the TypeScript optional is absent, so
                # the two states are told apart by `code <= 58`.
                parent_wilaya=parents.get(int(row["wilaya_num"])),
            )
            for row in rows
        )
    return _wilayas


def wilayas_pre_reform() -> tuple[Wilaya, ...]:
    """The 58 pre-reform wilayas, with the new ones folded into their parents.

    Only **wilaya attribution** is rewritten, which is what makes the 58 map a
    view rather than a second dataset: 59..69 are absent and their daira and
    commune counts are re-aggregated onto the wilaya mère; the 585 daires and
    1541 communes are unchanged, in the same order, with the same ids and the
    same postal codes. Daires are never merged.

    Only reachable once the mapping is filled — every caller goes through
    :func:`~._reform.wilayas_as_of`, which raises while the stub is unfilled.
    """
    global _wilayas_58
    if _wilayas_58 is None:
        current = all_wilayas()
        by_code = {w.code: w for w in current}
        daira_extra: dict[int, int] = {}
        commune_extra: dict[int, int] = {}
        for wilaya in current:
            parent = wilaya.parent_wilaya
            if parent is None:
                continue
            daira_extra[parent] = daira_extra.get(parent, 0) + wilaya.daira_count
            commune_extra[parent] = commune_extra.get(parent, 0) + wilaya.commune_count
        _wilayas_58 = tuple(
            replace(
                by_code[code],
                daira_count=by_code[code].daira_count + daira_extra.get(code, 0),
                commune_count=by_code[code].commune_count + commune_extra.get(code, 0),
            )
            for code in range(1, _LAST_PRE_REFORM_WILAYA + 1)
            if code in by_code
        )
    return _wilayas_58


def is_pre_reform_wilaya(code: int) -> bool:
    """True for the 58 wilayas that existed before Loi 26-06.

    This is how a caller distinguishes the two meanings of a ``None``
    ``parent_wilaya``: for these codes there is no parent to have, and for the
    rest the mapping is simply not published yet.
    """
    return code <= _LAST_PRE_REFORM_WILAYA


def all_dairas() -> tuple[Daira, ...]:
    """The 585 daires, in document order.

    Built from ``algeria.json`` rather than ``dairas.json``, because
    ``dairas.json`` has **no ``wilaya_ar`` field** while ``communes.json`` does
    - a frozen quirk of the original jq filter that generated them (see
    docs/DECISIONS.md). Reading the nested source is the only way to populate
    every language for a daira's own name without joining, and it is correct by
    construction rather than by patching around the asymmetry.
    """
    global _dairas
    if _dairas is None:
        built: list[Daira] = []
        for wilaya in load("algeria.json")["wilayas"]:
            code_text = wilaya["code"]
            for daira in wilaya["dairas"]:
                built.append(
                    Daira(
                        id=f"{code_text}-{slug(daira['nom_fr'])}",
                        wilaya=int(wilaya["wilaya_num"]),
                        name=_name(daira),
                        commune_count=daira["nb_communes"],
                    )
                )
        _dairas = tuple(built)
    return _dairas


def all_communes() -> tuple[Commune, ...]:
    """The 1541 communes, in document order.

    Built from ``algeria.json`` for the same reason as :func:`all_dairas`: the
    commune's own id is derived from its daira's id, so the nesting is needed.
    """
    global _communes
    if _communes is None:
        built: list[Commune] = []
        for wilaya in load("algeria.json")["wilayas"]:
            code_text = wilaya["code"]
            wilaya_num = int(wilaya["wilaya_num"])
            for daira in wilaya["dairas"]:
                daira_id = f"{code_text}-{slug(daira['nom_fr'])}"
                for commune in daira["communes"]:
                    built.append(
                        Commune(
                            id=f"{daira_id}-{slug(commune['nom_fr'])}",
                            wilaya=wilaya_num,
                            daira=daira_id,
                            name=_name(commune),
                            postal_code=commune["code_postal"],
                        )
                    )
        _communes = tuple(built)
    return _communes


def wilaya_index() -> dict[int, Wilaya]:
    """``code -> Wilaya``. 69 entries; the cheapest index."""
    global _wilaya_by_code
    if _wilaya_by_code is None:
        _wilaya_by_code = {wilaya.code: wilaya for wilaya in all_wilayas()}
    return _wilaya_by_code


def daira_index() -> dict[str, Daira]:
    """``id -> Daira``. Unique by construction."""
    global _daira_by_id
    if _daira_by_id is None:
        _daira_by_id = {daira.id: daira for daira in all_dairas()}
    return _daira_by_id


def commune_index() -> dict[str, Commune]:
    """``id -> Commune``. Unique by construction."""
    global _commune_by_id
    if _commune_by_id is None:
        _commune_by_id = {commune.id: commune for commune in all_communes()}
    return _commune_by_id


def postal_index() -> dict[str, tuple[Commune, ...]]:
    """``postal code -> communes``. The value is a tuple, **always**.

    This is the single most common place to get the model wrong. There are
    1474 distinct non-null postal codes across 1511 communes with a code, so
    **33 codes are shared by more than one commune**. A ``Dict[str, Commune]``
    would silently drop records depending on insertion order.
    """
    global _commune_by_postal
    if _commune_by_postal is None:
        grouped: dict[str, list[Commune]] = {}
        for commune in all_communes():
            if commune.postal_code is None:
                continue
            grouped.setdefault(commune.postal_code, []).append(commune)
        _commune_by_postal = {code: tuple(rows) for code, rows in grouped.items()}
    return _commune_by_postal


def commune_name_index() -> dict[str, tuple[Commune, ...]]:
    """``normalized name -> communes``, covering both French and Arabic.

    Backs :func:`~._api.find_communes_by_name`. It is an index rather than a
    scan for the same reason every other lookup here is: normalizing all 1541
    names on every call is v1's O(n) failure mode, and the cost that actually
    hurts is that scan sitting inside a consumer's loop over ten thousand
    addresses.

    The value is a tuple because commune names are not unique - 38 French names
    are shared across wilayas, and folding French and Arabic into one key space
    adds a few more collisions.
    """
    global _commune_by_name
    if _commune_by_name is None:
        grouped: dict[str, list[Commune]] = {}
        for commune in all_communes():
            for key in {normalize(commune.name.fr), normalize(commune.name.ar)}:
                if key:
                    grouped.setdefault(key, []).append(commune)
        # Already in document order: all_communes() is iterated in order and
        # rows are appended, so no sort is needed (and .index() over a
        # 1541-tuple per row would be quadratic).
        _commune_by_name = {key: tuple(rows) for key, rows in grouped.items()}
    return _commune_by_name


def dairas_of_wilaya() -> dict[int, tuple[Daira, ...]]:
    """``wilaya code -> its daires``. Backs the search's ``wilaya=`` scoping."""
    global _dairas_by_wilaya
    if _dairas_by_wilaya is None:
        grouped: dict[int, list[Daira]] = {}
        for daira in all_dairas():
            grouped.setdefault(daira.wilaya, []).append(daira)
        _dairas_by_wilaya = {code: tuple(rows) for code, rows in grouped.items()}
    return _dairas_by_wilaya


def communes_of_wilaya() -> dict[int, tuple[Commune, ...]]:
    """``wilaya code -> its communes``."""
    global _communes_by_wilaya
    if _communes_by_wilaya is None:
        grouped: dict[int, list[Commune]] = {}
        for commune in all_communes():
            grouped.setdefault(commune.wilaya, []).append(commune)
        _communes_by_wilaya = {code: tuple(rows) for code, rows in grouped.items()}
    return _communes_by_wilaya


def communes_missing_postal_code() -> tuple[str, ...]:
    """The ids of the 30 communes published without a postal code.

    Derived from the data, never hand-copied: a transcribed list is one more
    thing to drift.
    """
    global _missing_postal
    if _missing_postal is None:
        _missing_postal = tuple(
            commune.id for commune in all_communes() if commune.postal_code is None
        )
    return _missing_postal


def __index_state__() -> dict[str, bool]:
    """Which caches are populated. For tests only, not public API.

    The "pay for what you use" rule is otherwise unobservable: calling
    ``get_wilayas()`` and asserting it returned 69 rows says nothing about
    whether ``communes.json`` was parsed on the way. This exposes that.
    """
    return {
        "wilayas": _wilayas is not None,
        "wilayas_58": _wilayas_58 is not None,
        "dairas": _dairas is not None,
        "communes": _communes is not None,
        "wilaya_index": _wilaya_by_code is not None,
        "daira_index": _daira_by_id is not None,
        "commune_index": _commune_by_id is not None,
        "postal_index": _commune_by_postal is not None,
        "commune_name_index": _commune_by_name is not None,
        "dairas_of_wilaya": _dairas_by_wilaya is not None,
        "communes_of_wilaya": _communes_by_wilaya is not None,
    }


def __reset_indexes__() -> None:
    """Drop every cache. For tests only, not public API."""
    global _wilayas, _dairas, _communes, _wilaya_by_code, _daira_by_id
    global _commune_by_id, _commune_by_postal, _dairas_by_wilaya
    global _communes_by_wilaya, _missing_postal, _commune_by_name, _wilayas_58
    _wilayas = _dairas = _communes = None
    _wilaya_by_code = _daira_by_id = _commune_by_id = None
    _commune_by_postal = _dairas_by_wilaya = _communes_by_wilaya = None
    _missing_postal = _commune_by_name = _wilayas_58 = None
    # Reach through the module rather than calling the `load` imported above:
    # a test that swaps in a double binds the local name, and the real parse
    # cache would then survive a reset and leak between tests.
    clear = getattr(_loader.load, "cache_clear", None)
    if clear is not None:
        clear()
