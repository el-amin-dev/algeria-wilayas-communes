"""Ranked multilingual search - a port of ``packages/js/src/search.ts``.

The normative description is ``shared/contract/search.md``; the conformance
fixture is ``shared/fixtures/search.json``, which records the full ordered
result list, scores included, for 35 queries. Both packages must reproduce it
exactly.

What this replaces, and why every point of it mattered. v1 was::

    def find_commune(query):
        q = query.lower()
        return [c for c in get_communes() if q in c["nom_fr"].lower()]

French only, so an Algerian typing an Arabic name got nothing for a commune that
plainly exists. No diacritic folding, so ``bejaia`` missed ``Bejaia``'s accented
cousins. No apostrophe handling, so ``msila`` missed ``M'Sila``. No ranking, so
an exact hit sorted identically to a substring hit. No limit. No fuzzy. And it
lowercased 1541 strings on **every call**.

The key index is built lazily on the first :func:`search` and cached for the
process lifetime. The JavaScript package does this at build time instead,
emitting the keys into ``generated/search-keys.ts``; Python cannot, by decision
PY-D2 (no generated ``.py`` data literals). So Python pays a one-time cost and
is free thereafter - against v1's 1541 allocations *per call*, the amortized
position is overwhelmingly better from the second query onward.
"""

from __future__ import annotations

import bisect
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from itertools import chain
from typing import Union

from . import _indexes
from ._models import Commune, Daira, Wilaya
from ._normalize import normalize

# A runtime alias, so `Union` rather than `X | Y`: the PEP 604 form is only
# valid at runtime from 3.10, and this package supports 3.9. Annotations are
# fine either way thanks to `from __future__ import annotations`.
Record = Union[Wilaya, Daira, Commune]

__all__ = ["SearchResult", "bounded_levenshtein", "search"]

# Packed ref layout, identical to the JavaScript side:
#
#   ref = (index << 3) | (kind << 1) | lang
#     lang   bit 0     0 = fr, 1 = ar
#     kind   bits 1-2  0 = wilaya, 1 = daira, 2 = commune
#     index  bits 3+   position in the wilaya / daira / commune tuple
#
# `ref >> 1` is the record identity used to deduplicate a record that matched on
# both its French and its Arabic name.
_KIND_WILAYA = 0
_KIND_DAIRA = 1
_KIND_COMMUNE = 2
_KIND_NAMES = ("wilaya", "daira", "commune")
_KIND_RANK = {"wilaya": 0, "daira": 1, "commune": 2}

_LANG_FR = 0
_LANG_AR = 1
_LANG_ANY = -1
_LANG_NONE = -2

_ALL_KINDS = (1 << _KIND_WILAYA) | (1 << _KIND_DAIRA) | (1 << _KIND_COMMUNE)

DEFAULT_LIMIT = 20

# The score bands do not overlap, which is what makes `score` meaningful as a
# public number a consumer can threshold on. They are part of the API and must
# stay stable across releases - and identical to the JavaScript package's, or
# the two are different products.
_SCORE_EXACT = 1.0
_PREFIX_BASE = 0.7
_PREFIX_SPAN = 0.2
_SUBSTRING_BASE = 0.4
_SUBSTRING_SPAN = 0.2
_FUZZY_BASE = 0.35
_FUZZY_STEP = 0.05

_NO_RESULTS: tuple[SearchResult, ...] = ()

_keys: list[str] | None = None
_refs: list[int] | None = None
_exact: dict[str, list[int]] | None = None
_en_overrides: list[tuple[str, int]] | None = None
_buckets: dict[str, tuple[int, int]] | None = None
_wilaya_positions: dict[int, list[int]] | None = None
_lang_pairs: dict[int, list[tuple[str, int]]] | None = None


