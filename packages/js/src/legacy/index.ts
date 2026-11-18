/**
 * `algeria-wilayas-communes/legacy` — the v1 API, pinned.
 *
 * Decision D5 in one sentence: **the root is pure v2, this subpath is pure v1.**
 * v1 and v2 both want the names `getWilayas` / `getDairas` / `getCommunes` with
 * different return shapes, and a module can export only one binding per name.
 * Rather than ship two conventions from one entry point — where
 * `import { getCommunes } from "algeria-wilayas-communes"` and
 * `import dz from "…"; dz.getCommunes()` would return different shapes and the
 * mismatch would surface as a silent `undefined` in production — the two APIs
 * get two entry points, each internally consistent.
 *
 * **This subpath is permanent**, not a transitional courtesy. `SUPPORT.md`
 * commits to it for the life of the v2 line; nothing here is ever removed. A
 * user pinned to `^1.0.0` never receives v2 at all, so the shape change only
 * reaches them when they deliberately take a major — and the migration is then
 * a one-line, mechanical import change to `…/legacy`.
 *
 * **No `@deprecated` tags in this file, on purpose.** This is the
 * pin-the-old-contract entry point. Someone who imports it has *chosen* v1;
 * striking through every call they make would be user-hostile noise. The
 * deprecated shims live at the root, in `../compat.ts`, where they are aimed at
 * people who have *not* yet chosen. (Neither file ever calls `console.warn`.)
 *
 * The seven implementations are one line each, and are **literally the v1
 * compositions**. That is not laziness: writing `findByPostalCode` as
 * `getCommunes().filter(…)` rather than as a `Map` lookup is what makes
 * `findByPostalCode("19018")[0] === getCommunes().find(…)` come out true, which
 * is exactly the object-identity behaviour v1 had and consumers depend on
 * without ever having written it down.
 *
 * @module
 */

import {
  buildAlgeria,
  buildCommunesFlat,
  buildDairasFlat,
  buildWilayaTree,
  buildWilayasFlat,
} from "./project";

import type { WilayaCode } from "../generated/codes";
import type { Algeria, CommuneFlat, DairaFlat, Wilaya, WilayaFlat } from "./types";

// ---------------------------------------------------------------------------
// The `byWilaya` argument types
// ---------------------------------------------------------------------------

/**
 * A wilaya number as a **number**: `1`..`69`.
 *
 * Aliased to the generated {@link WilayaCode} union rather than hand-written as
 * `1 | 2 | … | 69`. The two are the same type; the generated one cannot drift
 * from the data, and a hand-written 69-member union rots the moment a reform
 * adds a wilaya.
 */
export type WilayaNum = WilayaCode;

/**
 * A wilaya number as a **string**, padded or not: `"1"` and `"01"` both work,
 * through `"69"`.
 *
 * Derived rather than enumerated. `` `${WilayaCode}` `` already gives every
 * unpadded form `"1"`..`"69"`, and for `10`..`69` the padded form *is* the
 * unpadded one — so the only members left to name are the nine single-digit
 * padded codes, which are fixed for as long as codes are two digits wide.
 *
 * Both numeric and string literals are accepted because **v1 accepted both**:
 * its `String(num).padStart(2, "0")` never cared. A union of this size is fine
 * here — it narrows *one argument*. It does not generate 69 distinct record
 * types, which is the thing that bloats a `.d.ts` and slows every consumer's
 * `tsc`.
 */
export type WilayaNumString =
  `${WilayaCode}` | "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09";

// ---------------------------------------------------------------------------
// The seven v1 functions
// ---------------------------------------------------------------------------

/**
 * The full nested tree: pays → wilayas → daïras → communes.
 *
 * @returns The v1 document. Same reference on every call; not frozen, and a
 *   mutation through it persists — see `project.ts`, rule 6.
 *
 * @example
 * ```ts
 * import { getAll } from "algeria-wilayas-communes/legacy";
 *
 * getAll().nb_wilayas;           // → 69
 * getAll().wilayas[18]?.nom_fr;  // → "Setif"
 * getAll() === getAll();         // → true
 * ```
 */
