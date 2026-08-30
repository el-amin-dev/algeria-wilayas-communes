/**
 * `algeria-wilayas-communes` — the v2 public entry point.
 *
 * Every public symbol is listed here **by hand**. There is no `export *`, no
 * barrel over `generated/`, and no default export. Three reasons, all load-bearing:
 *
 * 1. A hand-written surface is something a bundler can bite on. `export *`
 *    forces a tree-shaker to keep the whole namespace alive.
 * 2. The debug hooks — `__indexState`, `__searchState`, `__searchStats` — are
 *    exported from their own modules and re-exported by nothing, so they vanish
 *    from `dist/` entirely. The API-surface meta-test pins that they never leak.
 * 3. No default export means `import dz from "algeria-wilayas-communes"` fails
 *    loudly at ESM link time, rather than silently handing back v2 objects whose
 *    `.nom_fr` reads `undefined`. v1 had a default export; that is a deliberate
 *    break, and session 6's migration guide names it.
 *
 * Nothing in the import path of this module builds an index. The only top-level
 * statements with an effect in the whole library are the three `Object.freeze`
 * calls in `api.ts`.
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
export { DATA_VERSION, LAST_VERIFIED, SOURCE_LAW } from "./generated/meta";

// --- Types -----------------------------------------------------------------
// `DairaSubtree` and `NameOf` are exported because they APPEAR in public
// signatures: `WilayaTree.dairas` is `readonly DairaSubtree[]`, and the
// narrowing overload of `byWilaya` returns `... & { name: NameOf<C> }`. Without
// them a consumer cannot write a function typed against what `byWilaya(19).dairas`
// actually yields. The `Object.keys(api)` surface test cannot catch this, because
// type-only exports are erased before it runs.
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
export type { SearchKind, SearchOptions, SearchResult } from "./search";
