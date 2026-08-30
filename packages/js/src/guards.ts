/**
 * The three runtime type guards.
 *
 * Validating a wilaya code out of a form `<select>`, or a postal code out of a
 * JSON body, before touching the data is the single most common real use of this
 * package. That is why both wilaya guards take `unknown` rather than `number`:
 * the value came from `JSON.parse`, `process.argv` or an `<input>`, and typing
 * the parameter as `number` would push the cast — the exact mistake the guard
 * exists to prevent — back onto the caller.
 *
 * **Nothing in this file touches the data.** `isWilayaCode` deliberately does
 * *not* look the code up in the wilaya index: that would build a 69-entry index
 * just to validate a number, and it would drag the whole dataset into a bundle
 * that only wanted the guard. The range `1..69` is a fact about the law, checked
 * arithmetically.
 */

import type { WilayaCode } from "./generated/codes";
import type { PostalCode } from "./types";

/** Lowest wilaya code under Loi 26-06. */
const MIN_WILAYA_CODE = 1;

/** Highest wilaya code under Loi 26-06. */
const MAX_WILAYA_CODE = 69;

/**
 * Exactly five ASCII digits, anchored at both ends.
 *
 * `\d` is ASCII-only here by design: `"١٦٠٠٠"` in Arabic-Indic digits is not a
 * postal code any Algerian postal system will accept.
 */
const POSTAL_RE = /^\d{5}$/;

/**
 * Narrows an unknown value to a valid wilaya code (`1`..`69`).
 *
 * Takes `unknown`, not `number`, because the value realistically arrives from
 * `JSON.parse`, a form field or `process.argv`. `"19"` — a string from a form —
 * is the number-one real-world input and is correctly rejected.
 *
 * Does not consult the wilaya index, so importing this guard pulls no data into
 * your bundle.
 *
 * @param n - Any value at all.
 * @returns `true` if `n` is an integer between 1 and 69 inclusive, narrowing it
 *   to {@link WilayaCode}.
 *
 * @example
 * ```ts
 * isWilayaCode(19);    // → true   — Setif
 * isWilayaCode(19.0);  // → true   — JavaScript has one number type; 19.0 === 19
 * isWilayaCode(69);    // → true   — Messaad, the last code
 * isWilayaCode("19");  // → false  — a string from a form field
 * isWilayaCode(70);    // → false
 * isWilayaCode(19.5);  // → false
 * isWilayaCode(NaN);   // → false
 * isWilayaCode(null);  // → false
 *
 * const fromForm: unknown = JSON.parse('{"wilaya":19}').wilaya;
 * if (isWilayaCode(fromForm)) getWilaya(fromForm)?.name.fr; // → "Setif"
 * ```
 *
 * @since 2.0.0
 */
export function isWilayaCode(n: unknown): n is WilayaCode {
  return (
    typeof n === "number" && Number.isInteger(n) && n >= MIN_WILAYA_CODE && n <= MAX_WILAYA_CODE
  );
}

/**
 * Throws unless `n` is a valid wilaya code (`1`..`69`).
 *
 * The throwing sibling of {@link isWilayaCode}, for the "validate at the edge,
 * then trust it" style. **This is the only throwing export in the entire
 * library** — every other miss is `undefined` or an empty array.
 *
 * Note the mechanic: an `asserts` signature requires a function *declaration*.
 * An arrow function assigned to a `const` cannot carry one, which is why this is
 * written as `export function` and must stay that way.
 *
 * @param n - Any value at all.
 * @returns Nothing. After the call, `n` is narrowed to {@link WilayaCode}.
 * @throws {TypeError} If `n` is not an integer in `1..69`. The message contains
 *   the offending value, so a stack trace from production says which input broke.
 *
 * @example
 * ```ts
 * const raw: unknown = 19;
 * assertWilayaCode(raw);
 * getWilaya(raw)?.name.fr;   // → "Setif"  — narrowed, no cast
 *
 * assertWilayaCode(70);      // ✗ TypeError: Not a valid Algerian wilaya code (1..69): 70
 * assertWilayaCode("19");    // ✗ TypeError: Not a valid Algerian wilaya code (1..69): "19"
 * ```
 *
 * @since 2.0.0
 */
export function assertWilayaCode(n: unknown): asserts n is WilayaCode {
  if (isWilayaCode(n)) return;
  const shown = typeof n === "string" ? JSON.stringify(n) : String(n);
  throw new TypeError(
    `Not a valid Algerian wilaya code (${String(MIN_WILAYA_CODE)}..${String(MAX_WILAYA_CODE)}): ${shown}`,
  );
}

/**
 * Narrows a string to a well-formed 5-digit postal code.
 *
 * Shape, not existence: `"00000"` is well-formed and matches no commune. Use
 * `findByPostalCode` to ask whether a code is real.
 *
 * **Never trims.** Trimming inside a validator is how `" 19018 "` ends up in a
 * database as a padded key; `" 19018"` and `"19018 "` are both rejected so the
 * caller trims deliberately.
 *
 * @param v - The string to check.
 * @returns `true` if `v` is exactly five ASCII digits, narrowing it to
 *   {@link PostalCode}.
 *
 * @example
 * ```ts
 * isPostalCode("19018");   // → true   — Ain Lahdjar, Setif
 * isPostalCode("05000");   // → true   — leading zeros are real; Batna is 05
 * isPostalCode("00000");   // → true   — well-formed, matches no commune
 * isPostalCode("0500");    // → false  — four digits
 * isPostalCode("1e5");     // → false  — the template-literal type accepted this
 * isPostalCode("1.5");     // → false
 * isPostalCode(" 19018");  // → false  — no implicit trim, ever
 * isPostalCode("١٦٠٠٠");    // → false  — Arabic-Indic digits are not \d
 * ```
 *
 * @since 2.0.0
 */
export function isPostalCode(v: unknown): v is PostalCode {
  // `unknown`, not `string`, for the same reason `isWilayaCode` takes `unknown`:
  // the value arrives from `JSON.parse`, a form field or `process.argv`. It also
  // closes a real hole -- `RegExp.prototype.test` coerces, so with a `string`
  // parameter a JavaScript caller could pass the NUMBER 19018 and have it
  // narrowed to `PostalCode`, which is exactly the forgery the brand exists to
  // prevent.
  return typeof v === "string" && POSTAL_RE.test(v);
}
