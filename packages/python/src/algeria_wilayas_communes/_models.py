"""The record model.

Mirrors the TypeScript interfaces in ``packages/js/src/generated/`` field for
field, so the two packages are one product: same ids, same shapes, same answers.
Only the naming convention changes, from ``camelCase`` to ``snake_case``.

Every record is a ``@dataclass(frozen=True)``. Immutability is the headline
reason, ahead of autocomplete and ahead of mypy: v1 handed out the live mutable
cached dicts, so any consumer could write ``get_communes()[0]["nom_fr"] = "oops"``
or ``get_communes().clear()`` and permanently corrupt the dataset for every other
consumer in the process. There was no copy, no freeze and no read-only type. A
tuple of frozen dataclasses closes that without a defensive copy per call.

``slots=True`` is deliberately NOT used: it requires Python 3.10 and the package
floor is 3.9. It is a pure optimization with no API effect, so it drops in
unchanged the moment the floor moves - see the note below.

The naming convention, held everywhere: **snake_case English attribute names,
and the language lives in the value, never in the attribute name.** v1's real
design flaw was English function names returning French keys - ``get_communes()``
handing back ``nom_fr`` and ``code_postal``. v2 says ``commune.name.fr`` and
``commune.postal_code``.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["Commune", "Daira", "Name", "Wilaya"]

# On slots=True, so nobody re-opens it:
#
#   frozen=True already gives immutability, hashability and __eq__ for free.
#   slots=True would also drop the per-instance __dict__, but it landed in
#   dataclasses in Python 3.10 and this package supports 3.9.
#
#   The memory it costs to go without is BOUNDED: the model projects
#   69 + 566 + 1541 = 2176 records, not millions, so a __dict__ per instance is
#   a few hundred KB - noise next to the parsed JSON already resident. The
#   install-base cost of dropping 3.9 is NOT bounded; it is every user on a
#   distro Python (Debian 11, RHEL 9, a long tail of Docker images).
#
#   Revisit when the floor moves to 3.10. It is a drop-in change with no API
#   impact and no source change for consumers.


@dataclass(frozen=True)
class Name:
    """A place name in the three languages the dataset carries.

    ``en`` equals ``fr`` for all but one record in 2176: wilaya 16, ``Alger`` /
    ``Algiers``. That is not an oversight - Algerian place names are generally
    not exonymized in English.

    Example:
        >>> from algeria_wilayas_communes import get_wilaya
        >>> get_wilaya(19).name.fr
        'Setif'
        >>> get_wilaya(19).name.ar
        'سطيف'
    """

    ar: str
    fr: str
    en: str


@dataclass(frozen=True)
class Wilaya:
    """A wilaya - the top level, and the only level with an official code.

    Example:
        >>> from algeria_wilayas_communes import get_wilaya
        >>> get_wilaya(19).code
        19
        >>> get_wilaya(19).code_text
        '19'
        >>> get_wilaya(19).daira_count
        20
    """

    #: The official government code as a NUMBER, 1..69. Not the padded string.
    code: int

    #: The zero-padded form, ``str(code).zfill(2)``. Kept as its own field
    #: rather than derived at each call site because it is what appears in
    #: record ids and in every JSON file, so it is needed constantly.
    code_text: str

    name: Name
    daira_count: int
    commune_count: int

    #: The pre-reform wilaya this one was carved out of, for codes 59..69.
    #:
    #: ``None`` for wilayas 1..58, which have no parent, AND for 59..69 while
    #: the Loi 26-06 mapping stub is unfilled. The JavaScript package
    #: distinguishes those two states (the field is absent for 1..58 and
    #: present-but-null for 59..69); a frozen dataclass cannot omit a field, so
    #: here the "absent" case is exactly ``code <= 58``. A test pins that
    #: equivalence. See ``shared/contract/reform.md``.
    parent_wilaya: int | None = None


@dataclass(frozen=True)
class Daira:
    """A daira - the level between a wilaya and its communes.

    A daira split by the 2026 reform appears under more than one wilaya, which
    is why there are 566 (wilaya, daira) pairs for only 545 distinct names.

    Example:
        >>> from algeria_wilayas_communes import get_daira
        >>> get_daira("19-ain-azel").name.fr
        'Ain Azel'
        >>> get_daira("19-ain-azel").wilaya
        19
    """

    #: Library-assigned, NOT official - this dataset has no ONS or Journal
    #: Officiel code for a daira. Stable by promise. See
    #: ``shared/contract/ids.md``.
    id: str

    #: Parent wilaya, by code. Join on it rather than denormalizing names.
    wilaya: int

    name: Name
    commune_count: int


@dataclass(frozen=True)
class Commune:
    """A commune - the smallest unit in the hierarchy.

    Example:
        >>> from algeria_wilayas_communes import get_commune
        >>> commune = get_commune("19-ain-azel-ain-lahdjar")
        >>> commune.name.fr
        'Ain Lahdjar'
        >>> commune.postal_code
        '19018'
        >>> commune.daira
        '19-ain-azel'
    """

    #: Library-assigned, NOT official. Stable by promise.
    id: str

    #: Parent wilaya, by code.
    wilaya: int

    #: Parent daira, by id.
    daira: str

    name: Name

    #: A 5-digit postal code, or ``None`` for the 48 communes published without
    #: one.
    #:
    #: ``None`` rather than an absent attribute, on purpose: ``None`` says
    #: *published as absent*, while a missing attribute would say *we did not
    #: look*. That distinction is worth carrying, and it is why
    #: ``COMMUNES_MISSING_POSTAL_CODE`` exists alongside it. The 27 cannot be
    #: filled - no available source has them - and inventing one would say
    #: something false about a real place.
    postal_code: str | None = None
