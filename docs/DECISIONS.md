# Decisions

Architecture decision records for `algeria-wilayas-communes`. Newest last. Each entry states the
decision, what forced it, and what was given up — so a future reader can tell a deliberate choice
from an accident.

---

## ADR-001 — The root entry is pure v2; `/legacy` is pure v1

**Status:** accepted (v2.0.0)

v1 and v2 both want the names `getWilayas`, `getDairas` and `getCommunes`, with different return
shapes, and **a module can export only one binding per name.**

Two compromises were rejected:

- **A mixed root** — v2 owning the named exports while the default export object stays v1 — ships
  two different APIs from one module, so `import { getCommunes } from "pkg"` and
  `import dz from "pkg"; dz.getCommunes()` return different shapes from the same entry point.
  Worse, it makes the failure **silent**: a v1 caller who upgrades and keeps their named import
  gets v2 objects, and `c.wilaya_fr` quietly reads `undefined` — in production, far from the
  upgrade.
- **Dual-shape records** — attaching v1 snake_case aliases as non-enumerable getters — genuinely
  makes both `c.nom_fr` and `c.name.fr` work, but **object spread is ubiquitous in JavaScript** and
  `{...commune}` silently drops non-enumerable aliases. A compatibility shim whose own failure mode
  is silent and spread-dependent is worse than a clean break. It also costs memory and construction
  time on 1541 objects, forever.

**Decision.** The root is pure v2. `/legacy` is pure v1, byte-exact, including its own default
export object, and is **permanent** — never removed for the life of the v2 line. The migration is
a one-line, mechanical import change, and semver is the real protection: a user pinned to `^1.0.0`
never receives v2 at all.

**The root ships no default export.** This is the load-bearing detail. In ESM, importing a default
that does not exist is a **link-time error** — `The requested module does not provide an export
named 'default'` — raised before a single line of user code runs. So the one population that would
otherwise fail silently gets a loud, immediate error instead. *A loud failure at import beats a
silent one at property access.*

---

## ADR-002 — Only `getAll` and `findCommune` are shimmed at the root

**Status:** accepted (v2.0.0) — refines ADR-001

The v2 core already owns `byWilaya` and `findByPostalCode` at the root, with v2 return shapes.
The original plan re-exported v1 versions of those two names from the compatibility module, which
is an impossible duplicate export and would in any case contradict ADR-001.

**Decision.** The root shims are **`getAll` and `findCommune` only** — the two v1 names the v2 API
never claimed. `byWilaya` and `findByPostalCode` stay pure v2 at the root. All seven v1 functions
remain available, unchanged and untagged, at `/legacy`.

**Given up:** a v1 caller of `byWilaya` or `findByPostalCode` who imports from the root now gets v2
shapes rather than a deprecation warning. That is ADR-001's trade taken to its conclusion, and it
is the same one-line fix as every other v1 call site: import from `/legacy`.

---

## ADR-003 — Wilaya codes are numbers in TypeScript, padded strings in JSON

**Status:** accepted (v2.0.0)

v1's `code` was the padded string `"16"`. v2's `WilayaCode` is the **number union `1..69`**, with
the padded official form derived as `Wilaya.codeText`. The reform work was originally specified in
padded strings throughout, which would have introduced a second code namespace and forced callers
to bridge between `getWilaya(59)` and `resolveLegacyWilaya("59")`.

**Decision.** One namespace. The public reform API uses numbers like the rest of v2 —
`REFORM.newWilayas[0].code === 59`, `getWilaya(59)?.parentWilaya`, `resolveLegacyWilaya(68) === 17`,
`resolveCurrentWilaya(17)` → `[17, 68, 69]`. The hand-edited `data/raw/reform.json` keeps padded
strings, because that matches `data/algeria.json`'s own `code` field and the Journal Officiel's
notation; the build converts on emit.

