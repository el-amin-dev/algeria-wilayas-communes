# Runbook

Common commands for maintaining this dataset. The build and release steps need
`pnpm` and `node`; everything else — validation, counts, lookups — uses `git`,
`gh`, `jq` and `python3` only.

## Regenerate derived files

After any edit to `data/algeria.json`, rebuild everything derived from it. There
is exactly one way to do that:

```bash
pnpm build:data
```

It regenerates the four flat files (`algeria.json`, `wilayas.json`,
`dairas.json`, `communes.json`) and the 69 per-wilaya files under
`data/by-wilaya/`, byte-identically to what is committed today, and it
additionally emits the generated TypeScript under `packages/js/src/generated/`
and the shared fixtures under `shared/fixtures/` — none of which any hand-run
filter updates. It also runs 20 integrity assertions on the way through.

**A rebuild that produces a diff in `data/` is a bug, not an update.** The
generator reproduces the published bytes; if it stops doing that, the generator
changed, and that change is what needs reviewing.

## Validate

```bash
# Integrity: counts, codes, cross-checks (no dependencies)
python3 shared/validate.py

# Schema (needs: pipx install check-jsonschema)
check-jsonschema --schemafile shared/schema/algeria.schema.json data/algeria.json
check-jsonschema --schemafile shared/schema/reform.schema.json data/raw/reform.json

# Confirm every JSON file parses
find data shared/schema -name '*.json' -print0 | xargs -0 -I{} sh -c 'jq empty "{}" && echo "ok: {}"'
```

## Quick counts

```bash
jq '{wilayas: .nb_wilayas, dairas: .nb_dairas, communes: .nb_communes, pc_ok: .codes_postaux_renseignes, pc_missing: .codes_postaux_manquants}' data/algeria.json

# Communes across all per-wilaya files should sum to 1541
jq -s '[.[].nb_communes] | add' data/by-wilaya/*.json
```

## Useful lookups

```bash
# All 69 wilaya names
jq -r '.wilayas[].nom_fr' data/wilayas.json

# Communes of one wilaya (e.g. Alger = 16)
jq -r '.dairas[].communes[].nom_fr' data/by-wilaya/16.json

# Find a commune by name (case-insensitive contains)
jq '.communes[] | select(.nom_fr | ascii_downcase | contains("adrar"))' data/communes.json

# Find a commune by postal code
jq '.communes[] | select(.code_postal == "16000")' data/communes.json

# List the communes with a missing postal code (27 of them)
jq -r '.communes[] | select(.code_postal == null) | "\(.wilaya_num)\t\(.nom_fr)"' data/communes.json

# Count communes per wilaya
jq -r '.wilayas[] | "\(.wilaya_num)\t\(.nom_fr)\t\(.nb_communes)"' data/wilayas.json
```

## Full rebuild + check in one go

```bash
pnpm build:data && python3 shared/validate.py && git diff --exit-code data/
```

Regenerate, validate, then prove the regeneration changed nothing in `data/`.
The third command is the one that matters: it fails loudly if the build no
longer reproduces the published bytes.

## Work on the Python package

```bash
# REQUIRED FIRST. packages/python/src/algeria_wilayas_communes/data/ is
# gitignored and only vendored in at publish time, so a fresh checkout imports
# but cannot read a byte of data. This symlinks the real dataset into place.
make dev

python3 -m venv .venv && . .venv/bin/activate
pip install -e "packages/python[dev]"

make check          # pytest + mypy --strict + ruff + ruff format --check
```

The two packages are one product: same record ids, same search scores, same
answers. What holds them together is `shared/` — the rules in
`shared/contract/*.md` and the machine-readable fixtures in
`shared/fixtures/*.json`, which BOTH test suites read.

```bash
# Regenerate the fixtures (they are build output, like data/ and generated/)
pnpm build:data
pnpm build:data --check     # fails if anything is stale or orphaned
```

**Never hand-edit `shared/fixtures/`.** Change the implementation, run
`pnpm build:data`, and review the fixture diff — that diff *is* the change to
the cross-language contract, which is exactly what wants reviewing.

## Release a new version

Two packages, one version number, one tag. Follow the sequence below; nothing
else is supported.

### 0. One-time setup: the npm trusted publisher

**Do this once, before the first tag, or the npm half of every release fails.**

`publish-npm.yml` authenticates with npm **Trusted Publishing** (OIDC) and
carries no `NPM_TOKEN`. npm has to be told to trust this repository:

> npmjs.com → the `algeria-wilayas-communes` package → **Settings** →
> **Trusted Publisher** → **GitHub Actions** → owner `el-amin-dev`, repository
> `algeria-wilayas-communes`, workflow file `publish-npm.yml`.

Until that publisher exists the publish step fails with an auth error and
nothing is published — which is the intended behaviour, not a bug.

