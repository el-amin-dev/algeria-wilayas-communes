/**
 * `findCommunesByName` — exact NORMALIZED match, plural result.
 *
 * "Exact" and "normalized" are both load-bearing and pull in opposite
 * directions, so both are pinned here:
 *
 * - *normalized* means case, accents, apostrophes and hyphens do not matter —
 *   `"SIDI M'HAMED"`, `"sidi mhamed"` and `"Sidi M'hamed"` are one question.
 * - *exact* means it is not a search engine: `"ain"` must NOT return
 *   `Ain Lahdjar`. Prefix, substring and fuzzy work belongs to `search()`,
 *   over a different structure, and conflating the two is how a lookup that
 *   should answer in O(1) starts scanning 1541 records.
 *
 * The result is always an array because commune names are not unique: 38 French
 * names are carried by more than one commune, and after normalization 42 name
 * keys are shared, covering 89 of the 1541 communes. `Sidi Ameur` (wilayas 32
 * and 64) and `Souk El Had` (35 and 48) are the canonical pairs — a result that
 * were only a name would be undisambiguable, which is why the caller gets the
 * whole records back and joins on `wilaya`.
 */

import { describe, expect, it } from "vitest";

import { findCommunesByName, getCommunes } from "../packages/js/src/index";
import { normalize } from "../packages/js/src/normalize";

