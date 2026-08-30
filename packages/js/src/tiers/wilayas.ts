/**
 * The **wilaya tier** — the 69 wilayas, and nothing that reaches a daïra or a
 * commune. `src/wilayas.ts` is the published entry over this file; `dairas.ts`
 * and `communes.ts` in this directory layer on top of it.
 *
 * ── Why this tier exists at all ─────────────────────────────────────────────
 *
 * This is the libphonenumber-js metadata-split idea applied to administrative
 * data: a developer rendering a wilaya `<select>` should download **69 records,
 * not 1541 communes**. The root entry cannot be tree-shaken down to that, and
 * the reason is worth stating precisely rather than discovering as a failed
 * size budget:
 *
 * `api.ts`'s `getWilayas(opts?: AsOfOptions)` calls `wantsLegacyView(opts)`,
 * which lives in `asof.ts`, which imports `generated/communes`. The reference is
 * unconditional in the module graph even though the *call* is conditional, so no
 * bundler may drop it. The root entry therefore carries the commune table no
 * matter what a consumer imports from it, and `.size-limit.json`'s
 * `root, getWilayas only` row measures exactly that.
 *
 * So this module reimplements the wilaya tier directly over the generated data.
 * It is **not** a re-export of `api.ts`, deliberately.
 *
 * ── What it gives up, on purpose ────────────────────────────────────────────
 *
 * - **No `asOf` parameter.** The pre-reform 58-wilaya view is derived from
 *   commune and daïra re-attribution; supporting it here would import the very
 *   data this entry exists to exclude. Callers who need `asOf` want the root.
 * - **No `byWilaya` tree, no `search`.** Both are commune-shaped by definition.
 *
 * Everything it *does* return is byte-for-byte the same record the root returns
 * — `tests/entries.test.ts` pins that, because two implementations that
 * silently diverge is the one real cost of this design.
 *
 * ── Duplication is free here ────────────────────────────────────────────────
 *
 * `tsup.config.ts` sets `splitting: false`, so every entry already gets its own
 * copy of everything it touches. The ~40 duplicated lines below cost nothing a
 * shared chunk would have saved, and they buy a size budget that is actually
 * enforceable per entry.
 *
 * @module
 */

import { REFORM_RAW } from "../generated/reform";
import { WILAYAS } from "../generated/wilayas";

import type { WilayaCode } from "../generated/codes";
import type { Wilaya } from "../types";

// ---------------------------------------------------------------------------
// The only top-level statement with an effect.
//
// Shallow, O(1)-per-array, allocates nothing — the same trade `api.ts` makes and
// for the same reason: v1 handed out its live cached array, so
// `getWilayas().length = 0` permanently corrupted the dataset for every other
// consumer in the process. `readonly` is erased at run time and cannot close
// that hole; this can.
//
// The 69 records and their nested `name` objects are deliberately NOT
// deep-frozen. See `types.ts` for the residual hole, documented rather than
// designed away.
// ---------------------------------------------------------------------------
Object.freeze(WILAYAS);

// ---------------------------------------------------------------------------
// Lazy structures. Same discipline as `indexes.ts`: no top-level `const x =
// build()`, one `let … | undefined` and one builder each, no `initAll()`.
// ---------------------------------------------------------------------------

let wilayaListValue: readonly Wilaya[] | undefined;

/**
 * The 69 public {@link Wilaya} records: the generated shape plus the derived
 * `codeText` and, on the 11 new wilayas only, `parentWilaya`.
 *
 * Reads `REFORM_RAW` from the generated module directly rather than `REFORM`
 * from `reform.ts` — the latter would pull the resolvers and their two lazy maps
 * into an entry whose whole purpose is to be a couple of kilobytes. The 11-row
 * constant is 1.9 kB and has no imports of its own.
 *
 * The two explicit branches are load-bearing under `exactOptionalPropertyTypes`:
 * `{ ...w, ...(p !== undefined && { parentWilaya: p }) }` widens the field to
 * `WilayaCode | null | undefined` and destroys the absent-vs-`null` distinction
 * the field exists to carry. Codes `1`..`58` get **no key at all**; codes
 * `59`..`69` get the key, holding `null` until the mapping is sourced.
 */
