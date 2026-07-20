"""Algeria administrative divisions: 69 wilayas, 591 daïras, 1541 communes.

Names in Arabic/French/English with postal codes (2025/2026 reform, Loi 26-06).
"""
from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any, Optional

__version__ = "1.0.0"

__all__ = [
    "get_all",
    "get_wilayas",
    "get_dairas",
    "get_communes",
    "by_wilaya",
    "find_by_postal_code",
    "find_commune",
]

_DATA = files(__name__) / "data"


@lru_cache(maxsize=None)
def _load(filename: str) -> Any:
    with (_DATA / filename).open("r", encoding="utf-8") as f:
        return json.load(f)


def get_all() -> dict:
    """Full nested tree: wilaya > daira > commune."""
    return _load("algeria.json")


def get_wilayas() -> list[dict]:
    """Flat list of the 69 wilayas."""
    return _load("wilayas.json")["wilayas"]


def get_dairas() -> list[dict]:
    """Flat list of the 591 daïras (each with its wilaya)."""
    return _load("dairas.json")["dairas"]


def get_communes() -> list[dict]:
    """Flat list of the 1541 communes (with wilaya + daïra + postal code)."""
    return _load("communes.json")["communes"]


def by_wilaya(num: int) -> Optional[dict]:
    """One wilaya's full subtree by number (1..69), or None."""
    try:
        return _load(f"by-wilaya/{int(num):02d}.json")
    except (FileNotFoundError, ValueError):
        return None


def find_by_postal_code(code: str) -> list[dict]:
    """All communes matching a 5-digit postal code."""
    return [c for c in get_communes() if c["code_postal"] == code]


def find_commune(query: str) -> list[dict]:
    """Communes whose French name contains query (case-insensitive)."""
    q = query.lower()
    return [c for c in get_communes() if q in c["nom_fr"].lower()]
