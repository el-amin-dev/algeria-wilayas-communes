"""The v2 accessors.

Ported from ``packages/js/src/api.ts``, with the same names in ``snake_case``.

Two conventions are held everywhere, without exception:

* **A singular lookup returns ``None`` on a miss.** (JavaScript returns
  ``undefined``.)
* **A plural lookup returns a possibly-empty tuple, never ``None``.** An empty
  result is a normal answer to a plural question.

No sentinel values, no ``(ok, value)`` pairs, no exceptions. Nothing in this
module raises.

Bulk accessors return the cached tuple **without copying**. That is safe
precisely because a tuple of frozen dataclasses is immutable end to end, and it
is the fix for v1's real hazard: v1 handed out its live mutable cached list, so
one consumer could corrupt the dataset for every other consumer in the process.
Copying 1541 records per call to defend against that would be the wrong trade.
"""

from __future__ import annotations

from typing import Union

from . import _indexes
from ._models import Commune, Daira, DairaSubtree, Wilaya, WilayaTree
from ._normalize import normalize

__all__ = [
    "find_by_postal_code",
    "find_communes_by_name",
    "get_commune",
    "get_communes",
    "get_communes_of_wilaya",
    "get_daira",
    "get_dairas",
    "get_dairas_of_wilaya",
    "get_wilaya",
    "get_wilaya_tree",
    "get_wilayas",
]

WilayaLike = Union[int, str]


def get_wilayas(*, as_of: str = "69") -> tuple[Wilaya, ...]:
    """All wilayas, in code order.

    Args:
        as_of: ``"69"`` (default) for the current map, or ``"58"`` for the
            pre-reform one. Strings only - the numeric ``58`` raises, because it
            is a two-value enum and a silent coercion would hide a typo.

    Returns:
        The cached tuple. Immutable, and not copied per call.

    Raises:
        TypeError: For an ``as_of`` other than ``"58"`` or ``"69"``.
        ReformMappingUnavailableError: For ``as_of="58"``, which needs the
            58->69 parent mapping that is not published yet. Check
            ``REFORM.mapping_complete`` first. See ``shared/contract/reform.md``.

    Example:
        >>> len(get_wilayas())
        69
        >>> get_wilayas()[18].name.fr
        'Setif'
        >>> len(get_wilayas(as_of="69"))
        69
    """
    # Imported here rather than at module scope, to keep the import graph
    # acyclic. (all_wilayas() already reads the reform stub to attach
    # parent_wilaya, so this is not the first touch of _reform on this path.)
    from ._reform import wilayas_as_of

    if wilayas_as_of(as_of):
        return _indexes.wilayas_pre_reform()
    return _indexes.all_wilayas()


def get_dairas() -> tuple[Daira, ...]:
    """All 566 daires, in document order.

    566 pairs carry only 545 distinct names, because a daira split by the 2026
    reform appears under each wilaya it now spans.

    Example:
        >>> len(get_dairas())
        566
    """
    return _indexes.all_dairas()


def get_communes() -> tuple[Commune, ...]:
    """All 1541 communes, in document order.

    Example:
        >>> len(get_communes())
        1541
    """
    return _indexes.all_communes()


def get_wilaya(code: WilayaLike) -> Wilaya | None:
    """One wilaya by its code, or ``None``.

    Args:
        code: ``19`` or ``"19"``. Both work; a padded ``"019"`` does not.

    Returns:
        The wilaya, or ``None`` if the code is out of range or not a number.

    Example:
        >>> get_wilaya(19).name.fr
        'Setif'
        >>> get_wilaya("19").code_text
        '19'
        >>> get_wilaya(6).code_text
        '06'
        >>> get_wilaya(16).name.en
        'Algiers'
        >>> get_wilaya(70) is None
        True
    """
    resolved = _indexes.coerce_wilaya_code(code)
    if resolved is None:
        return None
    return _indexes.wilaya_index().get(resolved)


def get_daira(daira_id: str) -> Daira | None:
    """One daira by its id, or ``None``.

    Args:
        daira_id: A library-assigned id such as ``"19-ain-azel"``.

    Returns:
        The daira, or ``None``.

    Example:
        >>> get_daira("19-ain-azel").name.fr
        'Ain Azel'
        >>> get_daira("nope") is None
        True
    """
    return _indexes.daira_index().get(daira_id)


def get_commune(commune_id: str) -> Commune | None:
    """One commune by its id, or ``None``.

    Args:
        commune_id: A library-assigned id such as
            ``"19-ain-azel-ain-lahdjar"``.

    Returns:
        The commune, or ``None``.

    Example:
        >>> get_commune("19-ain-azel-ain-lahdjar").postal_code
        '19018'
        >>> get_commune("nope") is None
        True
    """
    return _indexes.commune_index().get(commune_id)


