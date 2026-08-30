"""The maintainer's hard rule, kept visible instead of buried.

The deliverable is two packages a developer picks between freely: whichever
language they are already in, they get the same capability and the same answers.
Nobody should have to choose Node *because* the Python package is worse.

That is a promise about lightness, speed, ergonomics and integration, and each
half of it is checkable. These are those checks, in one file so they are easy to
find and hard to delete quietly - a rule with no gate is a preference, and a
comment asserting that something is checked is not a check.

The two that actually regress in practice are import purity and
pay-for-what-you-use. Both are invisible from ordinary tests: a suite can be
entirely green while every consumer pays 150 ms and 592 KB on import.
"""

from __future__ import annotations

import io
import os
import re
import subprocess
import sys
import tokenize
from pathlib import Path

import pytest

import algeria_wilayas_communes as package
from algeria_wilayas_communes import _indexes

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SRC = PACKAGE_ROOT / "src" / "algeria_wilayas_communes"
PYPROJECT = PACKAGE_ROOT / "pyproject.toml"

#: Fuzzy-matching and transliteration libraries. The bounded Levenshtein in
#: _search.py is hand-rolled precisely so none of these is ever needed.
FORBIDDEN_DEPENDENCIES = ("rapidfuzz", "Levenshtein", "jellyfish", "unidecode")


def _source_files() -> list[Path]:
    return sorted(SRC.glob("*.py"))


def _code_lines(path: Path) -> list[tuple[int, str]]:
    """Executable lines only, with comments and string literals removed.

    A plain text grep cannot tell a rule from a sentence about a rule. This file
    is full of prose that quotes the very things it forbids - "the bounded
    Levenshtein is hand-rolled", or a docstring showing v1's `query.lower()` -
    and matching those would train the next person to weaken the check rather
    than fix the code.
    """
    source = path.read_text(encoding="utf-8")
    blanked: dict[int, list[str]] = {}
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type in (tokenize.COMMENT, tokenize.STRING, tokenize.NL, tokenize.NEWLINE):
            continue
        blanked.setdefault(token.start[0], []).append(token.string)
    return [(number, " ".join(parts)) for number, parts in sorted(blanked.items())]


class TestImportIsFree:
    """``import algeria_wilayas_communes`` must read zero data files."""

    def test_importing_reads_no_data(self) -> None:
        """Run in a subprocess so the check cannot be fooled by module caching.

        Reloading in-process leaves the submodules in ``sys.modules``, so their
        module bodies never re-execute and the patched ``json.load`` is never
        reached - the test would pass no matter what the package did.
        """
        script = (
            "import json\n"
            "json.load = lambda *a, **k: (_ for _ in ()).throw("
            "AssertionError('data file read at import time'))\n"
            "import algeria_wilayas_communes\n"
            "print('ok')\n"
        )
        # The subprocess gets a clean sys.path, so it can only import the
        # package if it is pip-installed. Hand it the parent's path instead:
        # what is under test is whether IMPORTING reads data, not how the
        # package happens to be reachable. Without this the test passes under
        # `pip install -e` and fails under a bare `python3 -m pytest`, which
        # looks like a purity regression and is not one.
        env = dict(os.environ, PYTHONPATH=os.pathsep.join(p for p in sys.path if p))
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            check=False,
            env=env,
        )
        assert result.returncode == 0, result.stderr
        assert "ok" in result.stdout

    def test_no_module_level_index_build(self) -> None:
        # A single `X = _build_x()` at module scope would undo all of it, and it
        # is a one-line change that no other test would notice.
        offenders = [
            f"{path.name}:{number}"
            for path in _source_files()
            for number, line in _code_lines(path)
            if re.match(r"^[A-Z_]+ = (_build|all_|load)", line)
        ]
        assert offenders == []


