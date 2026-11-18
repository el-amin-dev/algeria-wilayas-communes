# Record ids

## Library-assigned, not official

Only a **wilaya** has a real government identifier: the code `01`–`69`. This
dataset has no ONS or Journal Officiel code for a daira or a commune — only
names. So daira and commune ids are synthesized deterministically by this
project (decision **D2**).

That distinction matters to anyone putting one in a database column: the id is
**ours, not the government's**. It is stable by promise — it will not change
without a major version — but it is not a legal identifier and should not be
presented as one.

Fixture: [`shared/fixtures/ids.json`](../fixtures/ids.json) — all 2126 ids, in
document order.

## Composition

```
daira id   = <padded wilaya code> "-" slug(daira nom_fr)
commune id = <daira id>           "-" slug(commune nom_fr)
```

The wilaya code is the **zero-padded string** form, which is why ids read
`01-aoulef` and not `1-aoulef` — even though `Wilaya.code` is the number `1` in
both packages. See [`slug.md`](slug.md) for the slug rule.

Examples, all real:

| Level | Id |
|---|---|
| daira | `19-ain-azel` |
| commune | `19-ain-azel-ain-lahdjar` |
| daira | `16-baraki` |
| commune | `16-baraki-baraki` |

## Why the wilaya prefix is not decoration

Commune names are **not** unique on their own: 1541 communes carry only 1500
distinct French names, so 38 names are shared across wilayas. `Sidi Ameur`
exists in wilaya 32 **and** 64; `Souk El Had` in 35 **and** 48.

Daira names are worse: 585 (wilaya, daira) pairs carry only 545 distinct names,
because the 2026 reform split daires across wilaya boundaries — `El Marsa`
appears under 2, 16 and 21; `Tenes` under 2 and 14; `Ain Bessem` under 10 and 20.

What *is* unique, with zero collisions, is the pair `(wilaya_num, nom_fr)` at
both levels. That is the whole reason the ids are safe to synthesize, and it is
asserted on every build.

Two consequences that follow directly, and are not negotiable:

- **Any name-keyed or postal-keyed lookup returns a list**, never a single
  record.
- **Every search result carries its owning wilaya**, or it is undisambiguable.

## An id must never be malformed

`slug()` returns `""` for a name with no Latin letters, which would mint `09-`
or `09--x`. Assertion **A20** in `scripts/build-data.ts` fails the build rather
than shipping one. Uniqueness is asserted too: all 585 daira ids and all 1541
commune ids distinct, 0 collisions.

## Postal codes are not ids

1511 communes have one, 27 have `null`. Of the 1474 distinct codes, **38 are
shared by more than one commune**, so a postal index maps to a **list**. A
`dict[str, Commune]` would silently drop records depending on insertion order.

The 27 without a code cannot be filled — no available source has them. They ship
as `null` behind an exported list (`COMMUNES_MISSING_POSTAL_CODE`), listed by id
in [`ground-truth.json`](../fixtures/ground-truth.json). **Never invent one.**
`null` says *published as absent*; a fabricated code says something false about
a real place, and one of those ends the dataset's credibility permanently.