**Migration trap worth repeating:** `` `${w.code}` `` yields `"1"` where v1 yielded `"01"` —
silently, and exactly where it matters (postal prefixes, plate numbers). Use `codeText`.

---

## ADR-004 — The nested daïra keeps its on-disk key order

**Status:** accepted (v2.0.0)

`packages/js/index.d.ts` declares `nb_communes` **before** `communes` on the nested `Daira`;
`data/algeria.json` on disk has `communes` **before** `nb_communes`. Only one can be reproduced by
the legacy projection.

**Decision.** On-disk order wins. The binding constraint is that
`JSON.stringify(legacy.getAll())` must equal the contents of `data/algeria.json` byte for byte —
`data/*.json` is a published contract consumed over jsDelivr and by the jq, Python and Java
examples in the README, and people do serialize these records. A TypeScript interface imposes no
runtime key order, so nothing is lost by declaring one order and emitting the other. A deep-equality
test pins it so it cannot drift.

---

## ADR-005 — The 58→69 parent mapping ships unfilled, and the derived API throws

**Status:** accepted (v2.0.0)

Loi 26-06 (JO n°25, 5 April 2026) raised Algeria from 58 to 69 wilayas. The transfer of powers is
progressive through 2026-12-31, so both maps are operationally live and consumers need to translate
between them. **But the *wilaya mère* mapping does not exist anywhere in the dataset** — verified by
exhaustive key search: zero `mere`/`parent`/`legacy`/`ancien`/`rattach`/`delegue` keys at any
nesting level in `data/algeria.json`.

Two derived signals exist and they **contradict each other**. Postal-code prefixes (the communes of
the new wilayas still carry their old prefixes) and shared daïra names corroborate on 3 of 11 rows,
disagree on 2, and say nothing about the other 6. Neither is a source.

**Decision.** `data/raw/reform.json` ships with all 11 `parentCode` values `null`, every `source`
`null`, every `confidence` `"unverified"`. The whole pipeline, types, API and build gates ship;
**zero guessed values ship.** The maintainer fills it from the text of the law, one line at a time,
each with a citation. Repo invariant #2 — *never invent a data record* — applies: the parent mapping
**is** a data record, and it **is** missing.

Getting this wrong is worse than shipping nothing. A wrong `parentWilaya` silently misroutes real
postal mail and real government paperwork, with the full authority of a package that advertises
itself as handling the transition correctly.

**Consequences, all deliberate:**

- `REFORM` is **always exported and always readable**, including `mappingComplete: false`. Reading
  the law reference and the dates must never throw — those facts are known.
- `parentWilaya` is **absent** on codes 1–58 and **present and `null`** on 59–69. *`undefined` means
  the question does not apply; `null` means the question applies and we do not yet know the answer.*
  It is a field read, not a lookup, so it does not throw.
- `resolveLegacyWilaya`, `resolveCurrentWilaya` and any `asOf: "58"` call throw
  `ReformMappingUnavailableError` — they are **exported unconditionally** and refuse to answer,
  rather than being omitted. A conditionally-present export would make the emitted `.d.ts` differ
  between a filled and an unfilled checkout, so `tsc`, `publint` and `attw` would give different
  results from the same source tree; and filling the mapping would then make the API *appear* in a
  patch release. This does not contradict the "a miss returns `T | undefined`" invariant: a miss is
  *"you asked a valid question and the answer is nothing"*; this is *"the library cannot answer at
  all"* — and encoding it as `undefined` would make it indistinguishable from **"no parent"**, the
  precise wrong answer being guarded against.
- The postal-prefix cross-check is a **build warning that can never fail the build.** The prefix
  disagrees with the commune's own wilaya code for **94 of 1408** communes in wilayas 1–58 —
  **6.7 %** — on data we know is correct. A rule that wrong cannot be an assertion: the first
  maintainer to enter a correct-but-prefix-divergent value would be told by a red CI run that the
  Journal Officiel is wrong. There is deliberately no flag that turns it into a hard failure.

