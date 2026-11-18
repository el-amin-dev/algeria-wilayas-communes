/**
 * The 2026 reform layer — Loi 26-06, and the 58 ↔ 69 translation it needs.
 *
 * ── Why this module exists ─────────────────────────────────────────────────
 *
 * Loi 26-06 (Journal Officiel n°25, 5 April 2026) took Algeria from 58 wilayas
 * to 69, carving 11 new wilayas (codes 59–69) out of territory previously
 * administered by existing *wilayas mères*. The transfer of powers is
 * **progressive**, running to 2026-12-31, so through the whole of 2026 **both
 * administrative maps are operationally live**: a consumer displays the new
 * wilaya to the user, prints the mère on the shipping label, and keeps the
 * legacy code in the ERP row until the counterparty's system catches up. Every
 * competing Algeria package ships exactly one map and offers no way to
 * translate between them. This module is the translation.
 *
 * ── Why it currently refuses to answer ─────────────────────────────────────
 *
 * **The 58 → 69 parent mapping does not exist in the dataset.** There is no
 * `mere`, `parent`, `legacy`, `ancien`, `rattach` or `delegue` field at any
 * nesting level of `data/algeria.json` — verified by exhaustive key search.
 * Two derived heuristics (majority postal-code prefix per new wilaya, and
 * daïra names shared between a new wilaya and an old one) corroborate each
 * other on 3 of the 11 rows, **contradict** each other on 2, and say nothing
 * at all about the remaining 6. That is exactly the epistemic state in which a
 * dataset must not guess: a wrong `parentWilaya` silently misroutes real postal
 * mail and real government paperwork, and does it with the full authority of a
 * package advertising that it handles the transition correctly.
 *
 * So `data/raw/reform.json` ships with all 11 `parentCode` values `null`, the
 * maintainer fills them one line at a time from the JO text with a citation
 * each, and until then `REFORM.mappingComplete` is `false` and the derived API
 * throws {@link ReformMappingUnavailableError}.
 *
 * ── Why THROW rather than omit the exports ─────────────────────────────────
 *
 * The alternative — export `resolveLegacyWilaya` / `resolveCurrentWilaya` only
 * once the mapping lands — was considered and rejected on three counts:
 *
 * 1. **A conditionally-present export makes the public type surface depend on
 *    data state.** The emitted `.d.ts` would differ between a filled and an
 *    unfilled checkout, so `tsc`, `publint` and `@arethetypeswrong/cli` would
 *    give different results from the same source tree. That is not a
 *    reproducible package.
 * 2. **Filling the mapping would become a breaking API change in reverse** —
 *    the API would *appear* in a patch release. Shipping the surface now and
 *    switching only the behaviour is the honest semver story: the functions
 *    exist from day one, they just refuse to answer until they can.
 * 3. **A missing export fails at a distance.** An import resolving to
 *    `undefined` surfaces as `TypeError: resolveLegacyWilaya is not a function`
 *    at some unrelated call site, with no explanation. A named error carrying
 *    the file path, the reason and a doc link is debuggable in one read.
 *
 * This does **not** contradict the library-wide rule that a lookup returns
 * `T | undefined` and never throws. A miss is *"you asked a valid question and
 * the answer is nothing"*. This is *"the library cannot answer the question at
 * all"* — a different category, and precisely the one that must not be encoded
 * as `undefined`, because `undefined` here would be indistinguishable from
 * **"this wilaya has no parent"**, which is the exact wrong answer the stub
 * exists to prevent.
 *
 * {@link REFORM}`.mappingComplete` is exported so a caller can branch without a
 * `try` / `catch`, and that is the intended pattern:
 *
 * ```js
 * import { REFORM, resolveLegacyWilaya } from "algeria-wilayas-communes";
 * const legacy = REFORM.mappingComplete ? resolveLegacyWilaya(68) : undefined;
 * ```
 *
 * ── What is and is not lazy here ───────────────────────────────────────────
 *
 * {@link REFORM} is a plain module-scope constant: it is the generated record
 * re-typed, so binding it allocates nothing and 11 small records are not an
 * index. It is deliberately **not** `Object.freeze`d — that would add a fourth
 * top-level statement with an effect to a library that documents having exactly
 * three (the array freezes in `api.ts`), and the `readonly` types carry the
 * same contract the generated records already rely on.
 *
 * The two lookup maps *are* indexes, and follow the `indexes.ts` rules: one
 * module-scope `let … | undefined` each, one builder each, filled on the first
 * `resolve*` call and never at import time.
 */

