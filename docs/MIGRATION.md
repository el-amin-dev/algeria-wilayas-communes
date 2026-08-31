# Migrating from v1 to v2

This guide covers **both** packages — `algeria-wilayas-communes` on npm and
`algeria-wilayas-communes` on PyPI. They publish from the same tag with the same
version number, so if you upgrade one you are almost certainly upgrading both.

Read the first section before anything else. Most of what you have heard about
this upgrade is about breaks, and the largest fact is that you can decline all
of them.

---

## Start here: what does not break

**Every v1 function still exists, unchanged, under its original name, returning
the exact v1 snake_case shapes.** It moved one import line.

All seven v1 JavaScript functions — `getAll`, `getWilayas`, `getDairas`,
`getCommunes`, `byWilaya`, `findByPostalCode`, `findCommune` — plus the v1
default-export object and all eight v1 type names, live permanently at
`algeria-wilayas-communes/legacy`:

```js
import dz from "algeria-wilayas-communes/legacy";
import { getCommunes, findByPostalCode } from "algeria-wilayas-communes/legacy";

console.log(Object.keys(dz).sort().join(", "));
console.log(getCommunes()[0].nom_fr, getCommunes()[0].code_postal);
console.log(findByPostalCode("19018")[0].daira_fr);
```

All seven v1 Python functions — `get_all`, `get_wilayas`, `get_dairas`,
`get_communes`, `by_wilaya`, `find_by_postal_code`, `find_commune` — live
permanently at `algeria_wilayas_communes.legacy`, warning-free:

```python
from algeria_wilayas_communes import legacy

print(legacy.get_wilayas()[18]["nom_fr"], legacy.get_wilayas()[18]["code"])
print(legacy.find_by_postal_code("19018")[0]["daira_fr"])
```

`/legacy` is **not** a deprecation staging area with a countdown on it. It is
supported for the life of the v2 line — see [`SUPPORT.md`](../SUPPORT.md). If the
rest of this document is more work than you want today, stop reading, change your
import path, and get on with your week.

The other protection is semver, and it is the stronger one: **a project pinned
to `^1.0.0` never receives v2 at all.**

---

## The field map

v2 stops denormalizing parent names onto every row and stops prefixing field
names with the language. A record carries a `name` object with three languages,
and children carry their parent **by id** rather than by a copy of its names.

| v1 field | v2 JavaScript | v2 Python |
|---|---|---|
| `nom_fr` | `name.fr` | `name.fr` |
| `nom_ar` | `name.ar` | `name.ar` |
| `nom_en` | `name.en` | `name.en` |
| `code_postal` | `postalCode` | `postal_code` |
| `wilaya_num` | `code` on a wilaya; `wilaya` on a daïra or commune | `code`; `wilaya` |
| `code` (padded `"19"`) | `codeText` — **`code` is now the number `19`** | `code_text` — **`code` is now the int `19`** |
| `daira_fr` | `daira` (an id) — join via `getDaira(c.daira).name.fr` | `daira` — join via `get_daira(c.daira).name.fr` |
| `nb_dairas` / `nb_communes` | `dairaCount` / `communeCount` | `daira_count` / `commune_count` |

The last two rows are where the work is. Everything else is a rename you can do
with a find-and-replace.

```js
import { getCommune, getDaira, getWilaya } from "algeria-wilayas-communes";

const c = getCommune("19-ain-azel-ain-lahdjar");
console.log(c.name.fr, c.postalCode, c.wilaya, c.daira);

// v1's daira_fr / wilaya_fr are a join now, not a column
console.log(getDaira(c.daira).name.fr, getWilaya(c.wilaya).name.fr);
console.log(getWilaya(19).dairaCount, getWilaya(19).communeCount);
```

```python
from algeria_wilayas_communes import get_commune, get_daira, get_wilaya

c = get_commune("19-ain-azel-ain-lahdjar")
print(c.name.fr, c.postal_code, c.wilaya, c.daira)

print(get_daira(c.daira).name.fr, get_wilaya(c.wilaya).name.fr)
print(get_wilaya(19).daira_count, get_wilaya(19).commune_count)
```

