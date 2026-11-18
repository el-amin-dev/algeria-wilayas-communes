# The 2026 reform

Reference implementations: `packages/js/src/reform.ts` and `asof.ts`.
Source file: `data/raw/reform.json`, validated by
[`shared/schema/reform.schema.json`](../schema/reform.schema.json).

## The facts

- **Loi 26-06**, published **5 April 2026**, *Journal Officiel* **n°25**.
- Powers transfer to the new wilayas by **31 December 2026**.
- The 11 new wilayas are operational from **1 January 2027**.
- Today is **mid-transition**: both the 58-wilaya map and the 69-wilaya map are
  real and in simultaneous administrative use. That is the entire reason an
  `asOf` view exists.

The 11 new wilayas are codes **59**–**69**: Aflou, El Abiodh Sidi Cheikh,
El Aricha, El Kantara, Barika, Bou Saada, Bir El Ater, Ksar El Boukhari,
Ksar Chellala, Ain Oussara, Messaad.

## The parent mapping does not exist in the dataset, and is not guessed

There is no `mere`, `parent`, `legacy`, `ancienne`, `rattach` or `delegue` field
anywhere in `data/algeria.json` or the generated files. Which of the 58 wilayas
*mères* each new wilaya was carved out of is knowable only from the text of
JO n°25, which nobody has transcribed yet.

So `data/raw/reform.json` ships as a **stub**: 11 rows, every `parentCode`
`null`, every `confidence` `"unverified"`. Filling it is a maintainer action
against a legal document, not an execution step (**ADR-005**, **ADR-007**).

**Never guess it.** Two independent heuristics were tried and they disagree:
postal-prefix inference and shared-daira-name inference agree on 3 of 11,
contradict on 2, and six new wilayas share no daira name at all. Two independent
heuristics agreeing a quarter of the time is the strongest possible argument for
shipping neither.

The unverified postal-prefix candidates live in the stub's per-row `todo`
strings, clearly labelled. They are **build input only** and are stripped from
both published packages — `publish-npm.yml` deletes `data/raw/` before packing,
and `publish-pypi.yml` strips the `todo` and `$comment` keys. A disclaimer
attached to a guess is still a guess once it is in a package.

## `mappingComplete` is computed, never read

The stub has **no `mappingComplete` key**, deliberately: a maintainer must not
be able to flip the gate by editing one boolean over an unfilled table.

It is derived at build time, and is true only when **all** of these hold for
**all 11** rows:

- `parentCode` is non-null and is a valid wilaya *mère* code (`^\d{2}$`, 1–58);
- `source` is non-null and not blank — supplying a `parentCode` is what costs a
  citation;
- `confidence` is exactly `"confirmed"`.

Today it is `false`.

## The behaviour contract while the stub is unfilled

**The derived API throws.** It does not return null, and it does not guess.

| Call | Behaviour today |
|---|---|
| `REFORM.mappingComplete` | `false` — the documented branch point |
| `REFORM.newWilayas` | fully populated: 11 rows, every `parentCode` null |
| `resolveLegacyWilaya(code)` | throws `ReformMappingUnavailableError` |
| `resolveCurrentWilaya(code)` | throws `ReformMappingUnavailableError` |
| `getWilayas(asOf: "58")` | throws `ReformMappingUnavailableError` |
| `getWilayas(asOf: "69")` | all 69 — the default, never throws |
| `getWilayas(asOf: <anything else>)` | throws `TypeError` |

Throwing rather than returning a silent empty answer is the point: a `null` the
caller cannot explain is worse than the missing data itself. The error message
names the file to fill and the flag to branch on, so a developer who hits it
learns the whole situation from the stack trace.

`asOf` accepts the **strings** `"58"` and `"69"` only. The numeric `58` is the
trap it guards against, and it raises a `TypeError` distinct from the mapping
error — this is a programmer error at a two-value enum, not user input.

## Directions, which are easy to invert

The two resolvers point opposite ways, and their names describe **what you get
back**, not what you pass in:

- `resolveLegacyWilaya(code)` → **the legacy (58-map) wilaya** that `code`
  belongs to. Singular. For codes 1–58 that is the code itself.
- `resolveCurrentWilaya(code)` → **the current (69-map) wilayas** carved out of
  legacy `code`, including `code` itself. Plural, ascending. Keyed on the 58
  legacy codes only, so 59–69 are absent.

A miss is null/None, never an empty list.

## What `asOf: "58"` means when it is eventually available

Only **wilaya attribution** is rewritten. Specifically: 58 wilaya records, with
59–69 absent and their counts re-aggregated onto the parent; **566 daires and
1541 communes unchanged, in the same order**; **ids never change**; postal codes
never change; daires are never merged.

That last set of guarantees is why `asOf` can be a view rather than a second
dataset.

## A cross-check that must warn, never fail

If a filled mapping is ever cross-checked against postal prefixes, the check
must emit a **warning** and never gate the build. For wilayas 1–58 the postal
prefix does not equal the wilaya code for **94 of 1408 communes (6.7%)**. A
6.7% base rate of legitimate mismatch makes a failing gate useless — it would
fire on correct data, and the natural response to that is to weaken or delete
the check.
