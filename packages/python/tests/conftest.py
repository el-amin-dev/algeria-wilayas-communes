"""Shared fixtures for the Python suite.

The expected values come from ``shared/fixtures/*.json`` wherever a fixture
exists, rather than from constants copied into this directory. That is the whole
point of the shared tier: a number hand-copied here would be a second source of
truth, free to drift away from the generator and from the JavaScript suite that
reads the same files. If a count changes, exactly one place should need editing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

#: conftest.py -> tests -> python -> packages -> repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "shared" / "fixtures"
DATA_DIR = REPO_ROOT / "data"


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_fixture(name: str) -> Any:
    """One ``shared/fixtures/<name>.json``, parsed."""
    return _read_json(FIXTURES_DIR / f"{name}.json")


@pytest.fixture(scope="session")
def ground_truth() -> dict[str, Any]:
    """The measured dataset facts both packages assert."""
    return load_fixture("ground-truth")


@pytest.fixture(scope="session")
def slug_fixture() -> dict[str, Any]:
    """Input/expected pairs pinning the slug rule's edges."""
    return load_fixture("slug")


@pytest.fixture(scope="session")
def raw_dairas() -> Any:
    """``data/dairas.json`` as it sits on disk.

    Read directly rather than through the package: these tests are about the
    published file's frozen shape, and going through the projection layer would
    assert what the loader chose to keep rather than what actually ships.
    """
    return _read_json(DATA_DIR / "dairas.json")


@pytest.fixture(scope="session")
def raw_communes() -> Any:
    """``data/communes.json`` as it sits on disk."""
    return _read_json(DATA_DIR / "communes.json")