**Two gaps in this argument, recorded rather than glossed:**

- **The "red CI run" above does not exist yet.** `.github/workflows/ci.yml` runs `jq`,
  `check-jsonschema` and `scripts/validate.py` only — there is no Node job, so `pnpm build:data`,
  the R1–R5 assertions, the test suite and the `data/` byte-identity gate are all **local-only**
  today. The schema step added alongside this ADR does *not* close the gap: a filled
  `"parentCode": "03"` is schema-valid, because the schema checks shape, not provenance. Session 6
  owns the CI matrix; until it lands, the assertions gate a developer's machine and a reviewer's
  attention, not a pull request.
- **`/legacy` is not resolvable yet.** `packages/js/package.json` still exports only `"."` and
  `"./data/*"`. Every `@deprecated` tag and every sentence above points at
  `algeria-wilayas-communes/legacy`, which currently throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Session 4 assembles the `exports` map and the dual build; the source, the tests and the
  guarantees are in place ahead of it.

---

## ADR-006 — One canonical example across all documentation

**Status:** accepted (v2.0.0)

**Decision.** Every `@example`, doc snippet and illustrative test uses one dataset row: wilaya
**19** Sétif (`codeText` `"19"`, 20 daïras, 60 communes), daïra **`"19-ain-azel"`** (Ain Azel, 4
communes), commune **`"19-ain-azel-ain-lahdjar"`** (Ain Lahdjar), postal code **`"19018"`**.

A reader learns the shape once. Mixed examples make every module look like a different dataset.

Four exceptions stay, because in each the specific value *is* the fact being shown: the frozen v1
README examples (`16`, `"16000"`, `"adrar"`), which are pinned as tests; `16` → `Algiers`, the only
record in 2201 where `nom_en !== nom_fr`; `6` → `codeText` `"06"`, which is why `codeText` exists;
and the reform API, where `parentWilaya` only exists on codes 59–69 and `68`/`69` under `17` Djelfa
is the one candidate row showing a single mère splitting into two — the reason
`resolveCurrentWilaya` returns an array.

---

## ADR-007 — Supplying a `parentCode` is what costs a citation

**Status:** accepted (v2.0.0) — closes a hole in ADR-005

The first implementation gated only on `confidence`: a row claiming `"confirmed"` had to carry a
`source` and a `parentCode`. That is one-directional, and the hole it left is the exact one the
design exists to close. `parentWilaya` is a **plain field read** on the `Wilaya` record — it does
not consult `confidence`, it does not throw, and it is served to every consumer the moment a
non-null `parentCode` is emitted, even while `mappingComplete` is still `false` and both resolvers
are still refusing to answer.

A row left mid-transcription as `{ parentCode: "03", source: null, confidence: "unverified" }`
therefore built clean and shipped `getWilaya(59).parentWilaya === 3` — a guess, carrying the full
authority of a package that advertises itself as handling the transition correctly. Reproduced
before fixing. The postal-prefix warning (W1) cannot catch it either: a guess taken *from* the
postal prefix agrees with the postal-prefix cross-check by construction, so W1 stays silent on
precisely the case that matters.

**Decision.** The rule is symmetric. Supplying a parent is the act that requires the citation, not
labelling it `"confirmed"`: a non-null `parentCode` must carry a non-empty `source` and a
`confidence` other than `"unverified"`. Together with the original check, a value can only reach
`parentWilaya` sourced.

This also matters because the "all 11 are still null" tripwire in `tests/reform.test.ts` is
expected to be rewritten by the very commit that fills the first row. After that commit the build
assertions are the only thing standing between rows 2–11 and a guess.

---

## ADR-008 — Inlined TS literals cost ~4.7× `JSON.parse`; the fix is deferred

**Status:** accepted (v2.0.0) — the measurement is binding, the remedy is not taken yet