@dataclass(frozen=True)
class SearchResult:
    """One ranked hit.

    Attributes:
        kind: ``"wilaya"``, ``"daira"`` or ``"commune"``.
        item: The matched record.
        wilaya: The owning wilaya, **always resolved**. Without it a result is
            undisambiguable: ``search("sidi ameur")`` legitimately returns two
            communes, in wilaya 32 and wilaya 64.
        score: See the tier table in ``shared/contract/search.md``. Stable
            across releases so callers can threshold on it.
        matched: Which language layer matched - ``"ar"``, ``"fr"`` or ``"en"``.
    """

    kind: str
    item: Wilaya | Daira | Commune
    wilaya: Wilaya
    score: float
    matched: str


def _build_index() -> tuple[list[str], list[int], dict[str, list[int]], list[tuple[str, int]]]:
    """Normalize the corpus once. Never called at import time.

    2201 records x 2 language layers (fr + ar) = **4402 keys**. There is
    deliberately no third `en` layer: ``name.en`` differs from ``name.fr`` for
    exactly one record in the whole dataset (wilaya 16, Alger / Algiers), so a
    full layer would add 2201 keys to serve one record. ``lang="en"`` searches
    the ``fr`` keys plus a one-entry override table instead.
    """
    global _keys, _refs, _exact, _en_overrides
    # `is None`, not `if not _keys`: an empty list is falsy and would rebuild
    # forever.
    if _keys is None or _refs is None or _exact is None or _en_overrides is None:
        pairs: list[tuple[str, int]] = []
        overrides: list[tuple[str, int]] = []

        def collect(records: Sequence[Record], kind: int) -> None:
            for index, record in enumerate(records):
                base = (index << 3) | (kind << 1)
                pairs.append((normalize(record.name.fr), base | _LANG_FR))
                pairs.append((normalize(record.name.ar), base | _LANG_AR))
                # The `en` layer is a 1-entry override table rather than a third
                # full layer: name.en differs from name.fr for exactly one record
                # in 2201 (wilaya 16, Alger / Algiers).
                if record.name.en != record.name.fr:
                    overrides.append((normalize(record.name.en), base | _LANG_FR))

        collect(_indexes.all_wilayas(), _KIND_WILAYA)
        collect(_indexes.all_dairas(), _KIND_DAIRA)
        collect(_indexes.all_communes(), _KIND_COMMUNE)

        # Sorted once. The sort order IS the prefix index - no trie is built,
        # and prefix lookup is a binary search over this list. The tie-break on
        # ref is not cosmetic: 1347 of the 4402 keys are duplicates, and without
        # it the order (and therefore which rows survive `limit`) could differ
        # between runtimes.
        pairs.sort()
        overrides.sort()

        keys = [key for key, _ in pairs]
        exact: dict[str, list[int]] = {}
        for position, key in enumerate(keys):
            exact.setdefault(key, []).append(position)

        _keys = keys
        _refs = [ref for _, ref in pairs]
        _exact = exact
        _en_overrides = overrides
    return _keys, _refs, _exact, _en_overrides


def _bucket_ranges() -> dict[str, tuple[int, int]]:
    """First-character -> ``[lo, hi)`` over the sorted keys.

    Free, because the keys are already sorted: one pass gives every range. Used
    only by the unscoped fuzzy tier.
    """
    global _buckets
    if _buckets is None:
        keys, _, _, _ = _build_index()
        ranges: dict[str, tuple[int, int]] = {}
        for position, key in enumerate(keys):
            if not key:
                continue
            head = key[0]
            existing = ranges.get(head)
            ranges[head] = (
                (position, position + 1) if existing is None else (existing[0], position + 1)
            )
        _buckets = ranges
    return _buckets


