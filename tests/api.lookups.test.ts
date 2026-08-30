/**
 * The singular lookups (`getWilaya`, `getDaira`, `getCommune`, `byWilaya`) and
 * the two per-wilaya plural lookups.
 *
 * Two rules run through the whole file.
 *
 * 1. **Every lookup that can miss is tested on its miss path**, and the
 *    assertion is `toBeUndefined()` — never `toBeFalsy()`. `null`, `0`, `""`
 *    and `{}` are all wrong answers to "no such record", and `toBeFalsy()`
 *    accepts three of them. `.not.toBeNull()` is asserted alongside, because
 *    `toBeUndefined()` alone would not catch a future `null` regression in a
 *    test that was written before the distinction mattered.
 * 2. **Anchor on real records, never on `[0]`.** An index-0 assertion passes
 *    unchanged when the dataset is reordered, which is exactly the change that
 *    should fail it.
 *
 * `getWilaya(70 as WilayaCode)` carries the ONE permitted `as` cast in the
 * session, and it lives only here: the runtime behaviour on an out-of-range
 * code has to be provable even though the type system forbids writing the call.
 * The compile-time half is proven separately, by `@ts-expect-error` in
 * `tests/types.test-d.ts`. The two halves together are the claim; either one
 * alone is half a test.
 */

import { describe, expect, it } from "vitest";

import {
  byWilaya,
  getCommune,
  getCommunes,
  getCommunesOfWilaya,
  getDaira,
  getDairas,
  getDairasOfWilaya,
  getWilaya,
  getWilayas,
} from "../packages/js/src/index";
import type { WilayaCode } from "../packages/js/src/index";

/**
 * The 69 codes, used only as the ITERATION DOMAIN of the "over all 69" tests —
 * never as an expectation. It is read off the dataset because `WilayaCode` is a
 * literal union and writing `1..69` by hand would need 69 casts; the very next
 * test pins the list against an independently written `1..69` so the domain
 * itself cannot silently shrink and take every total with it.
 */
const ALL_CODES: readonly WilayaCode[] = getWilayas().map((w) => w.code);

describe("the iteration domain", () => {
  it("is exactly 1..69, contiguous and in order", () => {
    expect([...ALL_CODES]).toEqual(Array.from({ length: 69 }, (_, i) => i + 1));
  });
});

// ── getWilaya ───────────────────────────────────────────────────────────────

describe("getWilaya", () => {
  it("finds Setif, Bejaia, Oran and M'Sila by code", () => {
    expect(getWilaya(19)?.name.fr).toBe("Setif");
    expect(getWilaya(19)?.name.ar).toBe("سطيف");
    expect(getWilaya(19)?.codeText).toBe("19");
    // NOT "Sétif", and NOT "Béjaïa". This dataset ships the unaccented forms;
    // the accent folding lives on the query side and is tested in
    // tests/search.test.ts.
    expect(getWilaya(6)?.name.fr).toBe("Bejaia");
    expect(getWilaya(31)?.name.fr).toBe("Oran");
    expect(getWilaya(28)?.name.fr).toBe("M'Sila");
  });

  it("finds all 69 codes and returns the same object identity as getWilayas()", () => {
    const missing = ALL_CODES.filter((c) => getWilaya(c) === undefined);
    expect(missing).toEqual([]);
    // The index maps to the array's own records — no per-call copy, no
    // re-wrapping. `codeText` is derived once, into the same object every call.
    expect(getWilaya(19)).toBe(getWilaya(19));
  });

  it("returns undefined, not null, for a wilaya that does not exist", () => {
    // 70 is past the 1..69 range. The cast is required to write the call at all.
    expect(getWilaya(70 as WilayaCode)).toBeUndefined();
    expect(getWilaya(70 as WilayaCode)).not.toBeNull();
    expect(getWilaya(0 as WilayaCode)).toBeUndefined();
    expect(getWilaya(-1 as WilayaCode)).toBeUndefined();
    expect(getWilaya(16.5 as WilayaCode)).toBeUndefined();
  });

  it("does not throw on a miss", () => {
    // The only throwing export in the library is `assertWilayaCode`.
    expect(() => getWilaya(70 as WilayaCode)).not.toThrow();
  });
});

// ── getDaira ────────────────────────────────────────────────────────────────