class TestPayForWhatYouUse:
    """Wanting one wilaya must not cost 1541 communes.

    This is the Python equivalent of the JavaScript package's tier subpaths.
    There, a bundler drops what you do not import; here, nothing is read until
    something needs it. Same promise, different mechanism.
    """

    def test_get_wilayas_does_not_touch_the_commune_data(self) -> None:
        _indexes.__reset_indexes__()
        package.get_wilayas()

        state = _indexes.__index_state__()
        assert state["wilayas"] is True
        # communes.json is 592 KB and projects 1541 dataclasses. A caller who
        # only wanted the 69 wilayas must not pay for any of it.
        assert state["communes"] is False
        assert state["postal_index"] is False
        assert state["daira_index"] is False
        assert state["commune_name_index"] is False

    def test_each_index_is_independent(self) -> None:
        # One `_init_all()` would re-couple them and defeat the point, so the
        # postal index must not drag in the name index or vice versa.
        _indexes.__reset_indexes__()
        package.find_by_postal_code("19018")

        state = _indexes.__index_state__()
        assert state["postal_index"] is True
        assert state["commune_name_index"] is False
        assert state["dairas_of_wilaya"] is False

    def test_the_empty_search_builds_nothing(self) -> None:
        # An empty search box on mount fires this on every page load.
        from algeria_wilayas_communes._search import __reset_search__, __search_state__

        __reset_search__()
        assert package.search("") == ()
        assert __search_state__()["keys"] is False

    @pytest.fixture(autouse=True)
    def _rebuild_after(self) -> object:
        # These tests deliberately clear global caches; leave the process in a
        # usable state for whatever runs next.
        yield
        _indexes.__reset_indexes__()


class TestZeroRuntimeDependencies:
    """No dependency, ever - not even for fuzzy matching."""

    def test_no_runtime_dependencies_are_declared(self) -> None:
        text = PYPROJECT.read_text(encoding="utf-8")
        # `dependencies` must be absent entirely, or present and empty. A
        # top-level `dependencies = [` with anything in it fails.
        match = re.search(r"^dependencies\s*=\s*\[(.*?)\]", text, re.MULTILINE | re.DOTALL)
        assert match is None or match.group(1).strip() == ""

    @pytest.mark.parametrize("library", FORBIDDEN_DEPENDENCIES)
    def test_no_fuzzy_library_is_declared(self, library: str) -> None:
        # Comments are stripped first: pyproject.toml explains *why* the
        # Levenshtein implementation is hand-rolled, and that sentence must not
        # read as a dependency on it.
        declarations = "\n".join(
            line.split("#", 1)[0] for line in PYPROJECT.read_text(encoding="utf-8").splitlines()
        )
        assert library.lower() not in declarations.lower()

    @pytest.mark.parametrize("library", FORBIDDEN_DEPENDENCIES)
    def test_no_fuzzy_library_is_imported(self, library: str) -> None:
        offenders = [
            f"{path.name}:{number}"
            for path in _source_files()
            for number, line in _code_lines(path)
            if re.match(rf"^(import|from) {library}\b", line)
        ]
        assert offenders == []

    def test_typing_extensions_never_runs(self) -> None:
        # It backfills TypeGuard on 3.9 and is dev-only. Importing it outside
        # `if TYPE_CHECKING:` would make it a runtime dependency by accident.
        for path in _source_files():
            lines = path.read_text(encoding="utf-8").splitlines()
            for number, line in enumerate(lines):
                if "typing_extensions" not in line or line.lstrip().startswith("#"):
                    continue
                preceding = "\n".join(lines[max(0, number - 5) : number])
                assert "TYPE_CHECKING" in preceding, f"{path.name}:{number + 1}"

    def test_only_the_standard_library_is_imported(self) -> None:
        # Catches a third-party import creeping in under any name, not just the
        # four known fuzzy libraries.
        allowed = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else set()
        if not allowed:  # pragma: no cover - 3.9 has no stdlib_module_names
            pytest.skip("sys.stdlib_module_names needs Python 3.10+")
        offenders = []
        for path in _source_files():
            for number, line in _code_lines(path):
                match = re.match(r"^(?:from|import) ([A-Za-z_][A-Za-z0-9_]*)", line)
                if match and match.group(1) not in allowed:
                    offenders.append(f"{path.name}:{number} {match.group(1)}")
        assert offenders == []


