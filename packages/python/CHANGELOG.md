# algeria-wilayas-communes (Python)

The two packages are released from one `v*` tag, so a version number means the
same 1541 records on PyPI and on npm. Changes that affect only the JavaScript
surface are listed in `packages/js/CHANGELOG.md`; this file records the Python
package's own API and packaging changes.

## 2.0.0

### Major Changes

- **`requires-python` is now `>=3.9`, corrected from `>=3.8`.** The published
  1.0.0 and 1.1.0 wheels claimed 3.8 support they never had: the data loader
  uses `importlib.resources.files()`, which does not exist before 3.9, so an
  install on 3.8 succeeded and then failed at the first accessor call. See
  `docs/DECISIONS.md` ADR-014.
- **The v2 API replaces v1's dicts with frozen dataclasses.** `get_wilayas()`,
  `get_dairas()` and `get_communes()` return `tuple`s of `Wilaya` / `Daira` /
  `Commune`, with `name.ar` / `name.fr` / `name.en` and `postal_code` in place
  of `nom_ar` / `nom_fr` / `nom_en` / `code_postal`. The complete v1 surface
  remains, unchanged and warning-free, at `algeria_wilayas_communes.legacy`.
  Field-by-field mapping in `docs/MIGRATION.md`.
- **A commune's wilaya is now a number and its daïra an id.** v1 carried
  denormalized copies of the parent names on every commune; v2 carries
  `wilaya: int` and `daira: str`, and the parents are looked up. `code_text`
  holds the zero-padded `"01"` form that v1 called `wilaya_code`.

### Minor Changes

- Multilingual ranked `search()` over all three languages, with optional
  `fuzzy=True` backed by a hand-rolled bounded Levenshtein — so the package
  still has **no runtime dependencies**.
- `is_wilaya_code`, `assert_wilaya_code` and `is_postal_code` guards, none of
  which build an index or read a file.
- `REFORM` and `COMMUNES_MISSING_POSTAL_CODE` as lazy module attributes
  (PEP 562), so `import algeria_wilayas_communes` still touches no file.
- Provenance and size constants: `DATA_VERSION`, `SOURCE_LAW`, `LAST_VERIFIED`,
  `WILAYA_COUNT`, `DAIRA_COUNT`, `COMMUNE_COUNT`, `POSTAL_CODE_COUNT`,
  `MISSING_POSTAL_CODE_COUNT`.
- Python 3.14 is tested and declared.

### Notes

- `resolve_legacy_wilaya`, `resolve_current_wilaya` and any `as_of="58"` call
  raise `ReformMappingUnavailableError`. The 58 → 69 parent mapping is not
  published by any source this project has transcribed, and it is not guessed.
  Branch on `REFORM.mapping_complete` rather than catching the error.
- 27 of the 1541 communes have `postal_code = None`, meaning *published as
  absent*. They are listed in `COMMUNES_MISSING_POSTAL_CODE`.
- A known defect is documented rather than silently patched: 36 communes in
  wilayas 01–48 carry a postal code belonging to a same-named commune in
  another wilaya. See `docs/DECISIONS.md` ADR-018 and run
  `node scripts/audit-postal-attribution.mjs` for the current list.
