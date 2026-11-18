/**
 * `algeria-wilayas-communes/dairas` — **the 69 wilayas plus the 566 daïras.**
 *
 * The middle tier: enough to render a wilaya → daïra cascade without shipping
 * the 1541 communes. Records are identical to the root's, and as with
 * `/wilayas` the **`asOf` parameter is absent** — it is derived over commune
 * re-attribution and lives at the root.
 *
 * @example
 * ```ts
 * import { getWilayas, getDairasOfWilaya } from "algeria-wilayas-communes/dairas";
 *
 * getWilayas().length;               // → 69
 * getDairasOfWilaya(19).length;      // → 20   (Setif)
 * getDairasOfWilaya(19)[0]?.id;      // → "19-salah-bey"
 * ```
 *
 * **Pick one entry per application; do not mix them.** Each subpath is a
 * self-contained bundle (`tsup`'s `splitting: false`), so importing this one
 * *and* the root ships the dataset twice, and their records are different
 * objects: `getWilaya(19)` from here is not `===` `getWilaya(19)` from the
 * root. They are deeply equal, so lookups by `id` or `code` behave
 * identically — but a `Set` or `Map` keyed by the record itself sees two.
 *
 * @module
 */

export { assertWilayaCode, isWilayaCode } from "./guards";
export { getDaira, getDairas, getDairasOfWilaya } from "./tiers/dairas";
export { getWilaya, getWilayas } from "./tiers/wilayas";

export type { WilayaCode } from "./generated/codes";
export type { Daira, Wilaya } from "./types";
