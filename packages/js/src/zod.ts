/**
 * `algeria-wilayas-communes/zod` — optional [Zod](https://zod.dev) schemas for
 * validating Algerian administrative data at a trust boundary: a checkout form,
 * an API request body, a CSV import.
 *
 * ── zod is an OPTIONAL PEER, never a dependency ─────────────────────────────
 *
 * `packages/js/package.json` declares `peerDependencies.zod` together with
 * `peerDependenciesMeta.zod.optional = true`. That flag is what tells npm 7+,
 * pnpm and yarn **not to install it** and **not to warn** when it is absent —
 * without it every consumer of `getWilayas()` would silently acquire zod, and
 * the package's zero-runtime-dependency claim would be false.
 *
 * Concretely, the user who wants schemas installs zod; the user who does not
 * never hears about it. Importing this subpath without zod installed fails at
 * build time with a plain `Cannot find module 'zod'`, which is the correct and
 * debuggable failure.
 *
 * **Nothing outside this file may import zod, and nothing may import this
 * file.** `src/zod.ts` is a leaf. If the root entry reached it, `require()` of
 * the package would break for everyone without zod, and `tsup`'s
 * `external: ["zod"]` would leave a bare `import "zod"` in `dist/index.mjs` that
 * a browser bundler resolves eagerly and fails on.
 *
 * ── Written against zod v3 AND v4 ───────────────────────────────────────────
 *
 * The peer range is `^3.23.0 || ^4.0.0`, so this file is restricted to the API
 * subset that behaves identically in both majors: `z.object/string/number/
 * literal/union/nullable/optional`, `.regex/.min/.max/.superRefine/.parse/
 * .safeParse`, `{ message: "…" }` as the second argument, and `z.infer`. No
 * transforms (v3 and v4 diverge on `z.input`/`z.output`), no `z.coerce` (v4
 * changed number coercion), no `errorMap` (renamed in v4), and
 * `ctx.addIssue({ code: "custom" })` as the string literal rather than
 * `z.ZodIssueCode.custom`, which moved in v4.
 *
 * ── Everything is derived; nothing is hand-typed ────────────────────────────
 *
 * The 69 wilaya codes come from the generated `WILAYA_CODES` tuple, so a reform
 * that adds wilaya 70 updates the schema by rebuilding the data. A hand-written
 * list of 69 literals would rot silently, which is the whole failure mode
 * `generated/codes.ts` exists to prevent.
 *
 * @module
 */

import { z } from "zod";

import { WILAYA_CODES } from "./generated/codes";
import { getCommunesOfWilaya } from "./tiers/communes";

import type { WilayaCode } from "./generated/codes";

/**
 * One arm of {@link wilayaCodeSchema}.
 *
 * `WILAYA_CODES.map((c) => z.literal(c))` types `c` as the full `WilayaCode`
 * union rather than as each element's own literal, so every arm is
 * `ZodLiteral<WilayaCode>` and `z.infer` of the union collapses back to exactly
 * `WilayaCode`. That is the property `tests/zod.test-d.ts` pins.
 */
type WilayaCodeArm = z.ZodLiteral<WilayaCode>;

/**
 * A wilaya code: one of the 69 **numbers** `1`..`69`.
 *
 * Numbers, not the zero-padded strings `"01".."69"` — see ADR-003. `"19"` is
 * `Wilaya.codeText`, a derived display form, and passing it here is rejected.
 * That rejection is the point: it is the v1 → v2 migration trap, caught at the
 * boundary instead of surfacing as an `undefined` lookup three layers in.
 *
 * @example
 * ```ts
 * wilayaCodeSchema.parse(19);              // → 19    (Setif)
 * wilayaCodeSchema.safeParse(6).success;   // → true  (Bejaia, codeText "06")
 * wilayaCodeSchema.safeParse(70).success;  // → false — only 1..69 exist
 * wilayaCodeSchema.safeParse(0).success;   // → false
 * wilayaCodeSchema.safeParse("19").success; // → false — that is codeText
 * ```
 *
 * @since 2.0.0
 */
