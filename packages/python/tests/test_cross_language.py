"""The live diff against the built JavaScript package.

``test_shared_fixtures.py`` is the primary anti-drift gate: it needs no
toolchain and so runs everywhere. This file is the belt-and-braces. It executes
the *actual shipped* ``packages/js/dist/index.cjs`` and compares its answers to
Python's directly, which closes the one gap the fixtures cannot: a fixture is
only as good as the moment it was generated, and a build that regenerated it
from a changed implementation would keep both sides green while quietly moving
the contract.

Two packages describing one dataset that disagree on record identity are worse
than either package alone - a consumer who joins them on ``id`` gets silent
mismatches rather than an error.

Skipped when Node or the JS build is absent, and run unconditionally in the CI
job that has both toolchains.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any

import pytest
from conftest import REPO_ROOT, load_fixture

from algeria_wilayas_communes import get_communes, get_dairas, search

JS_BUNDLE = REPO_ROOT / "packages" / "js" / "dist" / "index.cjs"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None or not JS_BUNDLE.is_file(),
    reason="JS package not built - run `pnpm build` first",
)


def _run_node(script: str, payload: str = "") -> Any:
    """Evaluate a script against the built package and parse its JSON stdout."""
    result = subprocess.run(
        ["node", "-e", script],
        input=payload,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


@pytest.fixture(scope="module")
def js_ids() -> Any:
    return _run_node(
        'const m = require("./packages/js/dist/index.cjs");'
        "console.log(JSON.stringify({"
        "dairas: m.getDairas().map((d) => d.id),"
        "communes: m.getCommunes().map((c) => c.id)}));"
    )


@pytest.fixture(scope="module")
def js_search() -> Any:
    """Run the fixture's query list through the real JavaScript ``search()``."""
    cases = json.dumps(
        [
            {"query": case["query"], "options": case["options"]}
            for case in load_fixture("search")["cases"]
        ]
    )
    script = (
        'const m = require("./packages/js/dist/index.cjs");'
        "const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        "console.log(JSON.stringify(cases.map((c) => ("
        "m.search(c.query, c.options) || []).map((r) => ({"
        "kind: r.kind,"
        'id: r.kind === "wilaya" ? r.item.codeText : r.item.id,'
        "wilaya: r.wilaya.code,"
        "score: r.score,"
        "matched: r.matched})))));"
    )
    return _run_node(script, cases)


class TestRecordIdentity:
    """All 2126 synthesized ids, byte-identical and in the same order."""

    def test_daira_ids(self, js_ids: Any) -> None:
        python_ids = [daira.id for daira in get_dairas()]
        assert python_ids == js_ids["dairas"]

    def test_commune_ids(self, js_ids: Any) -> None:
        python_ids = [commune.id for commune in get_communes()]
        assert python_ids == js_ids["communes"]

    def test_the_expected_number_of_ids_was_compared(self, js_ids: Any) -> None:
        # Guards against a bundle that loaded but returned nothing: two empty
        # lists compare equal, and the test above would pass while proving
        # nothing at all.
        assert len(js_ids["dairas"]) == 585
        assert len(js_ids["communes"]) == 1541


class TestSearchAgreement:
    """Same queries, same records, same scores, same order."""

    def test_every_fixture_query_agrees(self, js_search: Any) -> None:
        cases = load_fixture("search")["cases"]
        assert len(js_search) == len(cases)

        divergences = []
        for case, js_results in zip(cases, js_search):
            python_results = [
                {
                    "kind": result.kind,
                    "id": result.item.code_text if result.kind == "wilaya" else result.item.id,
                    "wilaya": result.wilaya.code,
                    "score": result.score,
                    "matched": result.matched,
                }
                for result in search(case["query"], **case["options"])
            ]
            if python_results != js_results:
                divergences.append((case["query"], case["options"], python_results, js_results))

        # If these ever diverge, fail the build. The most likely cause is the two
        # normalizers drifting on an Arabic fold, which is exactly the bug this
        # exists to catch - do not paper over it with a tolerance.
        assert divergences == []

    def test_the_query_list_actually_returned_results(self, js_search: Any) -> None:
        # Two empty result sets also compare equal.
        assert sum(len(results) for results in js_search) > 50


class TestProvenanceAgreement:
    """Both packages must claim the same data version and source."""

    def test_constants_match(self) -> None:
        from algeria_wilayas_communes import DATA_VERSION, LAST_VERIFIED, SOURCE_LAW

        js = _run_node(
            'const m = require("./packages/js/dist/index.cjs");'
            "console.log(JSON.stringify({"
            "DATA_VERSION: m.DATA_VERSION,"
            "SOURCE_LAW: m.SOURCE_LAW,"
            "LAST_VERIFIED: m.LAST_VERIFIED}));"
        )
        assert js["DATA_VERSION"] == DATA_VERSION
        assert js["SOURCE_LAW"] == SOURCE_LAW
        assert js["LAST_VERIFIED"] == LAST_VERIFIED

    def test_the_reform_stub_is_unfilled_on_both_sides(self) -> None:
        from algeria_wilayas_communes import REFORM

        js = _run_node(
            'const m = require("./packages/js/dist/index.cjs");'
            "console.log(JSON.stringify({"
            "mappingComplete: m.REFORM.mappingComplete,"
            "law: m.REFORM.law,"
            "newWilayas: m.REFORM.newWilayas.map((w) => w.code)}));"
        )
        assert js["mappingComplete"] == REFORM.mapping_complete
        assert js["law"] == REFORM.law
        assert js["newWilayas"] == [row.code for row in REFORM.new_wilayas]


class TestMissingPostalCodes:
    """The same 27 records are published without a postal code in both."""

    def test_the_same_ids(self) -> None:
        from algeria_wilayas_communes import COMMUNES_MISSING_POSTAL_CODE

        js = _run_node(
            'const m = require("./packages/js/dist/index.cjs");'
            "console.log(JSON.stringify(m.COMMUNES_MISSING_POSTAL_CODE));"
        )
        assert list(COMMUNES_MISSING_POSTAL_CODE) == list(js)
