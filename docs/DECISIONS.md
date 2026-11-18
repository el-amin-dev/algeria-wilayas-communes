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
  `check-jsonschema` and `shared/validate.py` only — there is no Node job, so `pnpm build:data`,
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
record in 2176 where `nom_en !== nom_fr`; `6` → `codeText` `"06"`, which is why `codeText` exists;
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

> **Re-measured in session 6** (2026-08-31, Node v22.18.0), and the conclusion is unchanged. The
> figures below are session 4's run and are kept as the record of what this decision was made on;
> the numbers the READMEs publish come from the later run and differ only by benchmark variance:
> warm `findByPostalCode` **5.847 µs → 0.031 µs (188.6×)**, root full API **96.92 kB**, and a cold
> path **1.5–3.3×** slower rather than 1.4–3.7×. If the two ever disagree by more than noise, the
> READMEs are the ones that must be right, and this ADR is the thing to re-open.

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

So tree-shaking is working — it removes the 4352-key search corpus and the reform resolvers — and it
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


---

## ADR-010 — The cross-language contract is a tier, not a paragraph

**Status:** accepted (v2.0.0)

Two packages describe one dataset. Until now, what they had to agree on lived in three places and
none of them was checkable: the slug rule only in `scripts/build-data.ts`, the normalization rule
only in `packages/js/src/normalize.ts`, and the measured ground truth only in a git-excluded design
document. Porting to Python meant reimplementing all three **by hand, from prose**.

That failure mode is silent. Two normalizers that drift do not crash and do not fail a type check —
every lookup simply misses, and neither test suite notices because each only ever checks itself.

It is not hypothetical. The design document described the slug rule the way it reads in prose:
lowercase, strip accents, drop apostrophes, turn separators into hyphens, collapse, trim. That is
the real rule minus one step — dropping everything outside `[a-z0-9-]` *after* the whitespace pass.
Implemented from that description, two real records come out wrong:

| Record | From the prose | Correct |
|---|---|---|
| `B. B. Arreridj` | `b.-b.-arreridj` | `b-b-arreridj` |
| `Z'barbar (El Isseri )` | `zbarbar-(el-isseri-)` | `zbarbar-el-isseri` |

Two ids in 2107. Nothing crashes, no test fails on its own, and a consumer joining the npm and PyPI
datasets on `id` gets two silent mismatches.

**Decision.** `shared/` is a first-class tier, in three layers:

| Layer | What it is | What it catches |
|---|---|---|
| `shared/contract/*.md` | the rules, and **why** each is the way it is | a reader reimplementing from a misunderstanding |
| `shared/fixtures/*.json` | generated by `build-data.ts`, read by **both** suites | a divergence, in either language, on any covered input |
| `tests/shared-fixtures.test.ts` | asserts the fixtures describe the real shipped API | a fixture hand-edited to make a test pass |

The fixtures are ordinary build outputs — written by `pnpm build:data`, verified by `--check`, swept
for orphans — so a behaviour change that is not reflected in them fails the build. `ids.json` is the
exhaustive slug proof (all 2107). `normalize.json` carries named edge cases plus a SHA-256 of the
sorted key set, so a port can prove all 4352 keys match without shipping a second copy of them.
`search.json` records full ordered results with scores for 35 queries.

`schema/` and `scripts/validate.py` moved into the tier as well, since both were already
language-neutral. `validate.py` moved **byte-identically**, so the standing invariant that it is a
deliberately independent second opinion in another language survives untouched.

**It paid for itself immediately.** The Python port was written against the fixtures and matched on
the first run: 2107 ids, 4352 keys by digest, and all 35 search cases including scores and ordering.

**Given up:** `build-data.ts` now owns files outside `packages/js`, and its `main()` had to become
async — the search fixture is produced by running the real `search()`, which reads the generated
keys, so it must be imported *after* they are written or it would record the previous build.

---

## ADR-011 — The Python root is v2; three v1 names are shimmed; `legacy` holds all seven

**Status:** accepted (v2.0.0) — the Python counterpart of ADR-001 and ADR-002

The same collision as JavaScript, with the same cause: `get_wilayas`, `get_dairas`, `get_communes`
and `find_by_postal_code` exist in both v1 and v2 with different return types, and **a Python module
can bind a name once.** The session spec claimed all seven v1 functions would sit at the top level
beside the v2 API, which is not expressible.

**Decision.** Mirror ADR-002 exactly:

