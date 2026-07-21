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

---

## Use it

**Packages**

```bash
npm install algeria-wilayas-communes      # JavaScript / TypeScript
pip install algeria-wilayas-communes      # Python
```

```js
import { getWilayas, byWilaya } from "algeria-wilayas-communes";
getWilayas().length;        // 69
byWilaya(16).nom_en;        // "Algiers"
```

**Straight from GitHub / CDN** (no install)

```bash
# CDN (jsDelivr)
curl -s https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@main/data/wilayas.json | jq '.wilayas | length'
```

More ready-to-copy commands (lookups by postal code, per-wilaya queries, rebuild, release) live in **[RUNBOOK.md](RUNBOOK.md)**.

---

## Good to know

- **Daïra layer:** wilaya → commune reflects the current 69-wilaya structure; daïra → commune membership comes from the pre-2025 structure regrouped under the new wilayas. Where the reform split a daïra across two wilayas, it appears under each — so the daïra count is **591**, not ~548.
- **Postal codes:** 27 of 1541 communes have `code_postal: null` (small communes missing from the reference data). Corrections welcome.

Spotted something wrong? Please **[open an issue or PR](../../issues/new/choose)** — see [CONTRIBUTING.md](CONTRIBUTING.md). Edit only `data/algeria.json`; CI validates the rest.

---

## Sources

- ONS *Code Géographique National* — Loi 19-12 (2019, 48→58) and Loi 26-06 (2025/2026, 58→69)
- Daïra structure and postal codes cross-referenced from open community datasets

## License

Released under **[CC0 1.0](LICENSE)** — public domain. Use it in anything, no attribution required (a link back is always appreciated).

---

Maintained by **El Amin** · [el-amin.dev](https://el-amin.dev) · [@el-amin-dev](https://github.com/el-amin-dev)

---

<sub>**Keywords / mots-clés / كلمات مفتاحية** — Algeria wilayas communes daïras dataset · Algeria administrative divisions JSON · Algeria postal codes / ZIP codes · 48 / 58 / 69 wilayas (2019 & 2025 reform) · liste des wilayas et communes d'Algérie · découpage administratif Algérie · code postal Algérie · daira baladiya wilaya dz · قائمة ولايات وبلديات الجزائر · الولايات والدوائر والبلديات · الرمز البريدي الجزائري · التقسيم الإداري الجزائري · 69 ولاية · wilaya dz json · algeria cities npm pip.</sub>
