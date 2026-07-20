# Algeria Wilayas, Daïras & Communes 🇩🇿

Up-to-date administrative divisions of **Algeria** — **69 wilayas**, **591 daïras**, and **1541 communes** — reflecting the **2025/2026 reform (Loi 26-06)**. Every name in **Arabic, French, and English**, with **postal codes** where available.

Plain JSON. No framework, no runtime, no lock-in. Use it from **npm, jq, JavaScript/TypeScript, Python, Java**, or anything that reads a file.

[![CI](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml/badge.svg)](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/algeria-wilayas-communes)](https://www.npmjs.com/package/algeria-wilayas-communes)
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
| `data/dairas.json` | Flat list of the **591 daïras** (each with its wilaya) |
| `data/communes.json` | Flat list of the **1541 communes** (each with wilaya + daïra + postal code) |
| `data/by-wilaya/NN.json` | One file per wilaya (`01.json` … `69.json`) — grab just what you need |
| `schema/algeria.schema.json` | JSON Schema for validation |

### Field shape

```jsonc
// wilaya
{ "wilaya_num": 16, "code": "16", "nom_ar": "الجزائر", "nom_fr": "Alger", "nom_en": "Algiers", "nb_dairas": 15, "nb_communes": 57 }

// commune (flat)
{ "wilaya_num": 1, "daira_fr": "Aoulef", "nom_ar": "تيمقتن", "nom_fr": "Timekten", "nom_en": "Timekten", "code_postal": "01041" }
```

All records carry `nom_ar`, `nom_fr`, `nom_en`. Note: Algerian place names use the Latin alphabet, so `nom_en` matches `nom_fr` for almost every entry — the one real exonym is **Algiers** (Alger).

---

## Install

### npm (JavaScript / TypeScript)

```bash
npm install algeria-wilayas-communes
```

```js
import {
  getWilayas,
  getCommunes,
  byWilaya,
  findByPostalCode,
  findCommune,
} from "algeria-wilayas-communes";

getWilayas().length;              // 69
byWilaya(16).nom_en;              // "Algiers"
findByPostalCode("16000");        // [{ ...commune }]
findCommune("adrar");             // communes matching "adrar"
```

Fully typed — TypeScript users get autocomplete out of the box.

---

## Quick start (no install)

Consume the data straight from GitHub or a CDN.

- **Raw:** `https://raw.githubusercontent.com/el-amin-dev/algeria-wilayas-communes/main/data/<file>`
- **CDN (jsDelivr):** `https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@main/data/<file>`

### jq / curl

```bash
# All 69 wilayas
curl -s https://raw.githubusercontent.com/el-amin-dev/algeria-wilayas-communes/main/data/wilayas.json | jq '.wilayas[].nom_fr'

# Just the communes of Alger (wilaya 16)
curl -s https://raw.githubusercontent.com/el-amin-dev/algeria-wilayas-communes/main/data/by-wilaya/16.json \
  | jq '.dairas[].communes[].nom_fr'

# Find a commune by postal code
jq '.communes[] | select(.code_postal == "16000")' data/communes.json
```

### JavaScript / TypeScript (without the package)

```js
const url = "https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@main/data/wilayas.json";
const { wilayas } = await fetch(url).then((r) => r.json());
console.log(wilayas.length); // 69
```

### Python

```python
import json, urllib.request

url = "https://raw.githubusercontent.com/el-amin-dev/algeria-wilayas-communes/main/data/communes.json"
data = json.load(urllib.request.urlopen(url))
print(len(data["communes"]))  # 1541
```

### Java

```java
// Drop a data file into src/main/resources/ and read it:
var stream = getClass().getResourceAsStream("/wilayas.json");
// parse with Jackson / Gson as you prefer
```

---

## The daïra layer — please read

The **wilaya → commune** assignment reflects the current **69-wilaya** structure. The **daïra → commune** membership comes from the official **pre-2025** structure, regrouped under the 69 new wilayas.

Where the reform **split** a daïra between two wilayas, that daïra name appears under **each** wilaya with its own communes — which is why the daïra count is **591** and not ~548. If you spot a daïra that should map differently under the new structure, please open an issue or PR (see below).

## Missing postal codes

**27 of 1541** communes have `code_postal: null` — they exist in the source but had no postal code in the reference data. They're small communes. If you know the correct code, contributions are very welcome.

---

## Found a problem? Contribute

Data is never perfect. If a name, postal code, or daïra mapping looks wrong or missing:

1. **Open an issue** describing what's off (wilaya + commune + what's expected), or
2. **Open a pull request** — edit **only `data/algeria.json`** (the source of truth), and CI will validate counts and schema automatically.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the exact steps.

---

## Sources

- ONS *Code Géographique National* — Loi 19-12 (2019, 48→58) and Loi 26-06 (2025/2026, 58→69)
- Daïra structure and postal codes cross-referenced from open community datasets

## License

Released under **[CC0 1.0](LICENSE)** — public domain. Use it in anything, commercial or not, no attribution required (though a link back is always appreciated).

---

Maintained by **El Amin** · [el-amin.dev](https://el-amin.dev) · [@el-amin-dev](https://github.com/el-amin-dev)