class TestOneNormalizer:
    """Two folding implementations that drift make every lookup miss silently."""

    def test_nfd_appears_in_exactly_two_modules(self) -> None:
        # _normalize.py owns the search-key rule and _slug.py owns the id rule.
        # They are deliberately different, and nowhere else may fold anything.
        users = {path.name for path in _source_files() if "NFD" in path.read_text(encoding="utf-8")}
        assert users == {"_normalize.py", "_slug.py"}

    def test_casefolding_is_not_reimplemented(self) -> None:
        offenders = [
            f"{path.name}:{number}"
            for path in _source_files()
            if path.name not in {"_normalize.py", "_slug.py"}
            for number, line in _code_lines(path)
            if ". casefold ( )" in line or ". lower ( )" in line
        ]
        # legacy.py is the one exception: it must reproduce v1's raw
        # `query.lower()` substring match exactly, which is not normalization.
        assert all(offender.startswith("legacy.py") for offender in offenders), offenders


class TestPublicSurface:
    """What is exported is a permanent liability, so it is stated explicitly."""

    def test_dir_matches_all(self) -> None:
        # The two lazy constants are served by module __getattr__, so without a
        # matching __dir__ they would be missing from IDE completion and look
        # like they do not exist.
        assert set(package.__all__) <= set(dir(package))

    def test_the_lazy_constants_behave_like_constants(self) -> None:
        assert package.REFORM.law == "Loi 26-06"
        assert len(package.COMMUNES_MISSING_POSTAL_CODE) == 27

    def test_no_debug_hook_leaks_to_the_top_level(self) -> None:
        # __index_state__, __reset_indexes__ and friends exist for these tests
        # only. Shipping them would make internal cache state public API.
        leaked = [
            name
            for name in dir(package)
            if name.startswith("__") and name.endswith("__") and "index" in name.lower()
        ]
        assert leaked == []
        assert "__reset_indexes__" not in dir(package)
        assert "__search_state__" not in dir(package)

    def test_an_unknown_attribute_still_raises_attribute_error(self) -> None:
        # A module __getattr__ that forgets to re-raise turns every typo into a
        # confusing None.
        with pytest.raises(AttributeError):
            package.does_not_exist  # noqa: B018

    def test_every_public_symbol_has_a_docstring(self) -> None:
        # The IDE hover is this package's documentation, so an undocumented
        # export is an undocumented feature.
        undocumented = [
            name
            for name in package.__all__
            if callable(getattr(package, name)) and not getattr(package, name).__doc__
        ]
        assert undocumented == []

    def test_no_private_module_is_re_exported(self) -> None:
        assert [name for name in package.__all__ if name.startswith("_")] == []


class TestPackagingIntegration:
    """`pip install` and it works - no build step, no extras required."""

    def test_py_typed_marker_ships(self) -> None:
        # PEP 561: without this file, mypy ignores the package's types entirely
        # and every consumer's strict run silently loses them.
        assert (SRC / "py.typed").is_file()

    def test_the_declared_floor_matches_the_loader(self) -> None:
        # importlib.resources.files() is 3.9+. Declaring 3.8 would let pip
        # install a package that cannot import.
        text = PYPROJECT.read_text(encoding="utf-8")
        assert 'requires-python = ">=3.9"' in text
        assert "importlib.resources" in (SRC / "_loader.py").read_text(encoding="utf-8")

    def test_the_licence_is_stated_where_procurement_looks(self) -> None:
        text = PYPROJECT.read_text(encoding="utf-8")
        assert 'license = "CC0-1.0"' in text
        assert "CC0 1.0 Universal" in text
