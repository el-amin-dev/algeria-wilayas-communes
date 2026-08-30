/**
 * The reform layer in the state it actually SHIPS: the 58 → 69 parent mapping
 * unfilled, `REFORM.mappingComplete === false`, and the derived API refusing to
 * answer.
 *
 * ── Why this file exists at all ─────────────────────────────────────────────
 *
 * Loi 26-06 (JO n°25, 5 April 2026) took Algeria from 58 wilayas to 69. The
 * *wilaya mère* of each of the 11 new wilayas is **not in the dataset** — no
 * `mere`, `parent`, `legacy`, `ancien`, `rattach` or `delegue` field exists at
 * any nesting level of `data/algeria.json`. Two derived heuristics (majority
 * postal-code prefix, shared daïra names) agree on 3 of the 11 rows, contradict
 * each other on 2, and say nothing about the other 6. So the mapping ships as
 * eleven `null`s and the derived API throws rather than guessing (ADR-005).
 *
 * A wrong `parentWilaya` misroutes real postal mail and real government
 * paperwork with the full authority of a package that advertises handling the
 * transition correctly. That is worse than shipping nothing, which is why the
 * assertions below are written as a **tripwire on the shipped data**, not just
 * as a description of the code.
 *
 * ── What each section is guarding ───────────────────────────────────────────
 *
 * 1. Metadata is readable and pinned — reading the law and the dates never
 *    throws, because those facts ARE known.
 * 2. The stub really is unfilled. If anyone ever pastes the unverified
 *    postal-prefix candidate table into `data/raw/reform.json`, section 2 goes
 *    red before the mapping can reach a consumer.
 * 3. `REFORM` is deeply frozen, so `REFORM.mappingComplete = true` from plain
 *    JavaScript cannot switch the gate off.
 * 4. `parentWilaya`: absent on 1–58, present-and-`null` on 59–69. `undefined`
 *    means the question does not apply; `null` means it applies and we do not
 *    yet know the answer.
 * 5. Every derived entry point throws `ReformMappingUnavailableError`, and the
 *    message names the file a maintainer has to edit.
 * 6. Every default-path call still works. The gate must be invisible to the
 *    99 % of callers who never ask for the 58-map.
 *
 * The day the mapping lands, sections 2 and 5 flip to their positive form and
 * that diff is the reviewable record of the change. `tests/reform.filled.test.ts`
 * already exercises the positive side against a fixture.
 */

import { describe, expect, it } from "vitest";

import {
  REFORM,
  ReformMappingUnavailableError,
  byWilaya,
  findByPostalCode,
  getCommune,
  getCommunes,
  getDairas,
  getWilaya,
  getWilayas,
  resolveCurrentWilaya,
  resolveLegacyWilaya,
  search,
} from "../packages/js/src/index";
import type { WilayaCode } from "../packages/js/src/index";

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A real commune id, so the `asOf` gate is exercised on a hit, not a miss. */
const COMMUNE_ID = "19-ain-azel-ain-lahdjar";

/** The 11 wilayas created by Loi 26-06, ascending. */
const NEW_CODES = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69];

/** The 58 wilayas that predate Loi 26-06. */
const OLD_CODES = Array.from({ length: 58 }, (_, i) => i + 1);

/**
 * Run `fn`, require that it threw an `Error`, and hand the error back so the
 * name, the message and the prototype chain can all be asserted on one throw.
 */
function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) return error;
    return expect.unreachable(`threw a non-Error value: ${String(error)}`);
  }
  return expect.unreachable("did not throw");
}

/**
 * Every entry point that depends on the 58 → 69 mapping, as `[label, call]`.
 *
 * Named exhaustively rather than sampled: each of these is a separate call site
 * in `api.ts` / `asof.ts` / `reform.ts`, and a gate check dropped from any one
 * of them would leak an answer derived from eleven `null`s.
 */
const DERIVED_CALLS: readonly [string, () => unknown][] = [
  ["resolveLegacyWilaya(68)", () => resolveLegacyWilaya(68)],
  ["resolveCurrentWilaya(17)", () => resolveCurrentWilaya(17)],
  ['getWilayas({ asOf: "58" })', () => getWilayas({ asOf: "58" })],
  ['getDairas({ asOf: "58" })', () => getDairas({ asOf: "58" })],
  ['getCommunes({ asOf: "58" })', () => getCommunes({ asOf: "58" })],
  ['getWilaya(17, { asOf: "58" })', () => getWilaya(17, { asOf: "58" })],
  ['getCommune(id, { asOf: "58" })', () => getCommune(COMMUNE_ID, { asOf: "58" })],
];