def _pairs_by_lang() -> dict[int, list[tuple[str, int]]]:
    """Language -> its ``(key, ref)`` pairs, in key order.

    Purely a shape for the substring tier to iterate cheaply. That tier is the
    only one that can touch every key, so at 4402 entries the difference between
    indexing two parallel lists per iteration and walking one list of pairs is
    the difference between beating v1 and losing to it. Splitting by language at
    build time also removes a per-key branch, and halves the walk for the common
    single-script query.
    """
    global _lang_pairs
    if _lang_pairs is None:
        keys, refs, _, _ = _build_index()
        split: dict[int, list[tuple[str, int]]] = {_LANG_FR: [], _LANG_AR: []}
        for key, ref in zip(keys, refs):
            split[ref & 1].append((key, ref))
        _lang_pairs = split
    return _lang_pairs


def _positions_by_wilaya() -> dict[int, list[int]]:
    """Wilaya code -> ascending key positions belonging to it.

    This is the cheapest big win in the API: it takes the corpus from 2201
    records down to typically 10-60 before a single key comparison runs.
    """
    global _wilaya_positions
    if _wilaya_positions is None:
        _, refs, _, _ = _build_index()
        grouped: dict[int, list[int]] = {}
        for position, ref in enumerate(refs):
            grouped.setdefault(_wilaya_code_of_ref(ref), []).append(position)
        _wilaya_positions = grouped
    return _wilaya_positions


def _record_of_ref(ref: int) -> Wilaya | Daira | Commune:
    index = ref >> 3
    kind = (ref >> 1) & 3
    if kind == _KIND_WILAYA:
        return _indexes.all_wilayas()[index]
    if kind == _KIND_DAIRA:
        return _indexes.all_dairas()[index]
    return _indexes.all_communes()[index]


def _wilaya_code_of_ref(ref: int) -> int:
    record = _record_of_ref(ref)
    return record.code if isinstance(record, Wilaya) else record.wilaya


def bounded_levenshtein(a: str, b: str, max_distance: int) -> int:
    """Edit distance, capped. Returns ``max_distance + 1`` when the bound is exceeded.

    Hand-rolled and dependency-free on purpose. ``rapidfuzz``,
    ``python-Levenshtein`` and ``jellyfish`` would each be a runtime dependency
    this package refuses to take, and ``difflib.SequenceMatcher`` is not a
    substitute at all: it computes Ratcliff-Obershelp similarity rather than
    edit distance, so it would give different answers from the JavaScript side
    by construction.

    Two rolling rows rather than a full ``(m+1) x (n+1)`` matrix, and an early
    exit as soon as a row's minimum exceeds the bound - no later row can go
    below it, so a hopeless pair is abandoned after one or two rows instead of
    filling the table.

    Args:
        a: The normalized query.
        b: A candidate key.
        max_distance: The budget, from the query-length table in :func:`search`.

    Returns:
        The distance, or ``max_distance + 1`` if it exceeds the budget.

    Example:
        >>> bounded_levenshtein("algier", "alger", 2)
        1
        >>> bounded_levenshtein("algeirs", "alger", 2)
        2
        >>> bounded_levenshtein("completely", "different", 2)
        3
    """
    if abs(len(a) - len(b)) > max_distance:
        return max_distance + 1

    previous = list(range(len(b) + 1))
    current = [0] * (len(b) + 1)

    for i in range(1, len(a) + 1):
        current[0] = i
        row_min = i
        a_char = a[i - 1]
        for j in range(1, len(b) + 1):
            cost = 0 if a_char == b[j - 1] else 1
            value = min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
            current[j] = value
            if value < row_min:
                row_min = value
        if row_min > max_distance:
            return max_distance + 1
        previous, current = current, previous

    return previous[len(b)]


def _max_distance_for(length: int) -> int:
    """Fuzzy budget by query length. Never taken from the caller.

    The jump to 2 happens at length **6**, not 8. The naive table
    (<=3 -> 0, 4-7 -> 1, >=8 -> 2) gives ``algeirs`` a budget of 1 and fails to
    find ``Alger``, which is two edits away. Do not "tidy" this back.
    """
    if length <= 3:
        return 0
    if length <= 5:
        return 1
    return 2


