/**
 * The `asOf` option — the pre-reform (58-wilaya) view of the same dataset.
 *
 * ── Why an option and not a second package ─────────────────────────────────
 *
 * Through the whole of 2026 both administrative maps are operationally live
 * (see `reform.ts`). The same consumer needs both, often in the same request:
 * show the citizen wilaya 59 Aflou, print its *wilaya mère* on the shipping
 * label, keep the legacy code in the ERP row. One dataset with one option is
 * the only shape that lets a caller ask both questions of the same records.
 *
 * ── What `asOf: "58"` changes, and what it must never change ───────────────
 *
 * | level | `asOf: "69"` (default) | `asOf: "58"` |
 * |---|---|---|
 * | wilayas | 69 records | **58** records; 59–69 absent; each mère's `dairaCount` / `communeCount` **recomputed** |
 * | daïras | 566 records | **566** records — never merged, never dropped; only the wilaya attribution is rewritten |
 * | communes | 1541 records | **1541** records, same order; only the wilaya attribution is rewritten |
 *
 * Three invariants that are easy to break and silent when broken:
 *
 * 1. **IDs never change across `asOf`.** The slug ids (`"19-ain-azel"`,
 *    `"19-ain-azel-ain-lahdjar"`) are built from the 69-map and are stable.
 *    `asOf: "58"` rewrites wilaya *attribution*, never the `id`. If ids shifted
 *    with `asOf` the library would have two incompatible id namespaces and
 *    every cached key in every consumer's database would become ambiguous.
 * 2. **Postal codes never change** either. A postal code is a postal code; they
 *    were assigned under the 58-map and have not been reissued.
 * 3. **Daïras are never merged.** There are 566 daïras over only 545 distinct
 *    names, so two same-named daïras landing under one mère is expected.
 *    Merging them would assert they are the same daïra — a claim the dataset
 *    does not make.
 *
 * ── Cost, and the default path ────────────────────────────────────────────
 *
 * `asOf: "69"` and the no-options call return the **identical object**:
 * `getWilayas() === getWilayas({ asOf: "69" })`. Adding the option costs the
 * 99 % case one strict-equality check and nothing else. Every structure below
 * follows the `indexes.ts` rules — one module-scope `let … | undefined` each,
 * one builder each — so a caller who never passes `asOf` allocates none of it.
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 *
 * Every entry point here calls the gate **first**, before consulting even the
 * cache: the 58-view is derived arithmetic over a maintainer-supplied mapping
 * that does not exist yet, so while `REFORM.mappingComplete` is `false` it
 * throws {@link ReformMappingUnavailableError} rather than inventing an answer.
 * Nothing in this module is reachable from a default-path call.
 *
 * Nothing here is part of the public API surface: `index.ts` re-exports only
 * the two types, which is what lets the bundler drop `__asOfState` from
 * `dist/` entirely.
 */

import { COMMUNES } from "./generated/communes";
import { DAIRAS } from "./generated/dairas";
import { wilayaList } from "./indexes";
import { REFORM, ReformMappingUnavailableError, resolveLegacyWilaya } from "./reform";

import type { WilayaCode } from "./generated/codes";
import type { Commune, Daira, Wilaya } from "./types";

// ---------------------------------------------------------------------------
// Types — the only two symbols `index.ts` re-exports from this module
// ---------------------------------------------------------------------------

/**
 * Which administrative map to answer from.
 *
 * - `"69"` — the current map created by Loi 26-06. **The default.**
 * - `"58"` — the pre-reform map, still operationally live through 2026-12-31.
 *
 * A string, not a number or a `Date`: `"58"` and `"69"` are the names of two
 * maps, not counts to do arithmetic on, and a date would imply the library can
 * answer for an arbitrary instant — it cannot, there are exactly two maps.
 *
 * @since 2.0.0
 */
export type AsOf = "58" | "69";

