/**
 * The **commune tier** — the 1541 communes and the postal-code lookup.
 * `src/communes.ts` is the published entry over this file, `./dairas.ts` and
 * `./wilayas.ts`.
 *
 * Independent of the other two tiers: a commune carries its parents as
 * `wilaya: WilayaCode` and `daira: string`, so nothing here needs a `Wilaya` or
 * `Daira` record. The `/communes` entry composes all three; none imports
 * another.
 *
 * ── What this tier gives up, on purpose ─────────────────────────────────────
 *
 * - **No `asOf` parameter.** See `tiers/wilayas.ts`.
 * - **No `findCommunesByName`, no `search`.** Name lookup needs the normalized
 *   4352-key corpus in `generated/search-keys.ts` (109 kB) — an order of
 *   magnitude more than the commune records themselves. Both live at the root,
 *   which is the entry that already pays for them.
 *
 * @module
 */

import { COMMUNES } from "../generated/communes";

import type { WilayaCode } from "../generated/codes";
import type { Commune } from "../types";

// See `tiers/wilayas.ts` for the full argument.
Object.freeze(COMMUNES);

/**
 * Shared empty result for the plural lookups.
 *
 * Frozen, not merely typed `readonly` — `findByPostalCode("99999")` and
 * `getCommunesOfWilaya` on a miss return this same object, so one `push` from
 * plain JavaScript would poison every future miss across both.
 */