// ── 1. REFORM is readable, and every metadata field is pinned ───────────────

describe("REFORM metadata", () => {
  it("is readable while the mapping is incomplete, and never throws", () => {
    expect(() => REFORM.law).not.toThrow();
    expect(REFORM.mappingComplete).toBe(false);
  });

  it("pins all seven metadata fields", () => {
    // Hard-coded literals, not re-read from the generated module: a test that
    // derives its expectation from its subject proves only that the subject
    // equals itself. These seven come from Loi 26-06 / JO n°25.
    expect(REFORM.law).toBe("Loi 26-06");
    expect(REFORM.journalOfficiel).toBe("JO n°25");
    expect(REFORM.publishedOn).toBe("2026-04-05");
    expect(REFORM.transitionDeadline).toBe("2026-12-31");
    expect(REFORM.operationalFrom).toBe("2027-01-01");
    expect(REFORM.previousWilayaCount).toBe(58);
    expect(REFORM.currentWilayaCount).toBe(69);
  });

  it("carries exactly the 11 new wilayas, codes 59..69 ascending", () => {
    expect(REFORM.newWilayas).toHaveLength(11);
    expect(REFORM.newWilayas.map((entry) => entry.code)).toEqual(NEW_CODES);
  });

  it("orders the dates publishedOn < transitionDeadline < operationalFrom", () => {
    // ISO-8601 dates sort lexicographically, which is why the field contract
    // demands YYYY-MM-DD. Publication precedes the end of the progressive
    // transfer of powers, which precedes full operation of the 11 new wilayas.
    const dates = [REFORM.publishedOn, REFORM.transitionDeadline, REFORM.operationalFrom];
    expect([...dates].sort()).toEqual(dates);
  });
});

// ── 2. TRIPWIRE — the stub really is unfilled ───────────────────────────────

describe("the shipped mapping is a stub, and stays one", () => {
  // ⚠ THIS BLOCK IS A TRIPWIRE, NOT A DESCRIPTION.
  //
  // The session document lists a CANDIDATE mapping derived from majority postal
  // prefixes (59→03 Laghouat, 68→17 Djelfa, …). It is an unverified heuristic,
  // not a source: the postal prefix already disagrees with the wilaya code for
  // 94 of the 1408 coded communes in wilayas 1–58 (6.7 %). If anyone ever pastes
  // that table into `data/raw/reform.json`, these three assertions go red before
  // the guessed values can reach a consumer's shipping label. Filling the
  // mapping is legitimate ONLY from the text of Loi 26-06 / JO n°25, one row at
  // a time, each with a citation — and that commit is expected to rewrite this
  // block by hand, which is exactly the review moment it exists to force.
  it("has parentCode null on all 11 entries", () => {
    expect(REFORM.newWilayas.map((entry) => entry.parentCode)).toEqual(NEW_CODES.map(() => null));
  });

  it("has source null on all 11 entries", () => {
    expect(REFORM.newWilayas.map((entry) => entry.source)).toEqual(NEW_CODES.map(() => null));
  });

  it('has confidence "unverified" on all 11 entries', () => {
    expect(REFORM.newWilayas.map((entry) => entry.confidence)).toEqual(
      NEW_CODES.map(() => "unverified"),
    );
  });

  it("reports mappingComplete false, which is what gates the derived API", () => {
    expect(REFORM.mappingComplete).toBe(false);
  });
});

// ── 3. REFORM is deeply frozen — the gate cannot be switched off ────────────

