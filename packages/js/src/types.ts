/**
 * The public type surface.
 *
 * Two rules hold everywhere below:
 *
 * 1. **Every member is `readonly`, every array is `readonly T[]`.** That is the
 *    whole mutability contract for TypeScript consumers, and it costs zero
 *    runtime bytes. The three bulk arrays are additionally `Object.freeze`d in
 *    `api.ts` so plain-JavaScript consumers cannot `push` or `length = 0` the
 *    shared data. The individual records are **not** deep-frozen: that would be
 *    ~6000 `Object.freeze` calls on the import path, which is exactly the
 *    import-time work the lazy-index invariant forbids. Residual hole, stated
 *    plainly: *records are typed `readonly`; mutating one from untyped
 *    JavaScript is possible and unsupported.*
 *
 * 2. **The record shapes are the generated shapes, verbatim.** `Daira` and
 *    `Commune` are re-exported from `generated/` rather than redeclared, so the
 *    accessors can hand back the generated arrays with zero copy and zero
 *    allocation. Children carry their parent by id (`Commune.wilaya` is a
 *    `WilayaCode`, `Commune.daira` is a daira id) — never a denormalized copy
 *    of the parent's names. Join with `getWilaya()` / `getDaira()`.
 *
 * `Wilaya` is the one shape that is *not* verbatim: it gains `codeText`, which
 * is derived lazily in the accessor layer rather than shipped 69 times in the
 * generated data.
 */

import type { WilayaCode } from "./generated/codes";
import type { Commune } from "./generated/communes";
import type { Daira } from "./generated/dairas";
import type { Wilaya as GeneratedWilaya } from "./generated/wilayas";

/**
 * An official Algerian wilaya code, `1`..`69` (Loi 26-06).
 *
 * Re-exported from the generated layer rather than hand-written: a 69-member
 * union typed by hand rots the moment a reform adds a wilaya.
 *
 * @example
 * ```ts
 * const setif: WilayaCode = 19;
 * ```
 *
 * @since 2.0.0
 */
export type { WilayaCode } from "./generated/codes";

/**
 * A daïra — the intermediate level, between a wilaya and its communes.
 *
 * `id` is library-assigned (`"19-ain-azel"`), not a government identifier;
 * `wilaya` is the parent's numeric code.
 *
 * @example
 * ```ts
 * const d: Daira | undefined = getDaira("19-ain-azel");
 * d?.name.fr;        // → "Ain Azel"
 * d?.wilaya;         // → 19          (Setif)
 * d?.communeCount;   // → 4
 * ```
 *
 * @since 2.0.0
 */
export type { Daira } from "./generated/dairas";

/**
 * A commune — the smallest Algerian administrative unit.
 *
 * `id` is library-assigned (`"19-ain-azel-ain-lahdjar"`), not a government
 * identifier. `postalCode` is `PostalCode | null`, never optional: `null` says
 * *published as absent* for the 27 communes with no code, where `undefined`
 * would say *we did not look*.
 *
 * @example
 * ```ts
 * const c: Commune | undefined = getCommune("19-ain-azel-ain-lahdjar");
 * c?.name.fr;     // → "Ain Lahdjar"
 * c?.name.ar;     // → "عين الحجر"
 * c?.postalCode;  // → "19018"
 * c?.wilaya;      // → 19            (Setif)
 * c?.daira;       // → "19-ain-azel"
 * ```
 *
 * @since 2.0.0
 */
export type { Commune } from "./generated/communes";

/**
 * A five-digit Algerian postal code, e.g. `"19018"`.
 *
 * Deliberately a *branded string*, not the template-literal type
 * `` `${number}${number}${number}${number}${number}` ``. That form is wrong in
 * both directions on this dataset: `${number}` accepts `"1e5"`, `"-1"` and
 * `"1.5"`, while TypeScript rejects a leading zero — so it would refuse every
 * real code in wilaya 05 (Batna), all of which start with `0`.
 *
 * The brand erases to `string` at run time and is only mintable through
 * {@link isPostalCode}, which does the real `/^\d{5}$/` check. Use it for values
 * you **store and pass around**; query arguments such as
 * `findByPostalCode(code)` take a plain `string` on purpose.
 *
 * @example
 * ```ts
 * declare function store(p: PostalCode): void;
 * const raw = "19018";
 * // store(raw);              // ✗ a raw string is not a PostalCode
 * if (isPostalCode(raw)) store(raw); // ✓ narrowed by the guard
 * ```
 *
 * @since 2.0.0
 */
