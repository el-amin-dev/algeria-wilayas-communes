# algeria-wilayas-communes

Algeria's administrative divisions as a zero-dependency Python package — **69 wilayas**, **591 daïras**, **1541 communes** (2025/2026 reform, *Loi 26-06*) with **Arabic / French / English** names and **postal codes**.

```bash
pip install algeria-wilayas-communes
```

## Usage

```python
from algeria_wilayas_communes import (
    get_all, get_wilayas, get_dairas, get_communes,
    by_wilaya, find_by_postal_code, find_commune,
)

len(get_wilayas())              # 69
len(get_communes())             # 1541
by_wilaya(16)["nom_en"]         # "Algiers"
find_by_postal_code("16000")    # [{"nom_fr": "Alger Centre", ...}]
find_commune("adrar")           # communes whose French name contains "adrar"
get_all()                       # full nested tree: wilaya > daira > commune
```

## API

| Function | Returns |
|----------|---------|
| `get_all()` | Full nested tree (wilaya → daïra → commune) |
| `get_wilayas()` | List of 69 wilayas |
| `get_dairas()` | List of 591 daïras (each with its wilaya) |
| `get_communes()` | List of 1541 communes (with wilaya + daïra + postal code) |
| `by_wilaya(num)` | One wilaya's subtree by number `1..69`, or `None` |
| `find_by_postal_code(code)` | Communes matching a 5-digit postal code |
| `find_commune(query)` | Communes whose French name contains `query` |

## Notes

- `nom_en` equals `nom_fr` for almost every place; the one exonym is **Algiers**.
- 27 communes have `code_postal` set to `None` (missing from the reference data).
- A daïra split by the reform appears under more than one wilaya — hence 591 daïras.

## Source & contributing

**https://github.com/el-amin-dev/algeria-wilayas-communes**

## License

**CC0 1.0** — public domain.