- Those four names mean **v2** at the root — tuples of frozen dataclasses.
- The three v1 names v2 never claimed — `get_all`, `by_wilaya`, `find_commune` — stay at the root
  and emit `DeprecationWarning` with `stacklevel=3`, so the warning points at the caller's line
  rather than at the shim.
- `algeria_wilayas_communes.legacy` exports all seven, in v1 dict shapes, **warning-free**, so a
  consumer who is not ready to migrate pins the old contract with one import change instead of
  suppressing `DeprecationWarning` globally and losing the signal everywhere else.

Both the shims and `legacy` are removed in v3, on the same schedule as the JavaScript side — the two
publish on the same `v*` tag, so the version they name must match.

`find_commune` keeps v1's body in both places: French `nom_fr` substring, `.lower()` on both sides,
unranked, unlimited, `list[dict]`. Routing it through `search()` would change the order, the length
and the element type of a list existing code already iterates and slices — a silent breakage dressed
up as an upgrade.

**One deliberate divergence from v1.** The legacy functions return copies. v1 handed out the live
`lru_cache`d objects, so `get_communes().clear()` permanently corrupted the dataset for every other
consumer in the process. Preserving a hazard is not compatibility worth keeping, and only legacy
callers pay the copy — the v2 API gets the same guarantee for free from frozen dataclasses in tuples.

---

## ADR-012 — `Wilaya.parent_wilaya` is two-state in Python, three-state in TypeScript

**Status:** accepted (v2.0.0)

TypeScript distinguishes three states on `parentWilaya`: **absent** for wilayas 1–58, which have no
parent at all, and **present-and-null** for 59–69, whose parent exists but is not yet published.
That distinction is real and load-bearing — "there is no answer" is not "we do not know the answer."

A frozen dataclass cannot omit a field. Reproducing three states in Python would need a sentinel
object, which then leaks into every type signature, every `repr`, and every consumer's `if`.

**Decision.** `parent_wilaya: int | None`, `None` in both cases. The "absent" state is recovered
exactly by `code <= 58`, which is not a heuristic — it is the definition, since Loi 26-06 created
precisely 59–69. A test pins the equivalence so it cannot rot.

**Given up:** a Python caller cannot tell the two states apart from the field alone and must compare
the code. Given that `REFORM.mapping_complete` is the documented way to ask "is the mapping
available?", and it is `False` today for every one of the 11, nothing real is lost.

---

## ADR-013 — The PyPI wheel ships a sanitized `reform.json`

**Status:** accepted (v2.0.0) — refines ADR-005

ADR-005 refuses to publish the unverified candidate mères, and `publish-npm.yml` enforces it by
deleting `data/raw/` before packing. `publish-pypi.yml` copies all of `data/` and **was shipping
them**: the stub's 11 `todo` strings spell out a postal-prefix candidate for each new wilaya.

Python cannot simply drop the directory the way npm does. By PY-D2 there are no generated `.py` data
literals, so `_reform.py` reads `data/raw/reform.json` at run time; deleting it would mean a filled
mapping never reaches PyPI users at all.

**Decision.** The publish workflow **sanitizes** rather than deletes: `en-overrides.json` is removed
(the one exonym is derived from the data at index time and the file is not needed at run time), and
`reform.json` is rewritten without its `todo` and `$comment` keys. The wheel carries the mapping
machinery and the metadata, and none of the guesses.

A disclaimer attached to a guess is still a guess once it is inside a package, which is the whole
point of ADR-005.

---

## ADR-014 — `requires-python` was a lie; the floor is 3.9

**Status:** accepted (v2.0.0)

The Python package declared `requires-python = ">=3.8"` while its loader was built on
`importlib.resources.files`, **added in 3.9**. pip honoured the declaration: on 3.8 the install
succeeded and the first call raised `ImportError: cannot import name 'files'`.

**Decision.** `>=3.9`, with per-version classifiers for 3.9–3.13 and a CI matrix that matches.
Declaring support for a runtime the code provably cannot run on is worse than dropping it — the
resolver now refuses the install and says why, instead of deferring the failure to import time.
Python 3.8 reached end of life in October 2024.

**`slots=True` was considered and rejected**, so nobody re-opens it. It is the shape the record
model wants, but it landed in `dataclasses` in 3.10. The memory it costs to go without is
**bounded** — 2176 records, so a `__dict__` per instance is a few hundred KB, noise beside the
parsed JSON already resident. The install-base cost of dropping 3.9 is *not* bounded: it is every
user on a distro Python. And `slots=True` is a pure optimization with no API effect, so it drops in
unchanged the moment the floor moves.


