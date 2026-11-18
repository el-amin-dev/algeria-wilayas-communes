/**
 * The eight v1 type names, reproduced field for field.
 *
 * This file is a **transcription**, not a design. Every interface below is
 * copied from the published `packages/js/index.d.ts` of v1.0.0, in the same
 * order, with the same field names and the same mutability — which is to say
 * **none of it is `readonly`**. That is deliberate and it is the point:
 *
 * - v1 handed callers the live `JSON.parse` result, so `getCommunes()[0].nom_fr = "X"`
 *   compiled *and* persisted. The v2 legacy projections keep both halves of that
 *   (see `project.ts`, "Deliberately not frozen"), so the types must keep the
 *   mutable half too. Adding `readonly` here would break source compatibility
 *   for every v1 program that assigns into a record — a compile error on
 *   upgrade, for zero runtime benefit.
 * - The v2 surface in `../types.ts` is `readonly` throughout. The two
 *   conventions coexist on purpose: the root is pure v2, `/legacy` is pure v1.
 *   Nothing here should be "harmonized" with the v2 shapes.
 *
 * **These names collide with the v2 ones.** `Commune`, `Daira` and `Wilaya`
 * exist in both surfaces with entirely different shapes. They are only ever
 * reachable through `algeria-wilayas-communes/legacy`, never re-exported from
 * the root under these names, and that separation is decision D5.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// The nested tree — what `getAll()` and `byWilaya()` return
// ---------------------------------------------------------------------------

/**
 * A commune inside the nested tree, v1 shape.
 *
 * `code_postal` is `string | null`, never `undefined`: `null` means *published
 * as absent* for the 30 communes with no code, and v1 emitted exactly that.
 *
 * @example
 * ```ts
 * const c: Commune = { nom_ar: "عين الحجر", nom_fr: "Ain Lahdjar",
 *                      nom_en: "Ain Lahdjar", code_postal: "19018" };
 * ```
 */
