# Algeria Wilayas, Daïras & Communes 🇩🇿

Up-to-date administrative divisions of **Algeria** — **69 wilayas**, **591 daïras**, and **1541 communes** — reflecting the **2025/2026 reform (Loi 26-06)**. Every name in **Arabic, French, and English**, with **postal codes** where available.

> 🇫🇷 Découpage administratif de l'Algérie à jour : **69 wilayas**, **591 daïras**, **1541 communes** (réforme 2025/2026, Loi 26-06) — noms en arabe / français / anglais avec **codes postaux**, en JSON.
>
> 🇩🇿 التقسيم الإداري للجزائر محدّث: **69 ولاية**، **591 دائرة**، **1541 بلدية** (إصلاح 2025/2026) — الأسماء بالعربية والفرنسية والإنجليزية مع **الرموز البريدية**، بصيغة JSON.

Plain JSON. No framework, no runtime, no lock-in. Use it from **jq, JavaScript/TypeScript, Python, Java**, or anything that reads a file.

[![CI](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml/badge.svg)](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml)
![Wilayas](https://img.shields.io/badge/wilayas-69-brightgreen)
![Communes](https://img.shields.io/badge/communes-1541-brightgreen)
![License](https://img.shields.io/badge/license-CC0--1.0-blue)
![Last verified](https://img.shields.io/badge/verified-2026--07--20-blue)

---

## Why this repo

Most Algeria datasets are stuck on the old **48** or **58** wilayas. After the 2025/2026 reform brought the country to **69 wilayas**, I couldn't find a clean, ready-to-use source that reflected it — so I built one and made it easy to drop into any project.

The nested file `data/algeria.json` is the single source of truth. Everything else is derived from it and checked by CI on every change.

---

## What's inside

| File | What it is |
|------|-----------|
| `data/algeria.json` | Full nested tree: **wilaya → daïra → commune** (source of truth) |
| `data/wilayas.json` | Flat list of the **69 wilayas** |
| `data/dairas.json` | Flat list of the **591 daïras** |
| `data/communes.json` | Flat list of the **1541 communes** (with wilaya + daïra + postal code) |
| `data/by-wilaya/NN.json` | One file per wilaya (`01.json` … `69.json`) — grab just what you need |

Every record carries `nom_ar`, `nom_fr`, `nom_en`. Since Algerian place names use the Latin alphabet, `nom_en` matches `nom_fr` for almost every entry — the one real exonym is **Algiers** (Alger).

Machine-readable summary of the dataset, the API surface and the reform facts: **[llms.txt](llms.txt)**.

---

## Use it

**Packages** — both are named `algeria-wilayas-communes` and are published together from the same `v*` tag, so a version number means the same data on npm and on PyPI.

**JavaScript / TypeScript**

```bash
npm install algeria-wilayas-communes
pnpm add algeria-wilayas-communes
yarn add algeria-wilayas-communes
```

```js
import { getWilaya, getCommune, findByPostalCode } from "algeria-wilayas-communes";

getWilaya(19).name.en;                             // "Setif"
getCommune("19-ain-azel-ain-lahdjar").postalCode;  // "19018"
findByPostalCode("19018").length;                  // 1
```

**Python**

```bash
pip install algeria-wilayas-communes
uv add algeria-wilayas-communes
poetry add algeria-wilayas-communes
```

```python
from algeria_wilayas_communes import get_wilaya, get_commune, find_by_postal_code

get_wilaya(19).name.en                              # "Setif"
get_commune("19-ain-azel-ain-lahdjar").postal_code  # "19018"
len(find_by_postal_code("19018"))                   # 1
```

Full API reference: **[npm README](packages/js/README.md)** · **[PyPI README](packages/python/README.md)**.

**Straight from GitHub / CDN** (no install)

```bash
# CDN (jsDelivr)
curl -s https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@main/data/wilayas.json | jq '.wilayas | length'
```

**From the terminal** (no install, no project)

```bash
npx algeria-wilayas-communes search "سطيف"
npx algeria-wilayas-communes postal 19018          # → Ain Lahdjar
npx algeria-wilayas-communes wilaya 19             # → 20 daïras, 60 communes
npx algeria-wilayas-communes communes 19 --json | jq '.[].name.fr'
```

Every command takes `--json`, so it pipes into `jq` instead of being screen-scraped. Exit codes are meaningful: **0** found, **1** not found, **2** usage error. `--help` lists everything.

More ready-to-copy commands (lookups by postal code, per-wilaya queries, rebuild, release) live in **[RUNBOOK.md](RUNBOOK.md)**.

---

## Good to know

- **Daïra layer:** wilaya → commune reflects the current 69-wilaya structure; daïra → commune membership comes from the pre-2025 structure regrouped under the new wilayas. Where the reform split a daïra across two wilayas, it appears under each — so the daïra count is **591**, not ~548.
- **Postal codes:** 27 of 1541 communes have `code_postal: null` (small communes missing from the reference data). Corrections welcome.
- **Known defect, being fixed:** 36 communes in wilayas 01–48 carry a postal code that belongs to a same-named commune in another wilaya, and 26 of those also sit in a daïra imported along with it — a name-collision artifact from the upstream corpus. Run `node scripts/audit-postal-attribution.mjs` for the current list. Four have been verified wrong by hand; the rest await sourcing, which is why nothing has been changed rather than partially changed. Full reasoning in [docs/DECISIONS.md](docs/DECISIONS.md) ADR-018.

Spotted something wrong? Please **[open an issue or PR](../../issues/new/choose)** — see [CONTRIBUTING.md](CONTRIBUTING.md). Edit only `data/algeria.json`; CI validates the rest.

---

## Sources

The dataset states its own provenance. `data/algeria.json` carries a `sources` array, verbatim:

```json
["ONS Code Geographique National / Loi 19-12 (2019) / Loi 26-06 (2026)", "othmanus/algeria-cities"]
```

- **ONS *Code Géographique National*** — the official wilaya codes and the administrative hierarchy, under **Loi 19-12** (2019, 48→58) and **Loi 26-06** (58→69).
- **Loi 26-06** was **signed on 4 April 2026** and **published in the *Journal Officiel* n°25 on 5 April 2026**. The two dates are one day apart and are not interchangeable: the law is dated 4 April, the JO issue is dated 5 April.
- **[`othmanus/algeria-cities`](https://github.com/othmanus/algeria-cities)** — the community dataset the daïra→commune membership and the postal codes were cross-referenced against. Named outright rather than folded into "open community datasets", because a dataset that will not name its inputs cannot be audited.

Both packages **export** their provenance, so it can be logged or asserted on rather than looked up: `DATA_VERSION` (`"2.0.0"`), `SOURCE_LAW` (`"Loi 26-06 du 4 avril 2026, JO n°25"`) and `LAST_VERIFIED` (`"2026-07-20"`) — the date a maintainer last checked the data against the sources above.

Details: **[docs/DATA_PROVENANCE.md](docs/DATA_PROVENANCE.md)** (record-by-record origin) · **[docs/DATA_POLICY.md](docs/DATA_POLICY.md)** (what may and may not be inferred) · **[SUPPORT.md](SUPPORT.md)** (how to report a wrong record) · **[CITATION.cff](CITATION.cff)** (how to cite this dataset).

---

## Questions people actually ask

### How many wilayas does Algeria have?

**69**, since the 2026 reform (**Loi 26-06**). It was 48 until 2019, then 58 under Loi 19-12, and 69 from 2026.

Most of the web still says 58 — including Wikipedia mirrors, OpenStreetMap, and nearly every other Algeria dataset on npm and PyPI. If a source disagrees with 69, it predates April 2026. This dataset is on the current map, and the build fails if the count is ever anything but 69.

### What are the 11 new wilayas in the 2026 reform?

Codes **59–69**: Aflou, El Abiodh Sidi Cheikh, El Aricha, El Kantara, Barika, Bou Saada, Bir El Ater, Ksar El Boukhari, Ksar Chellala, Ain Oussara, Messaad. Between them they hold 108 communes.

The reform was signed **4 April 2026**, published in *Journal Officiel* **n°25** on **5 April 2026**, and is fully operational from **1 January 2027**.

Which of the old 58 wilayas each new one was carved out of is **not** in this dataset, and is not guessed — see [docs/DATA_PROVENANCE.md](docs/DATA_PROVENANCE.md).

### How do I look up an Algerian postal code?

```js
import { findByPostalCode } from "algeria-wilayas-communes";

findByPostalCode("19018").map((c) => c.name.fr); // → ["Ain Lahdjar"]
```

A postal code can map to more than one commune (38 codes are shared), so this always returns an array. Codes are **strings**, not integers — `"05000"` is real, and parsing it as a number loses the leading zero.

### How do I get all the communes of a wilaya?

```js
import { getCommunesOfWilaya } from "algeria-wilayas-communes";

getCommunesOfWilaya(19).length; // → communes of Setif
```

### Is there a list of Algerian communes in Arabic?

Yes — every one of the 69 wilayas, 591 daïras and 1541 communes carries `name.ar` alongside `name.fr` and `name.en`. Search works in Arabic too, including without diacritics:

```js
import { search } from "algeria-wilayas-communes";

search("سطيف")[0].item.name.ar; // → "سطيف"
```

`name.en` is a transliteration and equals `name.fr` for all but one record: Alger → **Algiers**. That is honest rather than padded — Algerian place names use the Latin alphabet, so there is only one real exonym.

### Can I use this commercially?

Yes, unconditionally. The data is **CC0 1.0** — public domain, no attribution required, no share-alike. See [LICENSE](LICENSE).

### How do I cite this dataset?

[CITATION.cff](CITATION.cff) is machine-readable; GitHub renders a "Cite this repository" button from it.
## License

Released under **[CC0 1.0](LICENSE)** — public domain. Use it in anything, no attribution required (a link back is always appreciated).

---

Maintained by **El Amin** · [el-amin.dev](https://el-amin.dev) · [@el-amin-dev](https://github.com/el-amin-dev)

---

<sub>**Keywords / mots-clés / كلمات مفتاحية** — Algeria wilayas communes daïras dataset · Algeria administrative divisions JSON · Algeria postal codes / ZIP codes · 48 / 58 / 69 wilayas (2019 & 2025 reform) · liste des wilayas et communes d'Algérie · découpage administratif Algérie · code postal Algérie · daira baladiya wilaya dz · قائمة ولايات وبلديات الجزائر · الولايات والدوائر والبلديات · الرمز البريدي الجزائري · التقسيم الإداري الجزائري · 69 ولاية · wilaya dz json · algeria cities npm pip.</sub>
