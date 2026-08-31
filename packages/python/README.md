# algeria-wilayas-communes

Algeria's administrative divisions as a zero-dependency Python package — **69 wilayas**, **591 daïras**, **1541 communes** with **Arabic / French / English** names and **postal codes**.

[![PyPI](https://img.shields.io/pypi/v/algeria-wilayas-communes)](https://pypi.org/project/algeria-wilayas-communes/)
![Python](https://img.shields.io/badge/python-3.9--3.13-blue)
![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Typed](https://img.shields.io/badge/typed-py.typed-blue)
[![CI](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml/badge.svg)](https://github.com/el-amin-dev/algeria-wilayas-communes/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-CC0--1.0-blue)
![Last verified](https://img.shields.io/badge/verified-2026--07--20-blue)

**69 wilayas, 1541 communes. Updated for Loi 26-06 (April 2026).** Most Algeria datasets still ship the 1984 or 2019 map.

## Install

```bash
pip install algeria-wilayas-communes
```

```bash
uv add algeria-wilayas-communes
```

```bash
poetry add algeria-wilayas-communes
```

Requires **Python 3.9+**. Nothing else — there are no runtime dependencies to resolve.

## Thirty seconds

A user types a postal code into your checkout form. Resolve it, and handle the fact that **38 postal codes are shared by more than one commune**, so the answer is a tuple:

```python
from algeria_wilayas_communes import find_by_postal_code, get_wilaya

matches = find_by_postal_code("19046")  # a tuple, possibly empty, never None
if not matches:
    raise ValueError("No commune uses that postal code.")

for c in matches:
    print(c.name.fr, "-", get_wilaya(c.wilaya).name.fr, "-", c.name.ar)
# El-Ouldja  - Setif     - الولجة
# El Oueldja - Khenchela - الولجة
# El Ouldja  - Relizane  - الولجة
```

Three real communes, three different wilayas, one postal code. Any form that assumes one is a bug waiting for a support ticket.

## What you install

The wheel bundles the same `data/*.json` files this repository publishes — one parsed copy, no code generation, no build step on your side.

**Zero runtime dependencies, by design.** There is deliberately no fuzzy-matching library: the bounded Levenshtein in `_search.py` is hand-rolled so that `pip install algeria-wilayas-communes` pulls in nothing at all. Nothing to audit, nothing to pin, nothing to conflict with your solver.

**`py.typed` ships in the wheel**, so mypy and pyright see the real types rather than `Any`. The package itself is clean under `mypy --strict`.

**Importing reads no data files.** `REFORM` and `COMMUNES_MISSING_POSTAL_CODE` are PEP 562 lazy module attributes, so they behave like constants to every caller while still costing nothing at import time. Each of the six indexes is built on first use and cached for the process lifetime — asking only for wilayas never parses the commune data.

Measured on CPython 3.9.25, on the maintainer's machine:

| | |
|---|---|
| `import algeria_wilayas_communes` | 17.9 ms, **0 data files read** |
| first `find_by_postal_code` (index build included) | 14.6 ms |
| first `search()` (key index included) | 21.6 ms |
| warm `find_by_postal_code` | **0.106 µs/call** |
| resident memory: wilayas only | 81 KiB |
| resident memory: + communes | 1.86 MB |
| resident memory: + search keys | 1.53 MB |

Those are one machine's numbers, not a promise. The shape is what matters: the cost is a one-time index build, paid only for the layer you touch.

## API

`WilayaLike = Union[int, str]` — a wilaya may be given as `19` or as `"19"`.

| Callable | Signature |
|---|---|
| `get_wilayas` | `get_wilayas(*, as_of: str = "69") -> tuple[Wilaya, ...]` |
| `get_dairas` | `get_dairas() -> tuple[Daira, ...]` |
| `get_communes` | `get_communes() -> tuple[Commune, ...]` |
| `get_wilaya` | `get_wilaya(code: WilayaLike) -> Wilaya \| None` |
| `get_daira` | `get_daira(daira_id: str) -> Daira \| None` |
| `get_commune` | `get_commune(commune_id: str) -> Commune \| None` |
| `get_dairas_of_wilaya` | `get_dairas_of_wilaya(code: WilayaLike) -> tuple[Daira, ...]` |
| `get_communes_of_wilaya` | `get_communes_of_wilaya(code: WilayaLike) -> tuple[Commune, ...]` |
| `find_by_postal_code` | `find_by_postal_code(code: str) -> tuple[Commune, ...]` |
| `find_communes_by_name` | `find_communes_by_name(name: str) -> tuple[Commune, ...]` |
| `search` | `search(query: str, *, lang: str \| None = None, limit: int = 20, wilaya: int \| str \| None = None, fuzzy: bool = False, kinds: Sequence[str] \| None = None) -> tuple[SearchResult, ...]` |
| `bounded_levenshtein` | `bounded_levenshtein(a: str, b: str, max_distance: int) -> int` |
| `is_wilaya_code` | `is_wilaya_code(value: object) -> TypeGuard[int]` |
| `assert_wilaya_code` | `assert_wilaya_code(value: object) -> None` |
| `is_postal_code` | `is_postal_code(value: object) -> TypeGuard[str]` |
| `resolve_legacy_wilaya` | `resolve_legacy_wilaya(code: int \| str) -> int \| None` |
| `resolve_current_wilaya` | `resolve_current_wilaya(code: int \| str) -> tuple[int, ...] \| None` |
| `get_all` | `get_all() -> dict[str, Any]` — deprecated v1 shim |
| `by_wilaya` | `by_wilaya(num: Any) -> dict[str, Any] \| None` — deprecated v1 shim |
| `find_commune` | `find_commune(query: str) -> list[dict[str, Any]]` — deprecated v1 shim |

Two invariants, held without exception:

- **A lookup that can miss returns `Optional[...]`** — `None` on a miss. Never a raised exception, never an empty dict standing in for a record. Nothing in the accessor module raises.
- **A plural accessor returns a tuple**, possibly empty, never `None`. `find_by_postal_code("00000")` is `()`.

```python
get_wilaya(70)  # None
get_commune("nope")  # None
find_by_postal_code("00000")  # ()
```

### Postal codes are strings

`"05000"` is a real Algerian postal code. Postal codes are therefore **strings**, everywhere in this package and in the JSON files behind it.

Any code that stores them as `int` has already lost the leading zero, and it will lose it silently — a CSV export, a JSON column, a spreadsheet import. That is the single most common bug in this domain.

### The records

```text
Name(ar: str, fr: str, en: str)
Wilaya(code: int, code_text: str, name: Name, daira_count: int,
       commune_count: int, parent_wilaya: int | None = None)
Daira(id: str, wilaya: int, name: Name, commune_count: int)
Commune(id: str, wilaya: int, daira: str, name: Name,
        postal_code: str | None = None)
SearchResult(kind: str, item: Wilaya | Daira | Commune, wilaya: Wilaya,
             score: float, matched: str)
```

Every record is a `@dataclass(frozen=True)`: it autocompletes, it type-checks, it hashes, and it cannot be mutated by a consumer. Attribute names are English snake_case and **the language lives in the value** (`name.fr`), never in the attribute name.

`Wilaya.code` is the number `19`; `code_text` is the zero-padded `"19"` that appears in record ids and in every JSON file — which is why `get_wilaya(6).code_text` is `"06"`.

Daïra and commune `id`s are **library-assigned, not official**: Algeria publishes no ONS or *Journal Officiel* code below wilaya level. They are `<padded wilaya code>-<slug(daïra)>-<slug(commune)>`, stable by promise, and byte-identical to the npm package's.

### `search()`

Ranked, multilingual, typo-tolerant, dependency-free.

```python
search("setif")[0].score  # 1.0   exact
search("Sétif")[0].item.name.fr  # 'Setif'   accents folded
search("سطيف")[0].matched  # 'ar'

# duplicated names resolve to distinct wilayas
[r.wilaya.code for r in search("souk el had", kinds=["commune"])]  # [35, 48]

# scoping the scan is the cheapest win available
search("ain lahdjar", wilaya=19)[0].item.id  # '19-ain-azel-ain-lahdjar'

search("algier", fuzzy=True)[0].item.name.fr  # 'Alger'
search("algeirs")  # ()  — fuzzy is off by default
search("")  # ()  — before any index is built
```

Every result carries its owning wilaya, because a result that is only a name is undisambiguable. Ranking is **exact > prefix > substring > fuzzy** with non-overlapping score bands, so you can threshold on `score`; ties break deterministically; `limit` stops the scan rather than slicing at the end. The scores and the ordering are identical to the npm package's — the formulas live in [`shared/contract/search.md`](../../shared/contract/search.md).

Measured against v1's `find_commune` on CPython 3.9.25:

| Query | v2 `search()` | v1 `find_commune()` |
|---|---|---|
| `"bej"` | 98 µs | **78 µs** |
| `"ain"` | 40 µs | 117 µs |
| `"a"` | 36 µs | 340 µs |

**`search("bej")` is slower than v1**, and that row is here on purpose. v2 scans 4402 keys across 2201 records in two scripts, then ranks, dedupes and resolves parents; v1 scanned 1541 French names with `in`. On a three-letter query that reaches the substring tier and matches little, v1's smaller job wins. On anything that matches broadly, v2 wins by 3–9x. Pick the trade knowingly.

### Guards

For validating input at the boundary — a form field, a JSON body — before touching the data. None of these reads a file.

```python
is_wilaya_code(19)  # True
is_wilaya_code("19")  # False
is_wilaya_code(True)  # False  — bool is an int subclass; this is deliberate
assert_wilaya_code(70)  # TypeError: Not a valid Algerian wilaya code (1..69): 70
is_postal_code("05000")  # True
is_postal_code("١٦٠٠٠")  # False  — the regex is [0-9]{5}\Z, not Unicode \d
```

## Recipes

Every block below was executed against this package on CPython 3.9.25 before it was written down. The outputs in the comments are the real ones.

### 1. pandas — load, group, and join onto your own data

```python
import pandas as pd
from algeria_wilayas_communes import get_communes, get_wilaya

communes = pd.DataFrame(
    [
        {
            "commune_id": c.id,
            "wilaya": c.wilaya,
            "daira_id": c.daira,
            "name_fr": c.name.fr,
            "name_ar": c.name.ar,
            "postal_code": c.postal_code,  # str or None - never int
        }
        for c in get_communes()
    ]
)
len(communes)  # 1541
communes["postal_code"].notna().sum()  # 1514

per_wilaya = communes.groupby("wilaya").size().rename("communes").reset_index()
per_wilaya["name_fr"] = per_wilaya["wilaya"].map(lambda n: get_wilaya(n).name.fr)
per_wilaya.loc[per_wilaya["wilaya"] == 19, "communes"].item()  # 60
```

Now merge the reference data onto a dataset of your own. Commune names are **not unique**: `Sidi Ameur` exists in wilaya 32 *and* wilaya 64; `Souk El Had` in 35 *and* 48. Joining on the name alone silently duplicates rows.

```python
sales = pd.DataFrame(
    [
        {"wilaya": 32, "commune": "Sidi Ameur", "orders": 12},
        {"wilaya": 64, "commune": "Sidi Ameur", "orders": 7},
    ]
)

bad = sales.merge(communes, left_on="commune", right_on="name_fr", how="left")
len(bad)  # 4  — each of the 2 rows matched both wilayas

good = sales.merge(
    communes,
    left_on=["wilaya", "commune"],
    right_on=["wilaya", "name_fr"],
    how="left",
    validate="one_to_one",  # raises if the join is not what you claimed
)
len(good)  # 2
good["commune_id"].tolist()
# ['32-sidi-ameur-sidi-ameur', '64-sidi-ameur-sidi-ameur']
```

The join key is the **(wilaya, commune) pair**, or `commune_id` if you store it. `validate="one_to_one"` turns a silent row explosion into an exception at the line that caused it.

### 2. Django — models and a seeding management command

```python
# geo/models.py
from django.db import models


class Wilaya(models.Model):
    code = models.PositiveSmallIntegerField(primary_key=True)  # 1..69
    code_text = models.CharField(max_length=2)  # "06", zero-padded
    name_ar = models.CharField(max_length=64)
    name_fr = models.CharField(max_length=64)
    name_en = models.CharField(max_length=64)

    class Meta:
        ordering = ["code"]


class Daira(models.Model):
    # The slug ids are stable by promise, but library-assigned, not official:
    # Algeria publishes no code below wilaya level. Using them as primary keys
    # is a convenience, not a claim of officialness. If you need a key you
    # control, add your own AutoField and keep this one as `unique=True`.
    id = models.CharField(max_length=64, primary_key=True)  # "19-ain-azel"
    wilaya = models.ForeignKey(Wilaya, on_delete=models.CASCADE, related_name="dairas")
    name_ar = models.CharField(max_length=64)
    name_fr = models.CharField(max_length=64)

    class Meta:
        ordering = ["id"]


class Commune(models.Model):
    id = models.CharField(max_length=96, primary_key=True)  # "19-ain-azel-ain-lahdjar"
    wilaya = models.ForeignKey(Wilaya, on_delete=models.CASCADE, related_name="communes")
    daira = models.ForeignKey(Daira, on_delete=models.CASCADE, related_name="communes")
    name_ar = models.CharField(max_length=64)
    name_fr = models.CharField(max_length=64)
    # 27 of 1541 communes have no published postal code. null=True, never "".
    postal_code = models.CharField(max_length=5, null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["id"]
```

```python
# geo/management/commands/seed_geo.py
from django.core.management.base import BaseCommand
from django.db import transaction

from algeria_wilayas_communes import (
    DATA_VERSION,
    get_communes,
    get_dairas,
    get_wilayas,
)

from geo.models import Commune, Daira, Wilaya


class Command(BaseCommand):
    help = "Seed 69 wilayas, 591 daïras and 1541 communes."

    @transaction.atomic
    def handle(self, *args, **options):
        Wilaya.objects.bulk_create(
            [
                Wilaya(
                    code=w.code,
                    code_text=w.code_text,
                    name_ar=w.name.ar,
                    name_fr=w.name.fr,
                    name_en=w.name.en,
                )
                for w in get_wilayas()
            ],
            update_conflicts=True,
            update_fields=["code_text", "name_ar", "name_fr", "name_en"],
            unique_fields=["code"],
        )
        Daira.objects.bulk_create(
            [
                Daira(id=d.id, wilaya_id=d.wilaya, name_ar=d.name.ar, name_fr=d.name.fr)
                for d in get_dairas()
            ],
            update_conflicts=True,
            update_fields=["wilaya_id", "name_ar", "name_fr"],
            unique_fields=["id"],
        )
        Commune.objects.bulk_create(
            [
                Commune(
                    id=c.id,
                    wilaya_id=c.wilaya,
                    daira_id=c.daira,
                    name_ar=c.name.ar,
                    name_fr=c.name.fr,
                    postal_code=c.postal_code,
                )
                for c in get_communes()
            ],
            update_conflicts=True,
            update_fields=["wilaya_id", "daira_id", "name_ar", "name_fr", "postal_code"],
            unique_fields=["id"],
        )
        self.stdout.write(
            f"data {DATA_VERSION}: "
            f"{Wilaya.objects.count()} wilayas, "
            f"{Daira.objects.count()} daïras, "
            f"{Commune.objects.count()} communes"
        )
```

```console
$ ./manage.py seed_geo
data 2.0.0: 69 wilayas, 591 daïras, 1541 communes
```

`update_conflicts=True` needs **Django 4.1+** and makes the command idempotent: run it again after a data release and it upserts instead of failing on the primary key. Because `c.wilaya` and `c.daira` are already the parent ids, `wilaya_id=` / `daira_id=` assign the foreign keys with no extra query.

### 3. FastAPI — an address-validation endpoint

The check that catches real bad data is not "is this a valid wilaya" and "is this a valid commune" separately — it is whether the commune sits **inside** the wilaya the client claims.

```python
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from algeria_wilayas_communes import (
    get_commune,
    get_communes_of_wilaya,
    get_wilaya,
    is_postal_code,
)

app = FastAPI()


class Address(BaseModel):
    wilaya: int
    commune_id: str
    postal_code: Optional[str] = None  # str, never int: "05000" is a real code
    line1: str


@app.post("/addresses")
def create_address(address: Address) -> dict:
    wilaya = get_wilaya(address.wilaya)
    if wilaya is None:
        raise HTTPException(422, f"Unknown wilaya code {address.wilaya!r} (1..69).")

    commune = get_commune(address.commune_id)
    if commune is None:
        raise HTTPException(422, f"Unknown commune id {address.commune_id!r}.")

    if commune.wilaya != wilaya.code:
        owner = get_wilaya(commune.wilaya)
        raise HTTPException(
            422,
            f"{commune.name.fr} is in wilaya {owner.code} ({owner.name.fr}), "
            f"not {wilaya.code} ({wilaya.name.fr}).",
        )

    if address.postal_code is not None:
        if not is_postal_code(address.postal_code):
            raise HTTPException(422, "Postal code must be exactly 5 ASCII digits.")
        # 27 communes have no published code, so absence is not a mismatch.
        if commune.postal_code and address.postal_code != commune.postal_code:
            raise HTTPException(
                422,
                f"Postal code {address.postal_code} does not match "
                f"{commune.name.fr} ({commune.postal_code}).",
            )

    return {
        "wilaya": wilaya.code,
        "commune_id": commune.id,
        "postal_code": address.postal_code or commune.postal_code,
    }


@app.get("/wilayas/{code}/communes")
def communes_of(code: int) -> list[dict]:
    if get_wilaya(code) is None:
        raise HTTPException(404, f"Unknown wilaya code {code}.")
    return [
        {"id": c.id, "fr": c.name.fr, "ar": c.name.ar, "postal_code": c.postal_code}
        for c in get_communes_of_wilaya(code)
    ]
```

Real responses:

```http
POST /addresses {"wilaya": 32, "commune_id": "64-sidi-ameur-sidi-ameur", "line1": "..."}
# 422 {"detail": "Sidi Ameur is in wilaya 64 (Bou Saada), not 32 (El Bayadh)."}

POST /addresses {"wilaya": 19, "commune_id": "19-ain-azel-ain-lahdjar",
                 "postal_code": "19019", "line1": "..."}
# 422 {"detail": "Postal code 19019 does not match Ain Lahdjar (19018)."}
```

The error names both wilayas, so the client can fix the form rather than guess. Django REST Framework users: the same three checks go in `Serializer.validate()` and raise `serializers.ValidationError`.

### 4. Dependent dropdowns — wilaya → daïra → commune

Three JSON endpoints for a Django template or an htmx form. Each level narrows the next, and nothing is trusted on the way back in.

```python
# geo/views.py
from django.http import Http404, JsonResponse
from django.urls import path

from algeria_wilayas_communes import (
    get_commune,
    get_communes_of_wilaya,
    get_daira,
    get_dairas_of_wilaya,
    get_wilaya,
    get_wilayas,
)


def _options(records, lang):
    # Sort in the language being displayed, not in insertion order.
    rows = [
        {"value": r.id if hasattr(r, "id") else r.code, "label": getattr(r.name, lang)}
        for r in records
    ]
    return sorted(rows, key=lambda r: r["label"])


def wilaya_options(request):
    lang = request.GET.get("lang", "fr")
    return JsonResponse({"options": _options(get_wilayas(), lang)})


def daira_options(request, code: int):
    if get_wilaya(code) is None:
        raise Http404(f"Unknown wilaya code {code}.")
    lang = request.GET.get("lang", "fr")
    return JsonResponse({"options": _options(get_dairas_of_wilaya(code), lang)})


def commune_options(request, daira_id: str):
    daira = get_daira(daira_id)
    if daira is None:
        raise Http404(f"Unknown daïra id {daira_id!r}.")
    lang = request.GET.get("lang", "fr")
    communes = [c for c in get_communes_of_wilaya(daira.wilaya) if c.daira == daira_id]
    return JsonResponse({"options": _options(communes, lang)})


# Re-validate on POST. The three selects are client state; a submitted
# commune_id is enough on its own, because the id carries its own parents.
def submit(request):
    commune = get_commune(request.POST["commune"])
    if commune is None:
        return JsonResponse({"error": "Unknown commune."}, status=422)
    return JsonResponse(
        {
            "commune": commune.id,
            "daira": commune.daira,
            "wilaya": commune.wilaya,
            "postal_code": commune.postal_code,  # may be None for 27 communes
        }
    )


urlpatterns = [
    path("options/wilayas", wilaya_options),
    path("options/wilayas/<int:code>/dairas", daira_options),
    path("options/dairas/<str:daira_id>/communes", commune_options),
    path("addresses", submit),
]
```

```
GET /options/wilayas                        -> 69 options, {"value": 1, "label": "Adrar"}
GET /options/wilayas/19/dairas              -> 20 options
GET /options/wilayas/19/dairas?lang=ar      -> 20 options, labelled in Arabic
GET /options/dairas/19-ain-azel/communes    ->  4 options
GET /options/wilayas/70/dairas              -> 404
POST /addresses commune=19-ain-azel-ain-lahdjar
    -> {"commune": "19-ain-azel-ain-lahdjar", "daira": "19-ain-azel",
        "wilaya": 19, "postal_code": "19018"}
```

Each endpoint is a pure function of the dataset — no database, no cache to invalidate. In an htmx form, point `hx-get` at the next level and swap the `<select>`.

### 5. Arabic search and RTL display

```python
import re
import unicodedata

from algeria_wilayas_communes import get_commune, get_communes, search

# All 1541 communes carry a non-empty Arabic name, so an Arabic-first UI
# never has to fall back to French.
all(c.name.ar for c in get_communes())  # True

# search() folds the query and the corpus with the same rule, so the spelling
# variants people actually type all land on the same record.
hits = search("بجاية", kinds=["commune"])
hits[0].item.name.fr  # 'Bejaia'
hits[0].matched  # 'ar'

variants = [
    "بجاية",  # ta marbuta, as written
    "بجايه",  # ha, as typed on a phone keyboard
    "بَجَايَة",  # with tashkeel
    "بجــاية",  # with tatweel
]
{search(v, lang="ar", kinds=["commune"])[0].item.id for v in variants}
# {'06-bejaia-bejaia'} - one id, four spellings

# lang="ar" restricts the scan to the Arabic layer; wilaya= scopes it further.
search("عين الحجر", wilaya=19)[0].item.id
# '19-ain-azel-ain-lahdjar'

# Display always comes from the stored string, never from the fold.
get_commune("19-ain-azel-ain-lahdjar").name.ar
```

To match an Arabic column in **your own** database against these names, apply the same fold the package applies internally: NFD, drop the combining marks, then fold the three letters that have no canonical decomposition.

```python
# Spelled with \u escapes on purpose: a literal Arabic character class
# reorders on screen and stops being reviewable.
_MARKS = re.compile("[\u0300-\u036f\u064b-\u0655\u0670]")
_TATWEEL = "\u0640"
_FOLDS = (
    ("\u0671", "\u0627"),  # alef wasla   -> bare alef
    ("\u0649", "\u064a"),  # alef maqsura -> ya
    ("\u0629", "\u0647"),  # ta marbuta   -> ha
)


def fold_ar(value: str) -> str:
    out = _MARKS.sub("", unicodedata.normalize("NFD", value.lower()))
    out = out.replace(_TATWEEL, "")
    for source, replacement in _FOLDS:
        out = out.replace(source, replacement)
    return " ".join(out.split())


by_ar = {}
for c in get_communes():
    by_ar.setdefault(fold_ar(c.name.ar), []).append(c.id)

# The value is a LIST because Arabic names are not unique either: three
# communes fold to the same key here.
by_ar[fold_ar("عَين الحجر")]
# ['10-ain-bessem-ain-el-hadjar',
#  '19-ain-azel-ain-lahdjar',
#  '20-ain-bessem-ain-el-hadjar']
```

NFD plus that one combining-mark range already performs the alef unification and the hamza-carrier folding, because `أ`, `آ`, `إ`, `ؤ` and `ئ` all decompose. An explicit `أ → ا` replacement *after* NFD is a silent no-op. Fold for the key only; render `name.ar` as stored, with `dir="rtl" lang="ar"` on the element, rather than reordering the string yourself.

### 6. Shipping cost keyed by wilaya

Yalidine, Noest and ZR Express all price by wilaya, so the rate table is keyed by the **integer wilaya code** — the one identifier every Algerian carrier agrees on.

```python
from typing import Optional

from algeria_wilayas_communes import (
    WILAYA_COUNT,
    assert_wilaya_code,
    get_commune,
    get_wilaya,
    get_wilayas,
)

ZONES = {  # (to the desk, to the door), in DA
    0: (400, 500),  # Alger and its immediate ring
    1: (600, 800),
    2: (700, 900),
    3: (800, 1000),
    4: (1000, 1400),  # the deep south
}

WILAYA_ZONE = {
    **{code: 1 for code in range(1, WILAYA_COUNT + 1)},
    16: 0,
    9: 0,
    35: 0,
    42: 0,
    6: 2,
    15: 2,
    18: 2,
    19: 2,
    21: 2,
    23: 2,
    25: 2,
    31: 2,
    34: 2,
    43: 2,
    3: 3,
    7: 3,
    17: 3,
    28: 3,
    32: 3,
    45: 3,
    47: 3,
    51: 3,
    55: 3,
    1: 4,
    8: 4,
    11: 4,
    30: 4,
    33: 4,
    37: 4,
    39: 4,
    49: 4,
    50: 4,
    52: 4,
    53: 4,
    54: 4,
    57: 4,
    58: 4,
}

# The check that keeps the table honest, in both directions. Put it in your
# test suite: it fails the day the dataset gains a wilaya and you have not
# priced it, and the day you price a wilaya that does not exist.
missing = [w.code for w in get_wilayas() if w.code not in WILAYA_ZONE]
assert not missing, f"no shipping zone for wilaya {missing}"
assert set(WILAYA_ZONE) <= {w.code for w in get_wilayas()}, "zone for a nonexistent wilaya"


def quote(wilaya_code: int, *, to_door: bool = False) -> int:
    assert_wilaya_code(wilaya_code)  # TypeError on 0, 70, "19", True
    desk, door = ZONES[WILAYA_ZONE[wilaya_code]]
    return door if to_door else desk


def quote_for_commune(commune_id: str) -> Optional[dict]:
    commune = get_commune(commune_id)
    if commune is None:
        return None  # unknown id — the caller decides; this does not raise
    wilaya = get_wilaya(commune.wilaya)
    return {
        "wilaya": wilaya.name.fr,
        "commune": commune.name.fr,
        "postal_code": commune.postal_code,
        "desk_da": quote(wilaya.code),
        "door_da": quote(wilaya.code, to_door=True),
    }


quote(16), quote(16, to_door=True)  # (400, 500)
quote(19)  # 700
quote(1, to_door=True)  # 1400
quote_for_commune("19-ain-azel-ain-lahdjar")
# {'wilaya': 'Setif', 'commune': 'Ain Lahdjar', 'postal_code': '19018',
#  'desk_da': 700, 'door_da': 900}
quote_for_commune("nope")  # None
quote(70)  # TypeError: Not a valid Algerian wilaya code (1..69): 70
```

The zone assignments above are an illustration, not a carrier's published tariff — replace them with your contract's. What matters is the coverage assertion: with 69 wilayas and a table written by hand, the failure mode is a missing key discovered by a customer, not by you.

## Provenance, gaps and the reform

### Where the data comes from

The dataset's `sources` array, verbatim:

```json
["ONS Code Geographique National / Loi 19-12 (2019) / Loi 26-06 (2026)", "othmanus/algeria-cities"]
```

Provenance is **exported, not merely documented** — compliance, legal and procurement teams ask where administrative boundaries came from and as of when, and a constant answers that in one line, in a log or a config dump.

```python
DATA_VERSION  # '2.0.0'
SOURCE_LAW  # 'Loi 26-06 du 4 avril 2026, JO n°25'
LAST_VERIFIED  # '2026-07-20'
```

Pin them in **your own** test suite, so a data release that changes the shape under you fails your build rather than your users:

```python
from algeria_wilayas_communes import (
    COMMUNE_COUNT,
    COMMUNES_MISSING_POSTAL_CODE,
    DAIRA_COUNT,
    DATA_VERSION,
    LAST_VERIFIED,
    MISSING_POSTAL_CODE_COUNT,
    POSTAL_CODE_COUNT,
    SOURCE_LAW,
    WILAYA_COUNT,
)


def test_dataset_is_the_one_we_reviewed():
    assert DATA_VERSION == "2.0.0"
    assert SOURCE_LAW == "Loi 26-06 du 4 avril 2026, JO n°25"
    assert LAST_VERIFIED == "2026-07-20"
    assert (WILAYA_COUNT, DAIRA_COUNT, COMMUNE_COUNT) == (69, 591, 1541)
    assert POSTAL_CODE_COUNT == 1514
    assert MISSING_POSTAL_CODE_COUNT == len(COMMUNES_MISSING_POSTAL_CODE) == 27
```

### The postal-code shape

Three numbers that are routinely confused with one another:

| | |
|---|---|
| Communes **carrying** a postal code | **1514** (`POSTAL_CODE_COUNT`) |
| Communes with **no** postal code | **27** (`MISSING_POSTAL_CODE_COUNT`) |
| **Distinct** non-null postal codes | **1471** |
| Distinct codes **shared** by more than one commune | **38** |

1514 + 27 = 1541 communes. 1471 is a count of *codes*, not of communes — never substitute one for the other. Because 38 codes are shared, `find_by_postal_code` returns a tuple, always.

### The 27 communes with no postal code

They ship as `postal_code=None` and are listed by id in `COMMUNES_MISSING_POSTAL_CODE`. No available source has them, and they **will never be invented**: one fabricated postal code would end this dataset's credibility permanently. `None` means *published as absent*, not *we did not look*.

| Wilaya | Commune | Daïra |
|---|---|---|
| 4 | Ouled Zouai | Souk Naamane |
| 5 | Talkhamt | Ras El Aioun |
| 5 | Lemcene | Ouled Si Slimane |
| 10 | Ouled Rached | Bechloul |
| 13 | Beni Boussaid | Beni Boussaid |
| 15 | Abi-Youcef | Ain El Hammam |
| 15 | Ait-Oumalou | Tizi Rached |
| 19 | Guelta Zerka | El Eulma |
| 21 | Ouldja Boulbalout | Ain Kechra |
| 23 | Treat | Berrahal |
| 24 | Beni Mezline | Guelaat Bousbaa |
| 24 | Bou Hamdane | Hammam Debagh |
| 24 | Khezaras | Khezaras |
| 26 | Sidi Ziane | Souaghi |
| 26 | Mezerana | Tablat |
| 27 | Safsaf | Bouguirat |
| 28 | El Houamed | Khoubana |
| 29 | Tizi | Tizi |
| 32 | Sidi Ameur | Sidi Ameur |
| 34 | Elhammadia | El Hamadia |
| 35 | El Kharrouba | Boudouaou |
| 35 | Souk El Had | Thenia |
| 41 | Sidi Fredj | Merahna |
| 46 | Chentouf | Hammam Bou Hadjar |
| 48 | Souk El Had | Thenia |
| 64 | Sidi Ameur | Sidi Ameur |
| 66 | Bouaiche | Chahbounia |

### The 2026 reform

**Loi 26-06** was signed on **4 April 2026** and published in the *Journal Officiel* **n°25 on 5 April 2026**. It creates 11 new wilayas, codes 59–69:

| | | | |
|---|---|---|---|
| 59 Aflou | 60 El Abiodh Sidi Cheikh | 61 El Aricha | 62 El Kantara |
| 63 Barika | 64 Bou Saada | 65 Bir El Ater | 66 Ksar El Boukhari |
| 67 Ksar Chellala | 68 Ain Oussara | 69 Messaad | |

The transition runs until **31 December 2026**; the new wilayas are fully operational on **1 January 2027**. Through 2026, **both maps are legally real** — the 58-wilaya map and the 69-wilaya map are each in genuine administrative use, which is why this package carries the reform as data rather than as a migration.

```python
REFORM.law  # 'Loi 26-06'
REFORM.journal_officiel  # 'JO n°25'
REFORM.published_on  # '2026-04-05'
REFORM.transition_deadline  # '2026-12-31'
REFORM.operational_from  # '2027-01-01'
REFORM.previous_wilaya_count  # 58
REFORM.current_wilaya_count  # 69
REFORM.mapping_complete  # False
[w.code for w in REFORM.new_wilayas]  # [59, 60, ..., 69]
```

**Which pre-reform wilaya each new one was carved out of is not published in this dataset, and this package will never guess it.** The mapping ships as a stub with every `parent_code` set to `None`. Until the *Journal Officiel* n°25 text is transcribed by a maintainer, anything that depends on that mapping raises `ReformMappingUnavailableError` rather than returning a plausible-looking answer:

```python
get_wilayas()  # all 69 — the default, always works
get_wilayas(as_of="69")  # the same 69
get_wilayas(as_of="58")  # raises ReformMappingUnavailableError
resolve_legacy_wilaya(69)  # raises — 69 Messaad's parent is unpublished
resolve_current_wilaya(19)  # raises — which wilayas came out of 19 Setif

if REFORM.mapping_complete:  # branch on this; do not catch the exception
    ...
```

A wrong parent wilaya would be invisible in your data and wrong in your reports. An exception is not the friendly answer; it is the correct one.

## Migrating from v1

### What does not break

**All seven v1 functions still exist, permanently, in `algeria_wilayas_communes.legacy`.** One import change pins the entire v1 contract, warning-free:

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
find_by_postal_code("19018")  # [{'nom_fr': 'Ain Lahdjar', ...}]
find_commune("ain lahdjar")  # v1's French substring search, exactly
```

That is better than suppressing `DeprecationWarning` globally, which would lose the signal everywhere else in your codebase.

`find_commune` is **deliberately not** routed through `search()`, in either place. `search()` is multilingual, ranked and limited to 20 — swapping it in would change the order, the length and the element type of a list your code already iterates and slices. That is a silent breakage dressed up as an upgrade.

### The field map

v1 handed back French keys from English functions. v2 puts the language in the value.

| v1 key | v2 access |
|---|---|
| `c["nom_fr"]` | `c.name.fr` |
| `c["nom_ar"]` | `c.name.ar` |
| `c["nom_en"]` | `c.name.en` |
| `c["code_postal"]` | `c.postal_code` — `str \| None`, still a string |
| `c["wilaya_num"]` | `c.wilaya` (`int`); the name via `get_wilaya(c.wilaya).name.fr` |
| `c["daira_fr"]` | `get_daira(c.daira).name.fr` — `c.daira` is the daïra **id** |
| `w["code"]` (padded `"19"`) | `w.code_text`; `w.code` is now the `int` `19` |
| `w["nb_communes"]` | `w.commune_count` |
| `w["nb_dairas"]` | `w.daira_count` |

```python
c = get_commune("19-ain-azel-ain-lahdjar")
w = get_wilaya(c.wilaya)

c.name.fr  # 'Ain Lahdjar'
c.postal_code  # '19018'
c.wilaya  # 19
w.name.fr  # 'Setif'
w.code, w.code_text  # (19, '19')
get_daira(c.daira).name.fr  # 'Ain Azel'
w.commune_count  # 60
w.daira_count  # 20
```

### Breaking changes

Three real breaks. None of them is softened here.

**1. The Python floor moved to 3.9 — and v1's declared floor was wrong.** v1's `pyproject.toml` declared `requires-python = ">=3.8"` while its loader called `importlib.resources.files`, which only exists in 3.9+. On 3.8, pip installed the package happily and the first call failed with `ImportError: cannot import name 'files'`. The declared floor was a lie. v2 declares `>=3.9`, so the resolver now refuses the install and says so, which is the honest outcome. Python 3.8 has been end-of-life since October 2024.

**2. Returned data is immutable, and it was not before.** v1 returned the `lru_cache`d dict objects **live**. A caller could write `get_communes()[0]["nom_fr"] = "oops"` or `get_communes().clear()` and permanently corrupt the dataset for every subsequent call in the process — no copy, no freeze, no read-only type. v2's records are frozen dataclasses in tuples, and `legacy` returns copies. If your code mutated a returned record in place, it will now raise `FrozenInstanceError`, or silently stop having an effect on the `legacy` path. That is the point.

**3. Four names mean v2 at the root.** `get_wilayas`, `get_dairas`, `get_communes` and `find_by_postal_code` return tuples of frozen dataclasses at the root, not `list[dict]`. One module cannot export both meanings.

| Name | v1 | v2 at the root |
|---|---|---|
| `get_wilayas()` | `list[dict]` | `tuple[Wilaya, ...]` |
| `get_dairas()` | `list[dict]` | `tuple[Daira, ...]` |
| `get_communes()` | `list[dict]` | `tuple[Commune, ...]` |
| `find_by_postal_code(c)` | `list[dict]` | `tuple[Commune, ...]` |
| `get_all()` | `dict` | unchanged, **`DeprecationWarning`** |
| `by_wilaya(n)` | `dict \| None` | unchanged, **`DeprecationWarning`** |
| `find_commune(q)` | `list[dict]` | unchanged, **`DeprecationWarning`** |

The three root shims and the `legacy` module are both **removed in v3**.

## Working from a git checkout

`packages/python/src/algeria_wilayas_communes/data/` is **gitignored and does not exist on disk** — the dataset lives at the repo root and is only vendored in at publish time. So an editable install of a fresh clone imports fine and then raises `FileNotFoundError` on the first call. One command fixes it:

```bash
make dev
# equivalently:
ln -sfn ../../../../data packages/python/src/algeria_wilayas_communes/data
```

A symlink rather than a copy, so edits to `data/*.json` are visible immediately and there is no second copy to drift. If you skip it, the `FileNotFoundError` tells you this. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## What this package guarantees

No scoring, no comparison table against packages whose current releases have not been checked. These are the facts you can verify from the wheel, and the questions worth asking of any alternative you are weighing:

| | |
|---|---|
| Wilayas | 69 — the post-*Loi 26-06* map |
| Daïras | 591, as a first-class layer with its own records |
| Communes | 1541 |
| Names | Arabic, French and English, non-empty for all 2201 records |
| Postal codes | 1514 of 1541; the other 27 are `None` and published as a list |
| Type hints | `py.typed` in the wheel; clean under `mypy --strict` |
| Runtime dependencies | none |
| Python | 3.9 – 3.13, tested on all five in CI |
| Provenance | `DATA_VERSION`, `SOURCE_LAW`, `LAST_VERIFIED` exported as constants |
| Source law cited | Loi 26-06, JO n°25, 5 April 2026 |
| Reform parent mapping | not published — raises rather than guesses |
| Licence | CC0-1.0 |

Most Algeria datasets fail the first row. Many stop at the wilaya level, which makes the daïra row the second thing to check.

## One product, two languages

The [npm package of the same name](https://www.npmjs.com/package/algeria-wilayas-communes) ships the **same data under the same name**, published from the **same `v*` git tag** — so a version number means the same 1541 records on both registries.

They are not merely similar: they return the same record ids, the same search scores and the same answers, enforced by shared conformance fixtures that both test suites run against, plus a test that diffs all 2132 ids across the two implementations. The rules both sides implement are written down once, in [`shared/contract/`](../../shared/contract/). Pick whichever language you are already in.

## Source and issues

**https://github.com/el-amin-dev/algeria-wilayas-communes**

## Licence

**CC0-1.0 — public domain, no attribution required.** No licence compatibility review, no notice to carry, no obligations of any kind. Use it in anything, including commercially, including without saying where it came from.
