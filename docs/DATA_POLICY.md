# Data policy

What `^2.0.0` means, when the data changes, and how you find out.

This is a **dataset** shipped as a package. That makes versioning behave differently from a
library: a library changes when its author writes code, a dataset changes when a country
redraws a boundary or a ministry corrects a spelling. This document is the contract for both
kinds of change, so that `^2.0.0` in your `package.json` or `pyproject.toml` means something
you can reason about.

Companion documents:

- [`SUPPORT.md`](../SUPPORT.md) — what is promised not to break, and for how long.
- [`DATA_PROVENANCE.md`](DATA_PROVENANCE.md) — where the records came from and what is
  knowingly missing.
- [`DECISIONS.md`](DECISIONS.md) — the 14 ADRs behind the design.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — how to propose a data change.
- [`../shared/contract/`](../shared/contract/) — the normative rules both packages implement.

---

## 1. There are two versions, and they are not the same number

Conflating them is the single most common misreading of a data package. They are published
side by side, deliberately, and they move for different reasons.

| | **Package version** | **`DATA_VERSION`** |
|---|---|---|
| Example value | `2.0.0` | `"2.0.0"` |
| Where it lives | npm, PyPI, the `v*` git tag, `package.json`, `pyproject.toml` | an exported constant: `DATA_VERSION` in both packages |
| How you read it | your lockfile, `npm ls`, `pip show` | `import { DATA_VERSION } from "algeria-wilayas-communes"` / `from algeria_wilayas_communes import DATA_VERSION` |
| Changes when | the API changes **or** the data changes | **only** when a data record changes |
| Answers | "which release of this software am I running?" | "which edition of the map am I holding?" |

They start life equal at `2.0.0` and then drift apart. A release that only fixes a TypeScript
type, a bundling bug or a docstring bumps the package version and leaves `DATA_VERSION`
untouched. Two different package versions can therefore ship byte-identical data — and that
is the useful property: if `DATA_VERSION` is unchanged between two of your deployments, no
commune moved.

Both packages also export `SOURCE_LAW` and `LAST_VERIFIED` alongside it:

```ts
import { DATA_VERSION, SOURCE_LAW, LAST_VERIFIED } from "algeria-wilayas-communes";
// "2.0.0"
// "Loi 26-06 du 4 avril 2026, JO n°25"
// "2026-07-20"
```

```python
from algeria_wilayas_communes import DATA_VERSION, SOURCE_LAW, LAST_VERIFIED
```

Provenance is **exported, not merely documented**, because compliance, legal and procurement
teams ask where administrative boundaries came from and as of when. A constant you can log,
print into a report, or assert on in a test answers that in one line.

All three originate as literals near the top of `scripts/build-data.ts` and are emitted into
`packages/js/src/generated/meta.ts` and
`packages/python/src/algeria_wilayas_communes/_constants.py`, so the two languages cannot
disagree about them. Note that **`data/algeria.json` itself carries no `last_verified` key** —
the raw JSON files are the data, and the verification date is a property of the build that
publishes them. If you consume the raw files over jsDelivr rather than the packages, take
`LAST_VERIFIED` from the git tag you pinned, or from this document.

---

## 2. Semver rules for a data package

Semver was written for APIs. Applying it to records needs the rules spelled out, because
"is fixing a misspelled commune name a breaking change?" has no obvious answer. These are the
rules this project follows.