## ADR-015 — One `v*` tag publishes both registries; changesets versions but never publishes

**Status:** accepted (v2.0.0)

`.github/workflows/publish-npm.yml` and `.github/workflows/publish-pypi.yml` **both** trigger on
`push.tags: ["v*"]`. Pushing `v2.0.0` publishes `algeria-wilayas-communes@2.0.0` to npm **and**
`algeria-wilayas-communes==2.0.0` to PyPI, from the same commit, carrying the same `data/`. Versions
are locked in lockstep by construction, and neither workflow knows the other exists.

**That coupling is load-bearing and invisible in the YAML.** Adopting changesets — a tool whose
entire job is to compute versions and push tags — is exactly the change that breaks it silently.
This ADR records the shape chosen so it is not relitigated.

**Decision.** `@changesets/cli` owns the version number in `packages/js/package.json` and
`packages/js/CHANGELOG.md`, and nothing else. `.github/workflows/release.yml` runs
`changeset version` on `main` and opens a "chore: version packages" PR. It has **no `publish:`
input**. A human merges that PR and pushes the tag by hand; the tag is the only thing that publishes.

Three reasons, in the order they bind:

1. **The dataset is the product.** Someone comparing `algeria-wilayas-communes@2.1.0` on npm with
   `==2.1.0` on PyPI must be able to assume they hold the same 1541 records. A shared version number
   is the only thing that makes that promise visible from the outside. ADR-010 built the `shared/`
   tier to make the two implementations agree; this keeps the two *releases* agreeing.
2. **`packages/python` is not a pnpm workspace member**, so changesets cannot see it and could never
   publish it. Any design where changesets publishes npm directly needs a second, divergent path for
   PyPI — two release mechanisms for one release.
3. **The cost is accepted and named.** A JS-only fix bumps the Python package too and ships a
   version whose only change is the version. For a dataset library releasing a handful of times a
   year, that is cheaper than explaining a version skew to a user who found one.

**This is not hypothetical — the skew has already happened.** Checked against the live registries
while writing this ADR: npm carries `algeria-wilayas-communes@1.0.0` and PyPI carries `1.1.0`. Two
registries, one name, two different version numbers, and nothing in the repo noticed. A user who
pinned `1.1.0` in `requirements.txt` and `^1.0.0` in `package.json` believes they hold the same data
and cannot check. `v2.0.0` re-synchronizes them from one tag, and the header comment now in both
publish workflows is what stops it drifting again.

**Rejected: separate `js-v*` and `py-v*` tag prefixes**, with changesets publishing npm on merge and
PyPI triggered separately. It doubles the release ceremony, removes the same-number-same-data
guarantee, and requires editing the `on.push.tags` filter in **both** publish workflows — the exact
silent breakage this ADR exists to prevent. Revisit only if the JS and Python APIs genuinely diverge
in cadence, which after session 5 they do not.

Both publish workflows now carry a header comment naming the shared trigger and pointing here,
because the next person to edit one of them will not read this file first.

**Not changed:** `publish-pypi.yml` still authenticates with `PYPI_TOKEN` rather than Trusted
Publishing (ADR-013 has the reasoning and the three-step path back), and neither publish workflow
gets a `concurrency` block — cancelling a half-finished publish is how one registry ends up with a
version the other never receives. `ci.yml` does get one.

---

## ADR-016 — The pre-2.0.0 export-surface pass: one addition, three deliberate holds

**Status:** accepted (v2.0.0)

> Every exported symbol must be supported for the life of the major version. Adding an export is
> cheap today and expensive forever; **removing one is free today and costs a major after 2.0.0.**

The pass was run over the seven published subpaths (`.`, `/wilayas`, `/dairas`, `/communes`, `/zod`,
`/legacy`, `/data/*`), the 25 runtime exports of the root, its type exports, and the 30 names Python
exports. For each symbol: *who calls this, and what breaks if it is not there?* Outcome below —
recorded even where the answer was "keep", because a decision that is not written down gets
relitigated in six months by someone who does not know it was already made.

**1. `/lite` — already closed, stays closed.** ADR-009 settled it: Rollup cannot drop `ar`/`en`
*properties* from a frozen `as const` array, so `/lite` would need its own generated data module and
a new phase in `scripts/build-data.ts`. The measurement that answers the spec's own question is
`/wilayas` at **2.36 kB** gzip against `/lite`'s projected 12,577 B. Seven subpaths, not eight.

