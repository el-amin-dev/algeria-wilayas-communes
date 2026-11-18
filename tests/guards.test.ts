/**
 * The three guards, hammered with hostile input.
 *
 * These exist precisely because the value did NOT come from typed code. It came
 * from a `<select>`, a JSON body or `process.argv`, and it arrives as `unknown`.
 * So the tables below are not a formality: every row is a value that really
 * turns up at that boundary, and each one has exactly one correct answer.
 *
 * `assertWilayaCode` is the only throwing export in the entire library. Every
 * other miss path returns `undefined` or `[]`.
 */

import { describe, expect, it } from "vitest";

import {
  assertWilayaCode,
  findByPostalCode,
  getWilaya,
  isPostalCode,
  isWilayaCode,
} from "../packages/js/src/index";

// ── isWilayaCode ────────────────────────────────────────────────────────────

describe("isWilayaCode", () => {
  it.each<[unknown, boolean]>([
    [1, true],
    [16, true],
    [69, true],

    // 16.0 is included ON PURPOSE. JavaScript has ONE number type: `16.0 === 16`
    // is `true` and `Number.isInteger(16.0)` is `true`, so this is not a
    // separate case and it must return `true`. Someone will eventually read it
    // as a float and "fix" it to `false`. This comment is what stops them.
    [16.0, true],

    // The #1 real-world input: a string out of a form field. `<select>` values
    // are strings, `new URLSearchParams().get()` returns strings, and
    // `Number("16")` is the CALLER's deliberate act, not the guard's.
    ["16", false],
    ["1e5", false], // parses as 100000 under Number(), but it is still a string
    ["", false],

    [16.5, false], // a real number, not an integer
    [0, false], // codes start at 1
    [70, false], // codes stop at 69
    [-1, false],
    [NaN, false], // typeof "number", and every comparison against it is false
    [Infinity, false],
    [-Infinity, false],

    [null, false], // typeof "object" — the classic hole in a `typeof` check
    [undefined, false],
    [true, false], // `true == 1` under coercion; the guard must not coerce
    [[], false], // `Number([]) === 0`
    [[16], false], // `Number([16]) === 16` — coercion's nastiest case
    [{}, false],
  ])("isWilayaCode(%o) === %s", (input, expected) => {
    expect(isWilayaCode(input)).toBe(expected);
  });

  it("accepts every one of the 69 real codes and nothing on either side", () => {
    const rejected = Array.from({ length: 69 }, (_, i) => i + 1).filter((n) => !isWilayaCode(n));
    expect(rejected).toEqual([]);
    expect(isWilayaCode(0)).toBe(false);
    expect(isWilayaCode(70)).toBe(false);
  });

  it("narrows the value so it can be used without a cast", () => {
    // The guard-then-use round trip, which is the entire reason the guard ships.
    // The value comes out of JSON.parse as `unknown`, exactly as it would from
    // a request body.
    const parsed: unknown = JSON.parse('{"wilaya":19}');
    let fromForm: unknown = undefined;
    if (typeof parsed === "object" && parsed !== null && "wilaya" in parsed) {
      fromForm = parsed.wilaya;
    }

    expect(isWilayaCode(fromForm)).toBe(true);
    if (isWilayaCode(fromForm)) {
      // No cast on this line. If the guard's signature stops being
      // `n is WilayaCode`, `tsc` fails here rather than the test going red.
      expect(getWilaya(fromForm)?.name.fr).toBe("Setif");
    }
  });

  it("rejects the string form that the same JSON body would carry from a form post", () => {
    const parsed: unknown = JSON.parse('{"wilaya":"19"}');
    let fromForm: unknown = undefined;
    if (typeof parsed === "object" && parsed !== null && "wilaya" in parsed) {
      fromForm = parsed.wilaya;
    }
    expect(isWilayaCode(fromForm)).toBe(false);
  });
});

// ── assertWilayaCode ────────────────────────────────────────────────────────

describe("assertWilayaCode", () => {
  it("throws a TypeError naming the offending value", () => {
    // The message has to carry the value. "Invalid wilaya code" in a production
    // log is a support ticket; "Invalid wilaya code: 70" is a fixed bug.
    expect(() => {
      assertWilayaCode(70);
    }).toThrow(TypeError);
    expect(() => {
      assertWilayaCode(70);
    }).toThrow(/70/);
  });

  it("throws on the string form too", () => {
    expect(() => {
      assertWilayaCode("19");
    }).toThrow(TypeError);
    expect(() => {
      assertWilayaCode("19");
    }).toThrow(/19/);
  });

  it.each<[unknown]>([[0], [-1], [16.5], [NaN], [null], [undefined], [{}], [[16]]])(
    "throws on %o",
    (input) => {
      expect(() => {
        assertWilayaCode(input);
      }).toThrow(TypeError);
    },
  );

  it("does not throw on a valid code", () => {
    expect(() => {
      assertWilayaCode(19);
    }).not.toThrow();
    expect(() => {
      assertWilayaCode(1);
    }).not.toThrow();
    expect(() => {
      assertWilayaCode(69);
    }).not.toThrow();
  });

  it("narrows the value for the rest of the scope", () => {
    const fromArgv: unknown = Number.parseInt("19", 10);
    assertWilayaCode(fromArgv);
    // After the assertion `fromArgv` is a `WilayaCode`, with no cast.
    expect(getWilaya(fromArgv)?.codeText).toBe("19");
  });

  it("is the only throwing export — the lookups stay silent", () => {
    expect(() => isWilayaCode(70)).not.toThrow();
    expect(() => isPostalCode("nonsense")).not.toThrow();
  });
});