Sessions 2, 4 and 6 all assert, in prose, that v2 "kills the 1.10 ms first-call parse" because
inlined TypeScript constants are evaluated by the JS engine during module evaluation rather than by
a `JSON.parse`. **Measured, that is backwards.**

Isolated, both payloads pre-read into memory, no disk I/O in the timed region (Node v22.18.0):

| | bytes | cost |
|---|---|---|
| `JSON.parse(communes.json)` | 559,881 | ~1.3 ms |
| evaluating the `COMMUNES` literal | 237,041 | ~6.0 ms |

The JS literal is **less than half the bytes** and still costs **4.5–4.9×** more. V8's JSON parser
is specialised; object-literal compilation is not.

End to end, from `pnpm bench` on this checkout — cold is import + first call, reported separately
because v1 and v2 pay it in different places:

| op | v1 import | v1 first | **v1 total** | v2 import | v2 first | **v2 total** |
|---|---|---|---|---|---|---|
| `getWilayas()` | 1.92 | 0.12 | **2.04 ms** | 7.54 | 0.11 | **7.65 ms** |
| `getCommunes()` | 1.89 | 3.49 | **5.38 ms** | 7.43 | 0.04 | **7.48 ms** |
| `getAll()` | 1.90 | 1.96 | **3.85 ms** | 7.46 | 1.30 | **8.76 ms** |
| `findByPostalCode()` | 1.92 | 3.65 | **5.57 ms** | 7.68 | 0.38 | **8.05 ms** |
| `findCommune()` | 1.92 | 3.66 | **5.58 ms** | 7.69 | 1.23 | **8.93 ms** |

**v2's cold path is slower in every row**, and worst where v1 was fastest — `getWilayas()` costs
3.7× more, because v1 parsed only the 13 kB wilaya file while v2 evaluates the whole 578 kB bundle
whatever you asked for.

**Decision.** Publish the regression. `benchmarks/run.mjs` reports both halves of the cold cost and
the honest total; session 6's README table shows this direction, not the spec's. The size budgets in
`.size-limit.js` are seeded from measurement for the same reason: normalizing the records cut the
**raw** payload 59 % (559,881 → 229,334 B) but gzip had already collapsed the denormalized
repetition, so the **compressed** size moved by +1.7 %. The spec's "−41 % on communes" and its
26 KB floor do not exist.

**What v2 actually won** — all still true, all worth publishing:

- warm `findByPostalCode` **5.92 µs → 0.032 µs (~185×)**, and O(1) instead of O(n), so it stays flat
  inside a consumer's loop;
- it runs in a browser, a Worker, Deno and React Native **at all**, which v1 cannot — no exports-map
  trick fixes `node:fs`, only removing the filesystem read does;
- the metadata split: a wilaya `<select>` costs **2.36 kB** gzip instead of 96.9 kB.

**The remedy, measured and deliberately not taken in this session.** Emitting
`export const COMMUNES = JSON.parse('[…]')` is the documented V8 technique that would recover the
cold path while keeping fs-free portability. It is not free, and both costs are now measured rather
than estimated:

- **Types.** `JSON.parse` returns `any`, so the `as const` literal types disappear. Viable for
  `COMMUNES` and `DAIRAS` with an explicit annotation; **not** for `WILAYAS`, on which `WilayaCode`
  and `NameOf<C>` narrowing depend.
- **Bytes.** It is *larger*: for `COMMUNES`, 46,896 B gzip today as a minified object literal versus
  **49,120 B** as a `JSON.parse` string — a 4.7 % increase, ~2.2 kB, traded for the cold win.

A third option is better on both axes and was not in the spec at all: a **tuple encoding** drops the
repeated keys entirely and measures **41,043 B** gzip, −12.5 % against today *and* a smaller literal
to evaluate. It costs a hand-written row-to-record mapping and changes what `generated/*.ts` looks
like.

