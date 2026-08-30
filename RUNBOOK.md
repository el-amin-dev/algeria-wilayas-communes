# Runbook

Common commands for maintaining this dataset. Everything here uses standard, cross-platform tools: `git`, `gh`, `jq`, and `python3`.

## Regenerate derived files

After any edit to `data/algeria.json`, rebuild everything derived from it.

```bash
# Flat wilayas (69)
jq '{langues, nb_wilayas, wilayas: [.wilayas[] | {wilaya_num, code, nom_ar, nom_fr, nom_en, nb_dairas, nb_communes}]}' \
  data/algeria.json > data/wilayas.json

# Flat daïras (591)
jq '{nb_dairas, dairas: [.wilayas[] as $w | $w.dairas[] | {wilaya_num: $w.wilaya_num, wilaya_code: $w.code, wilaya_fr: $w.nom_fr, wilaya_en: $w.nom_en, nom_ar, nom_fr, nom_en, nb_communes}]}' \
  data/algeria.json > data/dairas.json

# Flat communes (1541)
jq '{nb_communes, communes: [.wilayas[] as $w | $w.dairas[] as $d | $d.communes[] | {wilaya_num: $w.wilaya_num, wilaya_code: $w.code, wilaya_ar: $w.nom_ar, wilaya_fr: $w.nom_fr, wilaya_en: $w.nom_en, daira_ar: $d.nom_ar, daira_fr: $d.nom_fr, daira_en: $d.nom_en, nom_ar, nom_fr, nom_en, code_postal}]}' \
  data/algeria.json > data/communes.json

# Per-wilaya files (01..69)
for i in $(seq 1 69); do
  nn=$(printf "%02d" "$i")
  jq --argjson n "$i" '.wilayas[] | select(.wilaya_num == $n)' data/algeria.json > "data/by-wilaya/${nn}.json"
done
```

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
# Regenerate, then validate. Stop if anything fails.
set -e
bash -c '
  jq "{langues, nb_wilayas, wilayas: [.wilayas[] | {wilaya_num, code, nom_ar, nom_fr, nom_en, nb_dairas, nb_communes}]}" data/algeria.json > data/wilayas.json
  # ... (run the four regeneration blocks above) ...
'
python3 shared/validate.py
```

> Tip: once you add `scripts/build.sh` (optional), this becomes a single `bash scripts/build.sh`.

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

```bash
# 1. Make sure working tree is clean and CI is green on main
git status
gh run list --limit 1

# 2. Tag with semantic version (data-only change = minor/patch)
git tag -a v1.0.0 -m "First stable release: 69 wilayas, 1541 communes"
git push origin v1.0.0

# 3. Create the GitHub release (attach the main data file)
gh release create v1.0.0 \
  data/algeria.json \
  --title "v1.0.0" \
  --notes "Algeria administrative divisions — 69 wilayas, 591 daïras, 1541 communes (2025/2026 reform)."
```

After a tagged release, jsDelivr can pin it:
`https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@v1.0.0/data/wilayas.json`

## Repo metadata (discoverability)

```bash
# Update description
gh repo edit el-amin-dev/algeria-wilayas-communes \
  --description "🇩🇿 Algeria administrative divisions — 69 wilayas, daïras & 1541 communes (2025/2026 reform). JSON with Arabic/French/English names + postal codes."

# Add / remove topics
gh repo edit el-amin-dev/algeria-wilayas-communes --add-topic algeria,wilayas,communes,dairas,postal-code,json,dataset,open-data,dz
```

## CI

```bash
gh run list --limit 5          # recent CI runs
gh run watch                   # live-follow the latest run
gh run view --log-failed       # logs of the failing step
```