/**
 * The trailing options bag accepted by `getWilayas`, `getDairas`,
 * `getCommunes`, `getWilaya` and `getCommune`.
 *
 * @example
 * ```ts
 * getWilayas();                 // 69 records — the default
 * getWilayas({ asOf: "69" });   // the identical object
 * getWilayas({ asOf: "58" });   // 58 records — throws until the mapping lands
 * ```
 *
 * @since 2.0.0
 */
export interface AsOfOptions {
  /** Which map to answer from. Defaults to `"69"`. */
  readonly asOf?: AsOf;
}

/**
 * Whether the caller asked for the pre-reform view.
 *
 * A three-way answer collapsed into a boolean, but the third case is the point:
 * anything that is neither `"58"` nor `"69"` nor absent is a **`TypeError`**, not
 * a silent fall-through to the current map.
 *
 * The tempting one-liner `opts?.asOf === "58"` is wrong for the same reason the
 * root ships no default export: it fails **silently and at a distance**. A caller
 * who writes `{ asOf: 58 }` — the numeric form, which is the likeliest typo in a
 * library where {@link WilayaCode} is deliberately numeric — asked for the 58-map
 * and would be handed all 69 wilayas, with the 11 post-reform ones mixed in and
 * no error anywhere. That is a wrong shipping label, produced by a typo TypeScript
 * would have caught but plain JavaScript will not. Fail loudly instead.
 *
 * @throws {TypeError} if `asOf` is present and is not `"58"` or `"69"`.
 */
export function wantsLegacyView(opts: AsOfOptions | undefined): boolean {
  const asOf = opts?.asOf;
  if (asOf === undefined || asOf === "69") return false;
  if (asOf === "58") return true;
  throw new TypeError(
    `Invalid asOf option: ${typeof asOf === "string" ? JSON.stringify(asOf) : String(asOf)}. ` +
      `Expected the string "58" (the pre-reform map) or "69" (the current map, the default). ` +
      `Note these are STRINGS naming an era, not wilaya counts or codes.`,
  );
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Refuse the whole 58-view while the parent mapping is unfilled.
 *
 * Called at the top of every entry point below — before the cache check, not
 * after — so the answer never depends on whether some earlier call happened to
 * warm a structure.
 *
 * @throws {ReformMappingUnavailableError} while `REFORM.mappingComplete` is `false`.
 */
function assertMappingAvailable(): void {
  if (!REFORM.mappingComplete) throw new ReformMappingUnavailableError();
}

/**
 * The pre-reform wilaya a record is attributed to under `asOf: "58"`.
 *
 * Delegates to {@link resolveLegacyWilaya} rather than re-deriving the mapping,
 * so there is exactly one place in the library that knows what a mère is.
 *
 * @param code - The record's current (69-map) wilaya code.
 * @returns The legacy code to attribute the record to.
 */
function legacyOf(code: WilayaCode): WilayaCode {
  // `resolveLegacyWilaya` returns `undefined` only for a value that is not a
  // wilaya code at all, and every record in the generated data carries a real
  // one — so the fallback arm is unreachable. It is the identity, which is the
  // conservative answer if it ever were reached.
  /* v8 ignore next -- unreachable: see above */
  return resolveLegacyWilaya(code) ?? code;
}

// ---------------------------------------------------------------------------
// 1. wilayas58 — the 58 pre-reform wilayas, with recomputed counts
// ---------------------------------------------------------------------------

let wilayas58Value: readonly Wilaya[] | undefined;

/**
 * The 58 pre-reform wilayas, codes `1`..`58` ascending.
 *
 * The 11 new wilayas are **absent**, and each mère's `dairaCount` and
 * `communeCount` are **recomputed** to include everything re-attached from its
 * children. Those two numbers are *derived arithmetic over a
 * maintainer-supplied mapping* — not transcribed data, and not a claim the
 * Journal Officiel makes. The sum is taken over the 69 wilaya records rather
 * than by re-counting `DAIRAS` / `COMMUNES`, which is equivalent: the dataset
 * validator already gates that the per-wilaya counts agree with the rows.
 *
 * Built from {@link wilayaList} so `codeText` is derived in exactly one place,
 * and so the 1–58 records keep `parentWilaya` **absent** — they have no mère.
 *
 * @returns The 58 pre-reform wilayas, frozen.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
export function wilayas58(): readonly Wilaya[] {
  assertMappingAvailable();
  if (wilayas58Value === undefined) {
    const isNew = new Set<WilayaCode>();
    for (const entry of REFORM.newWilayas) isNew.add(entry.code);

    const dairaTotals = new Map<WilayaCode, number>();
    const communeTotals = new Map<WilayaCode, number>();
    for (const w of wilayaList()) {
      const parent = legacyOf(w.code);
      dairaTotals.set(parent, (dairaTotals.get(parent) ?? 0) + w.dairaCount);
      communeTotals.set(parent, (communeTotals.get(parent) ?? 0) + w.communeCount);
    }

    const out: Wilaya[] = [];
    for (const w of wilayaList()) {
      if (isNew.has(w.code)) continue;
      out.push({
        ...w,
        // Both `??` arms below are unreachable: the loop above maps every one of
        // the 69 wilayas onto its legacyOf() code, and legacyOf() is total over
        // 1..58, so both Maps hold an entry for every code reached here. Kept
        // because `Map.get` is typed `T | undefined` and the honest fallback is
        // the record's own count, not a `!`.
        /* v8 ignore next */
        dairaCount: dairaTotals.get(w.code) ?? w.dairaCount,
        /* v8 ignore next */
        communeCount: communeTotals.get(w.code) ?? w.communeCount,
      });
    }
    wilayas58Value = Object.freeze(out);
  }
  return wilayas58Value;
}

