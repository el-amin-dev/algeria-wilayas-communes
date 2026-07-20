# Contributing

Thanks for helping keep this dataset accurate. Fixes to names, postal codes, and daïra mappings are all welcome — no contribution is too small.

## The one rule to remember

**Only edit `data/algeria.json`.** It's the single source of truth. Every other file (`wilayas.json`, `dairas.json`, `communes.json`, `by-wilaya/NN.json`) is *derived* from it. If you edit a derived file by hand, CI will fail because the counts won't line up.

## Two ways to contribute

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

## Regenerating derived files

After editing `data/algeria.json`, rebuild the flat and per-wilaya files with `jq`:

```bash
# flat wilayas
jq '{langues, nb_wilayas, wilayas: [.wilayas[] | {wilaya_num, code, nom_ar, nom_fr, nom_en, nb_dairas, nb_communes}]}' \
  data/algeria.json > data/wilayas.json

# flat dairas
jq '{nb_dairas, dairas: [.wilayas[] as $w | $w.dairas[] | {wilaya_num: $w.wilaya_num, wilaya_code: $w.code, wilaya_fr: $w.nom_fr, wilaya_en: $w.nom_en, nom_ar, nom_fr, nom_en, nb_communes}]}' \
  data/algeria.json > data/dairas.json

# flat communes
jq '{nb_communes, communes: [.wilayas[] as $w | $w.dairas[] as $d | $d.communes[] | {wilaya_num: $w.wilaya_num, wilaya_code: $w.code, wilaya_ar: $w.nom_ar, wilaya_fr: $w.nom_fr, wilaya_en: $w.nom_en, daira_ar: $d.nom_ar, daira_fr: $d.nom_fr, daira_en: $d.nom_en, nom_ar, nom_fr, nom_en, code_postal}]}' \
  data/algeria.json > data/communes.json

# per-wilaya files
for i in $(seq 1 69); do
  nn=$(printf "%02d" "$i")
  jq --argjson n "$i" '.wilayas[] | select(.wilaya_num == $n)' data/algeria.json > "data/by-wilaya/${nn}.json"
done
```

## Running the checks locally

```bash
# integrity (counts, codes, cross-checks) — no dependencies
python3 scripts/validate.py

# schema validation (needs: pipx install check-jsonschema)
check-jsonschema --schemafile schema/algeria.schema.json data/algeria.json
```

Both must pass. The same checks run automatically in CI on every push and pull request.

## Data conventions

- Every commune, daïra, and wilaya has `nom_ar`, `nom_fr`, and `nom_en`.
- `nom_en` matches `nom_fr` unless there's a genuine English exonym (e.g. Algiers).
- `code_postal` is a 5-digit string, or `null` if unknown. Please don't guess — a `null` is better than a wrong code.
- Wilaya `code` is the 2-digit zero-padded form of `wilaya_num` (e.g. `1` → `"01"`).

## Reporting mapping issues from the reform

Because the 2025/2026 reform split some daïras across new wilayas, a daïra name can legitimately appear under more than one wilaya. If you believe a commune is under the wrong **wilaya** or **daïra** after the reform, please cite the official text (Loi 26-06 / Journal Officiel) in your issue or PR so it can be verified.

---

By contributing, you agree that your contributions are released under the same **CC0 1.0** dedication as the rest of the project.