export type PostalCode = string & { readonly __brand: "PostalCode" };

/**
 * One of the 69 wilayas — the top level of the hierarchy, and the only level
 * with an official government identifier.
 *
 * Two identity fields, because both are real:
 *
 * - `code` is the **number** `19` — the API identity and the member type of the
 *   {@link WilayaCode} union. This is what `byWilaya()` and `getWilaya()` take.
 * - `codeText` is the zero-padded official form `"19"` — plates, ID cards,
 *   postal prefixes. It is *derived* here in the accessor layer, not shipped in
 *   the generated data, keeping 69 duplicate strings off the wire.
 *
 * ⚠️ **Migration trap.** `code` survives the v1 → v2 rename verbatim, but v1's
 * `code` was the padded *string* `"16"` and v2's is the *number* `16`. So
 * `` `${w.code}` `` yields `"1"` where v1 yielded `"01"` — silently, and exactly
 * where it matters (postal prefixes, plate numbers). Use `codeText` there.
 *
 * @example
 * ```ts
 * const setif = getWilaya(19);
 * setif?.code;         // → 19      (number)
 * setif?.codeText;     // → "19"    (zero-padded string)
 * setif?.name;         // → { ar: "سطيف", fr: "Setif", en: "Setif" }
 * setif?.dairaCount;   // → 20
 * setif?.communeCount; // → 60
 *
 * getWilaya(6)?.codeText;  // → "06"  — Bejaia; the padding is why codeText exists
 * ```
 *
 * @since 2.0.0
 */
export interface Wilaya extends GeneratedWilaya {
  /** Zero-padded official form, `"01"`..`"69"`. Always `String(code).padStart(2, "0")`. */
  readonly codeText: string;
}

/**
 * A daïra inside a {@link WilayaTree}, carrying its communes inline.
 *
 * The only shape in the library that denormalizes, and it does so because the
 * caller explicitly asked for a tree.
 *
 * @example
 * ```ts
 * const tree = byWilaya(19);
 * const ainAzel = tree?.dairas.find((d) => d.id === "19-ain-azel");
 * ainAzel?.communes.map((c) => c.name.fr);
 * // → ["Ain Azel", "Ain Lahdjar", "Beidha Bordj", "Bir Haddada"]
 * ```
 *
 * @since 2.0.0
 */
export interface DairaSubtree extends Daira {
  /** Every commune of this daïra, in dataset order. */
  readonly communes: readonly Commune[];
}

/**
 * A whole wilaya with its daïras and their communes nested inside — what
 * {@link byWilaya} returns.
 *
 * Built lazily per requested wilaya and memoized, so asking for the same wilaya
 * twice costs one `Map` lookup and asking for one wilaya never materializes the
 * other 68.
 *
 * @example
 * ```ts
 * const setif = byWilaya(19);
 * setif?.name.fr;        // → "Setif"
 * setif?.dairas.length;  // → 20
 * setif?.dairas.reduce((n, d) => n + d.communes.length, 0); // → 60
 * ```
 *
 * @since 2.0.0
 */
export interface WilayaTree extends Wilaya {
  /** Every daïra of this wilaya, in dataset order, each with its communes. */
  readonly dairas: readonly DairaSubtree[];
}

/**
 * The `name` object of one specific wilaya, selected by its literal code.
 *
 * This is the machinery behind {@link byWilaya}'s literal-argument narrowing:
 * `byWilaya(19)` gives `name.fr` the literal type `"Setif"` rather than
 * `string`. It narrows **only** `name` (and `code`) — deliberately not the whole
 * record. A union of 69 complete wilaya record types would bloat the emitted
 * `.d.ts` and make every consumer's `tsc` re-check that union at every call
 * site, including consumers who never narrow a wilaya.
 *
 * @typeParam C - A wilaya code. Pass a literal (`16`) to narrow; pass the whole
 *   {@link WilayaCode} union to get the union of all 69 name objects.
 *
 * @example
 * ```ts
 * type SetifName = NameOf<19>;
 * // → { readonly ar: "سطيف"; readonly fr: "Setif"; readonly en: "Setif" }
 *
 * type AlgerName = NameOf<16>;
 * // → { readonly ar: "الجزائر"; readonly fr: "Alger"; readonly en: "Algiers" }
 * //   the one record in 2201 where `en` differs from `fr`
 * ```
 *
 * @since 2.0.0
 */
export type NameOf<C extends WilayaCode> = Extract<
  (typeof import("./generated/wilayas"))["WILAYAS"][number],
  { code: C }
>["name"];