def _substring_lang_bit(query: str, lang_bit: int) -> int:
    """Which language layer the substring tier may scan.

    Ported as-is, including a known quirk: the test is ``ord(c) < 0x80``, i.e.
    *any* non-space ASCII, rather than "Latin alphanumeric". One key in the
    corpus contains an ASCII ``(``, so a query mixing that parenthesis with
    Arabic is classified mixed-script and returns nothing despite being a real
    substring.

    It is pinned by tests on the JavaScript side. Fixing it in one language only
    would break conformance; fixing it properly means changing both
    implementations and the fixtures in one commit.
    """
    has_ascii = False
    has_wide = False
    for char in query:
        if char == " ":
            continue
        if ord(char) < 0x80:
            has_ascii = True
        else:
            has_wide = True
    if has_ascii and has_wide:
        return _LANG_NONE
    if not has_ascii and not has_wide:
        return lang_bit
    script = _LANG_AR if has_wide else _LANG_FR
    if lang_bit != _LANG_ANY and lang_bit != script:
        return _LANG_NONE
    return script


class _Context:
    """Per-query state. Not public."""

    __slots__ = ("kind_mask", "lang_bit", "limit", "out", "overrides", "query", "seen", "wilaya")

    def __init__(
        self,
        query: str,
        limit: int,
        kind_mask: int,
        lang_bit: int,
        overrides: bool,
        wilaya: int | None,
    ) -> None:
        self.query = query
        self.limit = limit
        self.kind_mask = kind_mask
        self.lang_bit = lang_bit
        self.overrides = overrides
        self.wilaya = wilaya
        self.seen: set[int] = set()
        self.out: list[tuple[str, SearchResult]] = []


def _admits_record(ref: int, ctx: _Context) -> bool:
    if (ctx.kind_mask & (1 << ((ref >> 1) & 3))) == 0:
        return False
    return not (ctx.wilaya is not None and _wilaya_code_of_ref(ref) != ctx.wilaya)


def _admits(ref: int, ctx: _Context) -> bool:
    if ctx.lang_bit != _LANG_ANY and (ref & 1) != ctx.lang_bit:
        return False
    return _admits_record(ref, ctx)


def _unseen(ref: int, ctx: _Context) -> bool:
    return (ref >> 1) not in ctx.seen


def _emit(ref: int, key: str, score: float, matched: str, ctx: _Context) -> None:
    ctx.seen.add(ref >> 1)
    record = _record_of_ref(ref)
    kind = _KIND_NAMES[(ref >> 1) & 3]
    owner = record if isinstance(record, Wilaya) else _indexes.wilaya_index()[record.wilaya]
    ctx.out.append((key, SearchResult(kind, record, owner, score, matched)))


def _tier_exact(ctx: _Context) -> None:
    _, refs, exact, overrides = _build_index()
    for position in exact.get(ctx.query, ()):
        if len(ctx.out) >= ctx.limit:
            return
        ref = refs[position]
        if _admits(ref, ctx) and _unseen(ref, ctx):
            _emit(ref, ctx.query, _SCORE_EXACT, "ar" if (ref & 1) == _LANG_AR else "fr", ctx)
    if not ctx.overrides:
        return
    for key, ref in overrides:
        if len(ctx.out) >= ctx.limit:
            return
        if key == ctx.query and _admits_record(ref, ctx) and _unseen(ref, ctx):
            _emit(ref, key, _SCORE_EXACT, "en", ctx)