describe("findCommunesByName — the duplicated names", () => {
  it("returns Sidi Ameur in wilayas 32 and 64", () => {
    const hits = findCommunesByName("Sidi Ameur");
    expect(hits).toHaveLength(2);
    // `wilaya` is a NUMBER on the record, so the sort is numeric and the
    // expectation is `[32, 64]`, not `["32", "64"]`.
    expect(hits.map((c) => c.wilaya).sort((a, b) => a - b)).toEqual([32, 64]);
    expect(hits.map((c) => c.id).sort()).toEqual([
      "32-sidi-ameur-sidi-ameur",
      "64-sidi-ameur-sidi-ameur",
    ]);
    // Both of them are also among the 45 communes with no postal code, so this
    // pair cannot be disambiguated by postal code either.
    expect(hits.map((c) => c.postalCode)).toEqual([null, null]);
  });

  it("returns Souk El Had in wilayas 35 and 48", () => {
    const hits = findCommunesByName("Souk El Had");
    expect(hits).toHaveLength(2);
    expect(hits.map((c) => c.wilaya).sort((a, b) => a - b)).toEqual([35, 48]);
    expect(hits.map((c) => c.id).sort()).toEqual([
      "35-thenia-souk-el-had",
      "48-thenia-souk-el-had",
    ]);
  });

  it("returns Sidi M'hamed in wilayas 16 and 64", () => {
    // The apostrophe is removed, not replaced by a space, so `Sidi M'hamed`
    // and `Sidi Mhamed` are the same key: `sidi mhamed`.
    const hits = findCommunesByName("Sidi M'hamed");
    expect(hits.map((c) => c.wilaya).sort((a, b) => a - b)).toEqual([16, 64]);
    expect(findCommunesByName("sidi mhamed").map((c) => c.id)).toEqual(hits.map((c) => c.id));
  });

  it("has 38 duplicated French names and 42 duplicated name keys over 89 communes", () => {
    // The two counts differ by four groups, and the difference is the point of
    // normalizing at all: `Souk El Tenine`, `Ain Benian`, `El Ouldja` and
    // `Ouled Sidi Brahim` are spelled differently across wilayas but are one
    // question to a user. A test that only pinned 38 would not notice
    // normalization being dropped from the index.
    const byExactName = new Map<string, number>();
    const byKey = new Map<string, number>();
    for (const c of getCommunes()) {
      byExactName.set(c.name.fr, (byExactName.get(c.name.fr) ?? 0) + 1);
      const key = normalize(c.name.fr);
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    expect([...byExactName.values()].filter((n) => n > 1)).toHaveLength(38);

    const dupKeys = [...byKey.entries()].filter(([, n]) => n > 1);
    expect(dupKeys).toHaveLength(42);
    expect(dupKeys.reduce((n, [, count]) => n + count, 0)).toBe(89);
    expect(byKey.size).toBe(1494);
  });

  it("returns the whole group for each of the 42 shared name keys", () => {
    const groups = new Map<string, string[]>();
    for (const c of getCommunes()) {
      const key = normalize(c.name.fr);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [c.id]);
      else group.push(c.id);
    }
    const wrong: string[] = [];
    for (const [key, ids] of groups) {
      if (ids.length < 2) continue;
      const got = findCommunesByName(key)
        .map((c) => c.id)
        .sort();
      const want = [...ids].sort();
      if (got.join(",") !== want.join(","))
        wrong.push(`${key}: ${got.join(",")} != ${want.join(",")}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("findCommunesByName — normalization of the query", () => {
  const AIN_LAHDJAR = ["19-ain-azel-ain-lahdjar"];

  it.each([
    "Ain Lahdjar",
    "ain lahdjar",
    "AIN LAHDJAR",
    "Ain-Lahdjar",
    "  Ain   Lahdjar  ",
    "Aïn Lahdjar",
  ])("finds Ain Lahdjar from %o", (query) => {
    expect(findCommunesByName(query).map((c) => c.id)).toEqual(AIN_LAHDJAR);
  });

  it("folds the accents a caller types even though the dataset ships none", () => {
    // The record is `Bejaia`, unaccented — there is not one accented Latin
    // character in the shipped names. The folding that matters is on the QUERY.
    expect(findCommunesByName("Béjaïa").map((c) => c.id)).toEqual(["06-bejaia-bejaia"]);
    expect(findCommunesByName("bejaia").map((c) => c.id)).toEqual(["06-bejaia-bejaia"]);
    expect(findCommunesByName("BEJAIA").map((c) => c.id)).toEqual(["06-bejaia-bejaia"]);
  });

  it("does not merge two communes whose Arabic names collide", () => {
    // `Ain Lahdjar` (19) and `Ain El Hadjar` (10 and 20) share the Arabic name
    // عين الحجر but not the French one. This lookup is keyed on the French
    // name, so the two questions stay separate and neither answer leaks into
    // the other.
    expect(findCommunesByName("Ain Lahdjar").map((c) => c.wilaya)).toEqual([19]);
    expect(findCommunesByName("Ain El Hadjar").map((c) => c.wilaya)).toEqual([10, 20]);
  });

  it("treats a hyphen and a space as the same separator", () => {
    // The commune is spelled `Tizi-Ouzou` with a hyphen; the wilaya is
    // `Tizi Ouzou` with a space. One key: `tizi ouzou`.
    expect(findCommunesByName("Tizi Ouzou").map((c) => c.id)).toEqual(["15-tizi-ouzou-tizi-ouzou"]);
    expect(findCommunesByName("Tizi-Ouzou").map((c) => c.id)).toEqual(["15-tizi-ouzou-tizi-ouzou"]);
  });

  it("finds every one of the 1541 communes by its own French name", () => {
    const unfound = getCommunes()
      .filter((c) => !findCommunesByName(c.name.fr).some((hit) => hit.id === c.id))
      .map((c) => c.id);
    expect(unfound).toEqual([]);
  });
});

describe("findCommunesByName — exactness", () => {
  it("does not do prefix matching", () => {
    // 172 keys start with `ain`, and `search("ain")` finds them. This lookup
    // must not: it answers "whose name IS this", and a caller who wanted the
    // other question has `search()`.
    expect(findCommunesByName("ain")).toEqual([]);
    expect(findCommunesByName("ain lahd")).toEqual([]);
  });

  it("does not do substring matching", () => {
    expect(findCommunesByName("lahdjar")).toEqual([]);
    expect(findCommunesByName("ouzou")).toEqual([]);
  });

  it("does not do fuzzy matching", () => {
    expect(findCommunesByName("ain lahdja")).toEqual([]);
    expect(findCommunesByName("ain lahdjer")).toEqual([]);
  });

  it("returns an empty array, never undefined and never null, on a miss", () => {
    expect(findCommunesByName("Paris")).toEqual([]);
    expect(findCommunesByName("Paris")).not.toBeUndefined();
    expect(findCommunesByName("Paris")).not.toBeNull();
    expect(findCommunesByName("")).toEqual([]);
    expect(findCommunesByName("   ")).toEqual([]);
  });

  it("is keyed on communes, never on daïras", () => {
    // `Ain Azel` is both a daïra of Setif and a commune of Setif. The lookup
    // must answer with the COMMUNE and nothing else — one record, not two, and
    // never a daïra wearing a commune's type.
    const hits = findCommunesByName("Ain Azel");
    expect(hits.map((c) => c.id)).toEqual(["19-ain-azel-ain-azel"]);
    expect(hits.map((c) => c.daira)).toEqual(["19-ain-azel"]);
  });
});
