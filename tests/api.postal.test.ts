/**
 * `findByPostalCode` — the plural lookup, the 17 shared codes and the 45 nulls.
 *
 * The single most common way to get this index wrong is to type it
 * `Map<string, Commune>`. 38 of the 1479 distinct codes are carried by more
 * than one commune, so a scalar value would silently drop records depending on
 * insertion order — no error, no type failure, just a missing commune for one
 * user in Skikda. Every assertion about the shared codes below exists to make
 * that specific bug impossible to ship.
 *
 * Numbers are measured literals: 1541 communes, 1496 with a code, 27 without,
 * 1479 distinct codes, 38 of them shared, largest bucket 2.
 */

import { describe, expect, it } from "vitest";

import { findByPostalCode, getCommunes } from "../packages/js/src/index";

describe("findByPostalCode — the single-commune case", () => {
  it("finds Ain Lahdjar by 19018", () => {
    // 19018 belongs to exactly one commune, which is what makes it the right
    // anchor for the simple case. Most codes are like this; 38 are not, and the
    // next block is about those.
    const hits = findByPostalCode("19018");
    expect(hits).toHaveLength(1);
    expect(hits.map((c) => c.id)).toEqual(["19-ain-azel-ain-lahdjar"]);
    expect(hits.map((c) => c.name.fr)).toEqual(["Ain Lahdjar"]);
    expect(hits.map((c) => c.wilaya)).toEqual([19]);
  });

  it("returns the record identity from getCommunes(), not a copy", () => {
    const fromIndex = findByPostalCode("19018")[0];
    const fromArray = getCommunes().find((c) => c.id === "19-ain-azel-ain-lahdjar");
    expect(fromIndex).toBe(fromArray);
  });

  it("finds a leading-zero code, which is most of wilayas 01..09", () => {
    // "02000" is Chlef. Leading zeros are the reason `PostalCode` is a branded
    // string and not the template-literal type — that type rejects "02000",
    // which is to say it rejects a large share of the real dataset.
    const hits = findByPostalCode("02000");
    expect(hits.map((c) => c.id)).toEqual(["02-chlef-chlef"]);
  });
});