def _tier_prefix(ctx: _Context) -> None:
    keys, refs, _, overrides = _build_index()
    for position in range(bisect.bisect_left(keys, ctx.query), len(keys)):
        if len(ctx.out) >= ctx.limit:
            return
        key = keys[position]
        if not key.startswith(ctx.query):
            break  # the sorted range of matching prefixes ends here
        ref = refs[position]
        if _admits(ref, ctx) and _unseen(ref, ctx):
            score = _PREFIX_BASE + _PREFIX_SPAN * (len(ctx.query) / len(key))
            _emit(ref, key, score, "ar" if (ref & 1) == _LANG_AR else "fr", ctx)
    if not ctx.overrides:
        return
    for key, ref in overrides:
        if len(ctx.out) >= ctx.limit:
            return
        if key.startswith(ctx.query) and _admits_record(ref, ctx) and _unseen(ref, ctx):
            _emit(ref, key, _PREFIX_BASE + _PREFIX_SPAN * (len(ctx.query) / len(key)), "en", ctx)


def _tier_substring(ctx: _Context, lang_bit: int) -> None:
    if lang_bit == _LANG_NONE:
        return
    keys, refs, _, overrides = _build_index()
    candidates = (
        _positions_by_wilaya().get(ctx.wilaya, []) if ctx.wilaya is not None else range(len(keys))
    )
    # This is the only tier that can touch all 4402 keys, so it is the one place
    # where Python's per-call overhead actually shows up. Two consequences for
    # how the loop is written, neither of which changes the result set:
    #
    #   * the substring test comes FIRST. It is a C-level `in` that rejects the
    #     overwhelming majority of keys, whereas _admits_record is a Python
    #     function call. Both predicates are pure, so the order is free to
    #     choose - and choosing wrongly costs ~9x on a short query.
    #   * the locals below are hoisted out of the loop. Attribute lookups on
    #     ctx are not free at 4402 iterations.
    query = ctx.query
    out = ctx.out
    limit = ctx.limit
    seen = ctx.seen
    # The common case: no kind filter and no wilaya scope, so _admits_record
    # cannot reject anything and need not be called at all.
    filtered = ctx.kind_mask != _ALL_KINDS or ctx.wilaya is not None

    walk: Iterable[tuple[str, int]]
    if ctx.wilaya is None:
        pairs = _pairs_by_lang()
        # chain, not `+`: concatenating would allocate a fresh 4402-element list
        # on every query for a branch that only a script-less query can reach.
        walk = chain(pairs[_LANG_FR], pairs[_LANG_AR]) if lang_bit == _LANG_ANY else pairs[lang_bit]
    else:
        # The language filter MUST be applied here too. The unscoped branch gets
        # it for free by selecting one language's pair list, but
        # _positions_by_wilaya() holds both layers and _admits_record
        # deliberately does not test language (that lives in _admits, which this
        # tier never calls). Without this, `search("(", wilaya=27)` returns the
        # one Arabic key containing an ASCII paren while JavaScript returns
        # nothing — and any future Arabic name carrying a Latin character or a
        # digit would make lang= silently unenforced for every scoped query.
        walk = (
            (keys[position], refs[position])
            for position in candidates
            if lang_bit == _LANG_ANY or (refs[position] & 1) == lang_bit
        )

    for key, ref in walk:
        if len(out) >= limit:
            return
        if query not in key:
            continue
        if (ref >> 1) in seen:
            continue
        if filtered and not _admits_record(ref, ctx):
            continue
        score = _SUBSTRING_BASE + _SUBSTRING_SPAN * (len(query) / len(key))
        _emit(ref, key, score, "ar" if (ref & 1) == _LANG_AR else "fr", ctx)
    if not ctx.overrides:
        return
    for key, ref in overrides:
        if len(ctx.out) >= ctx.limit:
            return
        if not _admits_record(ref, ctx):
            continue
        if ctx.query in key and _unseen(ref, ctx):
            score = _SUBSTRING_BASE + _SUBSTRING_SPAN * (len(ctx.query) / len(key))
            _emit(ref, key, score, "en", ctx)


