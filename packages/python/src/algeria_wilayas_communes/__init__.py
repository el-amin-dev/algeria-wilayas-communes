"""Algeria's administrative divisions: 69 wilayas, 585 daires, 1541 communes.

Names in Arabic, French and English with postal codes, current as of the
2025/2026 reform (*Loi 26-06*). Zero runtime dependencies.

    >>> from algeria_wilayas_communes import get_commune, search
    >>> get_commune("19-ain-azel-ain-lahdjar").postal_code
    '19018'
    >>> search("setif")[0].item.name.fr
    'Setif'

This is the sibling of the npm package of the same name. **The two are one
product**: same record ids, same search scores, same answers, verified against
the shared fixtures in ``shared/fixtures/``. Pick whichever language you are
already in.

Importing this module reads **no data files**. The first call to an accessor
loads only what it needs, so a caller who wants ``get_wilayas()`` never parses
the 592 KB of commune data.

Coming from v1? Four names now mean something different at the root -
``get_wilayas``, ``get_dairas``, ``get_communes`` and ``find_by_postal_code``
return frozen dataclasses in a tuple rather than a list of dicts. The other
three v1 functions still work here with a ``DeprecationWarning``, and all seven
are available unchanged and warning-free from
``algeria_wilayas_communes.legacy``.
"""

from __future__ import annotations

from typing import Any

from ._api import (
    find_by_postal_code,
    find_communes_by_name,
    get_commune,
    get_communes,
    get_communes_of_wilaya,
    get_daira,
    get_dairas,
    get_dairas_of_wilaya,
    get_wilaya,
    get_wilayas,
)
from ._compat import by_wilaya, find_commune, get_all
from ._constants import (
    COMMUNE_COUNT,
    DAIRA_COUNT,
    DATA_VERSION,
    LAST_VERIFIED,
    MISSING_POSTAL_CODE_COUNT,
    POSTAL_CODE_COUNT,
    SOURCE_LAW,
    WILAYA_COUNT,
)
from ._guards import assert_wilaya_code, is_postal_code, is_wilaya_code
from ._models import Commune, Daira, Name, Wilaya
from ._reform import (
    Reform,
    ReformMappingUnavailableError,
    ReformNewWilaya,
    resolve_current_wilaya,
    resolve_legacy_wilaya,
)
from ._search import SearchResult, bounded_levenshtein, search

__version__ = "1.0.0"

# Sorted, per the lint rule. The surface is: the four record types, the ten
# accessors, search, the three guards, the reform API, the provenance
# constants, and the three deprecated v1 shims (see .legacy for all seven).
__all__ = [
    "COMMUNES_MISSING_POSTAL_CODE",
    "COMMUNE_COUNT",
    "DAIRA_COUNT",
    "DATA_VERSION",
    "LAST_VERIFIED",
    "MISSING_POSTAL_CODE_COUNT",
    "POSTAL_CODE_COUNT",
    "REFORM",
    "SOURCE_LAW",
    "WILAYA_COUNT",
    "Commune",
    "Daira",
    "Name",
    "Reform",
    "ReformMappingUnavailableError",
    "ReformNewWilaya",
    "SearchResult",
    "Wilaya",
    "assert_wilaya_code",
    "bounded_levenshtein",
    "by_wilaya",
    "find_by_postal_code",
    "find_commune",
    "find_communes_by_name",
    "get_all",
    "get_commune",
    "get_communes",
    "get_communes_of_wilaya",
    "get_daira",
    "get_dairas",
    "get_dairas_of_wilaya",
    "get_wilaya",
    "get_wilayas",
    "is_postal_code",
    "is_wilaya_code",
    "resolve_current_wilaya",
    "resolve_legacy_wilaya",
    "search",
]

# REFORM and COMMUNES_MISSING_POSTAL_CODE read data, so they cannot be plain
# module-level constants: `import algeria_wilayas_communes` must not touch a
# file. PEP 562 module __getattr__ makes them behave exactly like constants to
# every caller while staying lazy - the JavaScript package can export them
# eagerly because its data is inlined at build time, and this is the Python
# equivalent of that ergonomics without the import cost.
_LAZY = frozenset({"COMMUNES_MISSING_POSTAL_CODE", "REFORM"})


def __getattr__(name: str) -> Any:
    if name == "REFORM":
        from ._reform import get_reform

        return get_reform()
    if name == "COMMUNES_MISSING_POSTAL_CODE":
        from ._indexes import communes_missing_postal_code

        return communes_missing_postal_code()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> tuple[str, ...]:
    # Without this, the lazy names are missing from dir() and from IDE
    # completion, which would make them look like they do not exist.
    return tuple(sorted(set(globals()) | _LAZY))
