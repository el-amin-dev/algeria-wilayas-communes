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

## Recorded, deliberately not fixed

- **`DairaFlat` has no `wilaya_ar`** (8 fields) while `CommuneFlat` does (12). Almost certainly an
  oversight in the original `jq` filter that generated `data/dairas.json`, but that file is a
  published contract. Adding the field would change what `getDairas()` returns. **Candidate v3 data
  break**; needs its own ADR before v3.