describe("REFORM is frozen", () => {
  it("freezes the wrapper, the table and every entry", () => {
    expect(Object.isFrozen(REFORM)).toBe(true);
    expect(Object.isFrozen(REFORM.newWilayas)).toBe(true);
    for (const entry of REFORM.newWilayas) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });

  it("refuses a plain-JavaScript REFORM.mappingComplete = true", () => {
    // `readonly` is erased at run time. Without the freeze, one assignment from
    // untyped JavaScript would switch off the entire safety gate and every
    // `asOf: "58"` call would start answering from a table of eleven `null`s.
    // ESM modules are strict mode, so the assignment throws rather than failing
    // silently — even louder, and just as safe.
    expect(() => {
      (REFORM as unknown as { mappingComplete: boolean }).mappingComplete = true;
    }).toThrow(TypeError);

    expect(REFORM.mappingComplete).toBe(false);
    expect(() => resolveLegacyWilaya(68)).toThrow(ReformMappingUnavailableError);
  });

  it("refuses a push onto the newWilayas table", () => {
    expect(() => {
      (REFORM.newWilayas as unknown as ReformNewWilayaTable).push(REFORM.newWilayas[0]);
    }).toThrow(TypeError);
    expect(REFORM.newWilayas).toHaveLength(11);
  });
});

/** The mutable view of the table, used only to prove the freeze holds. */
type ReformNewWilayaTable = { push: (entry: unknown) => number };

// ── 4. parentWilaya — absent vs. present-and-null ───────────────────────────

describe("Wilaya.parentWilaya", () => {
  it("is present and null on a new wilaya", () => {
    expect(getWilaya(59)?.parentWilaya).toBeNull();
  });

  it("is absent — not null — on a wilaya that predates the reform", () => {
    const alger = getWilaya(16);
    expect(alger).toBeDefined();
    expect("parentWilaya" in (alger ?? {})).toBe(false);
    expect(alger?.parentWilaya).toBeUndefined();
  });

  it.each(OLD_CODES)("wilaya %i (1..58) has no parentWilaya key at all", (code) => {
    // The boundary is checked on EVERY code, not sampled. `undefined` here means
    // "the question does not apply" — these wilayas have no wilaya mère — and
    // the distinction from `null` is the whole point of the field.
    const wilaya = getWilaya(code as WilayaCode);
    expect(wilaya).toBeDefined();
    expect("parentWilaya" in (wilaya ?? {})).toBe(false);
  });

  it.each(NEW_CODES)("wilaya %i (59..69) has the key, holding null", (code) => {
    // `null` means "the question applies and we do not yet know the answer".
    // Reading it is a plain field read, not a lookup, so it never throws.
    const wilaya = getWilaya(code as WilayaCode);
    expect(wilaya).toBeDefined();
    expect("parentWilaya" in (wilaya ?? {})).toBe(true);
    expect(wilaya?.parentWilaya).toBeNull();
  });
});

// ── 5. The gate — every derived entry point throws ──────────────────────────

describe("the derived API refuses to answer while mappingComplete is false", () => {
  it.each(DERIVED_CALLS)("%s throws ReformMappingUnavailableError", (_label, call) => {
    expect(call).toThrow(ReformMappingUnavailableError);
  });

  it.each(DERIVED_CALLS)("%s names data/raw/reform.json in the message", (_label, call) => {
    // The message has to say which file a maintainer edits to fix this. An error
    // that only says "unavailable" sends the reader to the source; this one is
    // debuggable in a single read.
    expect(thrown(call).message).toContain("data/raw/reform.json");
  });

  it.each(DERIVED_CALLS)("%s throws a real Error subclass", (_label, call) => {
    const error = thrown(call);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReformMappingUnavailableError);
    // `name` is pinned as an own property so a `catch` block can discriminate
    // without relying on `instanceof` surviving a bundler's class re-wrapping.
    expect(error.name).toBe("ReformMappingUnavailableError");
  });

  it("points at REFORM.mappingComplete as the branch to take instead", () => {
    const message = thrown(() => resolveLegacyWilaya(68)).message;
    expect(message).toContain("REFORM.mappingComplete");
    expect(message).toContain("Loi 26-06");
  });
});

// ── 6. The default path is unconditionally safe ─────────────────────────────