const NO_COMMUNES: readonly Commune[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Lazy structures. One `let … | undefined` and one builder each; no `initAll()`.
// ---------------------------------------------------------------------------

let communeIndex: Map<string, Commune> | undefined;

/**
 * Commune id (`"19-ain-azel-ain-lahdjar"`) → commune.
 *
 * Single-valued, and provably safe to be: the composite ids were verified 100%
 * unique at build time (0 collisions over 1541 records).
 */
function communeIdx(): Map<string, Commune> {
  if (communeIndex === undefined) {
    const m = new Map<string, Commune>();
    for (const c of COMMUNES) m.set(c.id, c);
    communeIndex = m;
  }
  return communeIndex;
}

let postalIndex: Map<string, readonly Commune[]> | undefined;

/**
 * Postal code → every commune carrying it.
 *
 * The value is an array **always**. 1496 communes share 1479 distinct codes, so
 * 17 codes map to more than one commune; a single-valued map would drop the
 * losers silently. The 45 communes with `postalCode === null` are skipped —
 * their ids are listed in `COMMUNES_MISSING_POSTAL_CODE`.
 */
function postalIdx(): Map<string, readonly Commune[]> {
  if (postalIndex === undefined) {
    const m = new Map<string, Commune[]>();
    for (const c of COMMUNES) {
      if (c.postalCode === null) continue;
      const bucket = m.get(c.postalCode);
      if (bucket === undefined) m.set(c.postalCode, [c]);
      else bucket.push(c);
    }
    for (const bucket of m.values()) Object.freeze(bucket);
    postalIndex = m;
  }
  return postalIndex;
}

let communesOfWilayaIndex: Map<WilayaCode, readonly Commune[]> | undefined;

/** `WilayaCode` → every commune of that wilaya, in dataset order. */
function communesOfWilayaIdx(): Map<WilayaCode, readonly Commune[]> {
  if (communesOfWilayaIndex === undefined) {
    const m = new Map<WilayaCode, Commune[]>();
    for (const c of COMMUNES) {
      const bucket = m.get(c.wilaya);
      if (bucket === undefined) m.set(c.wilaya, [c]);
      else bucket.push(c);
    }
    for (const bucket of m.values()) Object.freeze(bucket);
    communesOfWilayaIndex = m;
  }
  return communesOfWilayaIndex;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Every commune, in dataset order.
 *
 * Returns the frozen generated array directly: zero allocation, zero copy.
 *
 * @returns All 1541 communes. Frozen, never copied. 27 of them have
 *   `postalCode === null`; their ids are listed in
 *   `COMMUNES_MISSING_POSTAL_CODE`.
 *
 * @example
 * ```ts
 * import { getCommunes } from "algeria-wilayas-communes/communes";
 *
 * getCommunes().length;                                       // → 1541
 * getCommunes().filter((c) => c.postalCode === null).length;  // → 27
 * getCommunes().find((c) => c.id === "19-ain-azel-ain-lahdjar")?.postalCode;
 * // → "19018"
 * ```
 *
 * @since 2.0.0
 */
export function getCommunes(): readonly Commune[] {
  return COMMUNES;
}

/**
 * One commune by its library-assigned id.
 *
 * @param id - A commune id, e.g. `"19-ain-azel-ain-lahdjar"` — wilaya code,
 *   daïra slug, commune slug. Library-assigned, not an official government code,
 *   but stable by promise.
 * @returns The commune, or `undefined` if no commune has that id.
 *
 * @example
 * ```ts
 * import { getCommune } from "algeria-wilayas-communes/communes";
 *
 * getCommune("19-ain-azel-ain-lahdjar")?.name.fr;     // → "Ain Lahdjar"
 * getCommune("19-ain-azel-ain-lahdjar")?.postalCode;  // → "19018"
 * getCommune("19-ain-azel-ain-lahdjar")?.daira;       // → "19-ain-azel"
 * getCommune("32-sidi-ameur-sidi-ameur")?.postalCode; // → null (one of the 30)
 * getCommune("nope");                                 // → undefined
 * ```
 *
 * @since 2.0.0
 */
export function getCommune(id: string): Commune | undefined {
  return communeIdx().get(id);
}

/**
 * All communes sharing a 5-digit postal code.
 *
 * Postal codes are not unique: 38 of the 1479 distinct codes in the dataset are
 * shared by more than one commune, so this always returns an array.
 *
 * @param code - A 5-digit postal code, e.g. `"19018"`. A plain `string`, not a
 *   branded `PostalCode` — callers should not have to brand a value to ask a
 *   question, and unvalidated input is fine: a malformed code simply matches
 *   nothing.
 * @returns Every matching commune, or an empty array. Never `undefined`.
 *
 * @example
 * ```ts
 * import { findByPostalCode } from "algeria-wilayas-communes/communes";
 *
 * findByPostalCode("19018").map((c) => c.name.fr);
 * // → ["Ain Lahdjar"]              — 19018 belongs to exactly one commune
 *
 * findByPostalCode("10031").map((c) => c.wilaya);
 * // → [10, 20]                     — one of the 17 shared codes
 *
 * findByPostalCode("00000");        // → []  — well-formed, matches nothing
 * ```
 *
 * @since 2.0.0
 */
export function findByPostalCode(code: string): readonly Commune[] {
  const hit = postalIdx().get(code);
  if (hit === undefined) return NO_COMMUNES;
  return hit;
}

/**
 * Every commune of one wilaya, in dataset order.
 *
 * @param code - A wilaya code, `1`..`69`.
 * @returns The wilaya's communes, or an empty array. Never `undefined`. The
 *   union over all 69 codes is exactly 1541 communes.
 *
 * @example
 * ```ts
 * import { getCommunesOfWilaya } from "algeria-wilayas-communes/communes";
 *
 * getCommunesOfWilaya(19).length;                        // → 60  (Setif)
 * getCommunesOfWilaya(19).every((c) => c.wilaya === 19); // → true
 * getCommunesOfWilaya(69).length;                        // → 8   (Messaad)
 * ```
 *
 * @since 2.0.0
 */
export function getCommunesOfWilaya(code: WilayaCode): readonly Commune[] {
  const hit = communesOfWilayaIdx().get(code);
  if (hit === undefined) return NO_COMMUNES;
  return hit;
}

/**
 * Which of this tier's three lazy structures have been built.
 *
 * **Exported from this module only — never from `communes.ts`.** See
 * `tiers/wilayas.ts` for why the tier is a separate file from the entry.
 *
 * @returns A flag per structure: `commune`, `postal`, `communesOfWilaya`.
 *
 * @since 2.0.0
 */
export function __communeTierState(): Record<string, boolean> {
  return {
    commune: communeIndex !== undefined,
    postal: postalIndex !== undefined,
    communesOfWilaya: communesOfWilayaIndex !== undefined,
  };
}
