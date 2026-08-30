/**
 * The public accessors and lookups.
 *
 * **The miss convention is boringly consistent, on purpose:**
 *
 * - a **singular** lookup returns `T | undefined`;
 * - a **plural** lookup returns a possibly-empty `readonly T[]`.
 *
 * Never `null`, never a thrown `NotFoundError`, never a `{}` sentinel, never a
 * `{ ok: false }` result object. "Zero matches" is a normal answer to a plural
 * question, and v1 already returned `undefined` from `byWilaya` on a miss, so
 * this is continuity rather than a break.
 *
 * **`asOf: "58"` is the one narrow exception, and it is a different category.**
 * Five accessors take an optional trailing {@link AsOfOptions}. `asOf: "69"`
 * and no options at all are the same code path and return the **identical
 * object** — `getWilayas() === getWilayas({ asOf: "69" })` — so the default
 * path is unchanged and unconditionally safe. `asOf: "58"` asks for a view
 * derived from the 58 → 69 parent mapping, which the dataset does not yet
 * contain, so it throws `ReformMappingUnavailableError` rather than answering
 * from an unfilled table. That is not a miss ("you asked a valid question and
 * the answer is nothing"); it is "the library cannot answer at all", and
 * encoding it as `undefined` would make it indistinguishable from "no parent".
 * See `reform.ts` for the full argument, and branch on `REFORM.mappingComplete`
 * rather than catching. Together with `assertWilayaCode`, that is the entire
 * set of throwing exports.
 *
 * **No accessor ever returns a defensive copy.** `getCommunes()` copying 1541
 * records per call would turn a 0 µs accessor into a measurable one, and the
 * `readonly` type already expresses the contract.
 */

import { commune58, communes58, dairas58, wilaya58, wilayas58, wantsLegacyView } from "./asof";
import { COMMUNES } from "./generated/communes";
import { DAIRAS } from "./generated/dairas";
import { WILAYAS } from "./generated/wilayas";
import {
  communeIdx,
  communesOfWilaya,
  dairaIdx,
  dairasOfWilaya,
  nameIdx,
  postalIdx,
  tree,
  wilayaIdx,
  wilayaList,
} from "./indexes";
import { normalize } from "./normalize";

import type { AsOfOptions } from "./asof";
import type { WilayaCode } from "./generated/codes";
import type { Commune, Daira, NameOf, Wilaya, WilayaTree } from "./types";

// ---------------------------------------------------------------------------
// The three — and only three — top-level statements with an effect.
//
// `Object.freeze` on an already-materialized array is not index construction:
// it allocates nothing, walks nothing and costs three property-descriptor
// flips. Everything else on the import path stays inert.
//
// The freeze exists for plain-JavaScript consumers, who have no `readonly` type
// to stop them. v1 handed out the live cached array, so
// `getCommunes().length = 0` permanently corrupted the dataset for every other
// consumer in the process. That specific defect is closed here.
//
// The 1541 records and their nested `name` objects are deliberately NOT
// deep-frozen — that would be ~6000 `Object.freeze` calls on the import path,
// exactly the import-time work the lazy invariant forbids. See `types.ts` for
// the residual hole, documented rather than designed away.
// ---------------------------------------------------------------------------
Object.freeze(WILAYAS);
Object.freeze(DAIRAS);
Object.freeze(COMMUNES);

/** Shared empty result for the plural lookups. Typed `readonly`; see `indexes.ts`. */
// Frozen, not merely typed `readonly`. `readonly` is erased at run time, and this
// single array is handed back by EVERY miss -- `findByPostalCode("99999")` and
// `findCommunesByName("Paris")` return the same object -- so one `push` from
// plain JavaScript would poison every future miss across both functions for the
// life of the process. `Object.freeze` on an empty literal is O(1) and allocates
// nothing, so it does not weaken the no-work-at-import-time invariant: that rule
// forbids INDEX CONSTRUCTION on the import path, not a constant-time freeze.
const NO_COMMUNES: readonly Commune[] = Object.freeze([]);

