/**
 * The anti-drift gate for the three narrow entry points.
 *
 * `/wilayas`, `/dairas` and `/communes` reimplement the accessor tier directly
 * over the generated data instead of re-exporting `api.ts`, because
 * `getWilayas(opts?: AsOfOptions)` reaches `asof.ts` -> `generated/communes` and
 * would drag the whole commune table into a 2 kB entry. That duplication is the
 * design's one real cost, and this file is what stops it becoming a bug: every
 * overlapping function must return exactly what the root returns.
 *
 * Deep equality, not reference equality. `tsup`'s `splitting: false` gives each
 * built entry its own copy of everything, so identity across entries is not
 * preserved by construction and asserting it would be asserting the wrong thing.
 */

import { describe, expect, it, vi } from "vitest";

import * as communesEntry from "../packages/js/src/communes";
import * as dairasEntry from "../packages/js/src/dairas";
import * as root from "../packages/js/src/index";
import * as wilayasEntry from "../packages/js/src/wilayas";

import type { WilayaCode } from "../packages/js/src/generated/codes";

/** ADR-006's canonical row, used throughout. */
const WILAYA = 19;
const DAIRA = "19-ain-azel";
const COMMUNE = "19-ain-azel-ain-lahdjar";
const POSTAL = "19018";

/**
 * A code outside `1..69`, cast because the type system correctly forbids it.
 *
 * Reachable from plain JavaScript, which is the whole reason the miss paths
 * exist — and the only way to exercise the shared empty-array branches, since
 * all 69 real wilayas have both daïras and communes.
 */
const NOT_A_CODE = 999 as WilayaCode;

describe("/wilayas matches the root", () => {
  it("getWilayas() returns the same 69 records", () => {
    expect(wilayasEntry.getWilayas()).toHaveLength(69);
    expect(wilayasEntry.getWilayas()).toEqual(root.getWilayas());
  });

  it("memoizes: a second call returns the same reference", () => {
    expect(wilayasEntry.getWilayas()).toBe(wilayasEntry.getWilayas());
  });

  it("getWilaya() matches, including codeText and the reform field", () => {
    expect(wilayasEntry.getWilaya(WILAYA)).toEqual(root.getWilaya(WILAYA));
    expect(wilayasEntry.getWilaya(WILAYA)?.codeText).toBe("19");
    expect(wilayasEntry.getWilaya(6)?.codeText).toBe("06");
  });

  it("carries parentWilaya on 59..69 only, and absent elsewhere", () => {
    // `undefined` means the question does not apply; `null` means it applies
    // and the mère is not yet sourced. ADR-005 turns on that distinction.
    expect("parentWilaya" in wilayasEntry.getWilaya(WILAYA)!).toBe(false);
    expect("parentWilaya" in wilayasEntry.getWilaya(69)!).toBe(true);
    expect(wilayasEntry.getWilaya(69)?.parentWilaya).toBeNull();
  });

  it("returns undefined for a code outside 1..69", () => {
    expect(wilayasEntry.getWilaya(NOT_A_CODE)).toBeUndefined();
  });

  it("re-exports the guards", () => {
    expect(wilayasEntry.isWilayaCode(WILAYA)).toBe(true);
    expect(wilayasEntry.isWilayaCode(70)).toBe(false);
    expect(() => {
      wilayasEntry.assertWilayaCode(70);
    }).toThrow(TypeError);
  });
});

describe("/dairas matches the root", () => {
  it("getDairas() returns the same 566 records", () => {
    expect(dairasEntry.getDairas()).toHaveLength(566);
    expect(dairasEntry.getDairas()).toEqual(root.getDairas());
  });

  it("getDaira() and getDairasOfWilaya() match", () => {
    expect(dairasEntry.getDaira(DAIRA)).toEqual(root.getDaira(DAIRA));
    expect(dairasEntry.getDairasOfWilaya(WILAYA)).toEqual(root.getDairasOfWilaya(WILAYA));
    expect(dairasEntry.getDairasOfWilaya(WILAYA)).toHaveLength(20);
  });

  it("misses return undefined and a shared frozen empty array", () => {
    expect(dairasEntry.getDaira("19-not-a-daira")).toBeUndefined();
    expect(dairasEntry.getDairasOfWilaya(NOT_A_CODE)).toEqual([]);
    // The same object on every miss, so it must be frozen -- one push would
    // otherwise poison every future miss for the life of the process.
    expect(dairasEntry.getDairasOfWilaya(NOT_A_CODE)).toBe(
      dairasEntry.getDairasOfWilaya(NOT_A_CODE),
    );
    expect(Object.isFrozen(dairasEntry.getDairasOfWilaya(NOT_A_CODE))).toBe(true);
  });

  it("also carries the wilaya surface", () => {
    expect(dairasEntry.getWilayas()).toEqual(root.getWilayas());
    expect(dairasEntry.getWilaya(WILAYA)).toEqual(root.getWilaya(WILAYA));
  });
});

