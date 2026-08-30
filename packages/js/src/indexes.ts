/**
 * The lazy index layer.
 *
 * **The one invariant to re-read before touching this file: no index is
 * constructed at import time.** A consumer who calls only `getWilayas()` must
 * never allocate, ship or execute the commune index. Concretely that means
 * there is not a single top-level `const x = build()` below — every structure is
 * a module-scope `let … | undefined` plus its own builder, filled on first use.
 * A top-level build would make `"sideEffects": false` a lie, force Rollup and
 * esbuild to keep the builder and all the data it touches, and hand every
 * consumer the whole corpus. That is a hard failure, not a style preference.
 *
 * **Each structure gets its own `let` and its own builder.** There is
 * deliberately no `initAll()`: one entry point that fills everything re-couples
 * the nine structures and defeats the entire point of the split.
 *
 * Nine structures live here:
 *
 * | # | Name | Shape | Built by |
 * |---|---|---|---|
 * | 1 | `wilayaList` | `readonly Wilaya[]` (69, frozen) | `getWilayas()` |
 * | 2 | `wilayaIndex` | `Map<WilayaCode, Wilaya>` | `getWilaya()`, `search()` |
 * | 3 | `postalIndex` | `Map<string, readonly Commune[]>` | `findByPostalCode()` |
 * | 4 | `communeIndex` | `Map<string, Commune>` | `getCommune()` |
 * | 5 | `dairaIndex` | `Map<string, Daira>` | `getDaira()` |
 * | 6 | `nameIndex` | `Map<string, readonly Commune[]>` | `findCommunesByName()` |
 * | 7 | `communesOfWilayaIndex` | `Map<WilayaCode, readonly Commune[]>` | `getCommunesOfWilaya()` |
 * | 8 | `dairasOfWilayaIndex` | `Map<WilayaCode, readonly Daira[]>` | `getDairasOfWilaya()` |
 * | 9 | `treeCache` | `Map<WilayaCode, WilayaTree>` | `byWilaya()`, per wilaya |
 *
 * Two value-shape decisions that are easy to get wrong and silent when you do:
 *
 * - **The postal index value is an array, always.** 38 of the 1471 distinct
 *   codes are shared by more than one commune, so a `Map<string, Commune>`
 *   would drop records depending on insertion order, with no error anywhere.
 * - **The name index value is an array, always.** 38 commune names are
 *   duplicated across wilayas — `Sidi Ameur` in wilayas 32 and 64, `Souk El Had`
 *   in 35 and 48. Real data, not a bug.
 *
 * Nothing in this module is part of the public API. `index.ts` re-exports none
 * of it, which is what lets session 4's bundler drop `__indexState` from
 * `dist/` entirely.
 */

import { COMMUNES } from "./generated/communes";
import { DAIRAS } from "./generated/dairas";
import { WILAYAS } from "./generated/wilayas";
import { normalize } from "./normalize";

import type { WilayaCode } from "./generated/codes";
import type { Commune, Daira, DairaSubtree, Wilaya, WilayaTree } from "./types";

/**
 * Shared empty results for the plural lookups.
 *
 * Typed `readonly`, not frozen: freezing them would be two more top-level
 * statements with an effect, and the mutability contract for a `readonly T[]`
 * is the same one the records themselves carry (see `types.ts`).
 */
