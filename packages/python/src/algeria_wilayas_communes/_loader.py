"""Reading the bundled dataset.

Decision **PY-D2**: the data stays as the same ``data/*.json`` files the jq and
CDN consumers read, loaded lazily. It is deliberately NOT inlined into generated
``.py`` literals the way the JavaScript package inlines its data as TypeScript
constants.

That inlining exists for one reason: ``node:fs`` breaks browsers, bundlers,
Cloudflare Workers, Deno and React Native, so a JS package that reads files
cannot run in any of them. **Python has no equivalent constraint** — no bundle
size, no browser target, no tree-shaking. A 1541-record ``.py`` literal would be
slow to byte-compile on first import and heavy in memory for zero benefit.

Nothing here runs at import time. The first call to a public accessor is what
reads a file, and only the file it needs: a caller who only wants
:func:`~._api.get_wilayas` never parses the 592 KB ``communes.json``.
"""

from __future__ import annotations

import json
from functools import cache
from importlib.resources import files
from typing import Any

__all__ = ["load"]

_PACKAGE = "algeria_wilayas_communes"

#: How to fix the one failure every contributor hits on a fresh checkout.
_MISSING_DATA_HINT = (
    "If you are running from a git checkout, the dataset is not vendored into "
    "the package tree - it is gitignored and only copied in at publish time. "
    "Run `make dev` from the repo root (or "
    "`ln -sfn ../../../../data packages/python/src/algeria_wilayas_communes/data`) "
    "and try again."
)


@cache
def load(filename: str) -> Any:
    """Parse one bundled JSON file, once per process.

    Args:
        filename: A path relative to the package's ``data`` directory, using
            ``/`` as the separator, e.g. ``"communes.json"`` or
            ``"by-wilaya/19.json"``.

    Returns:
        The parsed JSON. Typed ``Any`` on purpose: this is the boundary where
        untyped data enters the package, and it is the only place ``Any`` is
        allowed. Everything above this line is projected into frozen dataclasses
        and typed properly.

    Raises:
        FileNotFoundError: If the dataset is not present. The message explains
            how to fix it rather than leaving a bare stack trace - without this,
            a fresh checkout fails on the first call with no indication that a
            one-line symlink is all that is missing.
    """
    target = files(_PACKAGE) / "data"
    # Split rather than passing "by-wilaya/19.json" through as one segment:
    # Traversable joins one path component at a time, and a bare "/" inside a
    # name is not guaranteed to work outside a plain filesystem loader.
    for part in filename.split("/"):
        target = target / part
    try:
        with target.open("r", encoding="utf-8") as handle:
            parsed: Any = json.load(handle)
            return parsed
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            f"{filename} not found in the package data directory. {_MISSING_DATA_HINT}"
        ) from exc