export const wilayaCodeSchema = z.union(
  WILAYA_CODES.map((c) => z.literal(c)) as unknown as [
    WilayaCodeArm,
    WilayaCodeArm,
    ...WilayaCodeArm[],
  ],
);

/**
 * A well-formed Algerian postal code: exactly five digits, as a string.
 *
 * Note the two things it deliberately does **not** do:
 *
 * - **It does not check the code exists in the dataset.** Shape validation and
 *   membership are different questions; use `findByPostalCode` for the second.
 * - **It does not accept `null`.** Nullability is applied at the record level
 *   ({@link communeSchema}), because that is where the 30 holes live — a *form*
 *   asking a user for their postal code should require one.
 *
 * @example
 * ```ts
 * postalCodeSchema.parse("19018");             // → "19018"  (Ain Lahdjar)
 * postalCodeSchema.safeParse("06000").success; // → true  — leading zero preserved
 * postalCodeSchema.safeParse("1901").success;  // → false — four digits
 * postalCodeSchema.safeParse("190180").success; // → false — six
 * postalCodeSchema.safeParse("1e5").success;    // → false
 * postalCodeSchema.safeParse("19 018").success; // → false
 * ```
 *
 * @since 2.0.0
 */
export const postalCodeSchema = z
  .string()
  .regex(/^\d{5}$/, { message: "Algerian postal codes are exactly 5 digits" });

/**
 * The trilingual name object every record carries.
 *
 * Internal on purpose. It is a two-line shape, and exporting it would add a
 * symbol this major version has to support forever in exchange for nothing a
 * caller cannot write themselves.
 */
const nameSchema = z.object({ ar: z.string(), fr: z.string(), en: z.string() });

/**
 * A {@link Commune} record, field for field.
 *
 * **`.nullable()` on `postalCode` is load-bearing.** 27 of the 1541 communes
 * have no postal code in the reference data; without it,
 * `getCommunes().every((c) => communeSchema.safeParse(c).success)` fails on
 * exactly those 27. `tests/zod.test.ts` parses all 1541 to pin it.
 *
 * @example
 * ```ts
 * communeSchema.parse({
 *   id: "19-ain-azel-ain-lahdjar",
 *   wilaya: 19,
 *   daira: "19-ain-azel",
 *   name: { ar: "عين الحجر", fr: "Ain Lahdjar", en: "Ain Lahdjar" },
 *   postalCode: "19018",
 * });
 * ```
 *
 * @since 2.0.0
 */
export const communeSchema = z.object({
  id: z.string(),
  wilaya: wilayaCodeSchema,
  daira: z.string(),
  name: nameSchema,
  postalCode: postalCodeSchema.nullable(),
});

/**
 * A {@link Daira} record, field for field.
 *
 * @example
 * ```ts
 * dairaSchema.parse({
 *   id: "19-ain-azel",
 *   wilaya: 19,
 *   name: { ar: "عين أزال", fr: "Ain Azel", en: "Ain Azel" },
 *   communeCount: 4,
 * });
 * ```
 *
 * @since 2.0.0
 */
export const dairaSchema = z.object({
  id: z.string(),
  wilaya: wilayaCodeSchema,
  name: nameSchema,
  communeCount: z.number().int().positive(),
});

/**
 * A {@link Wilaya} record, field for field — including the derived `codeText`
 * and the reform's `parentWilaya`.
 *
 * `parentWilaya` is `.nullable().optional()` because the field carries a
 * three-way distinction the reform layer depends on: **absent** on codes
 * `1`..`58` (the question does not apply), **present and `null`** on `59`..`69`
 * (it applies and the mère is not yet sourced from Loi 26-06), and present with
 * a code once it is. See ADR-005.
 *
 * @example
 * ```ts
 * wilayaSchema.parse({
 *   code: 19, codeText: "19",
 *   name: { ar: "سطيف", fr: "Setif", en: "Setif" },
 *   dairaCount: 20, communeCount: 60,
 * });                                    // ✓ no parentWilaya — Setif predates the reform
 * ```
 *
 * @since 2.0.0
 */