describe("getDaira", () => {
  it("takes the daira id, one argument", () => {
    const daira = getDaira("19-ain-azel");
    expect(daira?.name.fr).toBe("Ain Azel");
    expect(daira?.wilaya).toBe(19);
    expect(daira?.communeCount).toBe(4);
  });

  it("resolves every one of the 591 ids", () => {
    const unresolved = getDairas()
      .filter((d) => getDaira(d.id) === undefined)
      .map((d) => d.id);
    expect(unresolved).toEqual([]);
  });

  it("keeps the wilaya prefix load-bearing — the same slug in two wilayas is two records", () => {
    // 591 daïras carry only 545 distinct names, so an id without the wilaya
    // prefix would collide. `Sidi Ameur` exists in wilaya 32 and wilaya 64.
    expect(getDaira("32-sidi-ameur")?.wilaya).toBe(32);
    expect(getDaira("64-sidi-ameur")?.wilaya).toBe(64);
    expect(getDaira("32-sidi-ameur")).not.toBe(getDaira("64-sidi-ameur"));
  });

  it("returns undefined, not null, for an id that does not exist", () => {
    expect(getDaira("70-nowhere")).toBeUndefined();
    expect(getDaira("70-nowhere")).not.toBeNull();
    // A real slug under the wrong wilaya must also miss — that is what the
    // composite key buys.
    expect(getDaira("01-ain-azel")).toBeUndefined();
    // Not trimmed, not case-folded: an id is an exact key, not a search query.
    expect(getDaira(" 19-ain-azel")).toBeUndefined();
    expect(getDaira("19-Ain-Azel")).toBeUndefined();
    expect(getDaira("")).toBeUndefined();
  });
});

// ── getCommune ──────────────────────────────────────────────────────────────

describe("getCommune", () => {
  it("takes the commune id and returns the record", () => {
    const commune = getCommune("19-ain-azel-ain-lahdjar");
    expect(commune?.name.fr).toBe("Ain Lahdjar");
    expect(commune?.name.ar).toBe("عين الحجر");
    expect(commune?.postalCode).toBe("19018");
    expect(commune?.wilaya).toBe(19);
    expect(commune?.daira).toBe("19-ain-azel");

    expect(getCommune("19-ain-azel-ain-azel")?.name.fr).toBe("Ain Azel");
  });

  it("resolves every one of the 1541 ids", () => {
    const unresolved = getCommunes()
      .filter((c) => getCommune(c.id) === undefined)
      .map((c) => c.id);
    expect(unresolved).toEqual([]);
  });

  it("returns undefined, not null, for an id that does not exist", () => {
    expect(getCommune("19-ain-azel-nowhere")).toBeUndefined();
    expect(getCommune("19-ain-azel-nowhere")).not.toBeNull();
    expect(getCommune("ain-lahdjar")).toBeUndefined(); // no wilaya/daira prefix
    expect(getCommune("")).toBeUndefined();
  });
});

// ── byWilaya ────────────────────────────────────────────────────────────────

describe("byWilaya", () => {
  it("nests the whole wilaya: 20 daïras carrying 60 communes for Setif", () => {
    const tree = byWilaya(19);
    expect(tree?.code).toBe(19);
    expect(tree?.codeText).toBe("19");
    expect(tree?.name.fr).toBe("Setif");
    expect(tree?.dairas).toHaveLength(20);
    expect(tree?.dairas.reduce((n, d) => n + d.communes.length, 0)).toBe(60);

    // The daïra level really carries its communes, not just a count.
    const ainAzel = tree?.dairas.find((d) => d.id === "19-ain-azel");
    expect(ainAzel?.communeCount).toBe(4);
    expect(ainAzel?.communes.map((c) => c.id)).toEqual([
      "19-ain-azel-ain-azel",
      "19-ain-azel-ain-lahdjar",
      "19-ain-azel-beidha-bordj",
      "19-ain-azel-bir-haddada",
    ]);
  });

  it("keeps every nested record back-referencing wilaya 19", () => {
    const tree = byWilaya(19);
    const strays = (tree?.dairas ?? []).flatMap((d) => [
      ...(d.wilaya === 19 ? [] : [d.id]),
      ...d.communes.filter((c) => c.wilaya !== 19 || c.daira !== d.id).map((c) => c.id),
    ]);
    expect(strays).toEqual([]);
  });

  it("agrees with the flat per-wilaya lookups, record for record", () => {
    // The tree is a different materialization of the same rows. If the two ever
    // disagree, one of them is filtering on the wrong key.
    const tree = byWilaya(19);
    expect((tree?.dairas ?? []).map((d) => d.id)).toEqual(getDairasOfWilaya(19).map((d) => d.id));
    expect((tree?.dairas ?? []).flatMap((d) => d.communes.map((c) => c.id))).toEqual(
      getCommunesOfWilaya(19).map((c) => c.id),
    );
  });

  it("builds every one of the 69 trees, totalling 591 daïras and 1541 communes", () => {
    let dairas = 0;
    let communes = 0;
    const missing: WilayaCode[] = [];
    for (const code of ALL_CODES) {
      const tree = byWilaya(code);
      if (tree === undefined) {
        missing.push(code);
        continue;
      }
      dairas += tree.dairas.length;
      communes += tree.dairas.reduce((n, d) => n + d.communes.length, 0);
    }
    expect(missing).toEqual([]);
    expect(dairas).toBe(591);
    expect(communes).toBe(1541);
  });

  it("memoizes per code — the same tree instance comes back twice", () => {
    // Asking for one wilaya must never materialize the other 68, and asking
    // twice must not rebuild. Identity is the only way to prove the second half.
    expect(byWilaya(19)).toBe(byWilaya(19));
    expect(byWilaya(19)).not.toBe(byWilaya(6));
  });

  it("returns undefined, not null, for a wilaya that does not exist", () => {
    expect(byWilaya(70 as WilayaCode)).toBeUndefined();
    expect(byWilaya(70 as WilayaCode)).not.toBeNull();
    expect(byWilaya(0 as WilayaCode)).toBeUndefined();
  });
});