export function getAll(): Algeria {
  return buildAlgeria();
}

/**
 * The flat array of the 69 wilayas — the rows of `data/wilayas.json`.
 *
 * @returns 69 {@link WilayaFlat} rows in code order. Same reference every call.
 *
 * @example
 * ```ts
 * getWilayas().length;      // → 69
 * getWilayas()[18]?.code;   // → "19"       (Setif; a padded STRING, not 19)
 * getWilayas()[15]?.nom_en; // → "Algiers"  (the only nom_en !== nom_fr)
 * ```
 */
export function getWilayas(): WilayaFlat[] {
  return buildWilayasFlat();
}

/**
 * The flat array of the 566 daïras, each carrying its wilaya.
 *
 * Eight fields per row: there is **no `wilaya_ar`**, unlike the commune rows.
 * That asymmetry is a faithfully reproduced quirk of the published data, not a
 * bug in this layer — see `./types.ts` and `./project.ts`.
 *
 * @returns 566 {@link DairaFlat} rows in document order. Same reference every call.
 *
 * @example
 * ```ts
 * getDairas().length;                                    // → 566
 * getDairas().filter((d) => d.wilaya_num === 19).length; // → 20   (Setif)
 * ```
 */
export function getDairas(): DairaFlat[] {
  return buildDairasFlat();
}

/**
 * The flat array of the 1541 communes, each carrying wilaya + daïra + postal code.
 *
 * @returns 1541 {@link CommuneFlat} rows in document order. Same reference every call.
 *
 * @example
 * ```ts
 * getCommunes().length;                                       // → 1541
 * getCommunes().filter((c) => c.code_postal === null).length; // → 27
 * ```
 */
export function getCommunes(): CommuneFlat[] {
  return buildCommunesFlat();
}

/**
 * One wilaya's full subtree by its number.
 *
 * **Never throws, for any input.** v1 wrapped a `readFileSync` in a `try/catch`
 * that swallowed everything; there is no I/O here at all, so a `Map` miss
 * returning `undefined` is a strict superset of that guarantee. There is no
 * non-null assertion, no cast and no assumption that the argument is in range.
 *
 * The `String(num).padStart(2, "0")` below is **verbatim from v1** and must stay
 * that way — it is what makes `byWilaya("16")` return the very same object as
 * `byWilaya(16)`, and `byWilaya("016")` return `undefined` (padStart is a no-op
 * on a 3-character string, so the lookup simply misses, exactly as v1's file
 * lookup did).
 *
 * The argument type is a literal union, so `byWilaya(70)` is a **compile error**
 * for TypeScript users while still evaluating to `undefined` at run time for
 * JavaScript users and for anyone who casts.
 *
 * @param num - A wilaya number, as a number (`19`) or a string (`"19"`, `"06"`,
 *   `"6"`).
 * @returns The wilaya subtree, or `undefined` if there is no such wilaya.
 *
 * @example
 * ```ts
 * byWilaya(19)?.nom_fr;           // → "Setif"
 * byWilaya(19)?.dairas.length;    // → 20
 * byWilaya("19") === byWilaya(19); // → true  (memoized on the padded code)
 * byWilaya(6)?.code;              // → "06"
 * byWilaya(16)?.nom_en;           // → "Algiers"
 * ```
 */
export function byWilaya(num: WilayaNum | WilayaNumString): Wilaya | undefined {
  const nn = String(num).padStart(2, "0");
  return buildWilayaTree(nn);
}