// Frozen, not merely typed `readonly`. `readonly` is erased at run time, and this
// single array is handed back by EVERY miss -- `findByPostalCode("99999")` and
// `findCommunesByName("Paris")` return the same object -- so one `push` from
// plain JavaScript would poison every future miss across both functions for the
// life of the process. `Object.freeze` on an empty literal is O(1) and allocates
// nothing, so it does not weaken the no-work-at-import-time invariant: that rule
// forbids INDEX CONSTRUCTION on the import path, not a constant-time freeze.
const NO_COMMUNES: readonly Commune[] = Object.freeze([]);
const NO_DAIRAS: readonly Daira[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// 1. wilayaList — the 69 public Wilaya wrappers
// ---------------------------------------------------------------------------

let wilayaListValue: readonly Wilaya[] | undefined;

/**
 * The 69 public {@link Wilaya} records: the generated shape plus the derived
 * `codeText`.
 *
 * `codeText` is derived here rather than shipped, because 69 zero-padded
 * duplicates of a number we already have is 69 strings of dead weight in every
 * bundle. The build asserted that the source's padded string agrees with the
 * number, so `String(code).padStart(2, "0")` is lossless.
 *
 * The array is frozen before publication — `getWilayas()` hands this exact
 * reference to every caller, and a plain-JavaScript consumer must not be able to
 * `push` into the shared list.
 *
 * @returns The 69 wilayas in dataset order (code ascending), frozen.
 */
export function wilayaList(): readonly Wilaya[] {
  if (wilayaListValue === undefined) {
    const out: Wilaya[] = [];
    for (const w of WILAYAS) {
      out.push({ ...w, codeText: String(w.code).padStart(2, "0") });
    }
    wilayaListValue = Object.freeze(out);
  }
  return wilayaListValue;
}

// ---------------------------------------------------------------------------
// 2. wilayaIndex — WilayaCode → Wilaya
// ---------------------------------------------------------------------------

let wilayaIndex: Map<WilayaCode, Wilaya> | undefined;

/**
 * `WilayaCode` → the public {@link Wilaya} record.
 *
 * Built over {@link wilayaList} rather than over `WILAYAS`, so the object a
 * lookup returns and the object inside `getWilayas()` are the **same
 * reference** — a search result's `wilaya` field costs nothing to attach.
 *
 * @returns The 69-entry code index.
 */
export function wilayaIdx(): Map<WilayaCode, Wilaya> {
  if (wilayaIndex === undefined) {
    const m = new Map<WilayaCode, Wilaya>();
    for (const w of wilayaList()) m.set(w.code, w);
    wilayaIndex = m;
  }
  return wilayaIndex;
}

// ---------------------------------------------------------------------------
// 3. postalIndex — postal code → communes
// ---------------------------------------------------------------------------

let postalIndex: Map<string, readonly Commune[]> | undefined;

/**
 * Postal code → every commune carrying it.
 *
 * The value is an array **always**. 1514 communes share 1471 distinct codes, so
 * 38 codes map to more than one commune; a single-valued map would drop the
 * losers silently. The 27 communes with `postalCode === null` are skipped — they
 * are listed by id in `COMMUNES_MISSING_POSTAL_CODE`.
 *
 * @returns The 1471-entry postal index.
 */
export function postalIdx(): Map<string, readonly Commune[]> {
  if (postalIndex === undefined) {
    const m = new Map<string, Commune[]>();
    for (const c of COMMUNES) {
      if (c.postalCode === null) continue;
      const bucket = m.get(c.postalCode);
      if (bucket === undefined) m.set(c.postalCode, [c]);
      else bucket.push(c);
    }
    // Freeze each bucket before publishing it. The value type is
    // `readonly T[]`, but `readonly` is erased at run time: without this, a
    // plain-JavaScript consumer can `push` onto -- or `length = 0` -- the array
    // handed back by the lookup and corrupt the shared index for every other
    // consumer in the process. That is precisely the v1 defect `api.ts` claims
    // to have closed, and the claim has to be true for the lookups as well as
    // for the three bulk accessors. Freezing inside the lazy builder costs
    // nothing at import time, so the no-work-on-import invariant is untouched.
    for (const bucket of m.values()) Object.freeze(bucket);
    postalIndex = m;
  }
  return postalIndex;
}

// ---------------------------------------------------------------------------
// 4. communeIndex — commune id → commune
// ---------------------------------------------------------------------------

let communeIndex: Map<string, Commune> | undefined;

/**
 * Commune id (`"19-ain-azel-ain-lahdjar"`) → commune.
 *
 * Single-valued, and provably safe to be: the composite ids were verified 100%
 * unique at build time (0 collisions over 1541 records).
 *
 * @returns The 1541-entry commune index.
 */
export function communeIdx(): Map<string, Commune> {
  if (communeIndex === undefined) {
    const m = new Map<string, Commune>();
    for (const c of COMMUNES) m.set(c.id, c);
    communeIndex = m;
  }
  return communeIndex;
}

// ---------------------------------------------------------------------------
// 5. dairaIndex — daira id → daira
// ---------------------------------------------------------------------------

let dairaIndex: Map<string, Daira> | undefined;

/**
 * Daïra id (`"19-ain-azel"`) → daïra.
 *
 * The id already *is* the composite `(wilaya, slug)` key — there are only 545
 * distinct daïra names for 591 daïras, which is precisely why the wilaya prefix
 * is baked into the id rather than left to the caller to assemble.
 *
 * @returns The 591-entry daïra index.
 */
export function dairaIdx(): Map<string, Daira> {
  if (dairaIndex === undefined) {
    const m = new Map<string, Daira>();
    for (const d of DAIRAS) m.set(d.id, d);
    dairaIndex = m;
  }
  return dairaIndex;
}

// ---------------------------------------------------------------------------
// 6. nameIndex — normalized commune name → communes
// ---------------------------------------------------------------------------

let nameIndex: Map<string, readonly Commune[]> | undefined;

/**
 * Normalized commune name → every commune with that name.
 *
 * Keyed on `normalize(name.fr)` **and** `normalize(name.ar)`, in the same map.
 * The two cannot collide: one key set is Latin, the other Arabic script.
 *
 * **Exact match only.** This answers "give me every commune whose normalized
 * name is exactly `ain lahdjar`". It does no prefix, substring or fuzzy work —
 * that is `search()`'s job, on a different structure entirely.
 *
 * The value is an array because 38 commune names are duplicated across wilayas.
 *
 * @returns The commune name index, roughly 3000 entries.
 */
export function nameIdx(): Map<string, readonly Commune[]> {
  if (nameIndex === undefined) {
    const m = new Map<string, Commune[]>();
    const add = (key: string, c: Commune): void => {
      const bucket = m.get(key);
      if (bucket === undefined) m.set(key, [c]);
      else bucket.push(c);
    };
    for (const c of COMMUNES) {
      add(normalize(c.name.fr), c);
      add(normalize(c.name.ar), c);
    }
    // Freeze each bucket before publishing it. The value type is
    // `readonly T[]`, but `readonly` is erased at run time: without this, a
    // plain-JavaScript consumer can `push` onto -- or `length = 0` -- the array
    // handed back by the lookup and corrupt the shared index for every other
    // consumer in the process. That is precisely the v1 defect `api.ts` claims
    // to have closed, and the claim has to be true for the lookups as well as
    // for the three bulk accessors. Freezing inside the lazy builder costs
    // nothing at import time, so the no-work-on-import invariant is untouched.
    for (const bucket of m.values()) Object.freeze(bucket);
    nameIndex = m;
  }
  return nameIndex;
}

// ---------------------------------------------------------------------------
// 7. communesOfWilayaIndex — WilayaCode → communes
// ---------------------------------------------------------------------------

let communesOfWilayaIndex: Map<WilayaCode, readonly Commune[]> | undefined;

/**
 * `WilayaCode` → every commune of that wilaya, in dataset order.
 *
 * @returns The 69-entry grouping; the union over all codes is 1541 communes.
 */
export function communesOfWilayaIdx(): Map<WilayaCode, readonly Commune[]> {
  if (communesOfWilayaIndex === undefined) {
    const m = new Map<WilayaCode, Commune[]>();
    for (const c of COMMUNES) {
      const bucket = m.get(c.wilaya);
      if (bucket === undefined) m.set(c.wilaya, [c]);
      else bucket.push(c);
    }
    // Freeze each bucket before publishing it. The value type is
    // `readonly T[]`, but `readonly` is erased at run time: without this, a
    // plain-JavaScript consumer can `push` onto -- or `length = 0` -- the array
    // handed back by the lookup and corrupt the shared index for every other
    // consumer in the process. That is precisely the v1 defect `api.ts` claims
    // to have closed, and the claim has to be true for the lookups as well as
    // for the three bulk accessors. Freezing inside the lazy builder costs
    // nothing at import time, so the no-work-on-import invariant is untouched.
    for (const bucket of m.values()) Object.freeze(bucket);
    communesOfWilayaIndex = m;
  }
  return communesOfWilayaIndex;
}

/**
 * Every commune of one wilaya, or the shared empty array on a miss.
 *
 * @param code - The wilaya code.
 * @returns The wilaya's communes, never `undefined`.
 */
export function communesOfWilaya(code: WilayaCode): readonly Commune[] {
  const hit = communesOfWilayaIdx().get(code);
  if (hit === undefined) return NO_COMMUNES;
  return hit;
}

// ---------------------------------------------------------------------------
// 8. dairasOfWilayaIndex — WilayaCode → daïras
// ---------------------------------------------------------------------------

let dairasOfWilayaIndex: Map<WilayaCode, readonly Daira[]> | undefined;

/**
 * `WilayaCode` → every daïra of that wilaya, in dataset order.
 *
 * @returns The 69-entry grouping; the union over all codes is 591 daïras.
 */
export function dairasOfWilayaIdx(): Map<WilayaCode, readonly Daira[]> {
  if (dairasOfWilayaIndex === undefined) {
    const m = new Map<WilayaCode, Daira[]>();
    for (const d of DAIRAS) {
      const bucket = m.get(d.wilaya);
      if (bucket === undefined) m.set(d.wilaya, [d]);
      else bucket.push(d);
    }
    // Freeze each bucket before publishing it. The value type is
    // `readonly T[]`, but `readonly` is erased at run time: without this, a
    // plain-JavaScript consumer can `push` onto -- or `length = 0` -- the array
    // handed back by the lookup and corrupt the shared index for every other
    // consumer in the process. That is precisely the v1 defect `api.ts` claims
    // to have closed, and the claim has to be true for the lookups as well as
    // for the three bulk accessors. Freezing inside the lazy builder costs
    // nothing at import time, so the no-work-on-import invariant is untouched.
    for (const bucket of m.values()) Object.freeze(bucket);
    dairasOfWilayaIndex = m;
  }
  return dairasOfWilayaIndex;
}

/**
 * Every daïra of one wilaya, or the shared empty array on a miss.
 *
 * @param code - The wilaya code.
 * @returns The wilaya's daïras, never `undefined`.
 */
export function dairasOfWilaya(code: WilayaCode): readonly Daira[] {
  const hit = dairasOfWilayaIdx().get(code);
  if (hit === undefined) return NO_DAIRAS;
  return hit;
}

// ---------------------------------------------------------------------------
// 9. treeCache — WilayaCode → WilayaTree, filled one wilaya at a time
// ---------------------------------------------------------------------------

let treeCache: Map<WilayaCode, WilayaTree> | undefined;

/**
 * The nested wilaya → daïras → communes view, built for **one** wilaya and
 * memoized.
 *
 * Deliberately not a single 69-wilaya tree built in one pass: `byWilaya(19)` is
 * a request for Setif, and materializing the other 68 subtrees to answer it
 * would allocate 591 daïra wrappers and 1541 commune references nobody asked
 * for. The cache is keyed per wilaya, so the second call for the same code is a
 * `Map` hit.
 *
 * @param code - The wilaya code to build the subtree for.
 * @returns The memoized subtree, or `undefined` if the code is not a real
 *   wilaya (reachable only from untyped JavaScript or a cast).
 */
export function tree(code: WilayaCode): WilayaTree | undefined {
  if (treeCache === undefined) treeCache = new Map<WilayaCode, WilayaTree>();
  const cached = treeCache.get(code);
  if (cached !== undefined) return cached;

  const wilaya = wilayaIdx().get(code);
  if (wilaya === undefined) return undefined;

  const byDaira = new Map<string, Commune[]>();
  for (const c of communesOfWilaya(code)) {
    const bucket = byDaira.get(c.daira);
    if (bucket === undefined) byDaira.set(c.daira, [c]);
    else bucket.push(c);
  }

  const dairas: DairaSubtree[] = [];
  for (const d of dairasOfWilaya(code)) {
    const communes = byDaira.get(d.id);
    /* v8 ignore next 2 -- the NO_COMMUNES arm is unreachable: every daira in the dataset
       has communeCount >= 1, so `byDaira` always has a bucket for it. */
    dairas.push({ ...d, communes: communes === undefined ? NO_COMMUNES : Object.freeze(communes) });
  }

  const built: WilayaTree = { ...wilaya, dairas: Object.freeze(dairas) };
  treeCache.set(code, built);
  return built;
}

// ---------------------------------------------------------------------------
// Debug hook
// ---------------------------------------------------------------------------

/**
 * Which of the nine lazy structures have been built.
 *
 * **Exported from this module only — never from `index.ts`.** Because session
 * 4's bundler config emits only the declared public entries, a symbol no public
 * entry re-exports is tree-shaken out of `dist/` entirely, and the API-surface
 * meta-test pins that it never leaks.
 *
 * It exists so the import-purity invariant can be *asserted* rather than
 * eyeballed: after importing the entry point and calling only `getWilayas()`,
 * `postal`, `commune` and `name` must all still be `false`.
 *
 * @returns A flag per structure, keyed by the short names used in this module's
 *   table: `wilayaList`, `wilaya`, `postal`, `commune`, `daira`, `name`,
 *   `communesOfWilaya`, `dairasOfWilaya`, `tree`.
 *
 * @example
 * ```ts
 * import { __indexState } from "./indexes";
 * Object.values(__indexState()).some(Boolean); // → false at import time
 * ```
 *
 * @since 2.0.0
 */
export function __indexState(): Record<string, boolean> {
  return {
    wilayaList: wilayaListValue !== undefined,
    wilaya: wilayaIndex !== undefined,
    postal: postalIndex !== undefined,
    commune: communeIndex !== undefined,
    daira: dairaIndex !== undefined,
    name: nameIndex !== undefined,
    communesOfWilaya: communesOfWilayaIndex !== undefined,
    dairasOfWilaya: dairasOfWilayaIndex !== undefined,
    tree: treeCache !== undefined,
  };
}