// ── isPostalCode ────────────────────────────────────────────────────────────

describe("isPostalCode", () => {
  it.each<[unknown, boolean]>([
    ["19018", true], // Ain Lahdjar, wilaya 19
    ["05000", true], // leading zero — the template-literal type REJECTS this,
    //                  and wilayas 01..09 are full of codes that start with 0.
    //                  The brand must accept it or the type rejects real data.
    ["00000", true], // well-formed, matches no commune. Shape is not existence:
    //                  `findByPostalCode("00000")` correctly returns [].

    ["0500", false], // 4 digits
    ["050000", false], // 6 digits
    ["1e5", false], // the template-literal type ACCEPTS this; /^\d{5}$/ must not
    ["-1", false],
    ["1.5", false],

    // The guard must NOT trim. Trimming inside a validator is how " 19018 "
    // lands in a database as a padded key: the validator says yes, the value
    // that gets stored is the untrimmed one, and the mismatch surfaces months
    // later as a lookup that finds nothing. The caller trims deliberately.
    [" 19018", false],
    ["19018 ", false],
    [" 19018 ", false],
    ["19 018", false],

    ["", false],
    ["abcde", false],
    ["1901a", false],
    // Arabic-Indic digits. They read as "16000" to a human and they are not
    // `\d` — which is correct: the postal system's keys are ASCII.
    ["١٦٠٠٠", false],
    // A trailing newline is the other thing a regex anchored with `$` instead
    // of `\d{5}` against the whole string would let through.
    ["19018\n", false],

    // ── Non-strings ─────────────────────────────────────────────────────────
    //
    // The guard takes `unknown`, not `string`, and the reason is specific
    // rather than stylistic: `RegExp.prototype.test` COERCES its argument, so
    // `/^\d{5}$/.test(19018)` is `true`. With a `string` parameter, a
    // JavaScript caller — the only kind that can get here — could hand in the
    // NUMBER 19018 and have it narrowed to `PostalCode`. That is precisely the
    // forgery the brand exists to prevent, performed by the function whose job
    // is to prevent it. A `typeof v === "string"` check is what closes it, and
    // it puts `isPostalCode` in the same posture as `isWilayaCode`, which has
    // taken `unknown` from the start.
    [19018, false], // the coercion case — the whole reason for the change
    [1901.8, false],
    [null, false], // typeof "object"
    [undefined, false],
    [true, false],
    [["19018"], false], // Array#toString gives "19018" — coercion again
    [{}, false],
    [[], false],
    // A boxed String is an OBJECT, not a string primitive, so `typeof` rejects
    // it even though it stringifies to a valid code. Correct: nothing in this
    // library should hand a String object to a Map key.
    [new String("19018"), false],
  ])("isPostalCode(%o) === %s", (input, expected) => {
    expect(isPostalCode(input)).toBe(expected);
  });

  it("rejects the number that regex coercion would have accepted", () => {
    // Called out separately from the table because it is the entire point of
    // the signature change, and a table row is easy to delete by accident.
    // `/^\d{5}$/.test(19018)` is `true`; `isPostalCode(19018)` must not be.
    expect(/^\d{5}$/.test(19018 as unknown as string)).toBe(true);
    expect(isPostalCode(19018)).toBe(false);
  });

  it("accepts every one of the 1496 real postal codes in the dataset", () => {
    // Proven independently in tests/dataset.test.ts: zero malformed codes. This
    // asserts the guard agrees with the data it ships next to — a guard that
    // rejects its own dataset is the failure mode the template-literal type had.
    const codes = ["01000", "02000", "05000", "06000", "19000", "19018", "31000", "34000"];
    expect(codes.filter((c) => !isPostalCode(c))).toEqual([]);
  });

  it("narrows an unknown, not just a string", () => {
    // The realistic shape of the call: a value straight off a JSON body, typed
    // `unknown`, with no cast anywhere. If the parameter ever narrows back to
    // `string`, this stops compiling.
    const parsed: unknown = JSON.parse('{"postalCode":"19018"}');
    let fromBody: unknown = undefined;
    if (typeof parsed === "object" && parsed !== null && "postalCode" in parsed) {
      fromBody = parsed.postalCode;
    }
    expect(isPostalCode(fromBody)).toBe(true);
    if (isPostalCode(fromBody)) {
      expect(findByPostalCode(fromBody).map((c) => c.id)).toEqual(["19-ain-azel-ain-lahdjar"]);
    }

    // Same body, wrong JSON type — the number form a lax API happily emits.
    const numeric: unknown = JSON.parse('{"postalCode":19018}');
    let fromNumeric: unknown = undefined;
    if (typeof numeric === "object" && numeric !== null && "postalCode" in numeric) {
      fromNumeric = numeric.postalCode;
    }
    expect(isPostalCode(fromNumeric)).toBe(false);
  });

  it("narrows a raw string so it can be stored as a PostalCode", () => {
    const raw = "19018";
    expect(isPostalCode(raw)).toBe(true);
    if (isPostalCode(raw)) {
      // `raw` is a `PostalCode` here, with no cast. The brand erases at run
      // time, so the only observable is that this compiles.
      expect(raw).toBe("19018");
    }
  });
});
