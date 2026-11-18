"""Provenance and size constants.

Provenance is **exported, not merely documented**: users of an administrative
dataset get asked by compliance, legal and procurement teams to prove where the
boundaries came from and as of when. A constant they can log, print in a report
or assert on in a test answers that in one line.

These values mirror ``packages/js/src/generated/meta.ts`` exactly. Both are
produced from the same three constants at the top of ``scripts/build-data.ts``.
"""

from __future__ import annotations

__all__ = [
    "COMMUNE_COUNT",
    "DAIRA_COUNT",
    "DATA_VERSION",
    "LAST_VERIFIED",
    "MISSING_POSTAL_CODE_COUNT",
    "POSTAL_CODE_COUNT",
    "SOURCE_LAW",
    "WILAYA_COUNT",
]

#: Version of the *data*, bumped per data release - not the package version.
DATA_VERSION = "2.0.0"

#: The legal instrument these administrative boundaries come from.
SOURCE_LAW = "Loi 26-06 du 4 avril 2026, JO n°25"

#: The date the dataset was last checked against its sources.
#:
#: An ISO ``YYYY-MM-DD`` string, deliberately NOT a ``date``: dates are not
#: JSON-serializable in a config dump, and a ``date`` object buys nothing here.
LAST_VERIFIED = "2026-07-20"

WILAYA_COUNT = 69
DAIRA_COUNT = 566
COMMUNE_COUNT = 1541
POSTAL_CODE_COUNT = 1493

#: Communes published with no postal code. They are listed by id in
#: ``COMMUNES_MISSING_POSTAL_CODE`` and cannot be filled - no available source
#: has them.
MISSING_POSTAL_CODE_COUNT = 48
