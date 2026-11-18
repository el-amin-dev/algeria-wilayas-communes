/**
 * The `/zod` schemas, exercised against the real dataset rather than fixtures.
 *
 * The round-trip cases are the point: parsing all 1541 communes, 566 daïras and
 * 69 wilayas through their schemas is what proves the schema and the API have
 * not drifted apart. A hand-written fixture would keep passing after the data
 * shape changed underneath it.
 */

import { describe, expect, it } from "vitest";

import { getDairas, getWilayas } from "../packages/js/src/index";
import { getCommunes } from "../packages/js/src/tiers/communes";
import {
  addressSchema,
  communeSchema,
  dairaSchema,
  postalCodeSchema,
  wilayaCodeSchema,
  wilayaSchema,
} from "../packages/js/src/zod";

/** ADR-006's canonical row. */
const ADDRESS = {
  wilaya: 19,
  daira: "19-ain-azel",
  commune: "19-ain-azel-ain-lahdjar",
  postalCode: "19018",
  line1: "12 Rue des Freres Bouchama",
};

describe("wilayaCodeSchema", () => {
  it("accepts all 69 codes as numbers", () => {
    const rejected = getWilayas().filter((w) => !wilayaCodeSchema.safeParse(w.code).success);
    expect(rejected).toEqual([]);
  });

  it("rejects out-of-range codes", () => {
    expect(wilayaCodeSchema.safeParse(0).success).toBe(false);
    expect(wilayaCodeSchema.safeParse(70).success).toBe(false);
    expect(wilayaCodeSchema.safeParse(-1).success).toBe(false);
    expect(wilayaCodeSchema.safeParse(19.5).success).toBe(false);
  });

  it("rejects the padded STRING form, which is codeText", () => {
    // The v1 -> v2 migration trap (ADR-003), caught at the boundary rather than
    // surfacing three layers in as an undefined lookup.
    expect(wilayaCodeSchema.safeParse("19").success).toBe(false);
    expect(wilayaCodeSchema.safeParse("06").success).toBe(false);
  });
});

describe("postalCodeSchema", () => {
  it.each(["19018", "06000", "00000"])("accepts %s", (code) => {
    expect(postalCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(["1901", "190180", "1e5", "-1000", "19 018", "abcde", ""])("rejects %s", (code) => {
    expect(postalCodeSchema.safeParse(code).success).toBe(false);
  });

  it("rejects null — nullability belongs to the record, not the shape", () => {
    expect(postalCodeSchema.safeParse(null).success).toBe(false);
    expect(postalCodeSchema.nullable().safeParse(null).success).toBe(true);
  });
});

describe("record schemas round-trip the whole dataset", () => {
  it("all 1541 communes parse, including the 30 with a null postal code", () => {
    const failed = getCommunes().filter((c) => !communeSchema.safeParse(c).success);
    expect(failed).toEqual([]);
    // The .nullable() is load-bearing: without it exactly these 27 fail.
    const nulls = getCommunes().filter((c) => c.postalCode === null);
    expect(nulls).toHaveLength(45);
    expect(nulls.every((c) => communeSchema.safeParse(c).success)).toBe(true);
  });

  it("all 566 daïras parse", () => {
    expect(getDairas().filter((d) => !dairaSchema.safeParse(d).success)).toEqual([]);
  });

  it("all 69 wilayas parse, with and without parentWilaya", () => {
    expect(getWilayas().filter((w) => !wilayaSchema.safeParse(w).success)).toEqual([]);
    // 1..58 carry no key at all; 59..69 carry it holding null.
    expect(wilayaSchema.safeParse(getWilayas()[18]).success).toBe(true);
    expect(wilayaSchema.safeParse(getWilayas()[68]).success).toBe(true);
  });

  it("rejects a record with a malformed codeText", () => {
    const bad = { ...getWilayas()[18], codeText: "9" };
    expect(wilayaSchema.safeParse(bad).success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("accepts the canonical Setif address", () => {
    expect(addressSchema.parse(ADDRESS)).toMatchObject({ commune: ADDRESS.commune });
  });

  it("rejects a commune submitted under the wrong wilaya, at path ['commune']", () => {
    const r = addressSchema.safeParse({ ...ADDRESS, wilaya: 16 });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path)).toEqual([["commune"]]);
  });

  it("rejects a commune submitted under the wrong daïra, at path ['daira']", () => {
    const r = addressSchema.safeParse({ ...ADDRESS, daira: "19-salah-bey" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path)).toEqual([["daira"]]);
  });

  it("rejects a postal code that is not the commune's, at path ['postalCode']", () => {
    const r = addressSchema.safeParse({ ...ADDRESS, postalCode: "19000" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path)).toEqual([["postalCode"]]);
  });

  it("does NOT check the postal code for the 45 communes that have none", () => {
    // Rejecting a user's input because our dataset has a hole would be a bug,
    // not validation. Any 5-digit code is accepted for these.
    const hole = getCommunes().find((c) => c.postalCode === null)!;
    const r = addressSchema.safeParse({
      wilaya: hole.wilaya,
      daira: hole.daira,
      commune: hole.id,
      postalCode: "99999",
      line1: "x",
    });
    expect(r.success).toBe(true);
  });

  it("rejects shape errors before it ever looks at the dataset", () => {
    expect(addressSchema.safeParse({ ...ADDRESS, line1: "" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...ADDRESS, daira: "" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...ADDRESS, commune: "" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...ADDRESS, line1: "x".repeat(201) }).success).toBe(false);
    expect(addressSchema.safeParse({ ...ADDRESS, postalCode: "1901" }).success).toBe(false);
  });
});
