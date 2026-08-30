"""Guards for the runtime boundary.

The most common real use of this package is validating a wilaya code out of a
form ``<select>``, or a postal code out of a JSON body, *before* touching the
data. None of these functions reads a file or builds an index.

Ported from ``packages/js/src/guards.ts``.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Dev-only, and never imported at run time: `typing.TypeGuard` is 3.10+ and
    # this package supports 3.9, but adding typing_extensions as a runtime
    # dependency would break the zero-dependency rule for a static-analysis
    # nicety. Under TYPE_CHECKING, type checkers see real narrowing and the
    # interpreter never executes the import.
    from typing_extensions import TypeGuard

__all__ = ["assert_wilaya_code", "is_postal_code", "is_wilaya_code"]

MIN_WILAYA_CODE = 1
MAX_WILAYA_CODE = 69

#: Explicitly ASCII. Python's `\d` is Unicode-aware, so `re.match(r"\d{5}",
#: "١٦٠٠٠")` succeeds - and `"١٦٠٠٠".isdigit()` is True as well, which is why
#: str.isdigit() is not a substitute either. Compiled once at module scope.
_POSTAL_CODE_PATTERN = re.compile(r"[0-9]{5}\Z")


def is_wilaya_code(value: object) -> TypeGuard[int]:
    """True if ``value`` is a valid wilaya code, 1..69.

    Takes ``object``, not ``int``, precisely because the value comes from
    ``json.loads`` or a form field and has not been validated yet.

    Note the ``bool`` exclusion. In Python ``bool`` is a subclass of ``int``, so
    ``isinstance(True, int)`` is True and ``1 <= True <= 69`` is also True -
    without the explicit check, ``is_wilaya_code(True)`` would wrongly pass.

    Membership is decided arithmetically and NOT by looking the code up in the
    wilaya index: building a 69-entry index and parsing ``wilayas.json`` just to
    validate a number would defeat the point of a boundary guard.

    Args:
        value: Anything at all.

    Returns:
        True only for a real ``int`` in 1..69.

    Example:
        >>> is_wilaya_code(19)
        True
        >>> is_wilaya_code("19")
        False
        >>> is_wilaya_code(70)
        False
        >>> is_wilaya_code(True)
        False
    """
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and MIN_WILAYA_CODE <= value <= MAX_WILAYA_CODE
    )


def assert_wilaya_code(value: object) -> None:
    """Raise ``TypeError`` unless ``value`` is a valid wilaya code.

    The throwing sibling of :func:`is_wilaya_code`, for the "validate at the
    edge, then trust it" style. Along with the reform helpers, this is the only
    part of the package that raises.

    Args:
        value: Anything at all.

    Raises:
        TypeError: With the offending value in the message, so a log line is
            enough to debug from.

    Example:
        >>> assert_wilaya_code(19)
        >>> assert_wilaya_code(70)
        Traceback (most recent call last):
            ...
        TypeError: Not a valid Algerian wilaya code (1..69): 70
    """
    if is_wilaya_code(value):
        return
    shown = repr(value) if isinstance(value, str) else str(value)
    raise TypeError(f"Not a valid Algerian wilaya code (1..69): {shown}")


def is_postal_code(value: object) -> TypeGuard[str]:
    """True if ``value`` is a well-formed 5-digit postal code.

    Well-formed, not *present in the dataset*: this is a shape check at the
    boundary. Every one of the 1514 non-null codes in the data matches, and
    there are zero malformed values.

    Never trims. A code with surrounding whitespace is not a code.

    Args:
        value: Anything at all.

    Returns:
        True only for a ``str`` of exactly five ASCII digits.

    Example:
        >>> is_postal_code("19018")
        True
        >>> is_postal_code("05000")
        True
        >>> is_postal_code("1901")
        False
        >>> is_postal_code("١٦٠٠٠")
        False
    """
    return isinstance(value, str) and bool(_POSTAL_CODE_PATTERN.match(value))