export const wilayaSchema = z.object({
  code: wilayaCodeSchema,
  codeText: z.string().regex(/^\d{2}$/, { message: 'codeText is the zero-padded code, e.g. "06"' }),
  name: nameSchema,
  dairaCount: z.number().int().positive(),
  communeCount: z.number().int().positive(),
  parentWilaya: wilayaCodeSchema.nullable().optional(),
});

/**
 * A submitted Algerian postal address, validated **against the dataset** rather
 * than merely against a shape.
 *
 * This is the recipe most people arrive at this subpath for. Beyond the field
 * shapes it enforces three cross-field facts:
 *
 * 1. the commune actually belongs to the submitted wilaya;
 * 2. the commune actually belongs to the submitted daïra;
 * 3. the postal code matches the commune's own — **unless the commune is one of
 *    the 30 with no postal code in the dataset**, in which case the check is
 *    skipped. Rejecting a user's input because our data has a hole would be a
 *    bug, not validation.
 *
 * Three design points worth keeping:
 *
 * - **`.superRefine`, not chained `.refine` calls.** It is what lets each
 *   failure attach to the *right form field path*, which is what makes this
 *   usable with react-hook-form and friends.
 * - **Membership is checked with the wilaya-scoped lookup and matched on `id`.**
 *   38 commune names repeat across wilayas (`Sidi Ameur` in 32 and 64,
 *   `Souk El Had` in 35 and 48), so a name is not a key.
 * - **The postal code is never used to derive the commune.** 17 postal codes are
 *   shared by more than one commune, so a code alone does not identify one.
 *
 * `postalCode` is required here, unlike on {@link communeSchema} — a record may
 * have a hole; a form asking a person for their address should not.
 *
 * @example
 * ```ts
 * addressSchema.parse({
 *   wilaya: 19,
 *   daira: "19-ain-azel",
 *   commune: "19-ain-azel-ain-lahdjar",
 *   postalCode: "19018",
 *   line1: "12 Rue des Freres Bouchama",
 * });                                     // ✓ passes
 *
 * // The same commune submitted under Alger:
 * const bad = addressSchema.safeParse({
 *   wilaya: 16,
 *   daira: "19-ain-azel",
 *   commune: "19-ain-azel-ain-lahdjar",
 *   postalCode: "19018",
 *   line1: "…",
 * });
 * bad.success;                  // → false
 * bad.error?.issues[0]?.path;   // → ["commune"]
 * ```
 *
 * @since 2.0.0
 */
export const addressSchema = z
  .object({
    wilaya: wilayaCodeSchema,
    daira: z.string().min(1),
    commune: z.string().min(1),
    postalCode: postalCodeSchema,
    line1: z.string().min(1).max(200),
  })
  .superRefine((value, ctx) => {
    const commune = getCommunesOfWilaya(value.wilaya).find((c) => c.id === value.commune);

    if (commune === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["commune"],
        message: `Commune ${value.commune} does not belong to wilaya ${String(value.wilaya)}`,
      });
      return;
    }

    if (commune.daira !== value.daira) {
      ctx.addIssue({
        code: "custom",
        path: ["daira"],
        message: `Commune ${commune.name.fr} is in daira ${commune.daira}, not ${value.daira}`,
      });
    }

    // The 45 communes with no postal code in the reference data are exempt:
    // our gap must not become the user's error.
    if (commune.postalCode !== null && commune.postalCode !== value.postalCode) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: `Expected ${commune.postalCode} for ${commune.name.fr}`,
      });
    }
  });