function wilayaList(): readonly Wilaya[] {
  if (wilayaListValue === undefined) {
    const parents = new Map<WilayaCode, WilayaCode | null>();
    for (const entry of REFORM_RAW.newWilayas) parents.set(entry.code, entry.parentCode);

    const out: Wilaya[] = [];
    for (const w of WILAYAS) {
      const codeText = String(w.code).padStart(2, "0");
      const parent = parents.get(w.code);
      if (parent === undefined) out.push({ ...w, codeText });
      else out.push({ ...w, codeText, parentWilaya: parent });
    }
    wilayaListValue = Object.freeze(out);
  }
  return wilayaListValue;
}

let wilayaIndex: Map<WilayaCode, Wilaya> | undefined;

/**
 * `WilayaCode` → the public {@link Wilaya} record.
 *
 * Built over {@link wilayaList}, so the object a lookup returns and the object
 * inside `getWilayas()` are the **same reference**.
 */
function wilayaIdx(): Map<WilayaCode, Wilaya> {
  if (wilayaIndex === undefined) {
    const m = new Map<WilayaCode, Wilaya>();
    for (const w of wilayaList()) m.set(w.code, w);
    wilayaIndex = m;
  }
  return wilayaIndex;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Every wilaya, in code order.
 *
 * The 69 records carry the derived `codeText` alongside the numeric `code`, so
 * they are built once on first call and memoized; the array is frozen before it
 * is handed out and the same reference is returned to every caller.
 *
 * **No `asOf` parameter** — see the module comment. This is the deliberate
 * difference from the root's `getWilayas`; for the identical default view the
 * two are interchangeable.
 *
 * @returns All 69 wilayas. Frozen, never copied, never empty.
 *
 * @example
 * ```ts
 * import { getWilayas } from "algeria-wilayas-communes/wilayas";
 *
 * getWilayas().length;                 // → 69
 * getWilayas()[18]?.name.fr;           // → "Setif"
 * getWilayas()[18]?.codeText;          // → "19"
 * getWilayas().find((w) => w.codeText === "06")?.name.fr; // → "Bejaia"
 * ```
 *
 * @since 2.0.0
 */
export function getWilayas(): readonly Wilaya[] {
  return wilayaList();
}

/**
 * One wilaya by its numeric code.
 *
 * @param code - A wilaya code, `1`..`69`. The **number** `19`, not the padded
 *   string `"19"` — that is `codeText`, and it is the v1 → v2 migration trap.
 * @returns The wilaya, or `undefined` if the code is not a real one (reachable
 *   only from untyped JavaScript or a cast — `getWilaya(70)` is a compile
 *   error).
 *
 * @example
 * ```ts
 * import { getWilaya } from "algeria-wilayas-communes/wilayas";
 *
 * getWilaya(19)?.name.fr;      // → "Setif"
 * getWilaya(19)?.name.ar;      // → "سطيف"
 * getWilaya(19)?.dairaCount;   // → 20
 * getWilaya(19)?.communeCount; // → 60
 * getWilaya(6)?.codeText;      // → "06"
 * getWilaya(69)?.parentWilaya; // → null   — Messaad; mère not yet sourced
 * ```
 *
 * @since 2.0.0
 */
export function getWilaya(code: WilayaCode): Wilaya | undefined {
  return wilayaIdx().get(code);
}

/**
 * Which of this tier's two lazy structures have been built.
 *
 * **Exported from this module only — never from `wilayas.ts`.** That is the
 * whole reason the tier is a separate file from the entry: a symbol no public
 * entry re-exports is tree-shaken out of `dist/` entirely, so the hook exists
 * for `tests/import-purity.test.ts` and `benchmarks/child-source.mjs` without
 * ever becoming a published symbol this major version has to keep.
 *
 * @returns A flag per structure: `wilayaList`, `wilaya`.
 *
 * @since 2.0.0
 */
export function __wilayaTierState(): Record<string, boolean> {
  return {
    wilayaList: wilayaListValue !== undefined,
    wilaya: wilayaIndex !== undefined,
  };
}
