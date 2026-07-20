# algeria-wilayas-communes

Algeria's administrative divisions as a zero-dependency npm package — **69 wilayas**, **591 daïras**, **1541 communes** (2025/2026 reform, *Loi 26-06*) with **Arabic / French / English** names and **postal codes**.

```bash
npm install algeria-wilayas-communes
```

## Usage

```js
import {
  getAll,
  getWilayas,
  getDairas,
  getCommunes,
  byWilaya,
  findByPostalCode,
  findCommune,
} from "algeria-wilayas-communes";

getWilayas().length;                 // 69
getCommunes().length;                // 1541
byWilaya(16).nom_en;                 // "Algiers"
findByPostalCode("16000");           // [ { nom_fr: "Alger Centre", ... } ]
findCommune("adrar");                // communes whose French name contains "adrar"
getAll();                            // full nested tree: wilaya > daira > commune
```

CommonJS works too:

```js
const dz = require("algeria-wilayas-communes");
dz.getWilayas().length; // 69
```

## API

| Function | Returns |
|----------|---------|
| `getAll()` | Full nested tree (wilaya → daïra → commune) |
| `getWilayas()` | Flat array of 69 wilayas |
| `getDairas()` | Flat array of 591 daïras (each with its wilaya) |
| `getCommunes()` | Flat array of 1541 communes (with wilaya + daïra + postal code) |
| `byWilaya(num)` | One wilaya's full subtree by number `1..69`, or `undefined` |
| `findByPostalCode(code)` | Communes matching a 5-digit postal code |
| `findCommune(query)` | Communes whose French name contains `query` (case-insensitive) |

Full TypeScript types are bundled (`Wilaya`, `Daira`, `Commune`, and the flat variants).

## Notes

- `nom_en` equals `nom_fr` for almost every place (Latin-alphabet names); the one exonym is **Algiers**.
- 27 communes have `code_postal: null` (missing from the reference data).
- Because the reform split some daïras across wilayas, a daïra name may appear under more than one wilaya — so the daïra count is 591.

## Source & contributing

Data, issues, and PRs live in the main repo:
**https://github.com/el-amin-dev/algeria-wilayas-communes**

## License

**CC0 1.0** — public domain.