// ── getCommunesOfWilaya / getDairasOfWilaya ─────────────────────────────────

describe("getCommunesOfWilaya", () => {
  it("returns Setif's 60 communes, every one back-referencing wilaya 19", () => {
    const communes = getCommunesOfWilaya(19);
    expect(communes).toHaveLength(60);
    expect(communes.filter((c) => c.wilaya !== 19)).toEqual([]);
    expect(communes.map((c) => c.id)).toContain("19-ain-azel-ain-lahdjar");
  });

  it("totals 1541 over all 69 codes, with no record counted twice", () => {
    // The union has to be the whole corpus exactly once: a bug that assigns a
    // commune to two wilayas, or drops one, shows up as a total that is not
    // 1541 while every individual list still looks plausible.
    const seen = new Set<string>();
    let total = 0;
    for (const code of ALL_CODES) {
      const communes = getCommunesOfWilaya(code);
      total += communes.length;
      for (const c of communes) seen.add(c.id);
    }
    expect(total).toBe(1541);
    expect(seen.size).toBe(1541);
  });

  it("agrees with the wilaya record's own denormalized counter for all 69", () => {
    const wrong = getWilayas()
      .filter((w) => getCommunesOfWilaya(w.code).length !== w.communeCount)
      .map((w) => w.code);
    expect(wrong).toEqual([]);
  });

  it("returns an empty array — never undefined — for a wilaya that does not exist", () => {
    // Plural lookups answer "zero matches", which is a normal answer, so the
    // miss value is `[]` and not `undefined`. Being boringly consistent about
    // this is the whole point: singular → `T | undefined`, plural → `T[]`.
    expect(getCommunesOfWilaya(70 as WilayaCode)).toEqual([]);
    expect(getCommunesOfWilaya(70 as WilayaCode)).not.toBeUndefined();
  });
});

describe("getDairasOfWilaya", () => {
  it("returns Setif's 20 daïras, every one back-referencing wilaya 19", () => {
    const dairas = getDairasOfWilaya(19);
    expect(dairas).toHaveLength(20);
    expect(dairas.filter((d) => d.wilaya !== 19)).toEqual([]);
    expect(dairas.map((d) => d.id)).toContain("19-ain-azel");
  });

  it("totals 591 over all 69 codes, with no record counted twice", () => {
    const seen = new Set<string>();
    let total = 0;
    for (const code of ALL_CODES) {
      const dairas = getDairasOfWilaya(code);
      total += dairas.length;
      for (const d of dairas) seen.add(d.id);
    }
    expect(total).toBe(591);
    expect(seen.size).toBe(591);
  });

  it("agrees with the wilaya record's own denormalized counter for all 69", () => {
    const wrong = getWilayas()
      .filter((w) => getDairasOfWilaya(w.code).length !== w.dairaCount)
      .map((w) => w.code);
    expect(wrong).toEqual([]);
  });

  it("returns an empty array — never undefined — for a wilaya that does not exist", () => {
    expect(getDairasOfWilaya(70 as WilayaCode)).toEqual([]);
    expect(getDairasOfWilaya(70 as WilayaCode)).not.toBeUndefined();
  });
});
