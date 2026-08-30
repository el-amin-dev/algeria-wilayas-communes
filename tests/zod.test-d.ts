/**
 * Type-level pins for the `/zod` schemas.
 *
 * These assertions are ERASED before run time, so they only execute because
 * `vitest.config.ts` sets `typecheck.enabled: true`. Without that flag this file
 * is decoration.
 *
 * What it catches that a runtime test cannot: the schemas and the accessor API
 * drifting apart in TYPE while still agreeing on VALUES. `wilayaCodeSchema`
 * inferring `number` instead of the 1..69 union would pass every runtime case in
 * `zod.test.ts` and silently destroy the narrowing consumers rely on.
 */

import { expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { WilayaCode } from "../packages/js/src/generated/codes";
import type { Commune, Daira, Wilaya } from "../packages/js/src/types";
import type {
  communeSchema,
  dairaSchema,
  wilayaCodeSchema,
  wilayaSchema,
} from "../packages/js/src/zod";

it("wilayaCodeSchema infers exactly the WilayaCode union", () => {
  // Not `number`. This is the assertion the whole generated-union approach
  // exists to make true.
  expectTypeOf<z.infer<typeof wilayaCodeSchema>>().toEqualTypeOf<WilayaCode>();
});

it("every real record satisfies its schema's inferred type", () => {
  // Asserted in this direction on purpose. The reverse -- inferred extends
  // record -- is FALSE and should be: `Commune.postalCode` is the branded
  // `PostalCode | null`, while the schema infers `string | null`, and a brand
  // cannot be reconstructed by parsing. What matters is that everything the API
  // hands out is accepted by the schema, which is exactly this direction.
  expectTypeOf<Commune>().toExtend<z.infer<typeof communeSchema>>();
  expectTypeOf<Daira>().toExtend<z.infer<typeof dairaSchema>>();
  expectTypeOf<Wilaya>().toExtend<z.infer<typeof wilayaSchema>>();
});

it("the schemas narrow the wilaya field to the union, not to number", () => {
  expectTypeOf<z.infer<typeof communeSchema>["wilaya"]>().toEqualTypeOf<WilayaCode>();
  expectTypeOf<z.infer<typeof dairaSchema>["wilaya"]>().toEqualTypeOf<WilayaCode>();
  expectTypeOf<z.infer<typeof wilayaSchema>["code"]>().toEqualTypeOf<WilayaCode>();
});
