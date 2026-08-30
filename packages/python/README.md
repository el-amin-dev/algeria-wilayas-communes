# algeria-wilayas-communes

Algeria's administrative divisions as a **zero-dependency** Python package — **69 wilayas**, **591 daïras**, **1541 communes** (2025/2026 reform, *Loi 26-06*) with **Arabic / French / English** names and **postal codes**.

```bash
pip install algeria-wilayas-communes
```

No runtime dependencies, and there never will be any. Typed (`py.typed`, clean under `mypy --strict`), immutable, and importing the package reads **no data files** — the first call loads only what it needs, so asking for wilayas never parses the 592 KB of commune data.

Requires **Python 3.9+**.

## Quick start

```python
from algeria_wilayas_communes import get_commune, get_wilaya, search

commune = get_commune("19-ain-azel-ain-lahdjar")
commune.name.fr  # 'Ain Lahdjar'
commune.name.ar  # 'عين الحجر'
commune.postal_code  # '19018'
commune.wilaya  # 19
commune.daira  # '19-ain-azel'

get_wilaya(19).name.fr  # 'Setif'
get_wilaya(19).commune_count  # 60

search("setif")[0].item.name.fr  # 'Setif'
```

Records are **frozen dataclasses**, so they autocomplete, type-check, and cannot be mutated. The language lives in the value (`name.fr`), never in the attribute name.

## The records

```python
Name(ar, fr, en)
Wilaya(code, code_text, name, daira_count, commune_count, parent_wilaya)
Daira(id, wilaya, name, commune_count)
Commune(id, wilaya, daira, name, postal_code)
```

`Wilaya.code` is the number `19`; `code_text` is the zero-padded `"19"` that appears in ids and in every JSON file — which is why `get_wilaya(6).code_text` is `"06"`.

Daïra and commune `id`s are **library-assigned, not official**: this dataset has no ONS or *Journal Officiel* code below wilaya level. They are `<padded wilaya code>-<slug(daïra)>-<slug(commune)>`, stable by promise, and byte-identical to the npm package's.

## API

### Accessors

| Function | Returns |
|---|---|
| `get_wilayas(*, as_of="69")` | All 69 wilayas |
| `get_dairas()` | All 591 daïras |
| `get_communes()` | All 1541 communes |
| `get_wilaya(code)` | One wilaya by code `19` or `"19"`, or `None` |
| `get_daira(id)` | One daïra by id `"19-ain-azel"`, or `None` |
| `get_commune(id)` | One commune by id, or `None` |
| `get_dairas_of_wilaya(code)` | That wilaya's daïras |
| `get_communes_of_wilaya(code)` | That wilaya's communes |
| `find_by_postal_code(code)` | Every commune with that code |
| `find_communes_by_name(name)` | Exact name match, any language |

Two conventions, held without exception: **a singular lookup returns `None` on a miss**, and **a plural lookup returns a possibly-empty tuple, never `None`**. No sentinels, no `(ok, value)` pairs. Bulk accessors return the cached tuple without copying — safe because the records are frozen.

```python
get_wilaya(70)  # None
get_commune("nope")  # None
find_by_postal_code("00000")  # ()
len(get_communes_of_wilaya(19))  # 60
```

**Postal codes are not unique.** 38 of the 1471 distinct codes are shared by more than one commune, so `find_by_postal_code` always returns a tuple. Names are not unique either:

```python
[c.wilaya for c in find_communes_by_name("Sidi Ameur")]  # [32, 64]
```

### `search()`

Ranked, multilingual, typo-tolerant, and dependency-free.

```python
search(query, *, lang=None, limit=20, wilaya=None, fuzzy=False, kinds=None)
```

Returns a tuple of `SearchResult(kind, item, wilaya, score, matched)`. Every result carries its owning wilaya — without it, a result that is only a name is undisambiguable.

```python
search("setif")[0].score  # 1.0   exact
search("Sétif")[0].item.name.fr  # 'Setif'   accents folded
search("سطيف")[0].matched  # 'ar'

# duplicated names resolve to distinct wilayas
[r.wilaya.code for r in search("souk el had", kinds=["commune"])]  # [35, 48]

# scoping is the cheapest big win: 2201 candidates -> a few dozen
search("ain lahdjar", wilaya=19)[0].item.id  # '19-ain-azel-ain-lahdjar'

search("algier", fuzzy=True)[0].item.name.fr  # 'Alger'
search("algeirs")  # ()  — fuzzy is off by default
search("")  # ()  — before any index is built
```

Ranking is **exact > prefix > substring > fuzzy**, with non-overlapping score bands so you can threshold on `score`, and ties broken deterministically. `limit` stops the scan rather than slicing at the end. The scores and ordering are identical to the npm package's; the formulas are in [`shared/contract/search.md`](../../shared/contract/search.md).

Arabic queries are folded for tashkeel, tatweel, alef forms, hamza carriers, alef maqsura and ta marbuta, so `بجاية` and `بجايه` find the same record.

### Guards

For validating input at the boundary — a form `<select>`, a JSON body — before touching the data. None of these reads a file.

```python
is_wilaya_code(19)  # True
is_wilaya_code("19")  # False
is_wilaya_code(True)  # False  — bool is an int subclass; this is deliberate
assert_wilaya_code(70)  # raises TypeError
is_postal_code("19018")  # True
is_postal_code("١٦٠٠٠")  # False  — Python's \d is Unicode-aware; this is not
```

### The 2026 reform