import { WILAYA_CODES } from "./generated/codes";
import { REFORM_RAW } from "./generated/reform";

import type { WilayaCode } from "./generated/codes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How much a single `parentCode` in the reform table can be trusted.
 *
 * - `"confirmed"` — read out of Loi 26-06 / JO n°25, with the citation in
 *   `source`. The only value that may ever contribute to
 *   `REFORM.mappingComplete`.
 * - `"probable"` — a sourced but non-authoritative attribution.
 * - `"unverified"` — no source. Every entry ships as this today.
 *
 * @since 2.0.0
 */
export type ReformConfidence = "confirmed" | "probable" | "unverified";

/**
 * One of the 11 wilayas created by Loi 26-06, and what is known about where it
 * came from.
 *
 * @example
 * ```ts
 * const messaad = REFORM.newWilayas.find((w) => w.code === 69);
 * messaad?.code;       // → 69
 * messaad?.parentCode; // → null   — unfilled; see `REFORM.mappingComplete`
 * messaad?.source;     // → null
 * messaad?.confidence; // → "unverified"
 * ```
 *
 * @since 2.0.0
 */
export interface ReformNewWilaya {
  /** The new wilaya, `59`..`69`. */
  readonly code: WilayaCode;
  /** The wilaya mère, `1`..`58` — or `null` while the mapping is unsupplied. */
  readonly parentCode: WilayaCode | null;
  /**
   * Citation for `parentCode`, e.g. `"JO n°25 du 5 avril 2026, art. 3"`.
   * `null` while unsupplied.
   */
  readonly source: string | null;
  /** How far `parentCode` can be trusted. */
  readonly confidence: ReformConfidence;
}

/**
 * Everything the library knows about Loi 26-06 — the law, the transition dates,
 * and the 58 ↔ 69 mapping table.
 *
 * Always readable, including while `mappingComplete` is `false`: the law
 * reference and the three dates are known facts, and reading them must never
 * throw.
 *
 * @since 2.0.0
 */
export interface Reform {
  /** The instrument that created the 11 new wilayas. */
  readonly law: "Loi 26-06";
  /** The Journal Officiel issue it was published in. */
  readonly journalOfficiel: "JO n°25";
  /** Publication in the Journal Officiel. */
  readonly publishedOn: "2026-04-05";
  /** Last day of the progressive transfer of powers from the wilayas mères. */
  readonly transitionDeadline: "2026-12-31";
  /** Date the 11 new wilayas are fully operational. */
  readonly operationalFrom: "2027-01-01";
  /** Wilaya count before the reform. */
  readonly previousWilayaCount: 58;
  /** Wilaya count after the reform. */
  readonly currentWilayaCount: 69;
  /**
   * `true` only when all 11 `parentCode` values are supplied, sourced and
   * confirmed. **Branch on this instead of catching**
   * {@link ReformMappingUnavailableError}.
   *
   * Typed `boolean`, not a literal: filling in `data/raw/reform.json` must
   * change the library's behaviour, never its public types.
   */
  readonly mappingComplete: boolean;
  /** The full 58 ↔ 69 mapping table, ascending by code. Always 11 entries. */
  readonly newWilayas: readonly ReformNewWilaya[];
}

// ---------------------------------------------------------------------------
// The constant
// ---------------------------------------------------------------------------

