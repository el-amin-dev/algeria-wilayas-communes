"""The frozen v1 API, warning-free.

``import algeria_wilayas_communes`` gives you v2. This module gives you exactly
what v1 gave you - the same seven functions, returning the same plain ``dict``
shapes with the same French keys - and emits **no** ``DeprecationWarning``.

It exists so a consumer who is not ready to migrate can pin the old contract
**deliberately**, with one import change::

    from algeria_wilayas_communes.legacy import get_communes, find_commune

rather than suppressing warnings globally and losing the signal everywhere else.
This mirrors the JavaScript package's permanent ``/legacy`` subpath (ADR-001).

Frozen at the v1 contract, and removed in v3 alongside the root shims.

Why v1 could not simply stay at the root: four of these names collide with their
v2 counterparts - ``get_wilayas``, ``get_dairas``, ``get_communes`` and
``find_by_postal_code`` all exist in both versions with different return types.
One module cannot export both. The three that do not collide (``get_all``,
``by_wilaya``, ``find_commune``) are re-exported at the root with a deprecation
warning; these seven live here. Same split as the JavaScript package (ADR-002).
"""

from __future__ import annotations

import copy
from typing import Any

from ._loader import load

__all__ = [
    "by_wilaya",
    "find_by_postal_code",
    "find_commune",
    "get_all",
    "get_communes",
    "get_dairas",
    "get_wilayas",
]

# On copying: v1 handed out the live `lru_cache`d objects, so
# `get_communes().clear()` or `get_communes()[0]["nom_fr"] = "oops"` permanently
# corrupted the dataset for every other consumer in the process. There was no
# copy, no freeze and no read-only type.
#
# These functions return copies instead. It is a deliberate, documented
# divergence from v1's exact object identity: preserving a hazard is not
# compatibility worth keeping, and only legacy callers pay the copy. The v2 API
# solves the same problem for free with frozen dataclasses in tuples, which is
# why it needs no copy at all.


def get_all() -> dict[str, Any]:
    """Deprecated. Full nested tree: wilaya > daira > commune.

    Returns:
        A deep copy of ``algeria.json``.

    Example:
        >>> get_all()["nb_wilayas"]
        69
    """
    document: dict[str, Any] = copy.deepcopy(load("algeria.json"))
    return document


def get_wilayas() -> list[dict[str, Any]]:
    """Deprecated. Flat list of the 69 wilayas, in v1 dict shape.

    Example:
        >>> len(get_wilayas())
        69
        >>> get_wilayas()[18]["nom_fr"]
        'Setif'
    """
    return [dict(row) for row in load("wilayas.json")["wilayas"]]


def get_dairas() -> list[dict[str, Any]]:
    """Deprecated. Flat list of the 566 daires, in v1 dict shape.

    Note the frozen quirk: a daira row has **8** fields and carries no
    ``wilaya_ar``, while a commune row has 12 and does. That asymmetry is an
    oversight in the original jq filter that generated the files, now a
    published contract. It is reproduced, not fixed.

    Example:
        >>> len(get_dairas())
        566
        >>> "wilaya_ar" in get_dairas()[0]
        False
    """
    return [dict(row) for row in load("dairas.json")["dairas"]]


def get_communes() -> list[dict[str, Any]]:
    """Deprecated. Flat list of the 1541 communes, in v1 dict shape.

    Example:
        >>> len(get_communes())
        1541
        >>> "wilaya_ar" in get_communes()[0]
        True
    """
    return [dict(row) for row in load("communes.json")["communes"]]


def by_wilaya(num: Any) -> dict[str, Any] | None:
    """Deprecated. One wilaya's full subtree by number (1..69), or ``None``.

    Preserves v1's coercion: the argument goes through ``int()`` and is then
    zero-padded, so ``16``, ``"16"`` and even ``"016"`` all resolve, while
    anything unparseable or out of range returns ``None`` rather than raising.

    One deliberate widening. v1 caught only ``(FileNotFoundError, ValueError)``,
    so ``by_wilaya(None)`` raised ``TypeError`` from ``int(None)``; this also
    catches ``TypeError`` and returns ``None``. Turning a crash into the
    documented miss value cannot break a caller that was not already crashing,
    and it makes the whole function honour the "singular lookup returns None on
    a miss" rule with no exceptions.

    Example:
        >>> by_wilaya(19)["nom_fr"]
        'Setif'
        >>> by_wilaya("19")["code"]
        '19'
        >>> by_wilaya(70) is None
        True
        >>> by_wilaya("nope") is None
        True
    """
    try:
        subtree: dict[str, Any] = copy.deepcopy(load(f"by-wilaya/{int(num):02d}.json"))
    except (FileNotFoundError, TypeError, ValueError):
        return None
    return subtree


def find_by_postal_code(code: Any) -> list[dict[str, Any]]:
    """Deprecated. All communes matching a 5-digit postal code.

    Preserves a genuine v1 trap: because it compares with ``==`` and 48 communes
    have ``code_postal`` of ``None``, ``find_by_postal_code(None)`` returns
    those 27 rather than an empty list. That is v1's behaviour and callers may
    depend on it.

    Example:
        >>> find_by_postal_code("19018")[0]["nom_fr"]
        'Ain Lahdjar'
        >>> len(find_by_postal_code(None))
        48
        >>> find_by_postal_code("00000")
        []
    """
    return [dict(c) for c in load("communes.json")["communes"] if c["code_postal"] == code]


def find_commune(query: str) -> list[dict[str, Any]]:
    """Deprecated. Communes whose French name contains ``query`` (case-insensitive).

    **This is v1's search, exactly.** French ``nom_fr`` only, ``.lower()`` on
    both sides, plain substring, no normalization, unranked, unlimited, in
    document order.

    It is deliberately NOT routed through :func:`~._search.search`. That would
    change the order, the length and the element type of a list existing code
    already iterates, slices and indexes - a silent breakage dressed up as an
    upgrade, which is the worst kind. Use ``search()`` directly when you want
    the better behaviour.

    Example:
        >>> [c["nom_fr"] for c in find_commune("ain lahdjar")]
        ['Ain Lahdjar']
        >>> find_commune("zzzz")
        []
    """
    lowered = query.lower()
    return [dict(c) for c in load("communes.json")["communes"] if lowered in c["nom_fr"].lower()]
