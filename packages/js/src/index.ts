/**
 * `algeria-wilayas-communes` — the v2 public entry point.
 *
 * Every public symbol is listed here **by hand**. There is no `export *`, no
 * barrel over `generated/`, and no default export. Three reasons, all load-bearing:
 *
 * 1. A hand-written surface is something a bundler can bite on. `export *`
 *    forces a tree-shaker to keep the whole namespace alive.
 * 2. The debug hooks — `__indexState`, `__searchState`, `__searchStats`,
 *    `__asOfState`, `__reformState` and `__legacyState` — are exported from
 *    their own modules and re-exported by nothing, so they vanish from `dist/`
 *    entirely. The API-surface meta-test pins that they never leak.
 * 3. No default export means `import dz from "algeria-wilayas-communes"` fails
 *    loudly at ESM link time, rather than silently handing back v2 objects whose
 *    `.nom_fr` reads `undefined`. v1 had a default export; that is a deliberate
 *    break, and session 6's migration guide names it.
 *
 * Nothing in the import path of this module builds an index. The only top-level
 * statements with an effect in the whole library are `Object.freeze` calls: the
 * three on the bulk arrays in `api.ts`, and the ones that seal `REFORM` in
 * `reform.ts`. All are constant-time and allocate nothing; the invariant forbids
 * index construction on the import path, not a freeze.
 */

// --- Accessors and lookups -------------------------------------------------
export {
  byWilaya,
  findByPostalCode,
  findCommunesByName,
  getCommune,
  getCommunes,
  getCommunesOfWilaya,
  getDaira,
  getDairas,
  getDairasOfWilaya,
  getWilaya,
  getWilayas,
} from "./api";

// --- Runtime guards --------------------------------------------------------
export { assertWilayaCode, isPostalCode, isWilayaCode } from "./guards";

// --- Search ----------------------------------------------------------------
export { search } from "./search";

// --- The 2026 reform (Loi 26-06) -------------------------------------------
//
// `REFORM` is always readable — the law, the Journal Officiel issue and the
// three transition dates are known facts. The two resolvers and every
// `asOf: "58"` call THROW `ReformMappingUnavailableError` while the 58 → 69
// parent mapping is unfilled, rather than being conditionally absent: a
// data-dependent export would make the emitted `.d.ts` differ between a filled
// and an unfilled checkout, and a missing export fails at a distance as
// `TypeError: … is not a function`. Branch on `REFORM.mappingComplete`. The
// full argument is in `reform.ts`.
export {
  REFORM,
  ReformMappingUnavailableError,
  resolveCurrentWilaya,
  resolveLegacyWilaya,
} from "./reform";

// --- Deprecated v1 shims ---------------------------------------------------
//
// Only the two v1 names with no v2 counterpart at the root. `getWilayas`,
// `getDairas`, `getCommunes`, `byWilaya` and `findByPostalCode` belong to v2
// here (decision D5: the root is pure v2). The complete v1 seven, unaliased and
// untagged, live at `algeria-wilayas-communes/legacy`.
export { findCommune, getAll } from "./compat";

// --- Provenance and data holes ---------------------------------------------
//
// Provenance is EXPORTED, not merely documented: users of an administrative
// dataset get asked by compliance, legal and procurement teams to prove where
// the boundaries came from and as of when, and a constant they can log or assert
// on answers that in one line.
//
// `COMMUNES_MISSING_POSTAL_CODE` is the honest counterpart: the 27 commune ids
// with no published postal code, shipped as a list so a consumer needing
// complete coverage can see exactly which rows to handle. None of them may ever
// be filled by guessing from a neighbour or from the wilaya prefix.
export { COMMUNES_MISSING_POSTAL_CODE } from "./generated/communes";
export { isCommuneMissingPostalCode } from "./postal-holes";
// The five size constants were generated into `generated/meta.ts` from the
// start but never re-exported here, so they existed in Python and not in
// JavaScript -- an asymmetry llms.txt had to warn about rather than a real
// design choice. Exporting them costs nothing (they are inlined literals) and
// removes the warning.
export {
  COMMUNE_COUNT,
  DAIRA_COUNT,
  DATA_VERSION,
  LAST_VERIFIED,
  MISSING_POSTAL_CODE_COUNT,
  POSTAL_CODE_COUNT,
  SOURCE_LAW,
  WILAYA_COUNT,
} from "./generated/meta";

// --- Types -----------------------------------------------------------------
// `DairaSubtree` and `NameOf` are exported because they APPEAR in public
// signatures: `WilayaTree.dairas` is `readonly DairaSubtree[]`, and the
// narrowing overload of `byWilaya` returns `... & { name: NameOf<C> }`. Without
// them a consumer cannot write a function typed against what `byWilaya(19).dairas`
// actually yields. The `Object.keys(api)` surface test cannot catch this, because
// type-only exports are erased before it runs.
export type { MissingPostalCodeId } from "./postal-holes";
export type {
  Commune,
  Daira,
  DairaSubtree,
  NameOf,
  PostalCode,
  Wilaya,
  WilayaCode,
  WilayaTree,
} from "./types";
export type { MatchedLang, SearchKind, SearchOptions, SearchResult } from "./search";
export type { AsOf, AsOfOptions } from "./asof";
export type { Reform, ReformConfidence, ReformNewWilaya } from "./reform";

// --- v1 types, kept resolvable from the root -------------------------------
//
// A v1 consumer's `import type { CommuneFlat } from "algeria-wilayas-communes"`
// must keep resolving, so all eight v1 type names stay exported here.
//
// Three of them — `Commune`, `Daira` and `Wilaya` — collide head-on with v2's
// own type names, which are exported above. The collision is real, not an
// oversight, and it is resolved deliberately at exactly this line: the root is
// pure v2 (decision D5), so the unqualified names belong to v2 and the v1 three
// are aliased `V1*`. `algeria-wilayas-communes/legacy` exports all eight
// unaliased under their original names, which is where a consumer who wants the
// v1 `Wilaya` should import it from. The other five do not collide.
export type {
  Algeria,
  Commune as V1Commune,
  CommuneFlat,
  Country,
  Daira as V1Daira,
  DairaFlat,
  Wilaya as V1Wilaya,
  WilayaFlat,
} from "./legacy/types";