/**
 * Every wilaya, in code order.
 *
 * The 69 records carry the derived `codeText` alongside the numeric `code`, so
 * they are built once on first call and memoized; the array is frozen before it
 * is handed out and the same reference is returned to every caller.
 *
 * @param opts - Optional. `{ asOf: "58" }` asks for the pre-reform map: **58**
 *   records, codes `1`..`58` ascending, the 11 new wilayas absent, and each
 *   mère's `dairaCount` / `communeCount` **recomputed** to include everything
 *   re-attached from its children. Those two numbers are *derived arithmetic
 *   over a maintainer-supplied mapping*, not transcribed data. Omitting `opts`
 *   and passing `{ asOf: "69" }` are the same call and return the same object.
 * @returns All 69 wilayas — or the 58 pre-reform ones. Frozen, never copied,
 *   never empty.
 * @throws {ReformMappingUnavailableError} for `asOf: "58"` only, while
 *   `REFORM.mappingComplete` is `false`. The default path never throws.
 *
 * @example
 * ```ts
 * getWilayas().length;                 // → 69
 * getWilayas()[18]?.name.fr;           // → "Setif"
 * getWilayas()[18]?.codeText;          // → "19"
 * getWilayas().find((w) => w.codeText === "06")?.name.fr; // → "Bejaia"
 *
 * getWilayas() === getWilayas({ asOf: "69" });  // → true — no extra allocation
 *
 * if (REFORM.mappingComplete) {
 *   getWilayas({ asOf: "58" }).length; // → 58  (throws today: mapping unfilled)
 * }
 * ```
 *
 * @since 2.0.0
 */
export function getWilayas(opts?: AsOfOptions): readonly Wilaya[] {
  if (wantsLegacyView(opts)) return wilayas58();
  return wilayaList();
}

/**
 * Every daïra, in dataset order.
 *
 * Returns the frozen generated array directly: zero allocation, zero copy. Each
 * record carries its parent as `wilaya: WilayaCode` — join with
 * {@link getWilaya} rather than expecting a denormalized name.
 *
 * @param opts - Optional. `{ asOf: "58" }` returns the same **591** daïras —
 *   never merged, never dropped — with the `wilaya` attribution of every daïra
 *   under `59`..`69` rewritten to its mère. Merging two same-named daïras under
 *   one mère would assert they are the same daïra, which the dataset does not
 *   claim; there are 591 daïras over only 545 distinct names. `id` never
 *   changes across `asOf`.
 * @returns All 591 daïras. Frozen, never copied.
 * @throws {ReformMappingUnavailableError} for `asOf: "58"` only, while
 *   `REFORM.mappingComplete` is `false`.
 *
 * @example
 * ```ts
 * getDairas().length;                                    // → 591
 * getDairas().filter((d) => d.wilaya === 19).length;     // → 20   (Setif)
 * getDairas().find((d) => d.id === "19-ain-azel")?.name.fr; // → "Ain Azel"
 *
 * if (REFORM.mappingComplete) {
 *   getDairas({ asOf: "58" }).length;                    // → 591  — still 591
 * }
 * ```
 *
 * @since 2.0.0
 */
export function getDairas(opts?: AsOfOptions): readonly Daira[] {
  if (wantsLegacyView(opts)) return dairas58();
  return DAIRAS;
}

/**
 * Every commune, in dataset order.
 *
 * Returns the frozen generated array directly: zero allocation, zero copy — the
 * accessor that cost 1.10 ms of `JSON.parse` in v1 is now a property read.
 *
 * @param opts - Optional. `{ asOf: "58" }` returns the same **1541** communes
 *   in the same order, with the `wilaya` attribution of every commune under
 *   `59`..`69` rewritten to its mère — so a commune in wilaya 59 Aflou resolves
 *   to the wilaya a 2026 shipping label must print. `id` and `postalCode` never
 *   change across `asOf`: a postal code is a postal code, and two id namespaces
 *   would make every cached key in every consumer's database ambiguous.
 * @returns All 1541 communes. Frozen, never copied. 27 of them have
 *   `postalCode === null`; their ids are listed in
 *   `COMMUNES_MISSING_POSTAL_CODE`.
 * @throws {ReformMappingUnavailableError} for `asOf: "58"` only, while
 *   `REFORM.mappingComplete` is `false`.
 *
 * @example
 * ```ts
 * getCommunes().length;                                       // → 1541
 * getCommunes().filter((c) => c.postalCode === null).length;  // → 27
 * getCommunes().find((c) => c.id === "19-ain-azel-ain-lahdjar")?.postalCode; // → "19018"
 *
 * if (REFORM.mappingComplete) {
 *   getCommunes({ asOf: "58" }).length;                       // → 1541
 * }
 * ```
 *
 * @since 2.0.0
 */
export function getCommunes(opts?: AsOfOptions): readonly Commune[] {
  if (wantsLegacyView(opts)) return communes58();
  return COMMUNES;
}