def _fuzzy_at(ctx: _Context, position: int, max_distance: int, head: str) -> None:
    keys, refs, _, _ = _build_index()
    key = keys[position]
    # Two prefilters, cheapest first. The first-character bucket cannot find a
    # typo in the first character - "blger" will not find Alger - which is an
    # accepted limitation: it is the cheapest possible prefilter and it cuts the
    # candidate set by roughly 20-30x.
    if not key or key[0] != head:
        return
    if abs(len(key) - len(ctx.query)) > max_distance:
        return
    ref = refs[position]
    if not _admits(ref, ctx) or not _unseen(ref, ctx):
        return
    distance = bounded_levenshtein(ctx.query, key, max_distance)
    if distance > max_distance:
        return
    score = _FUZZY_BASE - _FUZZY_STEP * (distance - 1)
    _emit(ref, key, score, "ar" if (ref & 1) == _LANG_AR else "fr", ctx)


def _tier_fuzzy(ctx: _Context) -> None:
    max_distance = _max_distance_for(len(ctx.query))
    if max_distance == 0:
        return
    head = ctx.query[0]
    _, _, _, overrides = _build_index()
    if ctx.wilaya is not None:
        candidates: Sequence[int] = _positions_by_wilaya().get(ctx.wilaya, [])
    else:
        bucket = _bucket_ranges().get(head)
        candidates = () if bucket is None else range(bucket[0], bucket[1])
    for position in candidates:
        if len(ctx.out) >= ctx.limit:
            return
        _fuzzy_at(ctx, position, max_distance, head)
    if not ctx.overrides:
        return
    for key, ref in overrides:
        if len(ctx.out) >= ctx.limit:
            return
        if not key or key[0] != head:
            continue
        if abs(len(key) - len(ctx.query)) > max_distance:
            continue
        if not _admits_record(ref, ctx) or not _unseen(ref, ctx):
            continue
        distance = bounded_levenshtein(ctx.query, key, max_distance)
        if distance > max_distance:
            continue
        _emit(ref, key, _FUZZY_BASE - _FUZZY_STEP * (distance - 1), "en", ctx)


def _resolve_limit(limit: int | None) -> int:
    """Normalize the ``limit`` option, falling back to the default.

    ``limit != limit`` is the NaN test, and it is the one that matters. NaN
    compares False against everything, so an unguarded NaN makes every
    ``len(out) >= limit`` gate False and every ``len(out) < limit`` gate False
    too: the tiers after `exact` never run and search returns an empty tuple
    with no error and no log. A caller doing
    ``limit = float(request.args.get("limit", 20))`` on ``?limit=nan`` gets
    exactly that. ``limit=0`` is honoured, not overridden - asking for nothing
    is a legitimate request.
    """
    if limit is None:
        return DEFAULT_LIMIT
    if limit != limit or limit < 0:
        return DEFAULT_LIMIT
    return limit


def _kind_mask(kinds: Sequence[str] | None) -> int:
    if kinds is None:
        return _ALL_KINDS
    mask = 0
    for kind in kinds:
        rank = _KIND_RANK.get(kind)
        if rank is None:
            continue  # an unknown kind is SKIPPED, not treated as wilaya
        mask |= 1 << rank
    return mask


