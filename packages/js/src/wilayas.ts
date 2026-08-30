/**
 * `algeria-wilayas-communes/wilayas` — **69 wilaya records, and nothing else.**
 *
 * The smallest useful entry point. Import this when you are rendering a wilaya
 * `<select>`, validating a wilaya code, or labelling a stored code — anything
 * that never needs a daïra or a commune. See `.size-limit.json` for what it
 * actually costs; the root entry is an order of magnitude larger because it
 * carries the commune table unconditionally (`tiers/wilayas.ts` explains why no
 * bundler can drop it).
 *
 * Records returned here are identical to the root's — `tests/entries.test.ts`
 * pins that. The one difference is the **absent `asOf` parameter**: the
 * pre-reform 58-wilaya view is derived over commune and daïra re-attribution, so
 * it lives at the root, which already pays for that data.
 *
 * @example
 * ```ts
 * import { getWilayas, getWilaya, isWilayaCode } from "algeria-wilayas-communes/wilayas";
 *
 * getWilayas().length;         // → 69
 * getWilaya(19)?.name.fr;      // → "Setif"
 * getWilaya(19)?.codeText;     // → "19"
 * isWilayaCode(70);            // → false
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
export { getWilaya, getWilayas } from "./tiers/wilayas";

export type { WilayaCode } from "./generated/codes";
export type { Wilaya } from "./types";