/**
 * One wilaya by its numeric code.
 *
 * @param code - A wilaya code, `1`..`69`. The **number** `19`, not the padded
 *   string `"19"` — that is `codeText`, and it is the v1 → v2 migration trap.
 * @param opts - Optional. `{ asOf: "58" }` answers from the pre-reform map, so
 *   `getWilaya(59, { asOf: "58" })` is `undefined` — wilaya 59 did not exist —
 *   and a mère comes back with its aggregated counts.
 * @returns The wilaya, or `undefined` if the code is not a real one (reachable
 *   only from untyped JavaScript or a cast — `getWilaya(70)` is a compile
 *   error).
 * @throws {ReformMappingUnavailableError} for `asOf: "58"` only, while
 *   `REFORM.mappingComplete` is `false`.
 *
 * @example
 * ```ts
 * getWilaya(19)?.name.fr;      // → "Setif"
 * getWilaya(19)?.name.ar;      // → "سطيف"
 * getWilaya(19)?.communeCount; // → 60
 * getWilaya(6)?.name.fr;       // → "Bejaia"   — no accent; the dataset has none
 * getWilaya(6)?.codeText;      // → "06"
 * getWilaya(31)?.name.fr;      // → "Oran"
 * getWilaya(16)?.name.en;      // → "Algiers"  — the one exonym in the dataset
 *
 * getWilaya(69)?.parentWilaya; // → null       — Messaad; mère not yet sourced
 * "parentWilaya" in getWilaya(19)!;  // → false — Setif predates the reform
 * ```
 *
 * @since 2.0.0
 */
export function getWilaya(code: WilayaCode, opts?: AsOfOptions): Wilaya | undefined {
  if (wantsLegacyView(opts)) return wilaya58(code);
  return wilayaIdx().get(code);
}

/**
 * One daïra by its library-assigned id.
 *
 * The id **is** the composite `(wilaya, slug)` key — there are only 545 distinct
 * daïra names for 591 daïras, so the wilaya prefix is part of the identity, not
 * decoration. It is passed as one string because that is how it is stored and
 * how it arrives back from a database column; there is no key to assemble at the
 * call site.
 *
 * @param id - A daïra id, e.g. `"19-ain-azel"`. Library-assigned, not an
 *   official government code.
 * @returns The daïra, or `undefined` if no daïra has that id.
 *
 * @example
 * ```ts
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
 * One commune by its library-assigned id.
 *
 * @param id - A commune id, e.g. `"19-ain-azel-ain-lahdjar"` — wilaya code,
 *   daïra slug, commune slug. Library-assigned, not an official government code,
 *   but stable by promise.
 * @param opts - Optional. `{ asOf: "58" }` returns the same record with its
 *   `wilaya` attribution rewritten to the pre-reform mère. The `id` is
 *   identical in both views — ids never move with `asOf`.
 * @returns The commune, or `undefined` if no commune has that id.
 * @throws {ReformMappingUnavailableError} for `asOf: "58"` only, while
 *   `REFORM.mappingComplete` is `false`.
 *
 * @example
 * ```ts
 * getCommune("19-ain-azel-ain-lahdjar")?.name.fr;     // → "Ain Lahdjar"
 * getCommune("19-ain-azel-ain-lahdjar")?.postalCode;  // → "19018"
 * getCommune("19-ain-azel-ain-lahdjar")?.daira;       // → "19-ain-azel"
 * getCommune("32-sidi-ameur-sidi-ameur")?.postalCode; // → null (one of the 27)
 * getCommune("nope");                                 // → undefined
 * ```
 *
 * @since 2.0.0
 */
export function getCommune(id: string, opts?: AsOfOptions): Commune | undefined {
  if (wantsLegacyView(opts)) return commune58(id);
  return communeIdx().get(id);
}

/**
 * One whole wilaya as a nested tree: the wilaya, its daïras, and each daïra's
 * communes.
 *
 * Called with a **literal** code, the return type narrows `code` and `name` to
 * that wilaya's own literal types — `byWilaya(19)?.name.fr` is `"Setif"`, not
 * `string` — while the rest of the record shape stays uniform. `byWilaya(70)` is
 * a compile error, not a runtime `undefined`.
 *
 * The subtree is built on first request for that code and memoized, so asking
 * for Setif never materializes the other 68 wilayas.
 *
 * @typeParam C - Inferred from a literal argument; this is what drives the
 *   narrowing.
 * @param code - A wilaya code, `1`..`69`.
 * @returns The wilaya with `dairas`, each daïra with `communes`, or `undefined`
 *   if the code is not a real one (reachable only from untyped JavaScript).
 *
 * @example
 * ```ts
 * const setif = byWilaya(19);
 * setif?.name.fr;        // → "Setif"   (narrowed to the literal "Setif")
 * setif?.codeText;       // → "19"
 * setif?.dairas.length;  // → 20
 * setif?.dairas.reduce((n, d) => n + d.communes.length, 0); // → 60
 * setif?.dairas.find((d) => d.id === "19-ain-azel")?.communes.map((c) => c.name.fr);
 * // → ["Ain Azel", "Ain Lahdjar", "Beidha Bordj", "Bir Haddada"]
 *
 * byWilaya(6)?.name.fr;  // → "Bejaia"
 * // byWilaya(70);       // ✗ Argument of type '70' is not assignable to 'WilayaCode'
 * ```
 *
 * @since 2.0.0
 */
