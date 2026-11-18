/**
 * The **daïra tier** — the 585 daïras, and nothing that reaches a commune.
 * `src/dairas.ts` is the published entry over this file and `./wilayas.ts`.
 *
 * Deliberately independent of the wilaya tier: a daïra carries its parent as
 * `wilaya: WilayaCode`, a number, so nothing here needs a `Wilaya` record. The
 * `/dairas` entry composes the two tiers; neither imports the other.
 *
 * ── What this tier gives up, on purpose ─────────────────────────────────────
 *
 * - **No `asOf` parameter.** `asOf: "58"` rewrites daïra attribution from the
 *   reform's parent mapping, which `asof.ts` derives over the commune table —
 *   the exact data this entry exists to exclude.
 * - **No nested `communes`.** That is `byWilaya` at the root.
 *
 * @module
 */

import { DAIRAS } from "../generated/dairas";

import type { WilayaCode } from "../generated/codes";
import type { Daira } from "../types";

// See `tiers/wilayas.ts` for the full argument: shallow, O(1), allocates
// nothing, and closes v1's "the caller can corrupt the shared array" hole that
// an erased `readonly` cannot.
Object.freeze(DAIRAS);

/**
 * Shared empty result for the plural lookup.
 *
 * Frozen, not merely typed `readonly`: `readonly` is erased at run time and this
 * one array is handed back by every miss, so a single `push` from plain
 * JavaScript would poison every future miss for the life of the process.
 */
const NO_DAIRAS: readonly Daira[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Lazy structures. One `let … | undefined` and one builder each; no `initAll()`.
// ---------------------------------------------------------------------------

let dairaIndex: Map<string, Daira> | undefined;

/**
 * Daïra id (`"19-ain-azel"`) → daïra.
 *
 * The id already *is* the composite `(wilaya, slug)` key — there are only 545
 * distinct daïra names for 585 daïras, which is precisely why the wilaya prefix
 * is baked into the id rather than left to the caller to assemble.
 */
function dairaIdx(): Map<string, Daira> {
  if (dairaIndex === undefined) {
    const m = new Map<string, Daira>();
    for (const d of DAIRAS) m.set(d.id, d);
    dairaIndex = m;
  }
  return dairaIndex;
}

let dairasOfWilayaIndex: Map<WilayaCode, readonly Daira[]> | undefined;

/** `WilayaCode` → every daïra of that wilaya, in dataset order. */
function dairasOfWilayaIdx(): Map<WilayaCode, readonly Daira[]> {
  if (dairasOfWilayaIndex === undefined) {
    const m = new Map<WilayaCode, Daira[]>();
    for (const d of DAIRAS) {
      const bucket = m.get(d.wilaya);
      if (bucket === undefined) m.set(d.wilaya, [d]);
      else bucket.push(d);
    }
    // Freeze each bucket before publishing it, for the same reason as
    // NO_DAIRAS: the lookup hands the caller the index's own array.
    for (const bucket of m.values()) Object.freeze(bucket);
    dairasOfWilayaIndex = m;
  }
  return dairasOfWilayaIndex;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Every daïra, in dataset order.
 *
 * Returns the frozen generated array directly: zero allocation, zero copy. Each
 * record carries its parent as `wilaya: WilayaCode` — join with `getWilaya`
 * rather than expecting a denormalized name.
 *
 * @returns All 585 daïras. Frozen, never copied.
 *
 * @example
 * ```ts
 * import { getDairas } from "algeria-wilayas-communes/dairas";
 *
 * getDairas().length;                                       // → 585
 * getDairas().filter((d) => d.wilaya === 19).length;        // → 20   (Setif)
 * getDairas().find((d) => d.id === "19-ain-azel")?.name.fr; // → "Ain Azel"
 * ```
 *
 * @since 2.0.0
 */
export function getDairas(): readonly Daira[] {
  return DAIRAS;
}

/**
 * One daïra by its library-assigned id.
 *
 * @param id - A daïra id, e.g. `"19-ain-azel"`. Library-assigned, not an
 *   official government code.
 * @returns The daïra, or `undefined` if no daïra has that id.
 *
 * @example
 * ```ts
 * import { getDaira } from "algeria-wilayas-communes/dairas";
 *
 * getDaira("19-ain-azel")?.name.fr;      // → "Ain Azel"
 * getDaira("19-ain-azel")?.wilaya;       // → 19   (Setif)
 * getDaira("19-ain-azel")?.communeCount; // → 4
 * getDaira("19-not-a-daira");            // → undefined
 * ```
 *
 * @since 2.0.0
 */
export function getDaira(id: string): Daira | undefined {
  return dairaIdx().get(id);
}

/**
 * Every daïra of one wilaya, in dataset order.
 *
 * @param code - A wilaya code, `1`..`69`.
 * @returns The wilaya's daïras, or an empty array. Never `undefined`. The union
 *   over all 69 codes is exactly 585 daïras.
 *
 * @example
 * ```ts
 * import { getDairasOfWilaya } from "algeria-wilayas-communes/dairas";
 *
 * getDairasOfWilaya(19).length;                                   // → 20  (Setif)
 * getDairasOfWilaya(19).map((d) => d.id).includes("19-ain-azel"); // → true
 * getDairasOfWilaya(69).length;                                   // → 2   (Messaad)
 * ```
 *
 * @since 2.0.0
 */
export function getDairasOfWilaya(code: WilayaCode): readonly Daira[] {
  const hit = dairasOfWilayaIdx().get(code);
  if (hit === undefined) return NO_DAIRAS;
  return hit;
}

/**
 * Which of this tier's two lazy structures have been built.
 *
 * **Exported from this module only — never from `dairas.ts`.** See
 * `tiers/wilayas.ts` for why the tier is a separate file from the entry.
 *
 * @returns A flag per structure: `daira`, `dairasOfWilaya`.
 *
 * @since 2.0.0
 */
export function __dairaTierState(): Record<string, boolean> {
  return {
    daira: dairaIndex !== undefined,
    dairasOfWilaya: dairasOfWilayaIndex !== undefined,
  };
}
