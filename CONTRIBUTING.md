# Contributing

Thanks for helping keep this dataset accurate. Fixes to names, postal codes, and daïra mappings are all welcome — no contribution is too small.

## The one rule to remember

**Only edit `data/algeria.json`.** It's the single source of truth. Every other file (`wilayas.json`, `dairas.json`, `communes.json`, `by-wilaya/NN.json`) is *derived* from it. If you edit a derived file by hand, CI will fail because the counts won't line up.

## Two ways to contribute

Both paths share one requirement: **a data fix without a citable source is not merged.** Not because we doubt you — because at 2176 records nobody can re-derive from memory why a name or a postal code says what it says, and a dataset whose corrections are unsourced stops being worth trusting within a few dozen merges. A source also makes triage cheap: a reviewer confirms the citation instead of re-researching the fix. The issue template [`.github/ISSUE_TEMPLATE/data-fix.yml`](.github/ISSUE_TEMPLATE/data-fix.yml) has a required source field, so a data-fix issue arrives actionable.

A link to the Journal Officiel, an APC or wilaya site, Algérie Poste, or the ONS is ideal. A photograph of a signpost is a start. "I live there" is a reason to look for the document, not a substitute for it.

### 1. Open an issue (easiest)

If you're not comfortable editing JSON, just [open an issue](../../issues/new/choose) and tell us:

- The **wilaya** (number or name)
- The **commune** (and daïra, if relevant)
- What's **wrong** and what it **should be** — a source or link helps a lot

That's enough for someone else to make the fix.

### 2. Open a pull request

1. Fork the repo and create a branch.
2. Edit the relevant entry in **`data/algeria.json`**.
3. If your change adds or removes a commune/daïra, update the affected `nb_communes` / `nb_dairas` counts so they stay consistent.
4. Regenerate the derived files (see below).
5. Run the checks locally (optional but appreciated).
6. Commit and open the PR.

The whole checklist for a data-fix PR, and it is three lines:

- [ ] Source cited in the PR description
- [ ] `pnpm build:data` run (or say in the PR that you could not, and a maintainer will)
- [ ] Gates green

## Regenerating derived files

After editing `data/algeria.json`, regenerate everything downstream with:

```bash
pnpm build:data          # write
pnpm build:data --check  # verify the tree is current, write nothing
```

That is the gated path: it reproduces all 73 JSON files **byte-identically**, emits the generated TypeScript and the shared fixtures, and runs the integrity assertions. `--check` is what CI enforces, so a change that forgets to regenerate fails there.

No Node toolchain? Open the PR anyway, editing only `data/algeria.json` — a maintainer runs the build and pushes the regenerated files onto your branch.

## Running the checks locally

For a data-only change, the first two are enough:

```bash
# integrity (counts, codes, cross-checks) — no dependencies
python3 shared/validate.py

# schema validation (needs: pipx install check-jsonschema)
check-jsonschema --schemafile shared/schema/algeria.schema.json data/algeria.json
check-jsonschema --schemafile shared/schema/reform.schema.json data/raw/reform.json
```

The two schemas live at `shared/schema/algeria.schema.json` (the source dataset) and `shared/schema/reform.schema.json` (the Loi 26-06 stub in `data/raw/reform.json`).

If you touched either package, run its suite too:

```bash
pnpm test     # the JavaScript suite (it prints the count)
make check    # the Python gates: pytest + mypy --strict + ruff + ruff format --check
```

All of these run automatically in CI on every push and pull request.

## Working on the packages

Two packages ship from this repo — `packages/js` (npm) and `packages/python` (PyPI). They are **one product**: the same record ids, the same search scores, the same answers. What they must agree on is written down once in [`shared/contract/`](shared/contract/) and enforced by generated fixtures in `shared/fixtures/` that **both** test suites run against.

Never hand-edit `shared/fixtures/`. Change the implementation, run `pnpm build:data`, and review the fixture diff — that diff *is* the change to the cross-language contract, which is exactly what should be under review.

### The Python package

**Do this first, before anything else.** The dataset lives at the repo root and is gitignored *inside* the package — it is only vendored in at publish time — so a fresh clone imports fine and then fails on the first call:

```bash
make dev
# or, equivalently:
ln -sfn ../../../../data packages/python/src/algeria_wilayas_communes/data
```

A symlink rather than a copy, so edits to `data/*.json` are visible immediately and there is no second copy to drift out of sync.

Then set up an environment and install the package with its dev extra:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e "packages/python[dev]"
```

The four gates, all of which CI runs — `make check` runs them in the same order:

```bash
python -m pytest packages/python -q                       # tests + every docstring example
python -m mypy packages/python/src                         # strict
python -m ruff check packages/python
python -m ruff format --check packages/python
```

`pytest` runs with `--doctest-modules`, so **every `Example:` in every docstring is executed**. The docstrings are the package's real documentation — an IDE hover is where people actually read them — and an example whose output does not match the shipped data is worse than no example. If you add one, it has to be true.

CI runs the suite on Python **3.9 – 3.13**. 3.9 is the floor because `importlib.resources.files`, which the loader is built on, was added in 3.9. Do not use syntax newer than that; `ruff` is configured with `target-version = "py39"` and will tell you.

Two rules that are gated rather than merely encouraged:

- **Zero runtime dependencies, forever.** Dev extras only. In particular the fuzzy matcher is hand-rolled — no `rapidfuzz`, no `python-Levenshtein`.
- **Importing the package must read no data file**, and asking only for wilayas must not parse the 592 KB of commune data. Never write `X = build_something()` at module scope.

If you change how names are folded or how ids are minted, you are changing the cross-language contract: update `shared/contract/`, regenerate the fixtures, and make sure the JavaScript side still passes.

## Data conventions

- Every commune, daïra, and wilaya has `nom_ar`, `nom_fr`, and `nom_en`.
- `nom_en` matches `nom_fr` unless there's a genuine English exonym (e.g. Algiers).
- `code_postal` is a 5-digit string, or `null` if unknown. Please don't guess — a `null` is better than a wrong code.
- Wilaya `code` is the 2-digit zero-padded form of `wilaya_num` (e.g. `1` → `"01"`).

## Reporting mapping issues from the reform

Because the 2025/2026 reform split some daïras across new wilayas, a daïra name can legitimately appear under more than one wilaya. If you believe a commune is under the wrong **wilaya** or **daïra** after the reform, please cite the official text (Loi 26-06 / Journal Officiel) in your issue or PR so it can be verified.

---

By contributing, you agree that your contributions are released under the same **CC0 1.0** dedication as the rest of the project.