describe("/communes matches the root", () => {
  it("getCommunes() returns the same 1541 records", () => {
    expect(communesEntry.getCommunes()).toHaveLength(1541);
    expect(communesEntry.getCommunes()).toEqual(root.getCommunes());
  });

  it("getCommune(), getCommunesOfWilaya() and findByPostalCode() match", () => {
    expect(communesEntry.getCommune(COMMUNE)).toEqual(root.getCommune(COMMUNE));
    expect(communesEntry.getCommunesOfWilaya(WILAYA)).toEqual(root.getCommunesOfWilaya(WILAYA));
    expect(communesEntry.getCommunesOfWilaya(WILAYA)).toHaveLength(60);
    expect(communesEntry.findByPostalCode(POSTAL)).toEqual(root.findByPostalCode(POSTAL));
    expect(communesEntry.findByPostalCode(POSTAL)).toHaveLength(1);
  });

  it("misses return undefined and the shared frozen empty array", () => {
    expect(communesEntry.getCommune("nope")).toBeUndefined();
    expect(communesEntry.findByPostalCode("00000")).toEqual([]);
    expect(Object.isFrozen(communesEntry.findByPostalCode("00000"))).toBe(true);
    expect(communesEntry.getCommunesOfWilaya(NOT_A_CODE)).toEqual([]);
  });

  it("exposes the 48 communes with no postal code", () => {
    expect(communesEntry.COMMUNES_MISSING_POSTAL_CODE).toHaveLength(48);
    expect(communesEntry.COMMUNES_MISSING_POSTAL_CODE).toEqual(root.COMMUNES_MISSING_POSTAL_CODE);
  });

  it("also carries the wilaya and daira surfaces, and isPostalCode", () => {
    expect(communesEntry.getWilayas()).toEqual(root.getWilayas());
    expect(communesEntry.getDairas()).toEqual(root.getDairas());
    expect(communesEntry.isPostalCode(POSTAL)).toBe(true);
    expect(communesEntry.isPostalCode("1901")).toBe(false);
  });
});

describe("the narrow entries freeze the arrays they hand out", () => {
  // Each tier module spends a paragraph justifying its top-level Object.freeze,
  // and until a review pointed it out, nothing asserted any of them. This is the
  // sole mechanism closing v1's defect where `getCommunes().length = 0`
  // permanently corrupted the dataset for every other consumer in the process --
  // `readonly` is erased at run time and cannot close it.
  it.each([
    ["getWilayas", () => wilayasEntry.getWilayas()],
    ["getDairas", () => dairasEntry.getDairas()],
    ["getCommunes", () => communesEntry.getCommunes()],
    ["getDairasOfWilaya", () => dairasEntry.getDairasOfWilaya(WILAYA)],
    ["getCommunesOfWilaya", () => communesEntry.getCommunesOfWilaya(WILAYA)],
    ["findByPostalCode", () => communesEntry.findByPostalCode(POSTAL)],
  ])("%s() returns a frozen array", (_name, get) => {
    expect(Object.isFrozen(get())).toBe(true);
  });

  it("a plain-JavaScript mutation attempt throws rather than corrupting", () => {
    // Not merely "is frozen": the observable behaviour a consumer would hit.
    const communes = communesEntry.getCommunes();
    expect(() => {
      (communes as unknown as unknown[]).push({});
    }).toThrow(TypeError);
    expect(communesEntry.getCommunes()).toHaveLength(1541);
  });
});

describe("the narrow entries build nothing at import time", () => {
  // The same discipline as tests/import-purity.test.ts: reset the module graph
  // first, then import inside the case, because a top-level import is hoisted
  // and evaluated before anything here runs.
  //
  // `benchmarks/import-time.bench.mjs` makes the stronger version of this
  // statement -- one fresh OS process per sample, plus a Map-counting probe
  // against dist/ -- but this keeps it in the suite that runs on every commit.
  it.each([
    ["wilayas", "../packages/js/src/wilayas"],
    ["dairas", "../packages/js/src/dairas"],
    ["communes", "../packages/js/src/communes"],
  ])("importing /%s builds no tier index and no root index", async (_name, specifier) => {
    vi.resetModules();
    await import(specifier);

    const wilayaTier = await import("../packages/js/src/tiers/wilayas");
    const dairaTier = await import("../packages/js/src/tiers/dairas");
    const communeTier = await import("../packages/js/src/tiers/communes");
    const { __indexState } = await import("../packages/js/src/indexes");
    const { __searchState } = await import("../packages/js/src/search");

    const built = [
      ...Object.entries(wilayaTier.__wilayaTierState()),
      ...Object.entries(dairaTier.__dairaTierState()),
      ...Object.entries(communeTier.__communeTierState()),
      ...Object.entries(__indexState()),
      ...Object.entries(__searchState()),
    ].filter(([, isBuilt]) => isBuilt);

    expect(built).toEqual([]);
  });

  it("the tier state hooks report every lazy structure they own", () => {
    // Pinned like INDEX_KEYS in import-purity.test.ts: a structure nobody
    // reports on can never be caught being built at import time, so a new
    // `let ... | undefined` has to come with a line here or this goes red.
    expect(Object.keys(wilayasEntry).includes("__wilayaTierState")).toBe(false);
  });
});