**2. `MatchedLang` is now exported — the one addition.** It appears in the public shape of
`SearchResult.matched`, so it is **already frozen for the life of the major** whether or not it has
a name: a consumer can reach it as `SearchResult["matched"]` today, and changing it would break them
either way. Exporting it therefore adds no liability that the structural position had not already
committed to; it only removes an inconsistency, since the exactly parallel `SearchKind` — a string
union in the public `SearchResult.kind` position — *was* exported. This is the whole reason the pass
happens before the tag: after 2.0.0 the inconsistency would be permanent.

**3. The five count constants stay unexported.** `WILAYA_COUNT`, `DAIRA_COUNT`, `COMMUNE_COUNT`,
`POSTAL_CODE_COUNT` and `MISSING_POSTAL_CODE_COUNT` exist in `generated/meta.ts` and are not
re-exported from any entry. They are **merely nice**: every one is a `.length` away
(`getWilayas().length`), and exporting them creates a second source of truth that can disagree with
the array it counts. `DATA_VERSION`, `SOURCE_LAW` and `LAST_VERIFIED` stay exported, because those
are *not* derivable from the data — they are the provenance claim itself. (Python does export the
counts, from `_constants.py`. The asymmetry is noted rather than fixed: removing them there would be
a break for a package whose README already documents them, and adding them to JS to match would be
adding five permanent exports to fix a cosmetic difference.)

**4. `getDaira(id)` keeps its missing `AsOfOptions` — deferred, not overlooked.** `getWilaya`,
`getCommune`, `getWilayas`, `getDairas` and `getCommunes` all take `opts?: AsOfOptions`;
`getDaira(id)` does not, so there is no way to ask for a daïra's re-attributed record by id even
though `getDairas({ asOf: "58" })` rewrites exactly that field. Held for three reasons: the path is
**unreachable today** — every `asOf: "58"` call throws `ReformMappingUnavailableError` while the
mapping is unfilled (ADR-005); the fix is not one line but a new lazy `daira58Idx` in `asof.ts`,
which changes the exact lazy-structure count that `pnpm bench:import` probes; and **adding an
optional parameter is a minor, not a major**, so unlike an export it loses nothing by waiting. It is
the one item on this list that is genuinely cheaper later.

**5. `/zod`'s `addressSchema` drag stays documented, not split.** `addressSchema` validates commune
membership, so it imports the commune tier, so a consumer importing only `postalCodeSchema` still
downloads the 1541-record table: measured **48.81 kB** against **48.93 kB** for the whole module —
importing one schema saves 0.12 kB. Splitting it would fix that and add a **permanent public
subpath**, which is a worse trade than a documented footnote for a module whose realistic consumer
wants `addressSchema` anyway. `.size-limit.js` keeps the row so the comparison cannot rot.

**Kept without change:** all seven subpaths; the two root v1 shims `getAll` and `findCommune`
(ADR-002); all eight v1 type names at the root, three of them aliased `V1*` (ADR-001); `/legacy`'s
default export; and `exports["./data/*"]`, which is byte-identical to v1 and serves consumers who
never touch npm at all.

## ADR-017 — npm publishes via Trusted Publishing; the token path never worked

**Status:** accepted (v2.0.0) — requires a one-time setup on npmjs.com before the first tag

`publish-npm.yml` no longer carries `NODE_AUTH_TOKEN`. It publishes with npm **Trusted Publishing**
(OIDC): the runner presents its GitHub identity, npm mints a short-lived credential, and no
long-lived secret exists to leak, rotate or expire.

**The evidence, because this was diagnosed rather than assumed.** From `gh run list` and
`gh api .../actions/secrets`, all 2026-07-21 UTC:

| time | event |
|---|---|
| 2026-07-20 23:49 | `NPM_TOKEN` created |
| 00:30 | tag `v1.0.0` → PyPI **published**, npm **failed** with `npm error code EOTP` |
| **00:59:04** | **npm 1.0.0 published by hand**, with an interactive OTP |
| 00:59:44 | `NPM_TOKEN` rotated, 40 seconds later |
| 01:08 | tag `v1.1.0` → PyPI **published (1.1.0)**, npm **failed with EOTP again** |

So the automated npm publish has **never once succeeded**. `1.0.0` on npm exists only because a
human ran `npm publish` locally. That is the whole mechanism behind the version skew ADR-015
records: PyPI advanced to 1.1.0 on the same tag that left npm at 1.0.0.

