/**
 * Type-level tests. **These assert nothing at run time.**
 *
 * `expectTypeOf` and `@ts-expect-error` are erased before execution, so
 * `vitest run` will happily "pass" a file full of broken type claims because it
 * never type-checks it. They only run under `vitest --typecheck`, which is why
 * `vitest.config.ts` sets `typecheck.enabled: true` with
 * `include: ["tests/**\/*.test-d.ts"]`, and why `pnpm test:types` is its own
 * script and its own CI step. `pnpm typecheck` (`tsc --noEmit` over a program
 * that includes `tests/`) is the second net: it catches an unused
 * `@ts-expect-error` even if vitest's typechecker were misconfigured.
 *
 * Two mechanisms, both required, because they prove different things.
 *
 * - `expectTypeOf` proves a type IS what we claim.
 * - `@ts-expect-error` proves a call does NOT compile. The mechanic is the
 *   point: the directive suppresses an error on the next line and ITSELF
 *   becomes an error when the next line does not error. So if someone widens
 *   `byWilaya`'s parameter from `WilayaCode` to `number`, the suppression has
 *   nothing left to suppress and the build fails with "Unused '@ts-expect-error'
 *   directive". A positive test could never catch that.
 *
 * This file is the compile-time half of a claim whose run-time half lives in
 * `tests/api.lookups.test.ts` (`getWilaya(70 as WilayaCode)` returns
 * `undefined`). Either half alone is half a test.
 */

import { describe, expectTypeOf, it } from "vitest";

import {
  assertWilayaCode,
  byWilaya,
  findByPostalCode,
  findCommunesByName,
  getCommune,
  getCommunes,
  getCommunesOfWilaya,
  getDaira,
  getDairas,
  getDairasOfWilaya,
  getWilaya,
  getWilayas,
  isPostalCode,
  isWilayaCode,
  search,
} from "../packages/js/src/index";
import type {
  Commune,
  Daira,
  PostalCode,
  SearchKind,
  SearchResult,
  Wilaya,
  WilayaCode,
  WilayaTree,
} from "../packages/js/src/index";

/**
 * Ambient stand-ins. They live at module scope because `declare` is only legal
 * there, and they exist so the negative tests below can be about the TYPE and
 * not about how the value was produced.
 */
declare const aWilaya: Wilaya;
declare const aCommune: Commune;
declare const aDaira: Daira;
declare const aResult: SearchResult;
declare function storePostal(p: PostalCode): void;

describe("accessor return types", () => {
  it("returns readonly arrays of the record types", () => {
    expectTypeOf(getWilayas()).toEqualTypeOf<readonly Wilaya[]>();
    expectTypeOf(getDairas()).toEqualTypeOf<readonly Daira[]>();
    expectTypeOf(getCommunes()).toEqualTypeOf<readonly Commune[]>();
  });

  it("returns T | undefined from every singular lookup", () => {
    expectTypeOf(getWilaya(19)).toEqualTypeOf<Wilaya | undefined>();
    expectTypeOf(getDaira("19-ain-azel")).toEqualTypeOf<Daira | undefined>();
    expectTypeOf(getCommune("19-ain-azel-ain-lahdjar")).toEqualTypeOf<Commune | undefined>();
  });

  it("returns readonly T[] from every plural lookup", () => {
    expectTypeOf(findByPostalCode("19018")).toEqualTypeOf<readonly Commune[]>();
    expectTypeOf(findCommunesByName("Ain Lahdjar")).toEqualTypeOf<readonly Commune[]>();
    expectTypeOf(getCommunesOfWilaya(19)).toEqualTypeOf<readonly Commune[]>();
    expectTypeOf(getDairasOfWilaya(19)).toEqualTypeOf<readonly Daira[]>();
  });

  it("never returns any", () => {
    // `toEqualTypeOf` alone would not catch `any` — `any` equals everything.
    expectTypeOf(byWilaya(19)).not.toBeAny();
    expectTypeOf(getWilayas()).not.toBeAny();
    expectTypeOf(search("setif")).not.toBeAny();
  });
});