def search(
    query: str,
    *,
    lang: str | None = None,
    limit: int = DEFAULT_LIMIT,
    wilaya: int | str | None = None,
    fuzzy: bool = False,
    kinds: Sequence[str] | None = None,
) -> tuple[SearchResult, ...]:
    """Ranked multilingual search across wilayas, daires and communes.

    Everything after ``query`` is keyword-only: a positional ``search("bej", 5)``
    reads as nothing and would break the moment an option is inserted.

    Never raises, and never returns ``None`` - an empty tuple is the miss.

    Args:
        query: Raw user input, in Arabic, French or English. Folded with the
            same rule as the corpus, so case, accents, apostrophes and Arabic
            spelling variants all work.
        lang: Restrict to ``"ar"``, ``"fr"`` or ``"en"``. ``None`` searches all
            layers. ``"en"`` searches the French keys plus the one-entry exonym
            table, so it is the only way to find ``Algiers``.
        limit: At most this many results, default 20. It **stops the scan**
            rather than slicing at the end.
        wilaya: Scope to one wilaya, ``19`` or ``"19"``. The single
            highest-leverage option here: it cuts the candidate set from 2201
            records to typically 10-60 before any key comparison runs.
        fuzzy: Enable the typo-tolerant tier. Off by default, and it only runs
            when the first three tiers came up short, so enabling it costs
            nothing on queries that already match.
        kinds: Restrict to some of ``"wilaya"``, ``"daira"``, ``"commune"``.

    Returns:
        Results ordered by score descending, ties broken deterministically by
        kind, then wilaya code, then key - so two identical calls always return
        an identical order.

    Example:
        >>> search("setif")[0].item.name.fr
        'Setif'
        >>> search("سطيف")[0].matched
        'ar'
        >>> [r.wilaya.code for r in search("sidi ameur", kinds=["commune"])]
        [32, 64]
        >>> search("ain lahdjar", wilaya=19)[0].item.id
        '19-ain-azel-ain-lahdjar'
        >>> search("algier", fuzzy=True)[0].item.name.fr
        'Alger'
        >>> search("")
        ()
    """
    normalized = normalize(query)
    # The cheapest possible answer to the most common accidental call - an empty
    # search box on mount. Returns before any index is built.
    if normalized == "":
        return _NO_RESULTS

    lang_bit = _LANG_ANY if lang is None else (_LANG_AR if lang == "ar" else _LANG_FR)
    scoped: int | None = None
    if wilaya is not None:
        scoped = _indexes.coerce_wilaya_code(wilaya)
        if scoped is None:
            # An unusable scope means an empty candidate set, not an ignored
            # option: silently searching everything would be a wrong answer
            # dressed as a broad one. JavaScript returns nothing here too.
            return _NO_RESULTS

    ctx = _Context(
        query=normalized,
        limit=_resolve_limit(limit),
        kind_mask=_kind_mask(kinds),
        lang_bit=lang_bit,
        overrides=lang == "en",
        wilaya=scoped,
    )

    # The tiers rank strictly: exact > prefix > substring > fuzzy. THAT is what
    # makes stopping early correct and not merely fast - a result dropped by the
    # limit can never have outranked one already collected.
    _tier_exact(ctx)
    if len(ctx.out) < ctx.limit:
        _tier_prefix(ctx)
    if len(ctx.out) < ctx.limit:
        _tier_substring(ctx, _substring_lang_bit(normalized, lang_bit))
    # `is True`, not truthiness: a handler passing
    # `fuzzy=request.args.get("fuzzy")` would otherwise turn fuzzy ON for the
    # string "false". JavaScript checks `opts?.fuzzy === true` for the same
    # reason, and shared/contract/search.md states it.
    if fuzzy is True and len(ctx.out) < ctx.limit:
        _tier_fuzzy(ctx)

    # An explicit total-order key. Python's sort is stable, but relying on
    # stability instead of stating the order is how a flaky ordering gets in.
    ctx.out.sort(
        key=lambda row: (-row[1].score, _KIND_RANK[row[1].kind], row[1].wilaya.code, row[0])
    )
    return tuple(result for _, result in ctx.out)


def __search_state__() -> dict[str, bool]:
    """Which search caches are populated. For tests only, not public API."""
    return {
        "keys": _keys is not None,
        "buckets": _buckets is not None,
        "wilaya_positions": _wilaya_positions is not None,
    }


def __reset_search__() -> None:
    """Drop the search caches. For tests only, not public API."""
    global _keys, _refs, _exact, _en_overrides, _buckets, _wilaya_positions
    global _lang_pairs
    _keys = _refs = _exact = _en_overrides = None
    _buckets = _wilaya_positions = _lang_pairs = None