**Why rotating the token did not and could not help.** `EOTP` means npm demanded a one-time
password, which no unattended runner can supply. It is a property of the token's *type* and the
account's 2FA policy, not of its age — so a fresh token of the same kind fails identically. Reaching
for "the token must have expired" is the natural reading and it is wrong; the 90-day clock was never
the constraint. A third tag with a fourth token would have failed the same way.

**Why not simply a classic Automation token.** Those do bypass 2FA and would work today, but npm is
actively restricting 2FA-bypass tokens for publishing — the CLI prints the deprecation notice
unprompted. Choosing the mechanism being phased out, in the session whose subject is longevity,
would be the wrong trade for the sake of ten minutes.

**Costs, accepted.** Trusted publishing requires npm CLI **≥ 11.5.1**, which no Node release bundles
yet, so the workflow upgrades npm explicitly and asserts the floor — a clear failure at that step
beats an EOTP later that names the wrong cause. And it requires a **one-time setup on npmjs.com**
(package → Settings → Trusted Publisher → GitHub Actions, naming this repository and
`publish-npm.yml`). Until that exists the publish step fails loudly with an auth error rather than
publishing something wrong, which is the correct behaviour for an operation npm allows you to undo
for 72 hours and PyPI never lets you redo at all.

**The PyPI side is unchanged and still uses `PYPI_TOKEN`** (ADR-013), which has worked on both tags.
Moving it to trusted publishing is the same shape of change and is worth doing — but it needs its
own TestPyPI dry run first, and doing both in one release would mean neither registry had a proven
path. One at a time.

## ADR-018 — The daira layer carries a name-join artifact; the audit ships before the fix

**Status.** Accepted. Detector landed, corrections deferred to a dedicated release.

**Context.** `data/algeria.json` inherited its trilingual names and postal codes from the
community corpus `othmanus/algeria-cities`, joined on commune name. The ids contract already
establishes why that is dangerous: 1541 communes carry only 1500 distinct French names, and 566
(wilaya, daira) pairs carry only 545 distinct daira names (`shared/contract/ids.md`). A
name-keyed join against data that ambiguous does not fail loudly — it silently drags a
homonym's wilaya, daira and postal code across together.

`scripts/audit-postal-attribution.mjs` now looks for the two shapes that leaves behind.

**Detector 1 — foreign shared postal codes.** 36 communes in wilayas 01–48 carry a postal code
that is also held by a same-named commune in a different wilaya, with a prefix that is not their
own wilaya's. It is restricted to 01–48 on purpose: for wilayas 49–58 (Loi 19-12) and 59–69
(Loi 26-06) a foreign prefix is *correct*, because a wilaya carved out of an older one inherits
the parent's postal space and Algérie Poste has not renumbered. 164 rows there carry a foreign
prefix, and 14 of those also share their code, so they would match the full signature and be
reported as defects.

This supersedes part of `docs/DATA_PROVENANCE.md`. That document described all 94
prefix-divergent rows in wilayas 1–58 as "known to be correct" and used the 6.7% figure to
justify keeping the prefix cross-check a warning. The 58 rows in wilayas 49–58 do support that.
The 36 in 01–48 do not: **every one of them** correlates with a shared postal code, and in 30 of
the 17 shared codes every sharer carries the same name. That is not a coincidence, it is a join.

**Detector 2 — invented daira containers.** The expensive half. A daira holding exactly one
commune, whose name is also a daira of another wilaya where it is larger. 39 candidates. This
matters more than the postal codes because `commune id = <padded wilaya>-<slug(daira)>-<slug(commune)>`,
so an invented container mints a **wrong, stable, public id**.

Verified by hand against independent sources, two examples of each outcome:

| record | shipped | sourced | verdict |
|---|---|---|---|
| `Aïn El Turck`, Oran | daira `Bouira`, code `10033` | daira `Aïn El Turck`, code `31300` | defect |
| `El Marsa`, Alger | daira `El Marsa`, code `02015` | daira `Dar El Beïda`, code `16111` | defect |
| `Hammamet`, Alger | daira `Bir Mokadem`, code `12016` | daira `Chéraga`, code `16060` | defect |
| `Sidi Abderrahmane`, Tiaret | daira `Tenes`, code `02066` | daira `Aïn Kermes`, code `14028` | defect |
| `Sebdou`, Tlemcen | daira `Sebdou`, code `13006` | daira `Sebdou`, code `13006` | **correct** |