This replaced a token that never worked: both `v1.0.0` and `v1.1.0` failed with
`npm error code EOTP` ("requires a one-time password"), which is why npm sat at
1.0.0 while PyPI reached 1.1.0. Rotating the token does not fix EOTP — it is
about the token's type and the account's 2FA policy, not its age. The full
timeline is in `docs/DECISIONS.md` ADR-017.

To confirm it worked, see step 5: `dist.attestations` must be present.

### 1. Write a changeset

Changesets owns the version bump and the changelog — neither is edited by hand.

```bash
pnpm changeset       # pick the bump, write the note
```

Commit the generated file in `.changeset/` with the change it describes.

### 2. Let the release workflow open the version PR

On every push to `main`, `.github/workflows/release.yml` runs
`changeset version` and opens (or updates) a PR titled
**"chore: version packages"**, carrying the bumped `package.json` and the
regenerated `CHANGELOG.md`.

That workflow **never publishes and never tags.** There is deliberately no
`publish:` input on `changesets/action`: `packages/python` is not a pnpm
workspace member, so changesets cannot see it and could never publish it.
Letting changesets publish npm on its own would mean a second, divergent path
for PyPI and would destroy the guarantee that a version number means the same
1541 records on both registries. See `docs/DECISIONS.md` ADR-015.

### 3. Merge it, then push the tag by hand

Merging publishes nothing. A human pushes the tag:

```bash
git checkout main && git pull
git tag "v$(node -p "require('./packages/js/package.json').version")"
git push origin --tags
```

### 4. One tag, both registries

That single `v*` tag fans out to **both** publish workflows —
`.github/workflows/publish-npm.yml` and `.github/workflows/publish-pypi.yml`
both trigger on `push.tags: ["v*"]`. They run from the same commit, carrying the
same `data/`, so the npm and PyPI versions are locked in lockstep by
construction rather than by discipline.

npm publishes with `--provenance`, which ties the tarball to this commit and
this workflow run. A version containing a hyphen (`2.0.0-rc.1`) goes to the
`next` dist-tag; everything else goes to `latest`.

### 5. Verify the release actually landed

```bash
npm view algeria-wilayas-communes dist-tags
npm view algeria-wilayas-communes@<version> --json | jq '.dist.attestations'   # must be present
pip index versions algeria-wilayas-communes                                    # must match npm
gh release view v<version>
```

The attestation check and the npm/PyPI version match are what actually prove the
release worked. A green workflow run is not the same evidence.

### 6. Write the release body

Order matters:

1. **The licence, first.** The dataset is dedicated to the public domain under
   **CC0 1.0**: no attribution required, no copyleft, no commercial restriction.
   Vendor the JSON, embed it in a proprietary product, ship it inside a mobile
   app — nothing is owed to anyone. Say it plainly at the top; it is the reason
   most people can use this at all.
2. **The CHANGELOG section** for this version, verbatim.
3. For a major, an explicit **Breaking** block — a heading that says *Breaking*,
   never a footnote — linking to `docs/MIGRATION.md`.

After a tagged release, jsDelivr can pin it:
`https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@v<version>/data/wilayas.json`

## Repo metadata (discoverability)

```bash
# Update description
gh repo edit el-amin-dev/algeria-wilayas-communes \
  --description "🇩🇿 Algeria administrative divisions — 69 wilayas, daïras & 1541 communes (2025/2026 reform). JSON with Arabic/French/English names + postal codes."

# Add / remove topics
gh repo edit el-amin-dev/algeria-wilayas-communes --add-topic algeria,wilayas,communes,dairas,postal-code,json,dataset,open-data,dz
```

## CI

`.github/workflows/ci.yml` runs six jobs on every push and pull request:

| Job | What it proves |
|---|---|
| `validate` | Every JSON file parses (jq sweep), `data/algeria.json` and `data/raw/reform.json` match their JSON Schemas, and `shared/validate.py` passes. |
| `python` | The Python suite on the 3.9 – 3.13 matrix. 3.9 is the declared floor (ADR-014). |
| `cross-language` | Both packages answer identically on the `shared/fixtures/` conformance set. |
| `node` | Node 18 / 20 / 22 matrix: `typecheck`, `lint`, `format:check`, type tests, tests with coverage, `build`, `lint:publish`, `size`, `bench:import`, `treeshake:proof`. |
| `bun` | The built ESM **and** CJS entries import cleanly under Bun. |
| `data` | `data/` is byte-identical to what the generator produces, plus `pnpm build:data --check`. |

There is also a monthly `freshness` workflow. It **opens an issue** rather than
failing a pull request — a dataset going stale is a maintenance prompt, not a
reason to block someone's fix.

```bash
gh run list --limit 5          # recent CI runs
gh run watch                   # live-follow the latest run
gh run view --log-failed       # logs of the failing step
```