export interface Commune {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

/**
 * A daïra inside the nested tree, v1 shape.
 *
 * ⚠️ **The field order declared here is NOT the runtime key order.** This
 * interface is transcribed from v1's `index.d.ts`, which lists `nb_communes`
 * before `communes`. The committed `data/algeria.json` and the 69
 * `data/by-wilaya/NN.json` files put `communes` **before** `nb_communes`. A
 * TypeScript interface imposes no runtime key order, and the acceptance gate is
 * `JSON.stringify(getAll())` against the bytes on disk — the harder constraint —
 * so **the on-disk order wins** in `project.ts`. Both are correct as written;
 * neither should be "tidied" to match the other.
 *
 * @example
 * ```ts
 * const d: Daira | undefined = byWilaya(19)?.dairas.find((x) => x.nom_fr === "Ain Azel");
 * d?.nb_communes; // → 4
 * ```
 */
export interface Daira {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_communes: number;
  communes: Commune[];
}

/**
 * A wilaya with its daïras nested inside — what `byWilaya()` returns, and each
 * element of `getAll().wilayas`.
 *
 * ⚠️ **`code` is the zero-padded STRING**, `"19"` / `"06"` — not the number.
 * v2's `Wilaya.code` is the *number* `19` and its `codeText` is the padded
 * string. Same field name, different type across the major: that is the single
 * most common v1 → v2 migration trap, and it is exactly why this layer exists.
 *
 * @example
 * ```ts
 * const setif = byWilaya(19);
 * setif?.wilaya_num;   // → 19    (number)
 * setif?.code;         // → "19"  (padded string)
 * setif?.nom_fr;       // → "Setif"
 * setif?.nb_dairas;    // → 20
 * setif?.nb_communes;  // → 60
 * ```
 */
export interface Wilaya {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
  dairas: Daira[];
}

// ---------------------------------------------------------------------------
// The three flat views — `getWilayas()`, `getDairas()`, `getCommunes()`
// ---------------------------------------------------------------------------

/**
 * Flat wilaya record — `Wilaya` minus `dairas`, i.e. the rows of
 * `data/wilayas.json`.
 *
 * @example
 * ```ts
 * getWilayas()[18];
 * // → { wilaya_num: 19, code: "19", nom_ar: "سطيف", nom_fr: "Setif",
 * //     nom_en: "Setif", nb_dairas: 20, nb_communes: 60 }
 * ```
 */
export interface WilayaFlat {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
}

/**
 * Flat daïra record — the rows of `data/dairas.json`.
 *
 * ⚠️ **EIGHT fields, and there is NO `wilaya_ar`.** {@link CommuneFlat} below
 * carries all three parent-name languages; this one carries only `wilaya_fr`
 * and `wilaya_en`. That asymmetry is almost certainly an oversight in the
 * original `jq` filter that produced `data/dairas.json` — and it is reproduced
 * here **deliberately**.
 *
 * `data/*.json` is a published contract: it is served over the jsDelivr CDN and
 * consumed by the jq, Python and Java examples in the root README. Adding
 * `wilaya_ar` would change what `getDairas()` returns and what every CDN
 * consumer receives. It is recorded as a **candidate v3 change** — a
 * major-version data break — not something to slip in here. The same note is
 * repeated at the daïra projection in `project.ts`, and in
 * `scripts/build-data.ts` Phase 3, so nobody "fixes" it from any of the three
 * places it is visible.
 *
 * @example
 * ```ts
 * getDairas().find((d) => d.nom_fr === "Ain Azel");
 * // → { wilaya_num: 19, wilaya_code: "19", wilaya_fr: "Setif",
 * //     wilaya_en: "Setif", nom_ar: "عين أزال", nom_fr: "Ain Azel",
 * //     nom_en: "Ain Azel", nb_communes: 4 }
 * ```
 */
export interface DairaFlat {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_fr: string;
  wilaya_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_communes: number;
}

/**
 * Flat commune record — the rows of `data/communes.json`, carrying the full
 * wilaya + daïra context denormalized onto every row.
 *
 * **TWELVE fields, and it DOES have `wilaya_ar`** — see the asymmetry note on
 * {@link DairaFlat}.
 *
 * @example
 * ```ts
 * findCommune("ain lahdjar")[0];
 * // → { wilaya_num: 19, wilaya_code: "19", wilaya_ar: "سطيف",
 * //     wilaya_fr: "Setif", wilaya_en: "Setif", daira_ar: "عين أزال",
 * //     daira_fr: "Ain Azel", daira_en: "Ain Azel", nom_ar: "عين الحجر",
 * //     nom_fr: "Ain Lahdjar", nom_en: "Ain Lahdjar", code_postal: "19018" }
 * ```
 */
export interface CommuneFlat {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_ar: string;
  wilaya_fr: string;
  wilaya_en: string;
  daira_ar: string;
  daira_fr: string;
  daira_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

// ---------------------------------------------------------------------------
// The document envelope — `getAll()`
// ---------------------------------------------------------------------------

/** The `pays` object at the root of the document. */
export interface Country {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_iso: string;
}

/**
 * The whole document — what `getAll()` returns, i.e. `data/algeria.json`.
 *
 * **One deliberate improvement over v1, and it is not a break.** v1 declared
 * this interface with six fields plus an index signature:
 *
 * ```ts
 * interface Algeria { pays; langues; nb_wilayas; nb_dairas; nb_communes; wilayas;
 *                     [key: string]: unknown }
 * ```
 *
 * That index signature silently swallowed **six real top-level keys** that
 * `data/algeria.json` has always carried — `reforme`, `hierarchie`,
 * `codes_postaux_renseignes`, `codes_postaux_manquants`, `note_daira` and
 * `sources`. Reading any of them typed as `unknown`, so a v1 consumer had to
 * cast before they could do anything at all with the value. All six are typed
 * **explicitly** below instead, and the index signature is gone.
 *
 * This is a strict improvement, not a break. `unknown` is the least useful type
 * in the language: nothing could be *done* with a value of that type without a
 * cast, so no working v1 program depended on it for anything but a cast that
 * still compiles — and each of the six now typechecks *without* the cast. The
 * only construct that stops compiling is indexing with a key that is not one of
 * the twelve, which was never a real key of this document and never returned
 * anything but `undefined`. It must be listed as an explicit **non-break** so
 * nobody mistakes the `.d.ts` diff for one.
 *
 * The runtime key order is the on-disk order of `data/algeria.json`, which is
 * what this declaration lists; `project.ts` writes it out literally.
 *
 * @example
 * ```ts
 * const dz = getAll();
 * dz.nb_wilayas;                 // → 69
 * dz.nb_dairas;                  // → 585
 * dz.nb_communes;                // → 1541
 * dz.codes_postaux_manquants;    // → 27      (a number in v2; `unknown` in v1)
 * dz.wilayas[18]?.nom_fr;        // → "Setif"
 * ```
 */
export interface Algeria {
  pays: Country;
  langues: string[];
  /** e.g. `"69 wilayas (Loi 26-06, 2025/2026)"`. Was `unknown` in v1. */
  reforme: string;
  /** e.g. `"pays > wilaya > daira > commune"`. Was `unknown` in v1. */
  hierarchie: string;
  nb_wilayas: number;
  nb_dairas: number;
  nb_communes: number;
  /** Communes with a published postal code — 1511. Was `unknown` in v1. */
  codes_postaux_renseignes: number;
  /** Communes with `code_postal: null` — 27. Was `unknown` in v1. */
  codes_postaux_manquants: number;
  /** The daïra-membership caveat, in French. Was `unknown` in v1. */
  note_daira: string;
  /** Provenance strings for the dataset. Was `unknown` in v1. */
  sources: string[];
  wilayas: Wilaya[];
}