| Release | What it may contain | Record count |
|---|---|---|
| **Patch** (`2.0.0` → `2.0.1`) | a correction to an existing record: a spelling, a diacritic, an Arabic or English name, a postal code that was wrong. Bug fixes with no API surface change. | unchanged |
| **Minor** (`2.0.0` → `2.1.0`) | records **added**; a `null` **filled** (for example one of the [45 missing postal codes](DATA_PROVENANCE.md#the-45-communes-with-no-postal-code) is finally assigned, or a `parentCode` in the reform mapping is sourced); new functions, new subpaths, new optional fields. | may grow |
| **Major** (`2.x.y` → `3.0.0`) | a record **removed** or **renumbered**; a field removed or retyped; an API removed; a runtime floor raised. | may shrink or be renumbered |

Read the boundaries the way a consumer feels them:

- **A correction is a patch.** If `nom_fr` was wrong, it was wrong yesterday too; publishing
  the right value does not break a contract, it honours one. Your lookups by `id` and by
  `code` are unaffected — see §4 on what this does mean for you.
- **Filling a `null` is a minor, not a patch.** Code written against `code_postal === null`
  may have a branch that stops being reachable. Nothing throws, but behaviour changes, and a
  minor is the signal for "new information is available".
- **Renumbering is major, always.** If the government ever reassigns a wilaya code, the
  primary key of the dataset moved. That is a database migration for every consumer, and it
  gets a major even though not one line of API changed.
- **A runtime floor is major.** Raising `engines.node` or `requires-python` breaks installs
  on machines that were working. See [`SUPPORT.md`](../SUPPORT.md#runtime-floors) for the
  standard that governs when a floor may move at all.

### The synthesized ids are covered by these rules

Daïra and commune ids (`"19-ain-azel"`, `"19-ain-azel-ain-lahdjar"`) are **library-assigned,
not official** — only wilayas have a government identifier. They are nevertheless bound by
the table above: an id does not change outside a major. What is *not* promised is that they
will remain the primary key forever; read
[`SUPPORT.md` § The ids are ours, not the government's](../SUPPORT.md#the-ids-are-ours-not-the-governments)
and [`shared/contract/ids.md`](../shared/contract/ids.md) before you put one in a database
column.

---

## 3. The raw JSON files follow the same rules

`data/algeria.json`, `data/wilayas.json`, `data/dairas.json`, `data/communes.json` and the
69 `data/by-wilaya/NN.json` files are a published contract, consumed by jq, jsDelivr, Java
and callers this project cannot survey. They are versioned by the same `v*` git tag as the
packages, and their **field names and shape do not change outside a major** — including the
one known asymmetry documented in [`SUPPORT.md`](../SUPPORT.md#the-raw-json-contract-is-permanent).

If you pin a jsDelivr URL, pin it to a tag (`.../algeria-wilayas-communes@v2.0.0/data/...`),
not to a branch. A branch URL gives you whatever landed this morning.

---

## 4. What `^2.0.0` means to you

Pinning `^2.0.0` means:

- you receive **data corrections automatically** — a fixed spelling, a corrected postal code,
  a newly assigned code that used to be `null`;
- you receive **new API** as it is added;
- you never receive a removed record, a renumbered code, a retyped field, or a raised
  runtime floor without an explicit major bump you have to opt into.

**For most consumers this is the behaviour you want.** A dataset of administrative divisions
is not a frozen artefact; it is a description of a country that keeps changing. If a commune
name is wrong today, "stability" means being wrong for longer. Caret-pinning says *give me
the current map*.

**Pin an exact version when byte-stability matters more than currency.** Concretely:

- a regulated filing, a tax or electoral submission, or anything you may have to reproduce
  under audit;
- a reproducible research result — a paper, a published analysis, a dataset you cite (see
  [`CITATION.cff`](../CITATION.cff));
- a record you have already written to durable storage and must be able to explain later.

```jsonc
// package.json — reproducible
"algeria-wilayas-communes": "2.0.0"
```

```toml
# pyproject.toml — reproducible
"algeria-wilayas-communes == 2.0.0"
```

A lockfile gets you most of the way there for the npm package; an exact pin makes the intent
visible to the next person reading the manifest.

**How you detect that the data moved under you.** Assert on the exported constant rather than
on the package version, because that is the number that tracks the records:

```ts
import { DATA_VERSION, WILAYA_COUNT, COMMUNE_COUNT } from "algeria-wilayas-communes";

// A cheap canary in your own test suite.
expect(DATA_VERSION).toBe("2.0.0");
expect([WILAYA_COUNT, COMMUNE_COUNT]).toEqual([69, 1541]);
```

If that assertion ever fails in CI, the changelog entry for the release you just picked up
names the records that changed (§6).

---

## 5. The reform transition: what happens on 1 January 2027

This is a **scheduled, publicly known change**, and it is the one most likely to cause a
false alarm. Writing the rule down now is how a panic release is avoided.

The facts, precisely (see [`DATA_PROVENANCE.md`](DATA_PROVENANCE.md#4-the-2026-reform) and
[`shared/contract/reform.md`](../shared/contract/reform.md)):

- **Loi 26-06** is dated **4 April 2026** and was published in the *Journal Officiel*
  **n°25 on 5 April 2026**. The law's date and its publication date are one day apart; they
  are not interchangeable.
- Powers transfer to the 11 new wilayas progressively, until **31 December 2026**.
- The 11 new wilayas — 59 Aflou, 60 El Abiodh Sidi Cheikh, 61 El Aricha, 62 El Kantara,
  63 Barika, 64 Bou Saada, 65 Bir El Ater, 66 Ksar El Boukhari, 67 Ksar Chellala,
  68 Ain Oussara, 69 Messaad — are **fully operational from 1 January 2027**.
- Through 2026, **both maps are legally real**: the 58-wilaya map and the 69-wilaya map are
  in simultaneous administrative use. That is the entire reason an `asOf` view exists.

### The rule

**The default `asOf` is `"69"`, and it does not change on 1 January 2027.**

The default is already the current map. The package shipped 69 wilayas from v2.0.0. Nothing
about the default view, the record set, the codes, or any function signature is scheduled to
change on that date.

What changes is **the meaning of the other view**. `asOf: "58"` moves from *"the map still
used for some paperwork during the transition"* to *"historical"*. It keeps working; it keeps
returning the same records; only the sentence describing it in the documentation is edited.

> **That is a documentation change, not an API change, and it will not be shipped as a
> major.** No 2027 release will remove `asOf: "58"`, renumber a wilaya, or change what the
> default returns, on the strength of the calendar alone.

If Algeria legislates a *further* change — a new law, new wilayas, a renumbering — that is a
data change and it is versioned by §2 like any other, on its own merits and not on a date.

### One caveat you must know about before depending on `asOf`

The 58 → 69 **parent-wilaya mapping is not in the dataset and ships unfilled.** Which of the
58 wilayas *mères* each new wilaya was carved out of is knowable only from the text of
JO n°25, which has not been transcribed. Rather than guess, the project ships nothing:

- `REFORM` is always exported and always readable, including `mappingComplete: false`.
- `resolveLegacyWilaya`, `resolveCurrentWilaya` and any `asOf: "58"` call currently **throw**
  `ReformMappingUnavailableError`. They refuse to answer rather than answering wrongly.
- When the mapping is sourced and filled, those calls begin to succeed. That is a **minor**
  (a `null` filled, new information available), never a patch.

See ADR-005 and ADR-007 in [`DECISIONS.md`](DECISIONS.md), and
[`DATA_PROVENANCE.md`](DATA_PROVENANCE.md#the-parent-wilaya-mapping-is-not-sourced) for what
would have to be true for a value to ship.

---

## 6. Freshness: how you know the data is still being checked

`LAST_VERIFIED` is the date the dataset was last checked against its sources. It is currently
**`2026-07-20`**.

**The commitment: `LAST_VERIFIED` is expected to be refreshed at least every 274 days
(9 months).**

That number is not decorative. `.github/workflows/freshness.yml` computes the age of
`LAST_VERIFIED` on a schedule and **opens an issue on this repository when it exceeds 274
days**. The threshold in the workflow and the threshold in this paragraph are the same
number, stated in both places on purpose so that the policy and the automation cannot drift
apart silently.

What this gives you as a consumer:

- **A stale dataset is visible from the outside.** You do not have to email the maintainer to
  find out whether the project is still tended; you read `LAST_VERIFIED`, or you look at the
  open issues.
- **You can enforce it yourself.** `LAST_VERIFIED` is an exported ISO `YYYY-MM-DD` string
  specifically so you can assert on it in your own CI:

  ```python
  from datetime import date
  from algeria_wilayas_communes import LAST_VERIFIED

  assert (date.today() - date.fromisoformat(LAST_VERIFIED)).days < 400
  ```

A refresh that finds no change updates `LAST_VERIFIED` and ships as a **patch**, with
`DATA_VERSION` untouched — "checked, nothing moved" is itself useful information.

---

## 7. Where the changelog is, and what a data change looks like in it

Releases are cut with [changesets](https://github.com/changesets/changesets). Every change
lands with a `.changeset/*.md` entry declaring its bump level, and the release workflow
assembles those entries into:

- **`packages/js/CHANGELOG.md`** — the npm package's changelog, generated at release time.
- The same entries drive the GitHub release notes for the `v*` tag, which covers the PyPI
  package and the raw `data/` files too. **The npm and PyPI packages share the name
  `algeria-wilayas-communes` and publish from the same `v*` tag**, so a version number means
  the same thing in both ecosystems.

**A data change produces a changelog entry that lists the changed records.** Not "fixed some
postal codes" — the wilaya, the commune, the field, the old value and the new one, so that a
consumer diffing two releases can tell whether anything they care about moved without
diffing 592 KB of JSON.

A release that changes data also states the new `DATA_VERSION` in its entry.

---

## 8. The rule underneath all of it

> **Never invent, interpolate or guess a record. Missing data is marked `null` and
> documented.**

This is the basis of the package's credibility and it outranks completeness, tidiness and
convenience. A `null` says *published as absent*. A fabricated postal code says something
false about a real place, with the full authority of a package that advertises itself as
accurate — and one of those, found once, ends the dataset's usefulness permanently.

Concretely, this is why:

- 45 communes ship with `code_postal: null` rather than a plausible neighbouring code
  ([the full list](DATA_PROVENANCE.md#the-45-communes-with-no-postal-code));
- all 11 reform `parentCode` values ship `null` rather than the postal-prefix heuristic that
  would have filled them;
- a data fix without a citable source is not merged ([`../CONTRIBUTING.md`](../CONTRIBUTING.md)).

The same rule is restated in [`SUPPORT.md`](../SUPPORT.md) and
[`DATA_PROVENANCE.md`](DATA_PROVENANCE.md), because it is the one sentence that has to
survive a change of maintainer.