// ---------------------------------------------------------------------------
// 2. wilaya58Index — WilayaCode → the pre-reform Wilaya
// ---------------------------------------------------------------------------

let wilaya58Index: Map<WilayaCode, Wilaya> | undefined;

/**
 * `WilayaCode` → the pre-reform {@link Wilaya} record.
 *
 * Built over {@link wilayas58}, so the record a lookup returns and the record
 * inside `getWilayas({ asOf: "58" })` are the same reference. Codes `59`..`69`
 * are absent, which is what makes `getWilaya(59, { asOf: "58" })` `undefined`
 * with no special case.
 *
 * @returns The 58-entry pre-reform code index.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
function wilaya58Idx(): Map<WilayaCode, Wilaya> {
  if (wilaya58Index === undefined) {
    const m = new Map<WilayaCode, Wilaya>();
    for (const w of wilayas58()) m.set(w.code, w);
    wilaya58Index = m;
  }
  return wilaya58Index;
}

/**
 * One pre-reform wilaya by its code.
 *
 * @param code - A wilaya code, `1`..`69`.
 * @returns The pre-reform wilaya, or `undefined` for `59`..`69` — they did not
 *   exist in the 58-map — and for anything that is not a wilaya code.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
export function wilaya58(code: WilayaCode): Wilaya | undefined {
  assertMappingAvailable();
  return wilaya58Idx().get(code);
}

// ---------------------------------------------------------------------------
// 3. dairas58 — all 566 daïras, re-attributed
// ---------------------------------------------------------------------------

let dairas58Value: readonly Daira[] | undefined;

/**
 * All **566** daïras in dataset order, with the wilaya attribution of every
 * daïra under `59`..`69` rewritten to its mère.
 *
 * The count is 566 in both views. A daïra whose wilaya is unchanged is handed
 * back as the **same object** the default path returns — no copy, and
 * `getDairas()[i] === getDairas({ asOf: "58" })[i]` for the 1–58 rows.
 *
 * @returns All 566 daïras, frozen.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
export function dairas58(): readonly Daira[] {
  assertMappingAvailable();
  if (dairas58Value === undefined) {
    const out: Daira[] = [];
    for (const generated of DAIRAS) {
      // Widened to `Daira` before the spread. `DAIRAS` is an `as const` tuple of
      // 566 distinct literal object types, and spreading that union directly
      // makes tsc give up with TS2590 ("union type too complex to represent").
      const d: Daira = generated;
      const parent = legacyOf(d.wilaya);
      out.push(parent === d.wilaya ? d : { ...d, wilaya: parent });
    }
    dairas58Value = Object.freeze(out);
  }
  return dairas58Value;
}

// ---------------------------------------------------------------------------
// 4. communes58 — all 1541 communes, re-attributed
// ---------------------------------------------------------------------------

let communes58Value: readonly Commune[] | undefined;

/**
 * All **1541** communes in dataset order, with the wilaya attribution of every
 * commune under `59`..`69` rewritten to its mère.
 *
 * This is the requirement that makes `asOf` worth having: a commune in wilaya
 * 59 Aflou must resolve to its mère so a 2026 shipping label prints the wilaya
 * the postal service still routes on. `id` and `postalCode` are untouched.
 *
 * @returns All 1541 communes, frozen.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
export function communes58(): readonly Commune[] {
  assertMappingAvailable();
  if (communes58Value === undefined) {
    const out: Commune[] = [];
    for (const generated of COMMUNES) {
      // Widened to `Commune` before the spread — see `dairas58` for why.
      const c: Commune = generated;
      const parent = legacyOf(c.wilaya);
      out.push(parent === c.wilaya ? c : { ...c, wilaya: parent });
    }
    communes58Value = Object.freeze(out);
  }
  return communes58Value;
}

// ---------------------------------------------------------------------------
// 5. commune58Index — commune id → the re-attributed commune
// ---------------------------------------------------------------------------

let commune58Index: Map<string, Commune> | undefined;

/**
 * Commune id → the pre-reform commune record.
 *
 * Keyed on the **same ids** as the default view — ids do not move with `asOf`.
 *
 * @returns The 1541-entry pre-reform commune index.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
function commune58Idx(): Map<string, Commune> {
  if (commune58Index === undefined) {
    const m = new Map<string, Commune>();
    for (const c of communes58()) m.set(c.id, c);
    commune58Index = m;
  }
  return commune58Index;
}

/**
 * One commune by id, attributed to its pre-reform wilaya.
 *
 * @param id - A commune id, e.g. `"19-ain-azel-ain-lahdjar"`. Identical to the
 *   id in the default view.
 * @returns The commune with the pre-reform wilaya attribution, or `undefined`.
 * @throws {ReformMappingUnavailableError} while the mapping is unfilled.
 */
export function commune58(id: string): Commune | undefined {
  assertMappingAvailable();
  return commune58Idx().get(id);
}

// ---------------------------------------------------------------------------
// Debug hook
// ---------------------------------------------------------------------------

/**
 * Which of the five lazy `asOf: "58"` structures have been built.
 *
 * **Exported from this module only — never from `index.ts`**, exactly like
 * `__indexState` in `indexes.ts`, so the bundler drops it from `dist/`
 * entirely. It exists so the import-purity invariant can be *asserted*: after
 * importing the entry point and calling only default-path accessors, every flag
 * below must still be `false`.
 *
 * @returns A flag per structure: `wilayas`, `wilayaIndex`, `dairas`,
 *   `communes`, `communeIndex`.
 *
 * @example
 * ```ts
 * import { __asOfState } from "./asof";
 * Object.values(__asOfState()).some(Boolean); // → false at import time
 * ```
 *
 * @since 2.0.0
 */
export function __asOfState(): Record<string, boolean> {
  return {
    wilayas: wilayas58Value !== undefined,
    wilayaIndex: wilaya58Index !== undefined,
    dairas: dairas58Value !== undefined,
    communes: communes58Value !== undefined,
    communeIndex: commune58Index !== undefined,
  };
}