Oran is the clearest case: officially 9 daïras and 26 communes. We ship 10 daïras — the extra is
a one-commune `Bouira` — while Oran's real `Aïn El Turck` daïra sits at 3 communes instead of 4,
missing its own seat. Annaba is the same shape: 7 shipped where 6 is correct, and removing the
one-commune `El Eulma` yields exactly 6 daïras and 12 communes.

**Why detector 2 reports candidates and not defects.** Three different things produce that shape
and only one is a bug: a genuine phantom; a **reform split**, which `note_daira` in
`data/algeria.json` already documents as expected and which is exactly what `Sebdou` turned out
to be (its namesake in new wilaya 61 is the other half); and a genuine homonym, which is the
premise of the ids contract. Separating them needs an external source per record. A detector that
called all 39 defects would be wrong about at least one, and the project's governing rule is that
we do not guess.

**Decision: a correction LEDGER, not dozens of hand-edits.**

**26 of the 36 rows are now sourced and corrected.** The mechanism matters more than the
count:

- `data/raw/postal-corrections.json` holds one entry per correction, each carrying `dairaFrom`
  → `dairaTo`, `postalCodeFrom` → `postalCodeTo`, a **citation**, and a confidence. It is
  hand-maintained and never written by a generator, like `en-overrides.json` and `reform.json`.
- `scripts/apply-corrections.mjs` applies it to `data/algeria.json`, re-parenting the commune,
  deleting a container the move empties, and recomputing every denormalized counter. Idempotent,
  with a `--check` mode, and it also supports a **postal-only** correction where the daira is
  genuine (Ghardaïa's `Mansoura` is that case — officially spelled `Mansoura`, so our `Mansourah`
  is a transliteration variant and not a phantom at all).
- `scripts/build-data.ts` asserts **A21–A24**: each entry resolves to exactly one commune, in
  `dairaTo`, with `postalCodeTo`; `dairaFrom` no longer holds it and was not left empty; and
  every entry carries a source. The ledger is the specification, the data is the state, and the
  build fails in **either** direction. All four were verified by tampering.

**Why the correction goes into `data/algeria.json` rather than staying an in-memory overlay.**
That file is itself published — jq users and CDN consumers read it off jsDelivr. An overlay
applied only at build time would leave the packages right and the raw JSON wrong, with nothing
reporting the split.

**What changed.** 591 → **566** daïras: 25 invented one-commune containers removed. Communes
**unchanged at 1541** — nothing deleted, 25 records re-parented. Postal codes 1514 → **1493**.

The most telling number: **shared postal codes fell from 38 to 17.** More than half of what this
dataset documented as "codes shared by several communes" was not a feature of Algerian postal
geography at all — it was the join artifact. And **zero** codes are now shared by two communes of
the same wilaya.

Six wilaya daïra counts now match the official figures they previously contradicted:

| wilaya | shipped | now | official |
|---|---|---|---|
| 16 Alger | 15 | **13** | 13 |
| 31 Oran | 10 | **9** | 9 |
| 23 Annaba | 7 | **6** | 6 |
| 36 El Tarf | 9 | **7** | 7 |
| 38 Tissemsilt | 10 | **8** | 8 |
| 48 Relizane | 16 | **13** | 13 |

**`null` now has two causes, and the docs say which.** 27 communes were never published with a
code; **21 were withdrawn** because they shipped a code belonging to another wilaya's commune.
Only 5 corrections carry a sourced replacement code; the daira was sourceable far more often
than the code, because French Wikipedia's "Daïras de la wilaya de X" pages are systematic while
its commune infoboxes carry postal codes only sometimes.

Withdrawal was chosen over leaving a known-wrong value, and over inventing a plausible one. Two
withdrawals are deliberate retreats rather than absences: Alger's `Hammamet`, whose sourced
`16060` would have created the dataset's only same-wilaya shared code, and Mascara's `Ain Fares`,
whose source offers `29140` and `29530` and settles neither.

**Independently verified, and it changed the result.** All 26 entries were re-checked by a fan-out
of independent verifiers, each prompted to REFUTE rather than confirm.

**0 of 26 daïra verdicts were refuted.** The id-affecting half of this work — the half that is
permanent — is independently corroborated. That is the result worth having.