describe("readonly-ness, asserted as a mutation failure", () => {
  it("rejects push and index assignment on the bulk arrays", () => {
    // Naming the type is NOT enough: the alias could be changed to a mutable
    // array under us and `toEqualTypeOf<Wilaya[]>` would keep passing. The only
    // assertion that survives that is the mutation itself failing to compile.
    const wilayas = getWilayas();
    const communes = getCommunes();

    /* eslint-disable @typescript-eslint/no-unsafe-call --
       Every call below is deliberately @ts-expect-error'd, so the type-aware
       linter cannot resolve a type for it and reports "unsafe call". That the
       call does not type-check IS the assertion; silencing the lint rule here
       is not papering over a problem, it is the only way to state it. The
       disable is scoped to this block and to this one rule. */

    // @ts-expect-error getWilayas() is readonly — push must not compile
    wilayas.push(aWilaya);
    // @ts-expect-error readonly — index assignment must not compile
    wilayas[0] = aWilaya;

    // @ts-expect-error findByPostalCode returns readonly Commune[]
    findByPostalCode("19018").push(aCommune);
    // @ts-expect-error findCommunesByName returns readonly Commune[]
    findCommunesByName("Sidi Ameur").push(aCommune);
    // @ts-expect-error getCommunesOfWilaya returns readonly Commune[]
    getCommunesOfWilaya(19).push(aCommune);
    // @ts-expect-error getDairasOfWilaya returns readonly Daira[]
    getDairasOfWilaya(19).push(aDaira);
    // @ts-expect-error getCommunes() is readonly
    communes.length = 0;

    /* eslint-enable @typescript-eslint/no-unsafe-call */
  });

  it("rejects writing to a record field", () => {
    const setif = getWilaya(19);
    if (setif !== undefined) {
      // @ts-expect-error every member of every record is readonly
      setif.codeText = "99";
      // @ts-expect-error the nested name object is readonly too
      setif.name.fr = "Sétif";
    }
  });
});

describe("byWilaya — literal-argument narrowing", () => {
  it("accepts a literal in the 1..69 union", () => {
    // No directive on this line. It must compile.
    byWilaya(19);
    byWilaya(1);
    byWilaya(69);
    expectTypeOf(byWilaya(19)).toExtend<WilayaTree | undefined>();
  });

  it("narrows code and name on a literal argument", () => {
    const setif = byWilaya(19);
    if (setif !== undefined) {
      expectTypeOf(setif.code).toEqualTypeOf<19>();
      expectTypeOf(setif.name.fr).toEqualTypeOf<"Setif">();
      // Only `code` and `name` narrow. The rest of the record stays uniform —
      // a union of 69 whole record types would bloat the emitted .d.ts and make
      // every consumer's tsc re-check it at every call site.
      expectTypeOf(setif.dairaCount).toEqualTypeOf<number>();
      expectTypeOf(setif.dairas).toEqualTypeOf<WilayaTree["dairas"]>();
    }
  });

  it("narrows the English exonym on the one record that has one", () => {
    // Wilaya 16 is the ONLY record in all 2201 where `name.en` differs from
    // `name.fr`, so it is the only place where narrowing `name` on a literal
    // proves anything about the `en` field. Setif's would just be `"Setif"`.
    const alger = byWilaya(16);
    if (alger !== undefined) {
      expectTypeOf(alger.name.fr).toEqualTypeOf<"Alger">();
      expectTypeOf(alger.name.en).toEqualTypeOf<"Algiers">();
    }
  });

  it("rejects a code outside the union, and rejects a string code", () => {
    // Removing any one of these three directives must make `pnpm typecheck`
    // fail. That is the assertion.
    // @ts-expect-error 70 is not a WilayaCode (1..69)
    byWilaya(70);
    // @ts-expect-error 0 is not a WilayaCode — the codes start at 1
    byWilaya(0);
    // @ts-expect-error "16" is a string, not a WilayaCode
    byWilaya("16");
    // @ts-expect-error a fractional code is not in the union
    byWilaya(16.5);
    // @ts-expect-error a bare number is too wide — it could be 70
    byWilaya(Number("16"));
  });

  it("rejects the same values on every other WilayaCode parameter", () => {
    // @ts-expect-error 70 is not a WilayaCode
    getWilaya(70);
    // @ts-expect-error 70 is not a WilayaCode
    getCommunesOfWilaya(70);
    // @ts-expect-error 70 is not a WilayaCode
    getDairasOfWilaya(70);
    // @ts-expect-error 70 is not a WilayaCode
    search("setif", { wilaya: 70 });
  });
});

