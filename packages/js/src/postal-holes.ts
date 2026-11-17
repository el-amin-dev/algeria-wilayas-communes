/**
 * The membership test for the 27 communes published without a postal code.
 *
 * `COMMUNES_MISSING_POSTAL_CODE` is a `readonly` TUPLE of 27 id *literals*, not
 * a `readonly string[]`. That is deliberate — it lets a consumer write
 * `"19-ain-azel-ain-lahdjar" satisfies MissingPostalCodeId` and get a compile
 * error on a typo — but it has one hostile consequence: `.includes(id)` for an
 * arbitrary `id: string` does not typecheck, because `Array.prototype.includes`
 * on a literal tuple only accepts those literals. Until now `llms.txt` and the
 * README answered that by telling people to widen the type by hand:
 *
 * ```ts
 * (COMMUNES_MISSING_POSTAL_CODE as readonly string[]).includes(id); // don't
 * ```
 *
 * Documenting a cast is not the same as not needing one. This function is the
 * cast, written once, in the package, where it can be tested.
 *
 * It lives in its own module rather than in `guards.ts` because `guards.ts`
 * holds a hard invariant — it touches no data, so `isWilayaCode` can be called
 * without pulling a single record. This predicate must read the id list, so it
 * belongs outside that boundary.
 *
 * Cheap by construction: a linear scan of 27 strings, no index, no `Set`, and
 * therefore nothing built at import time (`tests/import-purity.test.ts`).
 *
 * @module
 */

import { COMMUNES_MISSING_POSTAL_CODE } from "./generated/communes";

/** A commune id known to have no published postal code. */
export type MissingPostalCodeId = (typeof COMMUNES_MISSING_POSTAL_CODE)[number];

/**
 * Is this commune one of the 27 published without a postal code?
 *
 * Returns `false` for an id that does not exist at all — the question is
 * "is this a known hole", not "is this a valid id". Use `getCommune(id)` to
 * tell a nonexistent commune from a real one.
 *
 * @example
 * ```ts
 * isCommuneMissingPostalCode("01-timimoun-ouled-said"); // → true | false
 * isCommuneMissingPostalCode("not-a-commune");          // → false
 * ```
 */
export function isCommuneMissingPostalCode(id: string): boolean {
  // A widening cast, once, here — instead of at every call site.
  return (COMMUNES_MISSING_POSTAL_CODE as readonly string[]).includes(id);
}