The postal half did not survive as well, and the failure mode is instructive. This column holds
**one numbering family**: 1470 of 1493 codes are `NN0xx`, the 23 exceptions being `NN1xx` clusters
in wilayas 05, 15, 16 and 19. Algeria also uses a 100-increment locality numbering — the family in
which Bouhadjar is `36300`, while this dataset records it as `36005`. Three codes written here came
from that other family, and each was the **only** non-`NN0xx` code in its whole wilaya: `31300`
(Aïn El Turck), `44240` (Aïn Soltane), `30120` (Aïn Beïda). All three are withdrawn.

The same test worked in the other direction, replacing two values that were wrong with two that
fit: `26036` for Ouled Brahim and `36011` for Aïn Kerma, the latter slotting exactly between this
dataset's Aïn El Assel `36010` and Asfour `36012`.

The lesson is a sourcing rule, now written into `docs/DATA_PROVENANCE.md`: a candidate code needs
an external citation **and** agreement with the family its wilaya already uses. "The prefix matches
the wilaya" is what produced the `36330` error and is not sourcing. Verifiers also proposed codes
for 13 of the withdrawals, mostly from aggregator lists; those are recorded in the ledger as
**leads**, not written, because supplying a value requires a citation.

**What is left, and it is a different shape now.** The audit reports **10** rows, down from 36 —
and **`PHANTOM_DAIRA` is 0**. Every invented container in wilayas 01–48 is gone; all 10 remaining
rows are `POSTAL_ONLY`, meaning the daïra is genuine and only the postal code came from a
homonym. That matters because `POSTAL_ONLY` rows do **not** affect ids: fixing them later is a
field correction, not a breaking change, so they no longer have to be done before v2.0.0.

Detector 2 still reports **15** container candidates, down from 39. Most sit in wilayas 49–69,
which detector 1 must exclude, and each still needs a source before it is called a defect — a
documented reform split looks identical, as `Sebdou` demonstrated. One known case is
`Souk El Had` in Relizane, inside a container named `Thenia` that Relizane does not officially
have; its real daïra is not yet sourced, so it is left alone.

A21 cannot be promoted to a hard failure on the artifact signature until the remaining 10 are
resolved.

## ADR-019 — The MCP server is its own package, and is NOT on the `v*` tag

**Status.** Accepted. Package built and tested; release path deliberately left open.

**Context.** An MCP server makes the dataset callable by an assistant instead of recalled by
one, which matters more here than for most data: a model asked about Algeria's wilayas answers
**58** with confidence, because that was true from 2019 until April 2026 and is what nearly
every page on the open web still says.

**Why not a second `bin` on `algeria-wilayas-communes`.** That was the cheaper option and it
was rejected. The library's **zero runtime dependencies** is a headline property — it is why it
works unchanged in a browser, a Worker, Deno and Bun, and `packages/python` goes as far as
hand-rolling a bounded Levenshtein rather than taking a fuzzy-matching dependency. The MCP SDK
would be that package's first `dependencies` entry, inflicted on every consumer who only wanted
`getWilaya(19)`. Implementing MCP by hand over stdio to keep the dep count at zero was also
considered — it is only JSON-RPC 2.0 and a short handshake — and rejected as the wrong place to
hand-roll: a protocol we do not own, whose spec moves, is exactly what a maintained SDK is for.

**Why it is not wired into `publish-npm.yml` / `publish-pypi.yml`.** Those both fire on `v*` and
publish npm and PyPI from the same commit, which is what makes "`algeria-wilayas-communes@2.1.0`
on npm and `==2.1.0` on PyPI hold the same 1541 records" true by construction (ADR-015). A third
artifact on that tag would either have to share the version — claiming a data version it does
not contain — or carry its own, which means the tag no longer identifies one version. Neither is
acceptable for a guarantee whose whole value is that it needs no checking.

So `packages/mcp` is a workspace member (unlike `packages/python`, which cannot be one), it
builds, lints, typechecks and is tested in CI, and it has **no automated publish**. Adding one
needs its own decision about tag naming — `mcp-v*` is the obvious shape — and that decision is
not made here.

**Testing.** `tests/mcp.test.ts` speaks newline-delimited JSON-RPC to the built artifact
directly rather than using the SDK's client. Using the SDK on both ends would test the SDK
against itself; framing the requests by hand proves the published server answers what a real
client sends. What it asserts is the part that rots silently: the six tool **names** (renaming
one breaks every already-configured assistant and nothing else in the repo would notice), their
**input schemas**, and the **guard rails in the descriptions** — which are not documentation but
the only text a model reads before deciding to call, and the single defence against it answering
from memory. A tidy-up that reworded them would pass every other test here.

**Cost, accepted.** A third package to keep in step, with no release automation, and the MCP
protocol version pinned by a dependency rather than by us.