/**
 * Loi 26-06 and its 58 ↔ 69 mapping table.
 *
 * Readable unconditionally — the law reference, the Journal Officiel issue and
 * the three transition dates are known facts and never throw. Only the
 * *derived* API ({@link resolveLegacyWilaya}, {@link resolveCurrentWilaya}, and
 * any accessor called with `asOf: "58"`) depends on the mapping, and only that
 * API throws while `mappingComplete` is `false`.
 *
 * @example
 * ```ts
 * REFORM.law;                  // → "Loi 26-06"
 * REFORM.journalOfficiel;      // → "JO n°25"
 * REFORM.publishedOn;          // → "2026-04-05"
 * REFORM.transitionDeadline;   // → "2026-12-31"   both maps live until here
 * REFORM.operationalFrom;      // → "2027-01-01"
 * REFORM.previousWilayaCount;  // → 58
 * REFORM.currentWilayaCount;   // → 69
 * REFORM.newWilayas.length;    // → 11
 * REFORM.mappingComplete;      // → false — the mapping is not yet sourced
 * ```
 *
 * @since 2.0.0
 */
// Frozen, and deeply so across its 13 objects. `readonly` is erased at run time,
// and `REFORM.mappingComplete = true` from plain JavaScript would switch off the
// entire safety gate this module exists to hold — every `asOf: "58"` call and both
// resolvers would start answering from a mapping that is still all `null`, which
// is the precise wrong answer ADR-005 guards against. The cost is 13 small
// allocations (one wrapper, one array, 11 entries) and 13 constant-time
// property-descriptor flips — bounded, and independent of the 2195-record
// dataset. It does not weaken the no-work-at-import-time invariant: that rule
// forbids INDEX CONSTRUCTION on the import path, not a fixed-size freeze. Same
// reasoning as the three freezes in `api.ts`.
export const REFORM: Reform = Object.freeze({
  ...REFORM_RAW,
  newWilayas: Object.freeze(REFORM_RAW.newWilayas.map((entry) => Object.freeze({ ...entry }))),
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Thrown by every *derived* reform call while the 58 → 69 parent mapping has
 * not been supplied — i.e. while `REFORM.mappingComplete` is `false`.
 *
 * **Thrown by** {@link resolveLegacyWilaya}, {@link resolveCurrentWilaya}, and
 * any accessor called with `asOf: "58"`.
 *
 * **Not thrown by** {@link REFORM} itself, by `Wilaya.parentWilaya` (a plain
 * field read, which returns `null`), or by any call with `asOf: "69"` or no
 * options at all. **The default path is unconditionally safe.**
 *
 * Prefer branching on `REFORM.mappingComplete` over catching this.
 *
 * @example
 * ```ts
 * // The intended pattern — no try/catch:
 * const legacy = REFORM.mappingComplete ? resolveLegacyWilaya(68) : undefined;
 *
 * // What happens if you skip the check, today:
 * try {
 *   resolveLegacyWilaya(68);
 * } catch (e) {
 *   (e as Error).name; // → "ReformMappingUnavailableError"
 * }
 * ```
 *
 * @since 2.0.0
 */
export class ReformMappingUnavailableError extends Error {
  /**
   * `"ReformMappingUnavailableError"`, so a `catch` block can discriminate
   * without `instanceof` surviving a bundler's class re-wrapping.
   *
   * `override` is required because `Error` already declares `name`; the
   * repo runs with `noImplicitOverride`.
   */
  override readonly name = "ReformMappingUnavailableError";

  constructor() {
    super(
      "Reform mapping not yet supplied: the 58->69 wilaya parent mapping in " +
        "data/raw/reform.json has not been filled in from Loi 26-06 / JO n°25. " +
        "REFORM.mappingComplete is false. Check REFORM.mappingComplete before calling " +
        "asOf / resolveLegacyWilaya / resolveCurrentWilaya. " +
        "See https://github.com/el-amin-dev/algeria-wilayas-communes#the-2026-reform",
    );
  }
}

/**
 * The one place the gate is expressed. Called before any lookup, so a caller
 * never gets a partial answer computed from an unfilled table.
 *
 * @throws {ReformMappingUnavailableError} while `REFORM.mappingComplete` is `false`.
 */
function assertMappingAvailable(): void {
  if (!REFORM.mappingComplete) throw new ReformMappingUnavailableError();
}

// ---------------------------------------------------------------------------
// 1. forwardMap — current (69-map) code → legacy (58-map) code
// ---------------------------------------------------------------------------

let forwardMap: Map<WilayaCode, WilayaCode> | undefined;

/**
 * Every current code → the code its territory sat under before the reform.
 *
 * Deliberately **total over all 69 codes**, not just the 11 new ones: codes
 * `1`..`58` map to themselves, which turns {@link resolveLegacyWilaya} into a
 * single `Map.get` and makes "not a wilaya code at all" fall out as `undefined`
 * with no separate validation pass.
 *
 * A `59`..`69` entry whose `parentCode` is still `null` is left **absent**
 * rather than mapped to itself — unreachable while `mappingComplete` is `true`,
 * but `undefined` is the honest answer if it ever were reached, where mapping
 * `59 → 59` would be a fabricated one.
 *
 * @returns The 69-entry forward index.
 */
function forwardIdx(): Map<WilayaCode, WilayaCode> {
  if (forwardMap === undefined) {
    const parents = new Map<WilayaCode, WilayaCode | null>();
    for (const entry of REFORM.newWilayas) parents.set(entry.code, entry.parentCode);

    const m = new Map<WilayaCode, WilayaCode>();
    for (const code of WILAYA_CODES) {
      const parent = parents.get(code);
      /* v8 ignore next -- unreachable behind the gate: this index is built only
         once mappingComplete is true, and that requires all 11 parentCode values
         to be non-null. Kept, and kept as "omit the row" rather than falling
         through to the self-map below, because a new wilaya mapped to ITSELF
         would read to a caller as "this wilaya has no mere" — the one answer
         that must never be invented. */
      if (parent === null) continue;
      // `parent` is undefined for codes 1..58 — they are their own legacy code,
      // unchanged by the reform — and the mere for 59..69.
      m.set(code, parent ?? code);
    }
    forwardMap = m;
  }
  return forwardMap;
}

// ---------------------------------------------------------------------------
// 2. reverseMap — legacy (58-map) code → every current code covering it
// ---------------------------------------------------------------------------

let reverseMap: Map<WilayaCode, readonly WilayaCode[]> | undefined;

/**
 * Every legacy code → the mère itself first, then its children ascending.
 *
 * Keyed on the **58** legacy codes only. Codes `59`..`69` are absent on
 * purpose: they did not exist in the 58-map, so asking what a legacy `68`
 * became is not a question with an empty answer, it is a question about a
 * non-existent code.
 *
 * Each array is frozen once, here, and handed to every caller — which is what
 * makes `resolveCurrentWilaya(17) === resolveCurrentWilaya(17)` hold and keeps
 * the function allocation-free after the first call.
 *
 * @returns The 58-entry reverse index.
 */
function reverseIdx(): Map<WilayaCode, readonly WilayaCode[]> {
  if (reverseMap === undefined) {
    const isNew = new Set<WilayaCode>();
    const children = new Map<WilayaCode, WilayaCode[]>();
    for (const entry of REFORM.newWilayas) {
      isNew.add(entry.code);
      /* v8 ignore next -- unreachable behind the gate, for the same reason as
         forwardIdx(): mappingComplete implies every parentCode is non-null. */
      if (entry.parentCode === null) continue;
      const bucket = children.get(entry.parentCode);
      if (bucket === undefined) children.set(entry.parentCode, [entry.code]);
      else bucket.push(entry.code);
    }

    const m = new Map<WilayaCode, readonly WilayaCode[]>();
    for (const code of WILAYA_CODES) {
      if (isNew.has(code)) continue;
      const kids = children.get(code);
      if (kids === undefined) m.set(code, Object.freeze([code]));
      else m.set(code, Object.freeze([code, ...[...kids].sort((a, b) => a - b)]));
    }
    reverseMap = m;
  }
  return reverseMap;
}

// ---------------------------------------------------------------------------
// The two resolvers
// ---------------------------------------------------------------------------

/**
 * Given a **current** (69-map) wilaya code, the code it belonged to before
 * Loi 26-06.
 *
 * A new wilaya has exactly one mère, so this returns a single code, not an
 * array. A code that already existed before the reform is returned unchanged —
 * `resolveLegacyWilaya(19)` is `19`, because Setif was not touched by the
 * reform.
 *
 * @param code - A current wilaya code, `1`..`69`.
 * @returns The pre-reform code, or `undefined` if `code` is not a wilaya code
 *   at all (reachable only from untyped JavaScript or a cast). Never `null`.
 * @throws {ReformMappingUnavailableError} while `REFORM.mappingComplete` is
 *   `false` — checked before any lookup. Branch on `REFORM.mappingComplete`
 *   rather than catching.
 *
 * @example
 * ```ts
 * // ⚠ ILLUSTRATION ONLY — 68 Ain Oussara's mère is NOT yet sourced from the JO.
 * // These lines throw today; they show the shape of the answer, not data.
 * if (REFORM.mappingComplete) {
 *   resolveLegacyWilaya(68); // → 17   (Djelfa) — once the mapping is filled
 *   resolveLegacyWilaya(19); // → 19   Setif existed pre-reform, unchanged
 * }
 * ```
 *
 * @since 2.0.0
 */
export function resolveLegacyWilaya(code: WilayaCode): WilayaCode | undefined {
  assertMappingAvailable();
  return forwardIdx().get(code);
}

/**
 * Given a **legacy** (58-map) wilaya code, every current code its territory is
 * now under — the mère itself first, then its children ascending.
 *
 * Always an array, because one mère can split into several: the candidate
 * evidence already shows 17 Djelfa possibly yielding both 68 and 69.
 *
 * A miss is `undefined`, never `[]`. The distinction is load-bearing:
 * `undefined` means *"that is not a legacy wilaya code"*, while `[19]` means
 * *"wilaya 19 exists and lost no territory"*. An empty array would collapse the
 * two.
 *
 * @param code - A legacy wilaya code, `1`..`58`.
 * @returns Every current code covering that territory, frozen, never empty, the
 *   same array reference on every call for a given code — or `undefined` for
 *   `59`..`69` (they did not exist in the 58-map) and for anything that is not
 *   a wilaya code.
 * @throws {ReformMappingUnavailableError} while `REFORM.mappingComplete` is
 *   `false` — checked before any lookup.
 *
 * @example
 * ```ts
 * // ⚠ ILLUSTRATION ONLY — the 17 → [17, 68, 69] split is NOT yet sourced.
 * if (REFORM.mappingComplete) {
 *   resolveCurrentWilaya(17); // → [17, 68, 69]  Djelfa, Ain Oussara, Messaad
 *   resolveCurrentWilaya(19); // → [19]          Setif lost no territory
 *   resolveCurrentWilaya(68); // → undefined     68 is not a LEGACY code
 *   resolveCurrentWilaya(17) === resolveCurrentWilaya(17); // → true (cached, frozen)
 * }
 * ```
 *
 * @since 2.0.0
 */
export function resolveCurrentWilaya(code: WilayaCode): readonly WilayaCode[] | undefined {
  assertMappingAvailable();
  return reverseIdx().get(code);
}

// ---------------------------------------------------------------------------
// Debug hook
// ---------------------------------------------------------------------------

/**
 * Which of the two lazy reform maps have been built.
 *
 * **Exported from this module only — never from `index.ts`**, exactly like
 * `__indexState` in `indexes.ts` and `__asOfState` in `asof.ts`, so the bundler
 * drops it from `dist/` entirely. It exists so the import-purity invariant can
 * be *asserted* rather than merely asserted-about: importing the entry point,
 * reading `REFORM` metadata, and reading `parentWilaya` off a wilaya must all
 * leave both flags `false`. Reading the law reference is free; only the
 * resolvers pay for an index.
 *
 * @returns A flag per map: `forward` (current -> legacy), `reverse` (legacy ->
 *   current).
 *
 * @example
 * ```ts
 * import { __reformState } from "./reform";
 * Object.values(__reformState()).some(Boolean); // → false at import time
 * ```
 *
 * @since 2.0.0
 */
export function __reformState(): Record<string, boolean> {
  return {
    forward: forwardMap !== undefined,
    reverse: reverseMap !== undefined,
  };
}
