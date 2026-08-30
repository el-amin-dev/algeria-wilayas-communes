"""The ONE normalization function — a direct port of ``packages/js/src/normalize.ts``.

Used by both the index builder and the query path. If those two ever use
different rules, every lookup silently misses: no error, no failing type, no
crash. That is why there is exactly one implementation here, why this module and
:mod:`._slug` are the only places in the package allowed to call ``NFD``, and
why the result is pinned by ``shared/fixtures/normalize.json``.

The normative description is ``shared/contract/normalize.md``.

The output is an **internal index key**. It is never displayed — display always
comes from the original ``name.ar`` / ``name.fr``.

Unlike the JavaScript package, which normalizes the whole corpus at build time
into ``generated/search-keys.ts``, the Python package builds its keys lazily on
the first :func:`~._search.search` call and caches them for the process
lifetime. That is decision PY-D2: there are no generated ``.py`` data literals.
The cost is paid once and then never again; every subsequent query normalizes
exactly one string.
"""

from __future__ import annotations

import re
import unicodedata

__all__ = ["normalize"]

# See the note in _slug.py: JavaScript's `\s` and Python's differ at both ends,
# so the class is spelled out rather than left to `\s`.
_JS_WHITESPACE = "\t\n\u000b\f\r\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

# Combining marks removed after NFD, as one class.
#
#   U+0300..U+036F  Latin combining marks — turns é into e, ï into i.
#   U+064B..U+0652  Arabic tashkeel/harakat: fatha, damma, kasra, sukun, shadda
#                   and the tanween forms.
#   U+0653..U+0655  Maddah and the hamzas above/below. NOBODY TYPES THESE — they
#                   are what NFD *produces*. أ decomposes to ا + U+0654, آ to
#                   ا + U+0653, إ to ا + U+0655, ؤ to و + U+0654 and ئ to
#                   ي + U+0654.
#
#                   So NFD plus this range already performs the alef unification
#                   AND the hamza-carrier folding, on decomposed input too. A
#                   rule list that ran an explicit أ -> ا replacement *after* NFD
#                   would be a silent no-op — the precomposed characters it looks
#                   for no longer exist by then — and would leave a stray U+0654
#                   in the key that nothing displays and no type catches.
#   U+0670          Superscript (dagger) alef: a diacritic, not a letter.
_COMBINING_MARKS = re.compile("[\u0300-\u036f\u064b-\u0655\u0670]")

#: Tatweel / kashida — pure elongation, carries no meaning.
_TATWEEL = re.compile("\u0640")

# The three Arabic letters with no canonical decomposition, so NFD cannot fold
# them and they need an explicit map.
#
# The last two are LOSSY on purpose. بجاية normalizes to بجايه, which is not how
# the word is spelled — but users on phone keyboards routinely type ه where the
# orthography wants ة, and ي where it wants ى, and both must find the same
# record. Since the normalized form is only ever an index key, nothing incorrect
# is shown to anyone.
_ARABIC_LETTER_FOLDS = (
    ("\u0671", "\u0627"),  # alef wasla   -> bare alef
    ("\u0649", "\u064a"),  # alef maqsura -> ya
    ("\u0629", "\u0647"),  # ta marbuta   -> ha
)

#: Removed, never replaced with a space: M'Sila is one word, and `m sila` would
#: match nothing anyone types.
_APOSTROPHES = re.compile("['\u2019]")

#: Hyphens and underscores become a space, so `Abi-Youcef` matches `abi youcef`.
#: Note this is the opposite of _slug.py, where whitespace becomes a hyphen.
_WORD_SEPARATORS = re.compile("[-_]")

_WHITESPACE_RUNS = re.compile(f"[{_JS_WHITESPACE}]+")


def normalize(value: str) -> str:
    """Fold a name or a query to its search key.

    Both the Latin and the Arabic rule sets are applied unconditionally, with no
    script detection: a query can mix scripts, and branching on "is this Arabic?"
    would be one more thing for two implementations to disagree about.

    Args:
        value: A place name, or a raw user query. Unvalidated input is fine.

    Returns:
        The normalized key. Empty for input with no meaningful characters.

    Example:
        >>> normalize("Béjaïa")
        'bejaia'
        >>> normalize("M'Sila")
        'msila'
        >>> normalize("  Tizi-Ouzou  ")
        'tizi ouzou'
        >>> normalize("بجاية") == normalize("بجايه")
        True
        >>> normalize("أدرار") == normalize("ادرار")
        True
    """
    folded = unicodedata.normalize("NFD", value.lower())
    folded = _COMBINING_MARKS.sub("", folded)
    folded = _TATWEEL.sub("", folded)
    for source, replacement in _ARABIC_LETTER_FOLDS:
        folded = folded.replace(source, replacement)
    folded = _APOSTROPHES.sub("", folded)
    folded = _WORD_SEPARATORS.sub(" ", folded)
    folded = _WHITESPACE_RUNS.sub(" ", folded)
    # Equivalent to JS `.trim()`: the line above has already collapsed every run
    # of whitespace to a single ASCII space, so nothing else can lead or trail.
    return folded.strip(" ")