## ADR-020 — Geospatial data is not shipped, and the blocker is the reform mapping

**Status.** Accepted. Measured, not assumed. Re-run `scripts/geo-feasibility.py` before
re-opening it.

**Context.** Coordinates and GeoJSON are the largest single gap against the competing packages.
`geoalgeria` ships them; this package does not. It was attempted.

**What is actually available.** geoBoundaries is the only open source of Algerian commune
boundaries with a usable licence: 1540 ADM3 polygons, OSM-derived, **CC BY-SA 2.0**. Two facts
about it decide everything that follows.

First, **ADM3 carries no wilaya attribute** — the properties are `shapeName`, `shapeISO` (empty),
`shapeID`, `shapeGroup`, `shapeType`. So a join has to go through the commune *name*, which is the
exact failure mode ADR-018 is about. Measured: 1134 of 1541 communes would match 1:1 by name, and
**97 are ambiguous** — and they are the same names that were already corrupted once (`El Marsa`
×3, `Larbaa` ×3, `Timezrit` ×2, `El Hassi` ×2, `Sidi Abderrahmane` ×2). A 74% join that silently
misplaces those is worse than no geometry, because a wrong polygon draws a commune in the wrong
part of the country and looks authoritative doing it.

Second, **ADM1 is the pre-2019 48-wilaya map.** Not 58, and certainly not 69.

**What was tried, and it works better than expected.** Assign every ADM3 polygon to a wilaya by
point-in-polygon against ADM1, then match on `(wilaya, name)` instead of name alone. That
**removes ambiguity entirely: 97 → 0.** Every one of the 1509 named polygons gets a unique
`(wilaya, name)` key, because an Algerian place name repeats *across* wilayas but never *within*
one — the same property the ids contract is built on (`shared/contract/ids.md`).

So the technique is sound. The coverage is not:

| band | matched | unmatched |
|---|---|---|
| wilayas 01–48 | 1025 / 1375 (**74.5%**) | 350 |
| wilayas 49–69 | 0 / 166 (**0.0%**) | 166 |

**The 0% is the decisive number, and it is structural.** ADM1 predates both reforms, so a commune
now in wilaya 49–69 lands inside its **parent** wilaya — and which parent that is, is precisely the
58→69 mapping this project refuses to guess (ADR-005). Geospatial coverage for the eleven new
wilayas is therefore **blocked on the same unsourced mapping**, not on effort. That connection was
not obvious before measuring it, and it is the reason this is not a quick win.

The remaining 350 in band 01–48 are transliteration differences between OSM and this dataset
(`Aïn` vs `Ain`, hyphenation, `El`/`Al`). Closing them means fuzzy matching, which is how the
original artifact got in.

**Decision.** Ship no geometry yet. Specifically rejected: a name-only join (misplaces 97 records),
and a 66.5% spatially-matched set shipped as-is (leaves the eleven newest wilayas — the package's
headline differentiator — with no geometry at all, which is the worst possible place to have a
hole).

**When it becomes worth doing**, the shape is already known:
- Source the reform parent mapping (ADR-005). That unlocks the 49–69 band and is the gating item.
- Use spatial-then-name matching, never name alone. Record a per-record `confidence` and commit
  the match report. Unmatched stays `null`.
- Dissolve commune polygons by **our** `wilaya_num` to derive wilaya boundaries. Never take
  upstream ADM1 wilaya shapes: they are 48 units, so this dissolve is the only route to a
  69-wilaya boundary set, and that set would not exist anywhere else.
- **Licence isolation is mandatory, not tidiness.** CC BY-SA 2.0 is share-alike. It cannot sit in
  this repo's CC0 data or in the npm package. It needs its own package and its own `LICENSE`, and
  centroids derived from those polygons inherit the same obligation — so the plan's original idea
  of putting centroids in the main CC0 package does not survive contact with the licence.

**Cost, accepted.** The package stays names-and-postal-codes while competitors ship maps. In
exchange it does not ship 97 knowingly-misplaced polygons three days after fixing 26
knowingly-misattributed postal codes.

## Recorded, deliberately not fixed

- **`DairaFlat` has no `wilaya_ar`** (8 fields) while `CommuneFlat` does (12). Almost certainly an
  oversight in the original `jq` filter that generated `data/dairas.json`, but that file is a
  published contract. Adding the field would change what `getDairas()` returns. **Candidate v3 data
  break**; needs its own ADR before v3.