Deferred because this session's subject is packaging, and any of the three touches
`scripts/build-data.ts` — the byte-gated emitter behind sessions 2 and 3 — and re-opens every
integrity assertion and the `--check` output contract. **Whichever is chosen needs its own session
and its own ADR.** What is not acceptable is repeating the original claim: it is exactly the kind of
assertion a sceptical reader benchmarks and catches, which the spec itself warns about for the warm
path.

---

## ADR-009 — Three standalone tier entries; `/lite` is not shipped

**Status:** accepted (v2.0.0)

The metadata split (`/wilayas`, `/dairas`, `/communes`) is the headline of the packaging work: a
developer rendering a wilaya `<select>` should download 69 records, not 1541 communes. Two decisions
were forced while implementing it.

**1. The tiers are standalone, not re-exports of `api.ts`.**

Re-exporting looked obvious and is wrong. `api.ts`'s `getWilayas(opts?: AsOfOptions)` calls
`wantsLegacyView(opts)` from `asof.ts`, which imports `generated/communes`. The reference is
unconditional in the module graph even though the *call* is conditional, so **no bundler may drop
it**. Measured: importing `getWilayas` alone from the root is **64.7 kB** gzip; `/wilayas` is
**2.36 kB**. `.size-limit.js` keeps both rows precisely so that comparison cannot rot.

Proven on bytes rather than inferred from the totals — an esbuild bundle of nothing but
`import { getWilayas }`:

| bundle | gzip | corpus-only key `"abelsa"` | commune id `19-ain-azel-ain-lahdjar` |
|---|---|---|---|
| root, full API | 96.9 kB | present | present |
| root, `getWilayas` only | 64.8 kB | **shaken out** | **still present** |
| `/wilayas`, `getWilayas` only | 2.1 kB | absent | absent |

So tree-shaking is working — it removes the 4402-key search corpus and the reform resolvers — and it
still cannot remove the commune table, because `asof.ts` references it unconditionally. The 30×
difference between rows two and three is the entire case for the split.

So `src/tiers/{wilayas,dairas,communes}.ts` reimplement their tier over the generated data, behind
thin entry barrels. `tsup`'s `splitting: false` already gives every entry its own copy of everything,
so the duplication costs nothing a shared chunk would have saved. **Given up:** each tier omits
`asOf` (derived over commune re-attribution) and `/communes` omits name search (the normalized
corpus is 109 kB, larger than the commune records). Both live at the root. `tests/entries.test.ts`
pins every overlapping function deeply equal to the root's, because two implementations that
silently diverge is the real cost of this shape.

**2. `/lite` is not shipped.** Seven subpaths, not eight.

The spec describes `/lite` as codes + `fr` names only, dropped from `/communes` by tree-shaking with
`treeshake: true`. **Rollup cannot do that.** Tree-shaking removes unreachable bindings; it cannot
remove `ar` and `en` *properties* from a frozen `as const` array of object literals. `/lite` would
need its own generated data module and a new phase in `scripts/build-data.ts` — the byte-gated
emitter, with 20 integrity assertions and an 80-output `--check` contract.

The spec itself already asks whether `/lite` earns a permanent place, and this session supplies the
number that answers it: at **2.36 kB**, `/wilayas` is roughly a fifth of `/lite`'s projected
12,577 B, and `/lite`'s stated use case is "I only need names for a dropdown". **Removing an export
before 2.0.0 costs nothing; after, it costs a major.** So it is not shipped, and session 6 owns the
cut-down pass with the measurement in hand.


## Recorded, deliberately not fixed

- **`DairaFlat` has no `wilaya_ar`** (8 fields) while `CommuneFlat` does (12). Almost certainly an
  oversight in the original `jq` filter that generated `data/dairas.json`, but that file is a
  published contract. Adding the field would change what `getDairas()` returns. **Candidate v3 data
  break**; needs its own ADR before v3.
