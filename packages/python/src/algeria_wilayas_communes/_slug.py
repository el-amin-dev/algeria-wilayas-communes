"""The slug rule - a direct port of ``slug()`` in ``scripts/build-data.ts``.

Slugs mint record ids from ``nom_fr``. They are NOT the search normalizer, which
is a different rule with different answers (see :mod:`._normalize`). The two are
easy to conflate and must not be: an existing hyphen survives a slug and becomes
a space in a search key, and a slug drops every character outside ``[a-z0-9-]``
while a key keeps Arabic.

The normative description is ``shared/contract/slug.md``. The conformance
fixtures are ``shared/fixtures/slug.json`` and ``shared/fixtures/ids.json``, the
latter being the exhaustive proof: all 2132 ids are produced through here, and
every one must be byte-identical to the JavaScript package's.

Every non-ASCII character in this module is written as a ``\\u`` escape, on
purpose. Arabic and combining marks reorder when rendered, so a literal range
like the tashkeel block is unreviewable in a diff -- and a range that silently
became ``\\u064b\\u0655-\\u065f`` instead of ``\\u064b-\\u0655\\u0670`` would
still compile, still pass most tests, and quietly stop folding hamza carriers.
"""

from __future__ import annotations

import re
import unicodedata

__all__ = ["slug"]

# JavaScript's `\s` is not Python's: JS includes U+FEFF and excludes
# U+001C-U+001F, Python's `re` does the reverse. Spelling the class out is the
# only way the two implementations can agree on what a space is.
_JS_WHITESPACE = "\t\n\u000b\f\r\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

#: Latin combining marks, removed after NFD. This is what turns e-acute into e.
_COMBINING_MARKS = re.compile("[\u0300-\u036f]")

#: ASCII and typographic apostrophes. Deleted, never turned into a separator.
_APOSTROPHES = re.compile("['\u2019]")

_WHITESPACE_RUNS = re.compile(f"[{_JS_WHITESPACE}]+")

#: Everything outside the slug alphabet. See the note in slug() - this is the
#: step a reimplementation loses.
_NON_SLUG_CHARS = re.compile("[^a-z0-9-]")

_HYPHEN_RUNS = re.compile("-+")


def slug(value: str) -> str:
    """Fold a French place name into the id fragment used to build record ids.

    The steps are ordered, and the order is load-bearing: lowercase, NFD and
    strip combining marks, delete apostrophes, whitespace runs become ``-``,
    delete everything outside ``[a-z0-9-]``, collapse ``-`` runs, trim ``-``.

    Two of those steps are the ones a reimplementation gets wrong.

    Apostrophes are **deleted rather than hyphenated**, because the apostrophe
    in these names is not a word boundary: ``M'Sila`` is one word and ``msila``
    is how people type it. ``m-sila`` would be an id nobody could guess.

    And the ``[a-z0-9-]`` filter runs **after** the whitespace pass, so a real
    separator survives while punctuation does not. Dropping that step gives
    ``b.-b.-arreridj`` and ``zbarbar-(el-isseri-)`` for two real records - two
    wrong ids out of 2132, with nothing crashing and no test failing, which is
    exactly the kind of divergence the shared fixtures exist to catch.

    Args:
        value: A place name as it appears in ``nom_fr``.

    Returns:
        The slug. Empty only if the input had no Latin alphanumerics at all,
        which the build treats as a hard failure rather than minting ``19-``.

    Example:
        >>> slug("Ain Azel")
        'ain-azel'
        >>> slug("Sidi M'hamed")
        'sidi-mhamed'
        >>> slug("M'Sila")
        'msila'
        >>> slug("Abi-Youcef")
        'abi-youcef'
        >>> slug("B. B. Arreridj")
        'b-b-arreridj'
    """
    folded = unicodedata.normalize("NFD", value.lower())
    folded = _COMBINING_MARKS.sub("", folded)
    folded = _APOSTROPHES.sub("", folded)
    folded = _WHITESPACE_RUNS.sub("-", folded)
    folded = _NON_SLUG_CHARS.sub("", folded)
    folded = _HYPHEN_RUNS.sub("-", folded)
    # Equivalent to JS `replace(/^-+|-+$/g, "")`: by this point the only
    # character that can lead or trail is "-".
    return folded.strip("-")