export function byWilaya<C extends WilayaCode>(
  code: C,
): (WilayaTree & { readonly code: C; readonly name: NameOf<C> }) | undefined;
export function byWilaya(code: WilayaCode): WilayaTree | undefined {
  return tree(code);
}

/**
 * All communes sharing a 5-digit postal code.
 *
 * Postal codes are not unique: 38 of the 1471 distinct codes in the dataset are
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
 * findByPostalCode("19018").map((c) => c.name.fr);
 * // → ["Ain Lahdjar"]                 — 19018 belongs to exactly one commune
 *
 * findByPostalCode("10031").map((c) => c.wilaya);
 * // → [10, 20]                        — one of the 38 shared codes: `Ain El Hadjar`
 * //                                      exists in both Bouira and Saida
 *
 * findByPostalCode("00000");     // → []  — well-formed, matches nothing
 * findByPostalCode("not a code"); // → []
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
 * Every commune whose name matches, after normalization.
 *
 * **Exact match on the normalized form** — not a prefix, substring or fuzzy
 * search; use {@link search} for those. Normalization means the query is folded
 * the same way the corpus was: case, accents, apostrophes and hyphens are all
 * ignored, and Arabic orthographic variants are unified. So `"Alger Centre"`,
 * `"alger centre"` and `"ALGER-CENTRE"` are one query, and the Arabic name finds
 * the same records.
 *
 * Always an array: 38 commune names are duplicated across wilayas. Read the
 * `wilaya` field to disambiguate.
 *
 * @param name - A commune name in Arabic, French or English, in any casing.
 * @returns Every commune with that name, or an empty array. Never `undefined`.
 *
 * @example
 * ```ts
 * findCommunesByName("Ain Lahdjar").map((c) => c.id);
 * // → ["19-ain-azel-ain-lahdjar"]
 *
 * findCommunesByName("Sidi Ameur").map((c) => c.wilaya);   // → [32, 64]
 * findCommunesByName("Souk El Had").map((c) => c.wilaya);  // → [35, 48]
 *
 * // The Arabic name عين الحجر is shared by three communes with two different
 * // French names — `Ain Lahdjar` in Setif and `Ain El Hadjar` in Bouira and Saida.
 * findCommunesByName("عين الحجر").map((c) => c.wilaya);     // → [10, 19, 20]
 *
 * findCommunesByName("Nowhere");                           // → []
 * ```
 *
 * @since 2.0.0
 */
export function findCommunesByName(name: string): readonly Commune[] {
  const hit = nameIdx().get(normalize(name));
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
 * getCommunesOfWilaya(19).length;                        // → 60  (Setif)
 * getCommunesOfWilaya(19).every((c) => c.wilaya === 19); // → true
 * getCommunesOfWilaya(69).length;                        // → 8   (Messaad)
 * ```
 *
 * @since 2.0.0
 */
export function getCommunesOfWilaya(code: WilayaCode): readonly Commune[] {
  return communesOfWilaya(code);
}

/**
 * Every daïra of one wilaya, in dataset order.
 *
 * @param code - A wilaya code, `1`..`69`.
 * @returns The wilaya's daïras, or an empty array. Never `undefined`. The union
 *   over all 69 codes is exactly 591 daïras.
 *
 * @example
 * ```ts
 * getDairasOfWilaya(19).length;                    // → 20  (Setif)
 * getDairasOfWilaya(19).map((d) => d.id).includes("19-ain-azel"); // → true
 * getDairasOfWilaya(69).length;                    // → 2   (Messaad)
 * ```
 *
 * @since 2.0.0
 */
export function getDairasOfWilaya(code: WilayaCode): readonly Daira[] {
  return dairasOfWilaya(code);
}