describe("the guards narrow, and nothing else does", () => {
  it("takes unknown on isPostalCode, and still narrows a string", () => {
    // The signature widened from `(v: string)` to `(v: unknown)` so that a
    // JavaScript caller cannot smuggle a NUMBER past `RegExp#test`'s coercion
    // and have it branded. Widening a parameter is normally invisible to
    // callers, so both halves are pinned: the new capability, and the old one
    // it must not have cost.
    expectTypeOf(isPostalCode).parameter(0).toEqualTypeOf<unknown>();

    // Still narrows a plain string — the round trip below must keep compiling.
    const raw: string = "19018";
    if (isPostalCode(raw)) expectTypeOf(raw).toEqualTypeOf<PostalCode>();

    // And now narrows an `unknown` with no cast, which is the shape the guard
    // is actually for: a value off a JSON body.
    const fromBody: unknown = "19018";
    if (isPostalCode(fromBody)) {
      expectTypeOf(fromBody).toEqualTypeOf<PostalCode>();
      storePostal(fromBody);
    }

    // A number is accepted as an ARGUMENT (everything is, under `unknown`) and
    // must never be narrowed by it — the guard returns false at run time, and
    // there is no branch here in which `n` is a PostalCode.
    const n: unknown = 19018;
    isPostalCode(n);
  });

  it("only mints a PostalCode through isPostalCode", () => {
    const raw: string = "19018";
    // @ts-expect-error a raw string cannot be a PostalCode without the guard
    storePostal(raw);
    if (isPostalCode(raw)) storePostal(raw); // narrowed — compiles

    // The brand is not forgeable by a number either.
    // @ts-expect-error a number is not a PostalCode
    storePostal(19018);
  });

  it("takes unknown, not number, on isWilayaCode", () => {
    // The value comes from JSON.parse or a form field. A guard typed
    // `(n: number)` would force the caller to cast before validating, which is
    // exactly backwards.
    const fromBody: unknown = 19;
    expectTypeOf(isWilayaCode).parameter(0).toEqualTypeOf<unknown>();
    if (isWilayaCode(fromBody)) {
      expectTypeOf(fromBody).toEqualTypeOf<WilayaCode>();
      getWilaya(fromBody); // narrowed — compiles, no cast
    }
  });

  it("narrows an unknown through the asserts signature", () => {
    const fromArgv: unknown = 19;
    // @ts-expect-error unknown is not a WilayaCode yet
    getWilaya(fromArgv);
    assertWilayaCode(fromArgv);
    getWilaya(fromArgv); // after the assertion — narrowed, compiles
    expectTypeOf(fromArgv).toEqualTypeOf<WilayaCode>();
  });

  it("accepts a plain string on findByPostalCode", () => {
    // Deliberately NOT `PostalCode`: a caller must not be forced to brand a
    // value before they may ask a question. A malformed code simply misses.
    const raw: string = "19018";
    findByPostalCode(raw);
    expectTypeOf(findByPostalCode).parameter(0).toEqualTypeOf<string>();
  });
});

describe("search — the discriminated union", () => {
  it("narrows item on kind with no cast", () => {
    for (const result of search("setif")) {
      if (result.kind === "commune") {
        expectTypeOf(result.item).toEqualTypeOf<Commune>();
        expectTypeOf(result.item.postalCode).toEqualTypeOf<PostalCode | null>();
      } else if (result.kind === "daira") {
        expectTypeOf(result.item).toEqualTypeOf<Daira>();
      } else {
        expectTypeOf(result.item).toEqualTypeOf<Wilaya>();
      }
    }
  });

  it("carries the wilaya record and the matched layer on every result", () => {
    expectTypeOf(aResult.wilaya).toEqualTypeOf<Wilaya>();
    expectTypeOf(aResult.score).toEqualTypeOf<number>();
    expectTypeOf(aResult.matched).toEqualTypeOf<"ar" | "fr" | "en">();
    expectTypeOf(aResult.kind).toEqualTypeOf<SearchKind>();
  });

  it("returns a readonly array", () => {
    expectTypeOf(search("setif")).toEqualTypeOf<readonly SearchResult[]>();

    /* eslint-disable @typescript-eslint/no-unsafe-call --
       see the note in "rejects push and index assignment on the bulk arrays" */
    // @ts-expect-error search() returns readonly SearchResult[]
    search("setif").push(aResult);
    /* eslint-enable @typescript-eslint/no-unsafe-call */
  });

  it("rejects an unknown option and an unknown kind", () => {
    search("setif", { limit: 5, fuzzy: true, kinds: ["commune"], lang: "ar", wilaya: 19 });
    // @ts-expect-error "daïra" is not a SearchKind — the union is ASCII
    search("setif", { kinds: ["daïra"] });
    // @ts-expect-error the union is lowercase; "Commune" is the real-world typo
    search("setif", { kinds: ["Commune"] });
    // @ts-expect-error an unrecognised kind is not silently "wilaya"
    search("setif", { kinds: ["bogus"] });
    // @ts-expect-error "ber" is not a supported language layer
    search("setif", { lang: "ber" });
    // @ts-expect-error maxDistance is never caller-supplied
    search("setif", { maxDistance: 3 });
  });
});
