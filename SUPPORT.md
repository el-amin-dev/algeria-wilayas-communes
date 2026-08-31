# Support

What is promised, what is not, and how to get help.

If you are evaluating whether to depend on `algeria-wilayas-communes` — in a product, a
government system, a research pipeline, or a procurement review — this document and
[`docs/DATA_POLICY.md`](docs/DATA_POLICY.md) are written to answer your questions without
your having to read the source.

---

## The short answer: what can break under you, and how you would find out

| What could change | Can it reach you on `^2.0.0`? | How you find out |
|---|---|---|
| A name or postal code is **corrected** | Yes — patch | Changelog entry naming the record; `DATA_VERSION` bumps |
| A `null` postal code is **filled** | Yes — minor | Changelog entry; `DATA_VERSION` bumps |
| A reform `parentCode` is **sourced**, so `asOf: "58"` stops throwing | Yes — minor | Changelog entry; `REFORM.mappingComplete` flips to `true` |
| New functions or subpaths added | Yes — minor | Changelog entry |
| A v1 function is **removed** | **No.** Not in v2 at all — see below | — |
| The `/legacy` subpath or `legacy` module disappears | **No.** Permanent for the v2 line | — |
| `data/*.json` field names or shape change | **No.** Major only | — |
| A record is removed or a wilaya renumbered | **No.** Major only | — |
| Node or Python minimum version raised | **No.** Major only, and only on EOL | — |
| The default `asOf` view changes on 1 Jan 2027 | **No.** It is already the current map | [`docs/DATA_POLICY.md` §5](docs/DATA_POLICY.md#5-the-reform-transition-what-happens-on-1-january-2027) |
| The dataset stops being checked | Visible, not silent | `LAST_VERIFIED` goes stale; `.github/workflows/freshness.yml` opens an issue after 274 days |

The mechanics behind every row — the exact patch / minor / major rules, and what to pin if
you need byte-stability — are in [`docs/DATA_POLICY.md`](docs/DATA_POLICY.md).

---

## Deprecations are never removals on a schedule

A `@deprecated` tag in this project marks **intent**, not a countdown. Nothing listed below
is removed for the life of the v2 line.

**Permanent for the whole of v2:**

- The seven v1 JavaScript functions: `getAll`, `getWilayas`, `getDairas`, `getCommunes`,
  `byWilaya`, `findByPostalCode`, `findCommune`.
- The v1 **default-export object** at `algeria-wilayas-communes/legacy`.
- The **`/legacy` subpath itself**.
- The Python **`algeria_wilayas_communes.legacy`** module, exporting all seven in v1 dict
  shapes, warning-free.
- The raw **`./data/*` subpath** (`algeria-wilayas-communes/data/communes.json`, and every
  other file under `data/`), byte-identical to v1.

Two v1 names are also shimmed at the JavaScript root (`getAll`, `findCommune`) and three at
the Python root (`get_all`, `by_wilaya`, `find_commune`) — the names v2 never claimed for
itself. The rest live at `/legacy`, because a module can only bind one meaning per name;
ADR-001, ADR-002 and ADR-011 in [`docs/DECISIONS.md`](docs/DECISIONS.md) explain why a mixed
root was rejected, and [`docs/MIGRATION.md`](docs/MIGRATION.md) walks the one-line import
change.

**Some of those carry `@deprecated ... Removed in v3` (JSDoc) or a `DeprecationWarning`
(Python). Read that as: "there is a better v2 way to do this, and if a v3 is ever cut, this
is the surface that would go."**

> **v3 has no scheduled date, and will not be cut to tidy up the API.**

A major exists to carry a change that could not be made any other way — a government
renumbering, a field that must be retyped, a runtime that has reached end of life. Removing
working functions from working code is not a reason to publish a major. If you are on v1 and
not ready to migrate, `^1.0.0` never receives v2 at all; if you are on v2 and still calling
the v1 surface through `/legacy`, that keeps working.

---

## Runtime floors

**A runtime floor moves only when the runtime itself is end-of-life, and only in a major.**

v2 applies that standard in two places:

- **Node `>=16` → `>=18`.** Node 16 has been end-of-life since **September 2023**. It receives
  no security patches. (npm surfaces this as an `EBADENGINE` warning rather than a hard error
  unless you set `engine-strict=true`.)
- **Python `>=3.8` → `>=3.9`.** This one is a **correction, not a drop**. v1 declared
  `requires-python = ">=3.8"` while its loader was built on `importlib.resources.files`,
  which was **added in 3.9** — so on Python 3.8 the install succeeded and the first call
  raised `ImportError: cannot import name 'files'`. Declaring support for a runtime the code
  provably cannot run on is worse than declaring the truth: the resolver now refuses the
  install and says why, instead of deferring the failure to import time. Python 3.8 reached
  end of life in October 2024. See ADR-014.

That is the standard, applied consistently — not a one-off convenient to this release. A
floor is not raised because a newer syntax would be pleasant, because a dependency dropped a
version, or because CI would be cheaper. ADR-014 also records `slots=True` being **rejected**
for exactly this reason: it wants Python 3.10, its benefit is a bounded few hundred KB, and
the cost of dropping 3.9 is every user on a distribution Python.

CI runs the Python suite on **3.9 – 3.13**.

---

## The raw JSON contract is permanent

`data/algeria.json`, `data/wilayas.json`, `data/dairas.json`, `data/communes.json` and the
69 `data/by-wilaya/NN.json` files **keep their field names and shape.** They are not
refactored, renamed, reordered or tidied within a major.

This is a stronger promise than it looks, because it includes a known wart:

> **The frozen asymmetry.** Rows in `dairas.json` carry `wilaya_fr` and `wilaya_en` but
> **no `wilaya_ar`**. Rows in `communes.json` **do** carry `wilaya_ar`. There is no principle
> behind the difference — it is an artefact of the original `jq` filter that generated the
> flat files, and it is **deliberately reproduced**, byte for byte, by the current build.

It is reproduced rather than fixed because these files are consumed by `jq` scripts, by
jsDelivr URLs embedded in other people's HTML, by the Java and Python examples in the README,
and by an unknown number of downstream users who cannot be surveyed and cannot be notified.
Adding a field changes what `getDairas()` returns and what every one of those consumers
parses. It is recorded as a **candidate v3 data break** in
[`docs/DECISIONS.md`](docs/DECISIONS.md) ("Recorded, deliberately not fixed") and would need
its own ADR before v3.

The same reasoning pins on-disk key order: `JSON.stringify(legacy.getAll())` is asserted equal
to `data/algeria.json` byte for byte, because people do serialize these records (ADR-004).

If you consume the raw files from a CDN, **pin a tag**:

```
https://cdn.jsdelivr.net/gh/el-amin-dev/algeria-wilayas-communes@v2.0.0/data/communes.json
```

A branch URL gives you whatever landed this morning.

---

## What is explicitly NOT promised

### The ids are ours, not the government's

Daïra and commune ids look official and are not:

```
daira   19-ain-azel
commune 19-ain-azel-ain-lahdjar
```

They are **synthesized by this library** from the padded wilaya code and a slug of the French
name. **Only a wilaya has a real government identifier** — the code `01`–`69`. Neither
communes nor daïras have any official ONS or *Journal Officiel* code in the source data;
the dataset has only names.

What is promised: the ids are **deterministic and stable**, and will not change outside a
major (see [`docs/DATA_POLICY.md` §2](docs/DATA_POLICY.md#2-semver-rules-for-a-data-package)).
The slug rule and the exhaustive proof of all 2132 ids are in
[`shared/contract/ids.md`](shared/contract/ids.md) and `shared/fixtures/ids.json`.

What is **not** promised: that a synthesized id will remain the dataset's primary key
forever.

> **If the ONS publishes official commune codes, those become the primary key in the next
> major.** The slugs would remain as a stable alias — they would not be deleted out from
> under anyone — but new code would be expected to key on the official code.

This is stated now, before anyone builds a system on it, because the alternative is a user
discovering in 2029 that they inferred a guarantee that was never given. If you are writing
these into a database column, store them as an alias alongside the wilaya code, and expect a
migration if Algeria ever publishes official codes.

### The parent-wilaya mapping does not exist yet

`getWilaya(59)?.parentWilaya` is `null`, and `resolveLegacyWilaya`, `resolveCurrentWilaya`
and any `asOf: "58"` call **throw** `ReformMappingUnavailableError`. That is not a bug and it
is not a stub waiting on engineering time: which of the 58 wilayas *mères* each of the 11 new
wilayas was carved out of is knowable only from the text of JO n°25, and it has not been
transcribed. **No value is guessed.**

`REFORM` itself is always exported and always readable — the law, the dates and
`mappingComplete: false` are facts that are known, and reading them never throws. Full
reasoning: ADR-005 and ADR-007, and
[`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md#the-parent-wilaya-mapping-is-not-sourced).

### Cold-start performance is not a promise, and v2 is slower than v1 there

Measured and published rather than glossed: v2's **cold path is slower than v1** by roughly
1.5–3.3× depending on the call, because inlining the data as JavaScript (which is what
removed the `node:fs` dependency and made browser, Worker, Deno and React Native support
possible at all) moved the parse cost into module evaluation, where it is larger. Warm
lookups gain far more than the cold path loses — postal-code lookup went from **5.847 µs to
0.031 µs (188.6x)** and is O(1) rather than a scan. The full v1-versus-v2 tables, cold and
warm, are published in
[the package README](packages/js/README.md#v1-versus-v2-honestly); the decision behind them —
including the measurement that contradicts the original design document — is ADR-008. If you
are latency-sensitive on cold start, import a narrow subpath (`/wilayas` is 2.36 kB gzip
against the root's 96.92 kB).

### `/lite` is not shipped

Seven subpaths, not eight. ADR-009 has the measurement that killed it: `/wilayas` at 2.36 kB
already beats `/lite`'s projected 12,577 B for the same use case. Removing an export before
2.0.0 costs nothing; after, it costs a major — so it was not shipped.

---

## The licence is a longevity asset, not a formality

**CC0 1.0 Universal** — a **public-domain dedication**, not a permissive licence. The
distinction matters: a permissive licence grants you rights under conditions (attribution,
notice retention). CC0 waives the rights entirely, to the fullest extent the law allows. The
full text is in [`LICENSE`](LICENSE).

Three consequences, spelled out because they are the actual reasons this matters to a team
deciding whether to depend on the package:

1. **It removes every procurement objection.** There is no attribution clause to comply with,
   no notice file to propagate, no copyleft to analyse, no licence compatibility matrix to
   check. No legal review blocks adoption at a company, because there is nothing for legal to
   review. In practice this is the difference between "we'll get back to you next quarter"
   and merging the dependency this afternoon.

2. **It removes the bus-factor objection.** If the maintainer stops — moves on, loses
   interest, is hit by a bus — **anyone may fork this repository and continue it, with no
   permission needed from anyone.** The data, the build pipeline, the schemas, the
   cross-language contract and the test fixtures are all in the repository and all in the
   public domain.

   Stating this openly *increases* adoption rather than inviting forks. A team evaluating a
   dependency is not asking "will this be forked?" — they are asking "am I betting my product
   on one person's continued interest?" The honest answer here is no, and saying so is worth
   more than the theoretical risk that someone forks a dataset they could have contributed
   to instead.

3. **It makes the data usable inside government and commercial products without negotiation.**
   A ministry, a bank, a logistics company or a national registry can embed these records in
   a closed system, a printed form or a paid product, with no attribution line and no
   contract. Those are the largest users of an administrative-divisions dataset, and an
   attribution requirement is exactly what would keep them out.

Attribution is welcome and appreciated — [`CITATION.cff`](CITATION.cff) makes it easy for
researchers and government users who *want* to cite the dataset — but it is never required.

Contributions are accepted under the same dedication.

---

## Getting help

**Report a data error** — a wrong or missing name, postal code, or daïra mapping:
[`.github/ISSUE_TEMPLATE/data-fix.yml`](.github/ISSUE_TEMPLATE/data-fix.yml). Tell us the
wilaya, the commune (and daïra if relevant), what is wrong and what it should be.

**Request an addition** — a missing record, a new field, a new output format:
[`.github/ISSUE_TEMPLATE/data-request.yml`](.github/ISSUE_TEMPLATE/data-request.yml).

**Usage questions and general discussion** go to
[Discussions](https://github.com/el-amin-dev/algeria-wilayas-communes/discussions), not the
issue tracker.

### What to expect

- **A data fix without a citable source is not merged.** Not because contributors are
  distrusted, but because an unsourced correction is indistinguishable from a confident
  guess, and the whole value of this dataset is that it contains none. Cite the ONS, the
  *Journal Officiel*, a ministry publication, or an official municipal source. A link is
  enough. This applies with particular force to the reform parent mapping, where a wrong
  value would silently misroute real postal mail and real government paperwork (ADR-005,
  ADR-007).
- **Data-integrity reports are welcome and treated seriously**, including reports that the
  build, the schema, or the cross-language fixtures are not enforcing what they claim. There
  is no vulnerability-disclosure process to navigate: open an issue. If you believe a report
  should not be public, say so in a minimal issue and a private channel will be arranged.
- **Both packages ship zero runtime dependencies**, so there is no transitive-dependency
  advisory surface to monitor. `zod` is an optional peer dependency of the `/zod` subpath
  only; installing the package installs nothing.
- Contribution mechanics — which file to edit, how to regenerate the derived files, how to
  run the checks — are in [`CONTRIBUTING.md`](CONTRIBUTING.md). Release and maintenance
  procedures are in [`RUNBOOK.md`](RUNBOOK.md).

---

## The rule that governs all of it

> **Never invent, interpolate or guess a record. Missing data is marked `null` and
> documented.**

Every promise above is downstream of this one. It is why 27 communes ship with
`code_postal: null` instead of a plausible neighbouring code, why all 11 reform `parentCode`
values ship empty instead of filled from a heuristic that was right 3 times out of 11, and
why a data fix needs a source.

One fabricated postal code would end the credibility of the whole dataset permanently — and
correctly so, because there would be no way for a user to know which other records were
invented. See [`docs/DATA_PROVENANCE.md`](docs/DATA_PROVENANCE.md) for exactly what is known,
what is missing, and where each of it came from.