---

## JavaScript: the breaking changes

### 1. The root ships no default export

`import dz from "algeria-wilayas-communes"` is now an **ESM link-time error**:

```
SyntaxError: The requested module 'algeria-wilayas-communes' does not provide an export named 'default'
```

That error is raised before a single line of your code runs. It is the loudest
failure mode available in the language, and that is why it was chosen.

The alternative — keeping a v1 default export beside v2's named exports — was
rejected in [ADR-001](DECISIONS.md#adr-001--the-root-entry-is-pure-v2-legacy-is-pure-v1)
precisely because it fails *silently*: a v1 caller who upgraded and kept their
named imports would receive v2 objects, and `commune.nom_fr` would quietly read
`undefined`, in production, weeks after the upgrade. A loud failure at import
beats a silent one at property access.

The fix is one line:

```js
// before: import dz from "algeria-wilayas-communes";
import dz from "algeria-wilayas-communes/legacy";

console.log(dz.getWilayas().length, dz.getCommunes().length);
```

The same applies to the named v1 functions. `getWilayas`, `getDairas`,
`getCommunes`, `byWilaya` and `findByPostalCode` at the **root** are now v2's,
returning v2 shapes. `getAll` and `findCommune` — the two v1 names v2 never
claimed — stay at the root as `@deprecated` shims returning v1 shapes
([ADR-002](DECISIONS.md#adr-002--only-getall-and-findcommune-are-shimmed-at-the-root)).
In every case the fix is the same one line: import from `/legacy`.

### 2. `wilaya.code` is a number; the padded string is `codeText`

**This is the one break that can fail silently, so it gets its own section.**

`code` survives the rename verbatim, which is exactly the problem. v1's `code`
was the zero-padded *string* `"01"`. v2's is the *number* `1`
([ADR-003](DECISIONS.md#adr-003--wilaya-codes-are-numbers-in-typescript-padded-strings-in-json)).

```js
import { getWilayas as v1GetWilayas } from "algeria-wilayas-communes/legacy";
import { getWilaya } from "algeria-wilayas-communes";

// before (v1)
const w1 = v1GetWilayas().find((w) => w.wilaya_num === 1);
console.log(JSON.stringify(w1.code), `${w1.code}`); // "01"  01

// after (v2)
const w2 = getWilaya(1);
console.log(JSON.stringify(w2.code), `${w2.code}`); //  1    1   ← not "01"
console.log(JSON.stringify(w2.codeText)); // "01"  ← use this
```

Anywhere you interpolated a wilaya code into a string, `` `${w.code}` `` now
yields `"1"` where v1 yielded `"01"`. Nothing throws. The damage shows up as
wrong postal prefixes, wrong licence-plate strings, wrong URL segments and wrong
filenames — one character short, sorted wrong, and impossible to spot in a diff.

**Rule: `code` for lookups and arithmetic, `codeText` for anything a human or a
filesystem will read.** `getWilaya(19)` takes the number; `getWilaya(19).codeText`
gives you `"19"`, and `getWilaya(6).codeText` gives you `"06"` — the padding is
the entire reason the field exists.

### 3. `engines.node` moves from `">=16"` to `">=18"`

Node 16 reached end of life in September 2023 and receives no security patches.
The v2 toolchain targets ES2020 with `moduleResolution: "bundler"`, and the test
matrix runs Node 18, 20 and 22 plus Bun.

This is the one break with **no mitigation and no shim**. It is also soft: npm
prints an `EBADENGINE` warning and installs anyway, unless you have set
`engine-strict=true`, in which case the install fails. A project still on Node 16
pins `algeria-wilayas-communes@1`.

### 4. v2 data is frozen; v1 handed back live mutable objects

v1 returned the cached `JSON.parse` result directly, so
`getCommunes()[0].nom_fr = "X"` mutated the dataset for the rest of the process
— for every other library in it, with no trace.

v2 closes that in two layers, and it is worth being precise about which layer
catches what, because they are not the same strength:

- **Every member and every array is `readonly` in the types**, so in TypeScript
  any mutation is a compile error. This is the layer that actually protects you.
- **The three bulk arrays are additionally `Object.freeze`d**, so
  `getCommunes().push(x)` throws a `TypeError` at run time even from untyped
  JavaScript.

**Individual records are *not* deep-frozen.** Freezing 2201 records and their
nested `name` objects would mean thousands of `Object.freeze` calls on the import
path, which is exactly the cost this package spent a session removing. So
`getCommunes()[0].name.fr = "X"` from plain JavaScript still succeeds — it is
unsupported and it corrupts the data for the rest of the process, but nothing
stops it. If you are calling from JavaScript rather than TypeScript, that is the
case to know about.

```js
import { getCommunes } from "algeria-wilayas-communes";

console.log(Object.isFrozen(getCommunes())); // true
try {
  getCommunes().push({});
} catch (e) {
  console.log(e.constructor.name); // TypeError — the array is frozen
}

// But the record inside it is not:
getCommunes()[0].name.fr = "X"; // no error, and now the dataset is wrong
```

Shared mutable global state in a data package is a defect, not a feature. But
the mitigation reduces this to almost nothing in practice: **`/legacy` and the
root shims return unfrozen, mutable, cached projections — deliberately.** v1
mutation code keeps working verbatim. And because those projections are separate
objects from the v2 constants, mutating a legacy record cannot corrupt v2 data —
which reproduces v1's real semantics, where `getCommunes()` rows and `getAll()`
rows were already distinct objects that could not see each other's mutations.

```js
import { getCommunes } from "algeria-wilayas-communes";
import { getCommunes as legacyGetCommunes } from "algeria-wilayas-communes/legacy";

const rows = legacyGetCommunes();
rows[0].nom_fr = "X"; // still works
console.log(rows[0].nom_fr, getCommunes()[0].name.fr); // X  Timekten
```

If you want a mutable **v2** record, clone it:

```js
import { getCommunes } from "algeria-wilayas-communes";

const copy = structuredClone(getCommunes()[0]);
copy.name.fr = "Mutable";
console.log(copy.name.fr, getCommunes()[0].name.fr); // Mutable  Timekten
```

---

## Python: the breaking changes

### 1. `requires-python` is now `>=3.9`, and this fixes a bug

v1 declared `requires-python = ">=3.8"` while its loader was built on
`importlib.resources.files`, **which was added in 3.9**. pip honoured the
declaration: on Python 3.8 the install succeeded and the very first call raised
`ImportError: cannot import name 'files'`.

So the floor did not really move. It was **corrected**
([ADR-014](DECISIONS.md#adr-014--requires-python-was-a-lie-the-floor-is-39)).
The resolver now refuses the install and says why, instead of deferring the same
failure to import time. Python 3.8 reached end of life in October 2024; CI runs
3.9 through 3.13.

### 2. Four root names now mean v2

`get_wilayas`, `get_dairas`, `get_communes` and `find_by_postal_code` at the root
return v2 shapes — **tuples of frozen dataclasses**, not lists of dicts. A
Python module can bind a name once, and v2 owns these four
([ADR-011](DECISIONS.md#adr-011--the-python-root-is-v2-three-v1-names-are-shimmed-legacy-holds-all-seven)).

```python
from algeria_wilayas_communes import get_wilayas
from algeria_wilayas_communes import legacy

print(type(get_wilayas()).__name__, type(get_wilayas()[0]).__name__)
print(type(legacy.get_wilayas()).__name__, type(legacy.get_wilayas()[0]).__name__)
```

The three v1 names v2 never claimed — `get_all`, `by_wilaya`, `find_commune` —
stay at the root in **v1 dict shapes** and emit `DeprecationWarning` with
`stacklevel=3`, so the warning points at your line rather than at the shim:

```python
import warnings
import algeria_wilayas_communes as dz

with warnings.catch_warnings(record=True) as rec:
    warnings.simplefilter("always")
    dz.get_all()
    print(rec[0].category.__name__, "-", rec[0].message)
```

`algeria_wilayas_communes.legacy` exports all seven **warning-free**, so you can
pin the old contract with one import change instead of suppressing
`DeprecationWarning` globally and losing that signal everywhere else in your
codebase.

`find_commune` keeps v1's body in both places — French `nom_fr` substring,
`.lower()` on both sides, unranked, unlimited, `list[dict]`. Routing it through
the new `search()` would have changed the order, the length and the element type
of a list that existing code already iterates and slices: a silent breakage
dressed up as an upgrade.

### 3. Returned data is immutable

v1 handed out the live `lru_cache`d objects, so `get_communes().clear()`
permanently corrupted the dataset for **every** consumer in the process. v2
returns tuples of `@dataclass(frozen=True)` records:

```python
import dataclasses
from algeria_wilayas_communes import get_wilaya

try:
    get_wilaya(19).name = None
except dataclasses.FrozenInstanceError as e:
    print("FrozenInstanceError:", e)
```

The legacy functions diverge from v1 here on purpose: **they return copies.**
Preserving a cache-poisoning hazard is not compatibility worth keeping, and only
legacy callers pay for the copy — the v2 API gets the same guarantee for free
from frozen dataclasses in tuples.

```python
from algeria_wilayas_communes import legacy

rows = legacy.get_communes()
rows[0]["nom_fr"] = "X"
print(rows[0]["nom_fr"], legacy.get_communes()[0]["nom_fr"])  # X  Timekten
```

---

## What is **not** a break

Read this before you read a `.d.ts` diff, because several changes in it look
alarming and are not.

| Change | Why it is not a break |
|---|---|
| **CJS added** | v1 had no `"require"` condition and is `"type": "module"`, so **no CJS consumer can exist** to be broken. Purely additive. |
| **`Algeria`'s `[key: string]: unknown` replaced by explicit fields** — `reforme`, `hierarchie`, `codes_postaux_renseignes`, `codes_postaux_manquants`, `note_daira`, `sources` | Every program that typechecked against `unknown` still typechecks. Strictly more information: those six keys were always in the data, and the index signature made you cast to touch them. |
| **`byWilaya(70)` becomes a compile error** | Runtime still returns `undefined`, exactly as before. JavaScript consumers are unaffected; TypeScript consumers get an error where they previously got a silent `undefined`. |
| **New exports** — `REFORM`, `resolveLegacyWilaya`, `resolveCurrentWilaya`, `asOf`, `search`, `/legacy` | Additive. Nothing was renamed out from under you. |
| **`DairaFlat` still has no `wilaya_ar`** | Eight fields, where `CommuneFlat` has twelve. Almost certainly an oversight in the original `jq` filter that generated `data/dairas.json` — and **deliberately not fixed**, because `data/*.json` is a published contract and *fixing it would be the break*. Candidate for v3, with its own ADR. |

---

## `require("algeria-wilayas-communes")` works now

Not a new feature — a five-year-old README promise finally kept.

The v1 README has shown a `require()` example for years. It **threw**
(`ERR_REQUIRE_ESM` / `ERR_PACKAGE_PATH_NOT_EXPORTED`), because v1 was
`"type": "module"` with no `"require"` condition in `exports`. v2's dual
ESM/CJS build makes the documented example true for the first time:

```js
const { getWilaya } = require("algeria-wilayas-communes");
console.log(getWilaya(19).name.fr, getWilaya(19).codeText);

const legacy = require("algeria-wilayas-communes/legacy");
console.log(legacy.getWilayas().length);
```

---

## If you are not ready

Two options, and neither has a deadline attached:

1. **Pin to v1.** `"algeria-wilayas-communes": "^1.0.0"` in `package.json`, or
   `algeria-wilayas-communes<2` in your requirements. Semver means v2 never
   reaches you.
2. **Upgrade and import from `/legacy`.** One line per file, and every v1
   function behaves exactly as it did, including the mutable return values and
   the v1 default export object.

Option 2 is worth doing even if you never migrate further: you get the v2 build,
the CJS entry, the corrected Python floor and every future data fix, while your
call sites stay on the v1 contract. `/legacy` is permanent for the life of the
v2 line — see [`SUPPORT.md`](../SUPPORT.md).