`Loi 26-06` created 11 new wilayas (codes 59–69), operational **1 January 2027**. Today is mid-transition, so both the 58-wilaya and 69-wilaya maps are in real administrative use.

```python
REFORM.law  # 'Loi 26-06'
REFORM.operational_from  # '2027-01-01'
REFORM.mapping_complete  # False
[w.code for w in REFORM.new_wilayas]  # [59, 60, ..., 69]
```

**Which pre-reform wilaya each new one was carved out of is not published in the dataset, and this package will never guess it.** Until the *Journal Officiel* n°25 text is transcribed, anything that depends on that mapping raises `ReformMappingUnavailableError` rather than returning a plausible-looking answer:

```python
get_wilayas(as_of="69")  # all 69 — the default, always works
get_wilayas(as_of="58")  # raises ReformMappingUnavailableError
resolve_legacy_wilaya(69)  # raises — 69 Messaad's mère is unpublished
resolve_current_wilaya(17)  # raises — which wilayas came out of 17 Djelfa

if REFORM.mapping_complete:  # branch on this, don't catch the exception
    ...
```

### Provenance

Exported, not merely documented — compliance and procurement teams ask where administrative boundaries came from and as of when, and a constant answers it in one line.

```python
DATA_VERSION  # '2.0.0'
SOURCE_LAW  # 'Loi 26-06 du 4 avril 2026, JO n°25'
LAST_VERIFIED  # '2026-07-20'
COMMUNES_MISSING_POSTAL_CODE  # the 27 ids, by id
```

## Migrating from v1

v1's seven functions all still work. Four of them **changed meaning at the root**, because v1 and v2 want the same names with different return types and one module cannot export both:

| Name | v1 | v2 at the root |
|---|---|---|
| `get_wilayas()` | `list[dict]` | `tuple[Wilaya, ...]` |
| `get_dairas()` | `list[dict]` | `tuple[Daira, ...]` |
| `get_communes()` | `list[dict]` | `tuple[Commune, ...]` |
| `find_by_postal_code(c)` | `list[dict]` | `tuple[Commune, ...]` |
| `get_all()` | `dict` | unchanged, **`DeprecationWarning`** |
| `by_wilaya(n)` | `dict \| None` | unchanged, **`DeprecationWarning`** |
| `find_commune(q)` | `list[dict]` | unchanged, **`DeprecationWarning`** |

The field names changed with the shapes: `nom_fr` → `name.fr`, `code_postal` → `postal_code`, `wilaya_num` → `wilaya`.

**Not ready to migrate?** One import change pins the whole v1 contract, warning-free:

```python
from algeria_wilayas_communes.legacy import (
    get_all,
    get_wilayas,
    get_dairas,
    get_communes,
    by_wilaya,
    find_by_postal_code,
    find_commune,
)

len(get_communes())  # 1541, as list[dict] with nom_fr / code_postal
by_wilaya(16)["nom_en"]  # 'Algiers'
find_by_postal_code("16000")  # [{'nom_fr': 'Alger Centre', ...}]
find_commune("adrar")  # v1's French substring search, exactly
```

That is better than suppressing `DeprecationWarning` globally, which would lose the signal everywhere else in your codebase.

`find_commune` is **deliberately not** routed through `search()`, in either place. `search()` is multilingual, ranked and limited to 20 — swapping it in would change the order, the length and the element type of a list your code already iterates and slices. That is a silent breakage dressed up as an upgrade.

The root shims and `legacy` are both **removed in v3**.

### Why the floor moved to Python 3.9

v1 declared `requires-python = ">=3.8"`, and that was a lie: the loader is built on `importlib.resources.files`, added in **3.9**. On 3.8, pip would install the package happily and the first call would fail with `ImportError: cannot import name 'files'`. Declaring a runtime the code provably cannot run on is worse than dropping it — now the resolver refuses the install and says so. Python 3.8 has been end-of-life since October 2024.

## Working from a git checkout

The dataset lives at the repo root and is **gitignored inside the package**; it is only vendored in at publish time. So a fresh clone imports fine and then fails on the first call. One command fixes it:

```bash
make dev
# or, equivalently:
ln -sfn ../../../../data packages/python/src/algeria_wilayas_communes/data
```

A symlink rather than a copy, so edits to `data/*.json` are visible immediately and there is no second copy to drift. If you skip it, the `FileNotFoundError` tells you this.

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Dataset notes

- `nom_en` equals `nom_fr` for every place but one: **Algiers** (wilaya 16). Algerian place names are generally not exonymized in English.
- **27 communes have no postal code.** They ship as `None`, listed in `COMMUNES_MISSING_POSTAL_CODE`. No available source has them, and they **will never be invented** — one fabricated postal code would end this dataset's credibility permanently.
- A daïra split by the reform appears under more than one wilaya — hence 591 (wilaya, daïra) pairs for only 545 distinct daïra names.
- 38 postal codes are shared by more than one commune, so postal lookup returns a tuple.

## One product, two languages

This is the sibling of the [npm package of the same name](https://www.npmjs.com/package/algeria-wilayas-communes). They are not merely similar: they return the **same record ids, the same search scores and the same answers**, enforced by shared conformance fixtures that both test suites run against, plus a test that diffs all 2132 ids across the two implementations.

The rules both sides implement are written down once in [`shared/contract/`](../../shared/contract/). Pick whichever language you are already in.

## Source & contributing

**https://github.com/el-amin-dev/algeria-wilayas-communes**

## Licence

**CC0 1.0 Universal — a public domain dedication.** No attribution required, no licence compatibility review needed, no obligations of any kind. Use it in anything.