def get_dairas_of_wilaya(code: WilayaLike) -> tuple[Daira, ...]:
    """Every daira of one wilaya.

    Args:
        code: ``19`` or ``"19"``.

    Returns:
        The daires, or an empty tuple. Never ``None``.

    Example:
        >>> len(get_dairas_of_wilaya(19))
        20
        >>> get_dairas_of_wilaya(70)
        ()
    """
    resolved = _indexes.coerce_wilaya_code(code)
    if resolved is None:
        return ()
    return _indexes.dairas_of_wilaya().get(resolved, ())


def get_communes_of_wilaya(code: WilayaLike) -> tuple[Commune, ...]:
    """Every commune of one wilaya.

    Args:
        code: ``19`` or ``"19"``.

    Returns:
        The communes, or an empty tuple. Never ``None``.

    Example:
        >>> len(get_communes_of_wilaya(19))
        60
        >>> get_communes_of_wilaya(70)
        ()
    """
    resolved = _indexes.coerce_wilaya_code(code)
    if resolved is None:
        return ()
    return _indexes.communes_of_wilaya().get(resolved, ())


def find_by_postal_code(code: str) -> tuple[Commune, ...]:
    """All communes sharing a 5-digit postal code.

    Postal codes are **not unique**: 38 of the 1476 distinct codes in the
    dataset are shared by more than one commune, so this always returns a tuple.
    Treating it as a single-record lookup silently drops data.

    Args:
        code: A 5-digit postal code, e.g. ``"19018"``. Unvalidated input is
            fine - a malformed code simply matches nothing.

    Returns:
        Every matching commune, or an empty tuple. Never ``None``.

    Example:
        >>> find_by_postal_code("19018")[0].name.fr
        'Ain Lahdjar'
        >>> find_by_postal_code("19018")[0].wilaya
        19
        >>> find_by_postal_code("00000")
        ()
    """
    return _indexes.postal_index().get(code, ())


def find_communes_by_name(name: str) -> tuple[Commune, ...]:
    """Communes whose name matches ``name`` exactly, after normalization.

    An exact match on the normalized key, not a substring search - use
    :func:`~._search.search` for that. The query is folded with the same rule as
    the corpus, so accents, case, apostrophes and Arabic spelling variants all
    work.

    Returns a tuple because 38 commune names are shared across wilayas:
    ``Sidi Ameur`` exists in wilaya 32 and 64, ``Souk El Had`` in 35 and 48.

    Args:
        name: A commune name in Arabic, French or English.

    Returns:
        Every match, or an empty tuple. Never ``None``.

    Example:
        >>> [c.wilaya for c in find_communes_by_name("Sidi Ameur")]
        [32, 64]
        >>> find_communes_by_name("ain lahdjar")[0].id
        '19-ain-azel-ain-lahdjar'
        >>> find_communes_by_name("nowhere")
        ()
    """
    wanted = normalize(name)
    if not wanted:
        return ()
    return _indexes.commune_name_index().get(wanted, ())


def get_wilaya_tree(code: WilayaLike) -> WilayaTree | None:
    """One wilaya with its daïras, each carrying its communes.

    The Python counterpart of JavaScript's ``byWilaya(code)``. It exists to
    close a real trap: until now ``by_wilaya`` in Python was a **deprecated v1
    shim returning a dict**, while ``byWilaya`` in JavaScript was the **v2 tree
    accessor**. Same name, same package, two different things -- exactly the
    kind of asymmetry the cross-language contract exists to prevent, and the
    one place it had been documented instead of fixed.

    Returns ``None`` for an unknown code; nothing here raises.

    Built on each call rather than cached. The flat indexes underneath are
    memoised, so the work is re-grouping records that are already projected --
    and a cache keyed by wilaya would hold a second copy of up to 1541 commune
    references for a shape most callers ask for once.

    Example:
        >>> tree = get_wilaya_tree(19)
        >>> tree.name.fr
        'Setif'
        >>> len(tree.dairas) == tree.daira_count
        True
        >>> sum(len(d.communes) for d in tree.dairas) == tree.commune_count
        True
        >>> get_wilaya_tree(99) is None
        True
    """
    wilaya = get_wilaya(code)
    if wilaya is None:
        return None
    subtrees = tuple(
        DairaSubtree(
            id=daira.id,
            wilaya=daira.wilaya,
            name=daira.name,
            communes=tuple(c for c in get_communes_of_wilaya(wilaya.code) if c.daira == daira.id),
        )
        for daira in get_dairas_of_wilaya(wilaya.code)
    )
    return WilayaTree(
        code=wilaya.code,
        code_text=wilaya.code_text,
        name=wilaya.name,
        daira_count=wilaya.daira_count,
        commune_count=wilaya.commune_count,
        dairas=subtrees,
    )
