/**
 * `algeria-wilayas-communes/communes` — **wilayas, daïras and all 1541
 * communes, with the postal-code lookup.**
 *
 * The full administrative hierarchy as flat records, without the root entry's
 * search corpus (`generated/search-keys.ts`, 4352 normalized keys), reform
 * resolvers or v1 compatibility layer. Import this when you need commune data
 * and lookups by id, wilaya or postal code, but not fuzzy name search.
 *
 * Records are identical to the root's. Two deliberate absences, both because
 * they would pull in an order of magnitude more data or code than the communes
 * themselves: **`asOf`** and **`findCommunesByName` / `search`**. Both live at
 * the root.
 *
 * @example
 * ```ts
 * import { getCommune, findByPostalCode } from "algeria-wilayas-communes/communes";
 *
 * getCommune("19-ain-azel-ain-lahdjar")?.postalCode; // → "19018"
 * findByPostalCode("19018").map((c) => c.name.fr);   // → ["Ain Lahdjar"]
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

export { COMMUNES_MISSING_POSTAL_CODE } from "./generated/communes";
export { isCommuneMissingPostalCode } from "./postal-holes";
export { assertWilayaCode, isPostalCode, isWilayaCode } from "./guards";
export { getDaira, getDairas, getDairasOfWilaya } from "./tiers/dairas";
export { findByPostalCode, getCommune, getCommunes, getCommunesOfWilaya } from "./tiers/communes";
export { getWilaya, getWilayas } from "./tiers/wilayas";

export type { WilayaCode } from "./generated/codes";
export type { Commune, Daira, PostalCode, Wilaya } from "./types";
