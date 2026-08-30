/**
 * The deprecated root shims — **two functions, not seven.**
 *
 * ---------------------------------------------------------------------------
 * ## Why two
 * ---------------------------------------------------------------------------
 *
 * This is a deliberate, maintainer-confirmed deviation from the session spec's
 * Step 8b, which listed all seven v1 names here. Five of them cannot exist at
 * the root, and the reason is mechanical rather than a matter of taste:
 *
 * - `getWilayas`, `getDairas`, `getCommunes` — the root already exports these
 *   with **v2 shapes**. A module can export only one binding per name, so a v1
 *   version would be an impossible duplicate export, not a shim.
 * - `byWilaya`, `findByPostalCode` — same collision. The root's v2 versions
 *   take a `WilayaCode` / return `readonly Commune[]`, and they were shipped in
 *   session 2.
 *
 * Under decision D5 the root is **pure v2** and re-exporting a v1 shape beside
 * a v2 one under the same name is exactly the mixed-surface outcome D5 rejects:
 * one entry point handing back two conventions, failing silently at property
 * access rather than loudly at import.
 *
 * So only the two names that **do not collide** get a root shim:
 *
 * | name | collides with a v2 root export? | |
 * |---|---|---|
 * | `getAll` | no — v2 has no `getAll` | shimmed below |
 * | `findCommune` | no — v2's search is `search()` / `findCommunesByName()` | shimmed below |
 * | the other five | yes | not shimmable; use `/legacy` |
 *
 * **Nothing is lost.** All seven v1 names remain available, byte-exact and
 * permanently supported, from `algeria-wilayas-communes/legacy` — which is
 * where the migration guide points, and which carries no deprecation tags at
 * all because importing it is a deliberate choice rather than an oversight.
 *
 * ---------------------------------------------------------------------------
 * ## `@deprecated` is a JSDoc tag, and ONLY a JSDoc tag
 * ---------------------------------------------------------------------------
 *
 * **No `console.warn`. No runtime deprecation notice. Ever.** A library that
 * prints to a consumer's stderr on every call is a bug report waiting to
 * happen, it corrupts stdout-parsing pipelines, and in a serverless log stream
 * it is billed by the byte. The strikethrough in the editor and the warning in
 * the type-checker are the whole mechanism, and they cost the consumer nothing
 * at run time.
 *
 * Both shims delegate to the `/legacy` implementations rather than
 * reimplementing anything, so there is exactly one v1 code path in the library
 * and the two entry points can never drift.
 *
 * @module
 */

import { findCommune as legacyFindCommune, getAll as legacyGetAll } from "./legacy/index";

import type { Algeria, CommuneFlat } from "./legacy/types";

/**
 * The full nested v1 tree — `pays` → `wilayas` → `dairas` → `communes`, in v1's
 * snake_case denormalized shape.
 *
 * @deprecated Use `byWilaya(code)` and the v2 accessors (`getWilayas()`,
 * `getDairasOfWilaya()`, `getCommunesOfWilaya()`) instead. Removed in v3.
 * There is no v2 whole-document accessor by design: v2 is normalized and lazy,
 * and materializing the entire corpus to answer one question is the cost this
 * rebuild removed. If you need the v1 document verbatim, import `getAll` from
 * `algeria-wilayas-communes/legacy`, which is permanent and untagged.
 *
 * @returns The v1 document. Same reference on every call; not frozen.
 *
 * @example
 * ```ts
 * getAll().wilayas[18]?.nom_fr; // → "Setif"
 *
 * // v2 equivalent:
 * byWilaya(19)?.name.fr;        // → "Setif"
 * ```
 *
 * @since 2.0.0
 */
export function getAll(): Algeria {
  return legacyGetAll();
}

/**
 * Communes whose **French** name contains the query, case-insensitively —
 * unranked, unlimited, in document order.
 *
 * @deprecated Use `search(query)` instead. Removed in v3.
 * ⚠️ **The results differ — this is not a drop-in rename.** `search()` is
 * multilingual and **ranked**: it matches Arabic and English names as well as
 * French, normalizes accents and apostrophes, scores its hits and returns them
 * best-first (and honours a `limit`). So migrating changes *which* communes
 * come back, *how many*, and *in what order* — code that indexes
 * `findCommune(q)[0]` or renders the array will behave differently. Compare the
 * two on your own queries before switching, and if you need the exact v1
 * behaviour, import `findCommune` from `algeria-wilayas-communes/legacy`, which
 * is permanent and untagged.
 *
 * @param query - A substring of the French name, compared as written.
 * @returns The matching v1 rows in document order; empty on a miss.
 *
 * @example
 * ```ts
 * findCommune("ain lahdjar")[0]?.wilaya_fr; // → "Setif"
 *
 * // v2 equivalent — ranked, multilingual, and NOT the same result set:
 * search("ain lahdjar")[0]?.item.name.fr;
 * ```
 *
 * @since 2.0.0
 */
export function findCommune(query: string): CommuneFlat[] {
  return legacyFindCommune(query);
}
