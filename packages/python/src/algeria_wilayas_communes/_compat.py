"""The three v1 names that survive at the root, each with a deprecation warning.

Only three of v1's seven functions are re-exported from the top-level package:
``get_all``, ``by_wilaya`` and ``find_commune``. The other four -
``get_wilayas``, ``get_dairas``, ``get_communes`` and ``find_by_postal_code`` -
collide with their v2 counterparts, which have the same names and different
return types. One module cannot export both, so at the root those four names
mean v2, and all seven v1 functions remain available from
:mod:`algeria_wilayas_communes.legacy`.

This is the same split the JavaScript package makes (ADR-001, ADR-002): the root
entry is pure v2, ``/legacy`` is pure v1, and only the non-colliding names are
shimmed in between.

Each shim delegates to :mod:`.legacy` so there is exactly one implementation of
the v1 contract.
"""

from __future__ import annotations

import warnings
from typing import Any

from . import legacy

__all__ = ["by_wilaya", "find_commune", "get_all"]

_REMOVAL = "Removed in v3."


def _deprecated(old: str, new: str) -> None:
    warnings.warn(
        f"{old}() is deprecated. Use {new} instead. {_REMOVAL}",
        DeprecationWarning,
        # 3, not the default 1: the warning must point at the USER's call site.
        # With stacklevel=1 it points at this helper, and the caller has no idea
        # which of their lines is the deprecated one. 1 = here, 2 = the shim,
        # 3 = the caller.
        stacklevel=3,
    )


def get_all() -> dict[str, Any]:
    """Deprecated. Full nested tree: wilaya > daira > commune.

    Use :func:`~._api.get_wilayas` with :func:`~._api.get_dairas_of_wilaya` and
    :func:`~._api.get_communes_of_wilaya`, or
    ``algeria_wilayas_communes.legacy.get_all`` to keep the v1 dict.
    """
    _deprecated("get_all", "get_wilayas() / get_communes_of_wilaya()")
    return legacy.get_all()


def by_wilaya(num: Any) -> dict[str, Any] | None:
    """Deprecated. One wilaya's full subtree by number (1..69), or ``None``.

    Use :func:`~._api.get_wilaya`, or
    ``algeria_wilayas_communes.legacy.by_wilaya`` to keep the v1 dict.
    """
    _deprecated("by_wilaya", "get_wilaya()")
    return legacy.by_wilaya(num)


def find_commune(query: str) -> list[dict[str, Any]]:
    """Deprecated. Communes whose French name contains ``query``.

    Use :func:`~._search.search`, which is multilingual, ranked and typo
    tolerant - or ``algeria_wilayas_communes.legacy.find_commune`` to keep v1's
    exact French-substring behaviour.

    The body is v1's, unchanged: routing it through ``search()`` would change
    the order, the length and the element type of the returned list.
    """
    _deprecated("find_commune", "search()")
    return legacy.find_commune(query)
