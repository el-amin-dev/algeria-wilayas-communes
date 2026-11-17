# Data provenance

Where the 69 wilayas, 591 daïras and 1541 communes came from, what has been verified and
when, and — stated openly rather than hidden — exactly what is missing.

Companion documents: [`DATA_POLICY.md`](DATA_POLICY.md) (versioning),
[`../SUPPORT.md`](../SUPPORT.md) (what is promised), [`DECISIONS.md`](DECISIONS.md) (the
ADRs), [`../CONTRIBUTING.md`](../CONTRIBUTING.md) (how to propose a correction),
[`../shared/contract/`](../shared/contract/) (the normative rules both packages implement).

---

## The rule this document exists to make checkable

> **Never invent, interpolate or guess a record. Missing data is marked `null` and
> documented.**

Every gap below is published as a gap. Nothing has been filled in from a neighbouring value,
an average, a heuristic, or a plausible inference. A `null` says *published as absent*; a
fabricated value says something false about a real place, and a dataset caught doing that
once is untrustworthy forever, because a reader has no way to tell which other records were
invented.

The same rule is restated in [`../SUPPORT.md`](../SUPPORT.md) and
[`DATA_POLICY.md`](DATA_POLICY.md#8-the-rule-underneath-all-of-it).

---

## 1. Sources

The dataset declares its own sources, in `data/algeria.json` under the `sources` key. Quoted
verbatim:

```json
"sources": [
  "ONS Code Geographique National / Loi 19-12 (2019) / Loi 26-06 (2026)",
  "othmanus/algeria-cities"
]
```

Read that as three legal and statistical layers plus one prior compilation:

| Source | What it contributes |
|---|---|
| **ONS — *Code Géographique National*** | The Office National des Statistiques' official geographic coding of Algeria's administrative divisions: the wilaya codes, and the hierarchy of daïras and communes. |
| **Loi 19-12 (2019)** | The law establishing the **58**-wilaya map (the ten new southern wilayas created from the previous 48). This is the map the package exposes as `asOf: "58"`. |
| **Loi 26-06 (2026)** | The 2026 reform raising Algeria to **69** wilayas. This is the current map, and the package default. Details in §4. |
| **`othmanus/algeria-cities`** | A prior open compilation of Algerian place names, used as the starting corpus for the trilingual names. |

The dataset is a **compilation**: names in Arabic, French and English attached to the official
hierarchy, with postal codes where a source has them. It is not a survey, a geocoding
product, or a boundary/geometry dataset — there are no coordinates, no polygons, no
populations and no areas. Requests for those are welcome
([`data-request.yml`](../.github/ISSUE_TEMPLATE/data-request.yml)) but nothing has been
synthesized to satisfy them.

### The single source of truth inside the repository

`data/algeria.json` is the only hand-edited data file. Everything else —
`data/wilayas.json`, `data/dairas.json`, `data/communes.json`, the 69
`data/by-wilaya/NN.json` files, the generated TypeScript constants, the Python constants and
the cross-language fixtures — is **derived** from it by `scripts/build-data.ts`, reproducibly
and byte-identically. `pnpm build:data --check` regenerates the whole tree and fails if a
single byte differs, and it is what CI enforces. A hand-edited derived file therefore cannot
survive a pull request.

Two independent checks run over the source file on every push:

- `python3 shared/validate.py` — counts, code shapes and cross-checks, written in a different
  language from the build on purpose, so it is a genuinely second opinion rather than the
  same logic twice.
- `check-jsonschema --schemafile shared/schema/algeria.schema.json data/algeria.json`.

---

## 2. What `LAST_VERIFIED` means, how it is set, and where it lives

```
LAST_VERIFIED = "2026-07-20"
```

**Meaning.** The date the dataset was last checked against its sources — not the date the
package was published, not the date a file was touched, and not the date of the law. It is
the answer to *"as of when do you claim this map is right?"*.

**Where it lives.** It is a **literal near the top of `scripts/build-data.ts`** (alongside
`DATA_VERSION` and `SOURCE_LAW`), and the build emits it into both packages:

| Artefact | Constant |
|---|---|
| `packages/js/src/generated/meta.ts` | `export const LAST_VERIFIED = "2026-07-20"` |
| `packages/python/src/algeria_wilayas_communes/_constants.py` | `LAST_VERIFIED = "2026-07-20"` |

Because both are emitted from the same literal, **the npm and PyPI packages cannot disagree
about it.** The same is true of `DATA_VERSION` (`"2.0.0"`) and `SOURCE_LAW`
(`"Loi 26-06 du 4 avril 2026, JO n°25"`).

**Note: `data/algeria.json` itself carries no `last_verified` key.** The raw JSON files are
the data; the verification date is a property of the build that publishes them. If you
consume the raw files directly — over jsDelivr, with `jq`, or from a vendored copy — take the
date from the `v*` git tag you pinned, or from this document. Do not infer it from a file
mtime.

**How it is set.** By hand, by a maintainer, as part of a verification pass: the counts and a
sample of records are re-checked against the ONS publication and the *Journal Officiel*, and
the literal is updated whether or not anything changed. A pass that finds no change still
moves the date — "checked, nothing moved" is information a consumer wants.

**How you know it has gone stale.** It is expected to be refreshed at least every **274 days
(9 months)**, and `.github/workflows/freshness.yml` opens an issue on this repository when it
is not. It is an exported ISO `YYYY-MM-DD` string precisely so you can assert on it in your
own CI. See [`DATA_POLICY.md` §6](DATA_POLICY.md#6-freshness-how-you-know-the-data-is-still-being-checked).

---

## 3. The postal-code space

Postal codes come from the compiled sources; none has been derived from a neighbouring
commune, a wilaya prefix, or any other inference.

| Quantity | Value |
|---|---|
| Communes | **1541** |
| Communes with a postal code | **1514** |
| Communes with `code_postal: null` | **27** |
| Distinct non-null postal codes | **1471** |
| Codes shared by more than one commune | **38** |
| Malformed codes | **0** |

Two consequences that are structural, not incidental:

- **A postal-code lookup returns a list, never a single record.** 1514 communes carry only
  1471 distinct codes, so 38 codes are shared. A `Map<string, Commune>` or a
  `dict[str, Commune]` would silently drop records depending on insertion order. Both
  packages return a collection. See [`../shared/contract/ids.md`](../shared/contract/ids.md).
- **A postal code is not an identifier.** It does not identify a commune, it is not unique,
  and 27 communes do not have one at all. Use the wilaya code plus the record id.

Every code is validated as exactly five ASCII digits at build time. (This is stricter than it
looks: Python's `\d` and `str.isdigit()` accept Arabic-Indic digits, so `"١٦٠٠٠"` would pass
a naive check in one language and fail in the other — the validation uses an explicit
`[0-9]` class in both. See the language notes in
[`../shared/contract/README.md`](../shared/contract/README.md).)

### The 27 communes with no postal code

These are published as `null`. **No source available to this project has them**, and none has
been guessed. They are exported as a list — `COMMUNES_MISSING_POSTAL_CODE` in both packages —
and pinned in `shared/fixtures/ground-truth.json`, so the count cannot silently drift.

If you have an official source for any row below, please open a
[data fix](../.github/ISSUE_TEMPLATE/data-fix.yml) with the citation. Filling one is a
**minor** release ([`DATA_POLICY.md` §2](DATA_POLICY.md#2-semver-rules-for-a-data-package)).

| Wilaya | Wilaya name | Daïra | Commune | Record id |
|---|---|---|---|---|
| `04` | Oum El Bouaghi | Souk Naamane | Ouled Zouai | `04-souk-naamane-ouled-zouai` |
| `05` | Batna | Ras El Aioun | Talkhamt | `05-ras-el-aioun-talkhamt` |
| `05` | Batna | Ouled Si Slimane | Lemcene | `05-ouled-si-slimane-lemcene` |
| `10` | Bouira | Bechloul | Ouled Rached | `10-bechloul-ouled-rached` |
| `13` | Tlemcen | Beni Boussaid | Beni Boussaid | `13-beni-boussaid-beni-boussaid` |
| `15` | Tizi Ouzou | Ain El Hammam | Abi-Youcef | `15-ain-el-hammam-abi-youcef` |
| `15` | Tizi Ouzou | Tizi Rached | Ait-Oumalou | `15-tizi-rached-ait-oumalou` |
| `19` | Setif | El Eulma | Guelta Zerka | `19-el-eulma-guelta-zerka` |
| `21` | Skikda | Ain Kechra | Ouldja Boulbalout | `21-ain-kechra-ouldja-boulbalout` |
| `23` | Annaba | Berrahal | Treat | `23-berrahal-treat` |
| `24` | Guelma | Guelaat Bousbaa | Beni Mezline | `24-guelaat-bousbaa-beni-mezline` |
| `24` | Guelma | Hammam Debagh | Bou Hamdane | `24-hammam-debagh-bou-hamdane` |
| `24` | Guelma | Khezaras | Khezaras | `24-khezaras-khezaras` |
| `26` | Medea | Souaghi | Sidi Ziane | `26-souaghi-sidi-ziane` |
| `26` | Medea | Tablat | Mezerana | `26-tablat-mezerana` |
| `27` | Mostaganem | Bouguirat | Safsaf | `27-bouguirat-safsaf` |
| `28` | M'Sila | Khoubana | El Houamed | `28-khoubana-el-houamed` |
| `29` | Mascara | Tizi | Tizi | `29-tizi-tizi` |
| `32` | El Bayadh | Sidi Ameur | Sidi Ameur | `32-sidi-ameur-sidi-ameur` |
| `34` | Bordj Bou Arreridj | El Hamadia | Elhammadia | `34-el-hamadia-elhammadia` |
| `35` | Boumerdes | Boudouaou | El Kharrouba | `35-boudouaou-el-kharrouba` |
| `35` | Boumerdes | Thenia | Souk El Had | `35-thenia-souk-el-had` |
| `41` | Souk Ahras | Merahna | Sidi Fredj | `41-merahna-sidi-fredj` |
| `46` | Ain Temouchent | Hammam Bou Hadjar | Chentouf | `46-hammam-bou-hadjar-chentouf` |
| `48` | Relizane | Thenia | Souk El Had | `48-thenia-souk-el-had` |
| `64` | Bou Saada | Sidi Ameur | Sidi Ameur | `64-sidi-ameur-sidi-ameur` |
| `66` | Ksar El Boukhari | Chahbounia | Bouaiche | `66-chahbounia-bouaiche` |

Twenty-seven rows, 1.75 % of the 1541 communes. Note that two of them
(`64-sidi-ameur-sidi-ameur`, `66-chahbounia-bouaiche`) sit in wilayas created by the 2026
reform, and that `Sidi Ameur` and `Souk El Had` each appear twice under different wilayas —
those are genuinely different communes sharing a name, which is why the wilaya prefix is part
of the record id and not decoration.

---

## 4. The 2026 reform

### The legal facts, stated precisely

- **Loi 26-06** is **signed / dated 4 April 2026**.
- It was **published in the *Journal Officiel* n°25 on 5 April 2026**.

The law's date and its publication date are one day apart. They are not interchangeable, and
this document states both rather than collapsing them: the exported `SOURCE_LAW` constant
gives the law and its date (`"Loi 26-06 du 4 avril 2026, JO n°25"`), while
`data/raw/reform.json` records the publication date (`"publishedOn": "2026-04-05"`), because
that is what a citation to the *JO* needs.

- Powers transfer to the new wilayas **progressively, until 31 December 2026**.
- The 11 new wilayas are **fully operational from 1 January 2027**.
- **Through 2026, both maps are legally real.** The 58-wilaya map (Loi 19-12) and the
  69-wilaya map (Loi 26-06) are in simultaneous administrative use. That is the entire reason
  an `asOf` view exists in the API.

### The 11 new wilayas

Codes **59**–**69**, created by Loi 26-06:

| Code | Name |
|---|---|
| 59 | Aflou |
| 60 | El Abiodh Sidi Cheikh |
| 61 | El Aricha |
| 62 | El Kantara |
| 63 | Barika |
| 64 | Bou Saada |
| 65 | Bir El Ater |
| 66 | Ksar El Boukhari |
| 67 | Ksar Chellala |
| 68 | Ain Oussara |
| 69 | Messaad |

The dataset's own note on how the hierarchy was reassembled around them, quoted from
`data/algeria.json`:

> *"Appartenance daira->commune issue de la structure officielle pre-2025, regroupee sous les
> 69 nouvelles wilayas. Une daira scindee par la reforme apparait sous chaque wilaya
> concernee."*

That is why a daïra name can legitimately appear under more than one wilaya: 591
(wilaya, daïra) pairs carry only 545 distinct names, because the reform split some daïras
across new wilaya boundaries. `El Marsa` appears under 2, 16 and 21; `Ain Bessem` under 10 and
20.

### The parent-wilaya mapping is not sourced

**Which of the 58 wilayas *mères* each of the 11 new wilayas was carved out of is not in this
dataset, and this project publishes no value for it.**

It was verified absent by exhaustive key search: there is no `mere`, `parent`, `legacy`,
`ancien`, `rattach` or `delegue` key at any nesting level of `data/algeria.json` or of any
generated file. The information is knowable only from the text of JO n°25, which nobody has
transcribed for this project.

**Two derived signals exist, and they contradict each other.** Postal-code prefixes (communes
of the new wilayas still carry their old prefixes) and shared daïra names **corroborate on 3
of the 11 rows, disagree on 2, and say nothing at all about the remaining 6**. Two
independent heuristics agreeing a quarter of the time is the strongest possible argument for
publishing neither. Neither is a source.

> **Research note, 2026-11-18 — candidates checked, deliberately still not written down.**
>
> Two secondary web sources were examined. They agree with each other on which wilaya *mère* each
> of the 11 came from, and that agrees with the postal-prefix candidate already recorded in every
> row's `todo` string in `data/raw/reform.json` — 11 times out of 11. The pairs are not reproduced
> here; they live in that file, which is the one place allowed to hold a candidate, and
> `tests/docs.test.ts` fails this document if a pair appears in it.
>
> **The 11/11 is the reason it was not written down, not a reason to write it.**
> `scripts/build-data.ts` says in its own comment that "a postal-prefix guess agrees with the
> postal-prefix cross-check by construction", and warning W1 stays silent on precisely this case.
> The postal-prefix candidate is derived from the same commune records, so it is not a second
> opinion — it is the same opinion restated. Strip it out and the evidence is two web pages, one of
> them demonstrably unreliable (below), weighed against a field that `parentWilaya` serves to every
> consumer without consulting `confidence`, and that misroutes real post when wrong. The bar stays
> where ADR-005 put it: the text of JO n°25.
>
> **A conflict that should make anyone distrust web sources on this reform.** The same two sources
> disagree with this dataset about **which number each new wilaya carries** — not about parentage.
> One ordering matches ours, and the news outlet *Algérie Éco* independently publishes ours. The
> other, from `dzbuild.com` and `ouikayen.com` (both citing décret 26-206), permutes codes 60–69.
> That permuted ordering is exactly the list of wilayas *mères* sorted by code ascending, which is
> what one would expect a content farm to generate from a parent table.
>
> Our codes are corroborated from inside the dataset and theirs are not. For each new wilaya, the
> postal codes actually carried by the communes we assign to it match the prefix of the parent in
> its own `todo` string — so the code, the commune set and the prefix all agree. Under the permuted
> ordering they would not. That is evidence for the codes we ship, not proof.
>
> Both sources also attribute the *numbering* to **décret présidentiel 26-206 (JO n°40, 25 May
> 2026)** rather than to Loi 26-06 (JO n°25), which is what `SOURCE_LAW` cites. If so, the law
> created the wilayas and a later decree numbered them, and our provenance string names only the
> first. Unverified — do not change `SOURCE_LAW` on the strength of two web pages.

So the mapping **ships unfilled**:

- `data/raw/reform.json` carries all 11 rows with `parentCode: null`, `source: null`,
  `confidence: "unverified"`.
- `REFORM.mappingComplete` is **computed at build time, never read from the file**, so a
  maintainer cannot flip the gate by editing one boolean over an empty table. It is `false`
  today.
- `parentWilaya` is `null` (TypeScript: present-and-`null` on 59–69, absent on 1–58 —
  ADR-012 explains why Python collapses that to two states).
- `resolveLegacyWilaya`, `resolveCurrentWilaya` and any `asOf: "58"` call **throw**
  `ReformMappingUnavailableError`. They are exported unconditionally and refuse to answer,
  rather than returning `undefined` — which would be indistinguishable from "this wilaya has
  no parent", the precise wrong answer being guarded against.
- Reading `REFORM` never throws. The law, the *JO* number, the dates and `mappingComplete`
  are facts that **are** known.

Getting this wrong would be worse than shipping nothing. A wrong `parentWilaya` silently
misroutes real postal mail and real government paperwork, carrying the authority of a package
that advertises itself as handling the transition correctly. See **ADR-005** and **ADR-007**
in [`DECISIONS.md`](DECISIONS.md).

### Where a maintainer fills it in

| Step | File |
|---|---|
| 1. Transcribe from JO n°25, one row at a time, each with a real citation | **`data/raw/reform.json`** |
| 2. Shape gate | **`shared/schema/reform.schema.json`**, run by `check-jsonschema` in CI |
| 3. Provenance gate | build assertions in `scripts/build-data.ts` |
| 4. Behaviour contract | [`../shared/contract/reform.md`](../shared/contract/reform.md) |

The provenance gate is symmetric and deliberately so (**ADR-007**): **supplying a
`parentCode` is the act that requires the citation**, not labelling it `"confirmed"`. A
non-null `parentCode` must carry a non-empty `source` and a `confidence` other than
`"unverified"`, or the build fails. Without that symmetry, a row left mid-transcription as
`{ parentCode: <some code>, source: null, confidence: "unverified" }` would build clean and
ship a guess to every consumer — reproduced before it was fixed.

The postal-prefix cross-check is a **build warning that can never fail the build**. The prefix
disagrees with the commune's own wilaya code for **94 of the 1408** communes in wilayas 1–58 —
**6.7 %**. A rule that wrong cannot be an assertion: the first maintainer to enter a
correct-but-prefix-divergent value from the *JO* would otherwise be told by a red CI run that the
*Journal Officiel* is wrong. There is deliberately no flag that promotes it to a hard failure.

> **Correction (ADR-018).** An earlier version of this paragraph described all 94 of those rows
> as "data known to be correct". That is true of the 58 rows in wilayas 49–58, where a wilaya
> carved out of an older one inherits its parent's postal space and Algérie Poste has not
> renumbered. It is **not** true of the other 36, which sit in wilayas 01–48 where no reform
> explains them. All 36 carry a postal code that is also held by a same-named commune in another
> wilaya, and 26 of them additionally sit alone in a daïra that is really a daïra of that other
> wilaya. Four have been checked by hand against independent sources and all four were wrong —
> `Aïn El Turck` (Oran) ships Bouira's `10033` instead of `31300`, and its daïra is given as
> `Bouira`. That is a name-collision join artifact inherited from `othmanus/algeria-cities`, not
> a correct-but-divergent prefix.
>
> Run `node scripts/audit-postal-attribution.mjs` for the current list. The affected rows are
> **not** marked in the data yet and the correction has its own release; until then, treat the
> postal code and daïra of any row that audit reports as unverified. The remaining 32 are
> unsourced, which is why nothing has been changed rather than partially changed.

**The unverified postal-prefix candidates that live in the stub's per-row `todo` strings are
build input only, and are stripped from both published packages.** `publish-npm.yml` deletes
`data/raw/` before packing; `publish-pypi.yml` rewrites `reform.json` without its `todo` and
`$comment` keys (ADR-013 — Python reads the file at run time, so it cannot simply drop the
directory). A disclaimer attached to a guess is still a guess once it is inside a package.

---

## 5. Names, and what has *not* been normalized

- Every wilaya, daïra and commune carries `nom_ar`, `nom_fr` and `nom_en`.
- **`nom_en` equals `nom_fr` for all but one record in 2201.** Algerian place names are
  written in the Latin alphabet in French, and genuine English exonyms are almost
  non-existent. The one is **Algiers** (wilaya 16, `nom_fr` `Alger`). No other English name
  has been invented to make the field look useful.
- French spellings are reproduced from the sources, including their inconsistencies —
  `Elhammadia` as a daïra beside `El Hamadia` as a commune, hyphenated `Abi-Youcef`,
  apostrophes in `M'Sila` and `Z'barbar (El Isseri )`. They are **not** silently
  regularized, because a "tidied" name is an unsourced name. Search normalization handles the
  variation at query time instead ([`../shared/contract/normalize.md`](../shared/contract/normalize.md)).
- Arabic names are stored as-is, without transliteration round-trips.

### Identifiers

Only a **wilaya** has a government identifier: the code `01`–`69`. The dataset contains **no
official ONS or *Journal Officiel* code for a daïra or a commune** — only names. The ids you
see (`19-ain-azel`, `19-ain-azel-ain-lahdjar`) are **synthesized by this project** and are
library-assigned, not official. What that does and does not promise is set out in
[`../SUPPORT.md`](../SUPPORT.md#the-ids-are-ours-not-the-governments) and
[`../shared/contract/ids.md`](../shared/contract/ids.md).

---

## 6. Verification summary

| Claim | Value | Pinned by |
|---|---|---|
| Wilayas | 69 | build assertion; `WILAYA_COUNT`; `shared/validate.py` |
| Daïras | 591 | build assertion; `DAIRA_COUNT` |
| Communes | 1541 | build assertion; `COMMUNE_COUNT` |
| Communes with a postal code | 1514 | `POSTAL_CODE_COUNT`; `ground-truth.json` |
| Communes without one | 27 | `MISSING_POSTAL_CODE_COUNT`; `COMMUNES_MISSING_POSTAL_CODE` |
| Distinct postal codes | 1471 | `ground-truth.json` |
| Codes shared by >1 commune | 38 | `ground-truth.json` |
| Malformed postal codes | 0 | build assertion |
| Synthesized ids | 2132, all unique, none malformed | build assertions; `shared/fixtures/ids.json` |
| Reform `parentCode` values supplied | **0 of 11** | `REFORM.mappingComplete === false` |
| Data edition | `DATA_VERSION` `"2.0.0"` | `meta.ts`, `_constants.py` |
| Source law | `"Loi 26-06 du 4 avril 2026, JO n°25"` | `SOURCE_LAW` |
| Last verified | `"2026-07-20"` | `LAST_VERIFIED` |
| Licence | CC0 1.0 Universal (public-domain dedication) | [`../LICENSE`](../LICENSE) |

To cite this dataset, see [`../CITATION.cff`](../CITATION.cff).