/**
 * Every commune carrying a given postal code.
 *
 * **Returns an ARRAY, and legitimately returns more than one row.** 1493
 * communes share only 1476 distinct codes, so **17 codes are held by more than
 * one commune**. Anything that "simplifies" this to return a single commune is
 * a break, not a cleanup.
 *
 * For any **string** argument it never matches the **27** communes whose
 * `code_postal` is `null`, because `null === code` is false for every string.
 *
 * ⚠️ The converse is v1's, and is preserved deliberately: `findByPostalCode(null)`
 * returns exactly those 48 communes, because `null === null`. That is a real
 * trap for a JavaScript caller passing a nullable database column straight in —
 * "no postal code" reads as a query and comes back with 27 rows rather than
 * none. It is not fixed here: this function is byte-faithful to v1's
 * `getCommunes().filter((c) => c.code_postal === code)` and changing it would be
 * a silent behaviour change for anyone who already relies on it. Guard the call
 * site, or use the v2 `findByPostalCode`, which takes a `string`. A test pins
 * the quirk so a later "cleanup" cannot remove it unnoticed.
 *
 * Written as `getCommunes().filter(…)`, not as an index lookup, on purpose: the
 * returned array is fresh on every call while its **elements are the shared
 * cached rows**, so `findByPostalCode(p)[0] === getCommunes().find(…)` is true —
 * v1's exact object-identity behaviour.
 *
 * @param code - A five-digit postal code, e.g. `"19018"`.
 * @returns The matching rows in document order; empty on a miss.
 *
 * @example
 * ```ts
 * findByPostalCode("19018")[0]?.nom_fr; // → "Ain Lahdjar"  (Setif, Ain Azel)
 * findByPostalCode("99999");            // → []
 * ```
 */
export function findByPostalCode(code: string): CommuneFlat[] {
  return getCommunes().filter((c) => c.code_postal === code);
}

/**
 * Communes whose **French** name contains the query, case-insensitively.
 *
 * ⚠️ **This must stay exactly this. Do NOT route it to v2's `search()` or
 * `findCommunesByName()`.** The v2 search is multilingual and ranked, so
 * switching would change *which* records come back (Arabic and English names
 * would start matching), *how many* come back, and in *what order* — and every
 * existing consumer that indexes `findCommune(q)[0]` or renders the array would
 * silently get different output, with no error anywhere. `nom_fr` only,
 * `toLowerCase()`, substring `includes`, **unranked**, **unlimited**, document
 * order. The v2 search is a different function with a different name; this one
 * is frozen.
 *
 * @param query - A substring of the French name. Not normalized: accents and
 *   apostrophes are compared as written, exactly as in v1.
 * @returns The matching rows in document order; empty on a miss.
 *
 * @example
 * ```ts
 * findCommune("ain lahdjar")[0]?.wilaya_fr; // → "Setif"
 * findCommune("setif").length;              // → every nom_fr containing "setif"
 * ```
 */
export function findCommune(query: string): CommuneFlat[] {
  const q = query.toLowerCase();
  return getCommunes().filter((c) => c.nom_fr.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// The v1 type surface
// ---------------------------------------------------------------------------

/**
 * All eight v1 type names, re-exported so `/legacy` is a complete replacement
 * for the v1 root: `import type { CommuneFlat } from "algeria-wilayas-communes/legacy"`.
 */
export type {
  Algeria,
  Commune,
  CommuneFlat,
  Country,
  Daira,
  DairaFlat,
  Wilaya,
  WilayaFlat,
} from "./types";

// ---------------------------------------------------------------------------
// The v1 default export
// ---------------------------------------------------------------------------

/**
 * The v1 default export object, so `import dz from "algeria-wilayas-communes/legacy"`
 * keeps working.
 *
 * It holds **the same seven function references** the named exports are — this
 * is a bare shorthand object literal, not a set of wrappers — so
 * `dz.getAll === getAll` when both come from `/legacy`. Wrapping each one in an
 * arrow would compile and pass every behavioural test while quietly breaking
 * that identity.
 *
 * The v2 root deliberately has **no** default export, so a v1 user who upgrades
 * without changing their import gets a loud ESM link-time error rather than v2
 * objects whose `.nom_fr` reads `undefined`.
 */
export default {
  getAll,
  getWilayas,
  getDairas,
  getCommunes,
  byWilaya,
  findByPostalCode,
  findCommune,
};