describe("every default-path call still works with the mapping unfilled", () => {
  it("returns the full 69 / 591 / 1541 dataset", () => {
    expect(getWilayas()).toHaveLength(69);
    expect(getDairas()).toHaveLength(591);
    expect(getCommunes()).toHaveLength(1541);
  });

  it('accepts an explicit asOf: "69" everywhere the option exists', () => {
    expect(getWilayas({ asOf: "69" })).toHaveLength(69);
    expect(getDairas({ asOf: "69" })).toHaveLength(591);
    expect(getCommunes({ asOf: "69" })).toHaveLength(1541);
    expect(getWilaya(19, { asOf: "69" })?.name.fr).toBe("Setif");
    expect(getCommune(COMMUNE_ID, { asOf: "69" })?.name.fr).toBe("Ain Lahdjar");
  });

  it("answers the singular lookups", () => {
    expect(getWilaya(19)?.codeText).toBe("19");
    expect(getCommune(COMMUNE_ID)?.wilaya).toBe(19);
    expect(byWilaya(19)?.dairas).toHaveLength(20);
  });

  it("answers the plural lookups and search", () => {
    expect(findByPostalCode("19018")).toHaveLength(1);
    expect(search("setif").length).toBeGreaterThan(0);
  });

  it("throws from none of them", () => {
    // The negative form of the whole block: the gate lives on the `asOf: "58"`
    // branch only, and a stray `assertMappingAvailable()` on a default path
    // would take the entire library down while the stub is unfilled.
    const defaultCalls: readonly (() => unknown)[] = [
      () => getWilayas(),
      () => getWilayas({ asOf: "69" }),
      () => getDairas(),
      () => getDairas({ asOf: "69" }),
      () => getCommunes(),
      () => getCommunes({ asOf: "69" }),
      () => getWilaya(19),
      () => getWilaya(59),
      () => getCommune(COMMUNE_ID),
      () => byWilaya(19),
      () => findByPostalCode("19018"),
      () => search("setif"),
    ];
    for (const call of defaultCalls) expect(call).not.toThrow();
  });
});

// ── 7. asOf: "69" costs the default path nothing ────────────────────────────

describe('asOf: "69" is the same object as no options at all', () => {
  it("getWilayas", () => {
    // Object identity, not deep equality. `asOf: "69"` must be one strict
    // comparison and a return of the already-frozen array — no copy, no second
    // 69-record allocation for the 99 % of callers who never leave the default.
    expect(getWilayas({ asOf: "69" })).toBe(getWilayas());
  });

  it("getDairas", () => {
    expect(getDairas({ asOf: "69" })).toBe(getDairas());
  });

  it("getCommunes", () => {
    expect(getCommunes({ asOf: "69" })).toBe(getCommunes());
  });

  it("and the accessors are stable across calls", () => {
    expect(getWilayas()).toBe(getWilayas());
    expect(getDairas()).toBe(getDairas());
    expect(getCommunes()).toBe(getCommunes());
  });
});

// ── The asOf option rejects junk rather than answering from the wrong map ────

describe("an invalid asOf is a loud TypeError, never a silent fall-through", () => {
  // The tempting implementation, `opts?.asOf === "58" ? legacy : current`, fails
  // SILENTLY: a caller who writes `{ asOf: 58 }` — the numeric form, which is the
  // likeliest typo in a library where WilayaCode is deliberately numeric — asked
  // for the 58-map and would be handed all 69 wilayas with the post-reform ones
  // mixed in, no error anywhere. That is a wrong shipping label produced by a
  // typo. Same argument as the root shipping no default export: fail at the call,
  // not at a distance.
  // Labelled explicitly rather than stringified in the test name: `String({})`
  // is "[object Object]", which names nothing useful when a case fails.
  const junk: ReadonlyArray<readonly [label: string, value: unknown]> = [
    ["the number 58 — the likeliest typo, since WilayaCode is numeric", 58],
    ["the number 69", 69],
    ['the string "57"', "57"],
    ['the string "1958"', "1958"],
    ["the empty string", ""],
    ["null", null],
    ["an object", {}],
    ["a boolean", true],
  ];

  for (const [label, bad] of junk) {
    it(`rejects ${label}`, () => {
      for (const call of [
        () => getWilayas({ asOf: bad as never }),
        () => getDairas({ asOf: bad as never }),
        () => getCommunes({ asOf: bad as never }),
        () => getWilaya(19, { asOf: bad as never }),
        () => getCommune("19-ain-azel-ain-lahdjar", { asOf: bad as never }),
      ]) {
        expect(call).toThrow(TypeError);
      }
    });
  }

  it('still accepts the two valid values, and "69" stays free', () => {
    expect(getWilayas({ asOf: "69" })).toBe(getWilayas());
    expect(getDairas({ asOf: "69" })).toBe(getDairas());
    expect(getCommunes({ asOf: "69" })).toBe(getCommunes());
    // "58" is valid, so it reaches the reform gate rather than the type guard.
    expect(() => getWilayas({ asOf: "58" })).toThrow(ReformMappingUnavailableError);
  });
});
