/**
 * **This file is the v1 contract. A failure here is a breaking change, not a
 * flaky test.**
 *
 * ── Why this is a file of its own ───────────────────────────────────────────
 *
 * It mutates the memoized dataset. Vitest isolates **by file**, not by test, so
 * every `it` in a file shares one module graph and therefore one set of memo
 * slots — a mutation made in a test here would be visible to every other test
 * in the same file, in whatever order the runner happens to pick. Splitting the
 * round-trip out of `identity.test.ts` is what makes both files honest: the
 * other one asserts a pristine dataset, this one is allowed to scribble on it.
 *
 * The mutation is restored in a `finally` anyway, so an assertion failure
 * mid-test cannot poison the rest of the run. Belt and braces: the isolation is
 * the guarantee, the restore is the courtesy.
 *
 * ── What is being pinned ────────────────────────────────────────────────────
 *
 * Two halves of one v1 behaviour, and they pull in opposite directions:
 *
 * 1. **A mutation persists.** v1 returned the live `JSON.parse` result from a
 *    module-scope cache, so `getCommunes()[0].nom_fr = "X"` was visible to the
 *    next `getCommunes()`. Programs patched transliterations in place at boot.
 *    A v2 legacy layer that reprojected on each call — or froze the rows —
 *    would break them, with no error and no diff in any documented behaviour.
 *
 * 2. **A mutation does NOT cross views.** v1's cache was per FILE:
 *    `communes.json`, `algeria.json` and `by-wilaya/16.json` were three
 *    independent parses of the same facts. So the patch above never reached
 *    `getAll()`. Deduplicating the projections into one shared row per commune
 *    would be a strictly "better" implementation that changes observable
 *    behaviour in the other direction.
 *
 * Only a test that does both can catch a change in either.
 */

import { describe, expect, it } from "vitest";

import { byWilaya, getAll, getCommunes } from "../../packages/js/src/legacy/index";

// ── Helper ──────────────────────────────────────────────────────────────────

/** The first flat commune row, without a `!`. */
function firstCommune(): { nom_fr: string } {
  const row = getCommunes()[0];
  if (row === undefined) throw new Error("expected at least one commune");
  return row;
}

// ── The round-trip ──────────────────────────────────────────────────────────

describe("mutation round-trip — v1's live, per-view dataset", () => {
  it("a write through `getCommunes()` persists, and no other view sees it", () => {
    const original = firstCommune().nom_fr;
    expect(original).not.toBe("MUTATED");

    // Snapshot the same commune as seen through the other two projections,
    // BEFORE the write, so the comparison afterwards is against known values
    // rather than against whatever the write happened to leave behind.
    const nestedBefore = getAll().wilayas[0]?.dairas[0]?.communes[0]?.nom_fr;
    const byWilayaBefore = byWilaya(1)?.dairas[0]?.communes[0]?.nom_fr;
    expect(nestedBefore).toBe(original);
    expect(byWilayaBefore).toBe(original);

    try {
      // 1. The write compiles (the v1 types are mutable) and it sticks.
      firstCommune().nom_fr = "MUTATED";
      expect(getCommunes()[0]?.nom_fr).toBe("MUTATED");
      // Same array instance, same row: re-reading does not reproject.
      expect(getCommunes()[0]).toBe(getCommunes()[0]);

      // 2. It is invisible everywhere else — `getAll()` is a separate view, as
      //    v1's separate `algeria.json` parse was.
      expect(getAll().wilayas[0]?.dairas[0]?.communes[0]?.nom_fr).toBe(original);
      expect(byWilaya(1)?.dairas[0]?.communes[0]?.nom_fr).toBe(original);

      // 3. And the derived filters DO see it, because they filter the very rows
      //    that were mutated — `getCommunes().filter(…)`, not a private copy.
      const found = getCommunes().filter((c) => c.nom_fr === "MUTATED");
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(getCommunes()[0]);
    } finally {
      firstCommune().nom_fr = original;
    }

    // Restored, through the same live reference.
    expect(getCommunes()[0]?.nom_fr).toBe(original);
    expect(getAll().wilayas[0]?.dairas[0]?.communes[0]?.nom_fr).toBe(original);
  });
});