describe("findByPostalCode — the shared codes", () => {
  it("returns only Chlef's commune for 02015, both homonyms having been corrected", () => {
    // `El Marsa` is a commune in wilayas 2, 16 and 21 and all three shipped
    // 02015. 02015 is Chlef's; Alger's and Skikda's were the artifact and are
    // corrected (ADR-018), so the bucket is down to its one rightful holder.
    const hits = findByPostalCode("02015");
    expect(hits.map((c) => c.id)).toEqual(["02-el-marsa-el-marsa"]);
    expect(hits.map((c) => c.wilaya)).toEqual([2]);
  });

  it("no longer returns Alger's El Marsa for Chlef's code", () => {
    // The regression guard for the correction itself.
    expect(findByPostalCode("02015").map((c) => c.wilaya)).not.toContain(16);
    expect(findByPostalCode("16111").map((c) => c.id)).toEqual(["16-dar-el-beida-el-marsa"]);
  });

  it("returns only Bouira's commune for 10031, since Saida's was corrected", () => {
    // This is the row that exposed the whole defect. `Ain El Hadjar` exists in
    // wilaya 10 AND wilaya 20, and both shipped 10031 -- byte-identical, because
    // the upstream join matched on name and copied Bouira's code onto Saida's
    // commune along with Bouira's daira `Ain Bessem`. 10031 is Bouira's.
    //
    // Saida's row has been re-parented to its real daira `Ain El Hadjar` and its
    // code withdrawn pending a source (two candidates disagree), so 10031 now
    // resolves to exactly one commune. See ADR-018.
    const hits = findByPostalCode("10031");
    expect(hits.map((c) => c.id)).toEqual(["10-ain-bessem-ain-el-hadjar"]);
    expect(hits.map((c) => c.wilaya)).toEqual([10]);

    // The Arabic-name collision it illustrated is still real and still the
    // reason plural lookups return whole records: three communes across wilayas
    // 10, 19 and 20 share the Arabic name عين الحجر.
    const sameArabic = getCommunes().filter((c) => c.name.ar === "عين الحجر");
    expect(sameArabic.map((c) => c.wilaya).sort((a, b) => a - b)).toEqual([10, 19, 20]);
    // ...and the corrected Saida row keeps its identity while having no code.
    const saida = getCommunes().find((c) => c.id === "20-ain-el-hadjar-ain-el-hadjar");
    expect(saida?.name.ar).toBe("عين الحجر");
    expect(saida?.postalCode).toBeNull();
  });

  it("has exactly 17 shared codes across 1479 distinct codes, largest bucket 2", () => {
    // Re-derived through the PUBLIC accessor and cross-checked against the
    // public lookup: the census and the index must tell the same story.
    const buckets = new Map<string, number>();
    for (const c of getCommunes()) {
      if (c.postalCode === null) continue;
      buckets.set(c.postalCode, (buckets.get(c.postalCode) ?? 0) + 1);
    }
    expect(buckets.size).toBe(1479);
    expect([...buckets.values()].filter((n) => n > 1)).toHaveLength(17);
    expect(Math.max(...buckets.values())).toBe(2);
  });

  it("returns exactly the census bucket for every one of the 1479 codes", () => {
    // The strongest form of the claim: for each distinct code, the lookup's
    // result set equals the set of communes carrying it. Catches a dropped
    // record, a duplicated record and a cross-wired bucket in one pass.
    const buckets = new Map<string, string[]>();
    for (const c of getCommunes()) {
      if (c.postalCode === null) continue;
      const bucket = buckets.get(c.postalCode);
      if (bucket === undefined) buckets.set(c.postalCode, [c.id]);
      else bucket.push(c.id);
    }
    const wrong: string[] = [];
    for (const [code, ids] of buckets) {
      const got = findByPostalCode(code).map((c) => c.id);
      if (got.join(",") !== ids.join(","))
        wrong.push(`${code}: ${got.join(",")} != ${ids.join(",")}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("findByPostalCode — the miss path", () => {
  it("returns an empty array, never undefined and never null", () => {
    // Plural lookup: "zero matches" is a normal answer, so the miss value is
    // `[]`. A caller can `.map()` the result without a guard, which is the
    // whole reason for the convention.
    expect(findByPostalCode("99999")).toEqual([]);
    expect(findByPostalCode("99999")).not.toBeUndefined();
    expect(findByPostalCode("99999")).not.toBeNull();
  });

  it('matches nothing for "00000", which is well-formed but unused', () => {
    // Shape is not existence. `isPostalCode("00000")` is true; there is still
    // no commune with that code.
    expect(findByPostalCode("00000")).toEqual([]);
  });

  it("accepts unvalidated input and simply matches nothing", () => {
    // The parameter is a plain `string`, not a `PostalCode`: callers must not
    // be forced to brand a value before they may ask a question. A malformed
    // code is not an error, it is a miss.
    expect(findByPostalCode("")).toEqual([]);
    expect(findByPostalCode("abcde")).toEqual([]);
    expect(findByPostalCode("1e5")).toEqual([]);
    expect(findByPostalCode("190180")).toEqual([]);
    expect(findByPostalCode("1901")).toEqual([]);
  });

  it("does not trim the query", () => {
    // A lookup that trims teaches callers that whitespace is harmless, and
    // " 19018 " then reaches a database as a padded key somewhere downstream.
    // Trimming is the caller's deliberate act.
    expect(findByPostalCode(" 19018")).toEqual([]);
    expect(findByPostalCode("19018 ")).toEqual([]);
    expect(findByPostalCode(" 19018 ")).toEqual([]);
  });

  it("never returns a commune whose postalCode is null", () => {
    // The 45 nulls must not end up under a "null" or "" key. Sidi Ameur (32 and
    // 64) and Souk El Had (35 and 48) are among them.
    const nullCodeIds = new Set(
      getCommunes()
        .filter((c) => c.postalCode === null)
        .map((c) => c.id),
    );
    expect(nullCodeIds.size).toBe(45);

    const leaked: string[] = [];
    for (const probe of ["", "null", "undefined", "00000", "99999"]) {
      for (const hit of findByPostalCode(probe)) {
        if (nullCodeIds.has(hit.id)) leaked.push(`${probe} -> ${hit.id}`);
      }
    }
    expect(leaked).toEqual([]);
  });
});

describe("findByPostalCode — coverage of the whole corpus", () => {
  it("finds all 1496 communes that have a code, and only those", () => {
    let found = 0;
    const unfound: string[] = [];
    for (const c of getCommunes()) {
      if (c.postalCode === null) continue;
      if (findByPostalCode(c.postalCode).some((hit) => hit.id === c.id)) found += 1;
      else unfound.push(c.id);
    }
    expect(unfound).toEqual([]);
    expect(found).toBe(1496);
  });
});
