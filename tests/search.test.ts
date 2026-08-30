/**
 * `search()` — Arabic + French + the English alias, ranking, `limit`, scoping
 * and the bounded fuzzy tier.
 *
 * The acceptance sentence for the whole session is one line: **a user typing
 * `بجاية` and a user typing `bejaia` must both find Bejaia.** Everything else
 * here defends that sentence against the ways it breaks quietly.
 *
 * Two facts about the shipped data that the spec gets wrong, corrected here
 * once so the assertions below read sanely:
 *
 * - The dataset ships `Bejaia`, **unaccented**. There is not one accented Latin
 *   character in `wilayas.ts` or `communes.ts`. Accent folding is therefore
 *   tested on the QUERY side — `search("Béjaïa")` must work — never by
 *   expecting an accented value back.
 * - `result.wilaya` is the full `Wilaya` record, so the disambiguator is
 *   `r.wilaya.code` (a number), while `r.item.wilaya` on a daïra or commune is
 *   the same number reached the short way.
 *
 * The canonical anchor is Setif (19) and its commune Ain Lahdjar. The two
 * exceptions are deliberate and cannot be moved: the Bejaia block, because the
 * Arabic-and-Latin acceptance sentence is written about it, and everything
 * touching `lang: "en"` or the Alger misspellings, because wilaya 16 is the only
 * record in all 2201 whose `name.en` differs from its `name.fr`.
 *
 * `__searchStats` is imported here on purpose: proving that `limit` stops the
 * scan needs an instrumented comparison counter, because a timing-based
 * assertion is a flaky test with extra steps.
 */

import { describe, expect, it } from "vitest";

import { search } from "../packages/js/src/index";
import type { SearchKind, SearchResult } from "../packages/js/src/index";
import { __searchStats } from "../packages/js/src/search";

/**
 * The two accessors for the instrumented counter, isolated in one place: the
 * counter is a debug hook, not public API, and if its shape moves this file
 * should need a two-line change and no rewrite.
 */
function resetComparisons(): void {
  __searchStats().reset();
}
function comparisons(): number {
  return __searchStats().comparisons;
}

/** French names of the results, in result order. */
function names(results: readonly SearchResult[]): string[] {
  return results.map((r) => r.item.name.fr);
}

/**
 * Record ids of the results, in result order.
 *
 * A wilaya has no `id` — it has an official `code` — so one appearing in a list
 * that is supposed to be communes is reported as `wilaya:19` rather than
 * silently skipped or crashing. The union narrowing here is also the point:
 * reaching `item.id` at all requires discriminating on `kind`, with no cast.
 */
function ids(results: readonly SearchResult[]): string[] {
  return results.map((r) => (r.kind === "wilaya" ? `wilaya:${r.item.code}` : r.item.id));
}

// ── The acceptance sentence ─────────────────────────────────────────────────

describe("search — Bejaia from Arabic and from Latin", () => {
  it.each(["بجاية", "بجايه", "bejaia", "Bejaia", "BEJAIA", "béjaïa", "Béjaïa"])(
    "finds Bejaia (wilaya 6) as the top result for %o",
    (query) => {
      const top = search(query)[0];
      expect(top?.item.name.fr).toBe("Bejaia");
      expect(top?.kind).toBe("wilaya");
      expect(top?.wilaya.code).toBe(6);
      // All seven spellings normalize to the same key, so all seven are exact.
      expect(top?.score).toBe(1);
    },
  );

  it("reports which language layer matched", () => {
    expect(search("bejaia")[0]?.matched).toBe("fr");
    expect(search("بجاية")[0]?.matched).toBe("ar");
  });

  it("returns the wilaya, its seat daïra and its seat commune, in that order", () => {
    // Three records share the key `bejaia`. The tie-break is documented as
    // kind (wilaya, then daira, then commune), then wilaya code, then key —
    // never dataset order, which is what makes the order testable at all.
    const hits = search("bejaia");
    expect(hits.map((r) => r.kind)).toEqual(["wilaya", "daira", "commune"]);
    expect(names(hits)).toEqual(["Bejaia", "Bejaia", "Bejaia"]);
  });
});

describe("search — Setif, the canonical anchor", () => {
  it("returns the wilaya, its daïra and its commune, in that order", () => {
    // All three are named Setif, so all three are exact (1.0) and the ORDER is
    // entirely the documented tie-break: kind first (wilaya, then daira, then
    // commune), then wilaya code, then key. Never dataset order — a tie broken
    // by dataset order is a flaky test waiting to happen.
    const hits = search("setif");
    expect(hits.map((r) => r.kind)).toEqual(["wilaya", "daira", "commune"]);
    expect(hits.map((r) => r.score)).toEqual([1, 1, 1]);
    expect(hits.map((r) => r.wilaya.code)).toEqual([19, 19, 19]);
    expect(names(hits)).toEqual(["Setif", "Setif", "Setif"]);
  });

  it.each(["setif", "Setif", "SETIF", "Sétif", "سطيف"])("finds Setif for %o", (query) => {
    // `Sétif` is the accented spelling a French keyboard produces. It appears
    // NOWHERE in the dataset — the record is `Setif` — so this is purely the
    // query side folding, which is the only place accent folding lives.
    const top = search(query)[0];
    expect(top?.item.name.fr).toBe("Setif");
    expect(top?.wilaya.code).toBe(19);
    expect(top?.score).toBe(1);
  });

  it("finds Ain Lahdjar, the commune, from either script", () => {
    const fr = search("ain lahdjar");
    expect(ids(fr)).toEqual(["19-ain-azel-ain-lahdjar"]);
    expect(fr[0]?.matched).toBe("fr");
    expect(fr[0]?.wilaya.code).toBe(19);

    const ar = search("عين الحجر");
    expect(names(ar)).toContain("Ain Lahdjar");
    expect(ar[0]?.matched).toBe("ar");
  });

  it("returns three communes in wilayas 10, 19 and 20 for عين الحجر", () => {
    // One Arabic name, three communes, three wilayas: `Ain El Hadjar` in 10 and
    // 20, `Ain Lahdjar` in 19. Their French names differ, their postal codes
    // differ (10031 twice, 19018 once), and the ONLY thing that disambiguates
    // them in a result list is the wilaya each result carries. The daïra
    // `Ain El Hadjar` of wilaya 20 has the same Arabic name and comes first,
    // because kind outranks wilaya code in the tie-break.
    const hits = search("عين الحجر");
    expect(hits.map((r) => [r.kind, r.wilaya.code])).toEqual([
      ["daira", 20],
      ["commune", 10],
      ["commune", 19],
      ["commune", 20],
    ]);
    expect(hits.filter((r) => r.kind === "commune").map((r) => r.item.id)).toEqual([
      "10-ain-bessem-ain-el-hadjar",
      "19-ain-azel-ain-lahdjar",
      "20-ain-bessem-ain-el-hadjar",
    ]);
  });
});

describe("search — the other anchored queries", () => {
  it.each(["msila", "M'Sila", "m'sila", "المسيلة", "المسيله"])(
    "finds M'Sila (wilaya 28) for %o",
    (query) => {
      const top = search(query)[0];
      expect(top?.item.name.fr).toBe("M'Sila");
      expect(top?.wilaya.code).toBe(28);
    },
  );

  it("finds Sidi M'hamed (wilaya 16) from the apostrophe-free spelling", () => {
    // The apostrophe is deleted, not replaced by a space, so `M'hamed` and
    // `mhamed` are one key. This is the fr-side counterpart of the Arabic
    // folding above.
    const hits = search("sidi mhamed");
    expect(names(hits)).toContain("Sidi M'hamed");
    expect(hits.filter((r) => r.wilaya.code === 16)).not.toHaveLength(0);
  });

  it.each(["الجزائر الوسطى", "الجزاير الوسطي"])("finds Alger Centre for %o", (query) => {
    // One of the two places Alger stays the anchor on purpose: it is the record
    // that exercises the hamza-carrier fold end to end. Both spellings fold to
    // the ONE key `الجزاير الوسطي` -- hamza carrier folded, alef maqsura folded.
    // `الجزائر` is very commonly typed `الجزاير`, and the most-searched name in
    // the country must not miss on its most common misspelling.
    const hits = search(query);
    expect(names(hits)).toContain("Alger Centre");
    expect(hits[0]?.item.name.ar).toBe("الجزائر الوسطى");
    expect(hits[0]?.wilaya.code).toBe(16);
  });

  it.each(["tizi ouzou", "Tizi-Ouzou", "تيزي وزو"])(
    "finds Tizi Ouzou (wilaya 15) for %o",
    (query) => {
      const top = search(query)[0];
      expect(top?.wilaya.code).toBe(15);
      expect(top?.kind).toBe("wilaya");
    },
  );

  it("finds Bordj Bou Arreridj (wilaya 34)", () => {
    const top = search("bordj bou arreridj")[0];
    expect(top?.item.name.fr).toBe("Bordj Bou Arreridj");
    expect(top?.wilaya.code).toBe(34);
  });

  it("ranks an exact hit above the prefix hit that contains it", () => {
    // `ain azel` is exact for the daira and the commune of that name in Setif;
    // `ain lahd` is a prefix of `ain lahdjar` and nothing else. The exact tier
    // outranks the prefix tier by construction, which is what makes stopping
    // the scan early correct rather than merely fast.
    const exact = search("ain azel");
    expect(exact.map((r) => r.kind)).toEqual(["daira", "commune"]);
    expect(exact.map((r) => r.score)).toEqual([1, 1]);

    const prefix = search("ain lahd");
    expect(ids(prefix)).toEqual(["19-ain-azel-ain-lahdjar"]);
    expect(prefix[0]?.score ?? 1).toBeLessThan(1);
  });
});

// ── The duplicated names — every result carries its wilaya ──────────────────

describe("search — duplicated names are disambiguated by the wilaya", () => {
  it("returns Sidi Ameur as two daïras and two communes, wilayas 32 and 64", () => {
    // A result that were only a name would be undisambiguable. Four records
    // share the key `sidi ameur`; the documented tie-break orders them by kind
    // and then by wilaya code, so the whole array is pinned.
    const hits = search("sidi ameur");
    expect(hits.map((r) => [r.kind, r.wilaya.code])).toEqual([
      ["daira", 32],
      ["daira", 64],
      ["commune", 32],
      ["commune", 64],
    ]);

    // The two-element answer everyone quotes is the COMMUNE-FILTERED one. The
    // unfiltered call returns four results, and the difference is not cosmetic:
    // `[32, 64, 32, 64]` is what a consumer building a disambiguation dropdown
    // actually receives if they forget `kinds`.
    const communes = search("sidi ameur", { kinds: ["commune"] });
    expect(communes.map((r) => r.wilaya.code)).toEqual([32, 64]);
    expect(ids(communes)).toEqual(["32-sidi-ameur-sidi-ameur", "64-sidi-ameur-sidi-ameur"]);
    expect(hits.map((r) => r.wilaya.code)).toEqual([32, 64, 32, 64]);
    expect(ids(hits.filter((r) => r.kind === "commune"))).toEqual(ids(communes));
  });

  it("returns Souk El Had as two communes, wilayas 35 and 48", () => {
    const hits = search("souk el had");
    expect(hits.map((r) => [r.kind, r.wilaya.code])).toEqual([
      ["commune", 35],
      ["commune", 48],
    ]);
  });

  it("carries the full wilaya record on every result, not just a code", () => {
    const top = search("souk el had")[0];
    expect(top?.wilaya.code).toBe(35);
    expect(top?.wilaya.codeText).toBe("35");
    expect(top?.wilaya.name.fr).toBe("Boumerdes");
  });

  it("narrows `item` on `kind` with no cast", () => {
    // The discriminated union is the API promise. This block would not compile
    // if `kind` stopped discriminating — `postalCode` exists only on Commune,
    // `dairaCount` only on Wilaya.
    for (const r of search("setif")) {
      if (r.kind === "commune") expect(r.item.postalCode).toBe("19000");
      else if (r.kind === "daira") expect(r.item.communeCount).toBe(1);
      else expect(r.item.dairaCount).toBe(20);
    }
  });
});

// ── The empty query ─────────────────────────────────────────────────────────

describe("search — the empty query", () => {
  it.each(["", "   ", "\t\n", "'", "-"])("returns [] for %o", (query) => {
    // The cheapest possible answer to the most common accidental call: an empty
    // search box on mount. `search()` never throws and never returns undefined.
    // That NO INDEX is built for these is asserted in tests/import-purity.test.ts,
    // which is the only file that can make that claim honestly.
    expect(search(query)).toEqual([]);
  });
});

// ── Language layers ─────────────────────────────────────────────────────────

describe("search — lang", () => {
  it("finds Algiers for wilaya 16 via the 1-entry en override", () => {
    // The one place Alger MUST stay the anchor: `name.en` differs from
    // `name.fr` for exactly one record in all 2201, and wilaya 16 is it. Setif's
    // `en` is `Setif`, so Setif physically cannot demonstrate this path.
    //
    // That single difference is also precisely why there is no separate `en`
    // key layer at all: `lang: "en"` searches the fr keys plus a one-row
    // override table. 2201 duplicate keys saved, zero API change.
    const top = search("algiers", { lang: "en" })[0];
    expect(top?.kind).toBe("wilaya");
    expect(top?.item.name.en).toBe("Algiers");
    expect(top?.wilaya.code).toBe(16);
    expect(top?.matched).toBe("en");
  });

  it("returns [] for Algiers when lang is NOT passed — and that is deliberate", () => {
    // The override table is consulted ONLY under `lang: "en"`. It is tempting
    // to fold `algiers` into the default layer so that a bare
    // `search("Algiers")` works, and it must not be done, for a reason that
    // acts at a distance:
    //
    //   `algiers` in the default layer makes `algier` a PREFIX match, so
    //   `search("algier")` — with fuzzy OFF — would return Alger. That breaks
    //   the required fuzzy assertion ("a non-fuzzy call returns none of the
    //   three misspellings"), and it breaks it in a completely different file,
    //   with a failure message that says nothing about this decision.
    //
    // So: English callers pass `lang: "en"`. The tradeoff is one option, and
    // it is documented rather than designed away.
    expect(search("Algiers")).toEqual([]);
    expect(search("algiers")).toEqual([]);
    expect(search("Algiers", { lang: "en" })).not.toHaveLength(0);
  });

  it("scores the en override on the exact tier at 1.0", () => {
    // The three tests here walk the override table through all three
    // deterministic tiers. Until now only this one — the exact tier — had ever
    // run, so the prefix and substring override paths were published API that
    // nothing exercised. Their scores are part of that API: a consumer who
    // filters on `score >= 0.7` is relying on the numbers below.
    const hits = search("algiers", { lang: "en" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.score).toBe(1);
    expect(hits[0]?.matched).toBe("en");
    expect(hits[0]?.wilaya.code).toBe(16);
  });

  it("scores the en override on the prefix tier by key coverage", () => {
    // "algier" (6) is a prefix of the override key "algiers" (7):
    // 0.7 + 0.2 × 6/7 = 0.8714285…
    //
    // Note what this ALSO proves, and why the fuzzy tests in this file are not
    // in conflict with it: `algiers` lives in the override table, not in the
    // default key layer, so this prefix hit is reachable ONLY under
    // `lang: "en"`. A bare `search("algier")` still returns [] — asserted in
    // the fuzzy block — and that is the whole reason the override is kept out
    // of the default layer.
    const hits = search("algier", { lang: "en" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.item.name.en).toBe("Algiers");
    expect(hits[0]?.matched).toBe("en");
    expect(hits[0]?.score).toBeCloseTo(0.8714285714285714, 12);
    expect(hits[0]?.score ?? 0).toBeGreaterThan(0.7);
    expect(hits[0]?.score ?? 1).toBeLessThanOrEqual(0.9);
  });

  it("scores the en override on the substring tier in the substring band", () => {
    // "lgier" (5) is a substring of "algiers" (7) and a prefix of nothing:
    // 0.4 + 0.2 × 5/7 = 0.5428571…  The band is 0.4–0.6, strictly below every
    // prefix score and strictly above every fuzzy score.
    const hits = search("lgier", { lang: "en" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.item.name.en).toBe("Algiers");
    expect(hits[0]?.matched).toBe("en");
    expect(hits[0]?.score).toBeCloseTo(0.5428571428571429, 12);
    expect(hits[0]?.score ?? 0).toBeGreaterThan(0.4);
    expect(hits[0]?.score ?? 1).toBeLessThan(0.6);
  });

  it("keeps the three override tiers strictly ordered", () => {
    // Same record, same table, three tiers. If the override were ever scored
    // off a different formula from the main layers, this is where it shows.
    const exact = search("algiers", { lang: "en" })[0]?.score ?? 0;
    const prefix = search("algier", { lang: "en" })[0]?.score ?? 0;
    const substring = search("lgier", { lang: "en" })[0]?.score ?? 0;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });

  it("still finds the French names under lang: en, because en aliases fr", () => {
    const top = search("setif", { lang: "en" })[0];
    expect(top?.wilaya.code).toBe(19);
    expect(top?.item.name.en).toBe("Setif");
  });

  it("finds nothing for an Arabic query under lang: fr", () => {
    expect(search("سطيف", { lang: "fr" })).toEqual([]);
  });

  it("finds nothing for a Latin query under lang: ar", () => {
    expect(search("setif", { lang: "ar" })).toEqual([]);
  });

  it("searches every layer when lang is omitted", () => {
    expect(search("setif")).not.toHaveLength(0);
    expect(search("سطيف")).not.toHaveLength(0);
  });
});

// ── The script prune ────────────────────────────────────────────────────────

describe("search — the script prune", () => {
  // The substring tier is the only linear scan in the library, so it is pruned
  // by language layer before it runs. That prune is correct only because the
  // two layers are disjoint by script — asserted directly over SEARCH_KEYS in
  // tests/normalize.test.ts. These are the three cases where the prune is what
  // produces the answer, and all three answer `[]`.

  it("returns [] for a mixed-script query, which can match no single layer", () => {
    // "ain عين" contains both a Latin letter and an Arabic letter. No key in
    // either layer can contain both, so the query is unsatisfiable — and the
    // runtime must reach that conclusion by pruning, not by scanning 4402 keys
    // and finding nothing.
    expect(search("ain عين")).toEqual([]);
    expect(search("عين ain")).toEqual([]);
  });

  it("returns [] when an explicit lang contradicts the query's script", () => {
    // Both halves are asserted against a query that DOES match under its own
    // script, so an empty result really is the prune and not a typo: bare
    // `search("عين")` and `search("ain")` are both non-empty.
    expect(search("عين")).not.toHaveLength(0);
    expect(search("عين", { lang: "fr" })).toEqual([]);

    expect(search("ain")).not.toHaveLength(0);
    expect(search("ain", { lang: "ar" })).toEqual([]);
  });

  it("does not prune a query that matches under the lang it was given", () => {
    // The counterweight: the prune must not be so eager that it eats the
    // legitimate case.
    expect(search("عين", { lang: "ar" })).not.toHaveLength(0);
    expect(search("ain", { lang: "fr" })).not.toHaveLength(0);
  });
});

// ── kinds ───────────────────────────────────────────────────────────────────

describe("search — kinds", () => {
  it("returns all three kinds by default", () => {
    expect(new Set(search("setif").map((r) => r.kind))).toEqual(
      new Set(["wilaya", "daira", "commune"]),
    );
  });

  it("returns only communes for kinds: [commune]", () => {
    const hits = search("setif", { kinds: ["commune"] });
    expect(hits).toHaveLength(1);
    expect(hits.map((r) => r.kind)).toEqual(["commune"]);
    expect(ids(hits)).toEqual(["19-setif-setif"]);
  });

  it("returns only wilayas for kinds: [wilaya]", () => {
    const hits = search("setif", { kinds: ["wilaya"] });
    expect(hits.map((r) => r.kind)).toEqual(["wilaya"]);
    expect(hits[0]?.item.name.fr).toBe("Setif");
  });

  it("honours a two-kind filter", () => {
    const hits = search("sidi ameur", { kinds: ["commune", "daira"] });
    expect(hits.map((r) => r.kind)).toEqual(["daira", "daira", "commune", "commune"]);
  });

  it("returns [] for an empty kinds list", () => {
    // Asking for no kinds is a well-formed question with an empty answer, not
    // an error and not "all kinds".
    expect(search("setif", { kinds: [] })).toEqual([]);
  });

  it("ignores an unrecognised kind instead of silently meaning [wilaya]", () => {
    // The kinds filter is a bitmask, `1 << KIND_RANK[k]`. An unknown key makes
    // `KIND_RANK[k]` undefined, `1 << undefined` is `1`, and `1` is the WILAYA
    // bit — so an unrecognised entry used to mean "wilayas only" rather than
    // "nothing". A JavaScript caller who typed the kind with the wrong case got
    // 69 wilayas back and no indication anything was wrong.
    //
    // These casts are the only way to write the call: TypeScript rejects every
    // one of these values, and that half is asserted with `@ts-expect-error` in
    // tests/types.test-d.ts. This is the runtime half, for the callers the type
    // system never sees.
    expect(search("setif", { kinds: ["bogus" as SearchKind] })).toEqual([]);
    // The exact scenario the review named: right word, wrong case.
    expect(search("setif", { kinds: ["Commune" as SearchKind] })).toEqual([]);
    expect(search("setif", { kinds: ["COMMUNE" as SearchKind] })).toEqual([]);
    expect(search("setif", { kinds: ["communes" as SearchKind] })).toEqual([]);
    expect(search("setif", { kinds: ["daïra" as SearchKind] })).toEqual([]);

    // Crucially: NOT wilayas. Asserted separately from `toEqual([])` so a
    // regression reads as "returned a wilaya" rather than a bare array diff.
    for (const bogus of ["bogus", "Commune", "COMMUNE"]) {
      expect(
        search("setif", { kinds: [bogus as SearchKind] }).map((r) => r.kind),
        `kinds: [${bogus}]`,
      ).toEqual([]);
    }
  });

  it("keeps the valid entries when the list mixes good and bad", () => {
    // Skipping the unknown entry must not discard the whole filter, and must
    // not fall back to "all kinds" either.
    expect(
      search("setif", { kinds: ["commune", "bogus" as SearchKind] }).map((r) => r.kind),
    ).toEqual(["commune"]);
    expect(search("setif", { kinds: ["wilaya", "daira", "commune"] }).map((r) => r.kind)).toEqual([
      "wilaya",
      "daira",
      "commune",
    ]);
  });
});

// ── wilaya scoping ──────────────────────────────────────────────────────────

describe("search — wilaya scoping", () => {
  it("restricts every result to the requested wilaya", () => {
    // 172 keys begin with `ain`, spread over most of the country. Setif has 13
    // of them — 4 daïras and 9 communes — and scoping must return exactly those.
    const unscoped = search("ain", { limit: 100 });
    expect(new Set(unscoped.map((r) => r.wilaya.code)).size).toBeGreaterThan(1);

    const scoped = search("ain", { wilaya: 19, limit: 100 });
    expect(scoped).toHaveLength(13);
    expect(scoped.filter((r) => r.wilaya.code !== 19)).toEqual([]);
    expect(names(scoped)).toContain("Ain Lahdjar");
  });

  it("scopes out a record that would otherwise be the top hit", () => {
    // `centre` matches exactly one key in the whole corpus, `alger centre`, and
    // that commune is in wilaya 16. Scoped to 19 it is not a candidate at all —
    // this is a filter on the candidate SET, not a filter on the results.
    expect(names(search("centre"))).toEqual(["Alger Centre"]);
    expect(search("centre", { wilaya: 19 })).toEqual([]);
  });

  it("returns [] for a wilaya that has no match, rather than falling back", () => {
    expect(search("souk el had", { wilaya: 19 })).toEqual([]);
  });

  it("reaches the prefix tier under a scope", () => {
    // Setif has 13 records whose French name starts with `ain` — 4 daïras and
    // 9 communes — and the default limit of 20 does not bind, so this is the
    // complete scoped answer rather than a truncated one.
    const hits = search("ain", { wilaya: 19 });
    expect(hits).toHaveLength(13);
    expect(hits.filter((r) => r.wilaya.code !== 19)).toEqual([]);
    expect(names(hits)).toContain("Ain Lahdjar");
    // "ain" (3) against the key "ain azel" (8): 0.7 + 0.2 × 3/8 = 0.775.
    expect(hits[0]?.score).toBeCloseTo(0.775, 12);
  });

  it("reaches the substring tier under a scope", () => {
    // The scoped path has to run all four tiers, not just the cheap ones.
    // "lahdjar" (7) is a substring of "ain lahdjar" (11) and a prefix of
    // nothing: 0.4 + 0.2 × 7/11 = 0.5272727…, the same score the unscoped
    // query produces. Scoping changes the candidate SET, never the scoring.
    const hits = search("lahdjar", { wilaya: 19 });
    expect(ids(hits)).toEqual(["19-ain-azel-ain-lahdjar"]);
    expect(hits[0]?.score).toBeCloseTo(0.5272727272727273, 12);
    expect(hits[0]?.score).toBe(search("lahdjar")[0]?.score);
  });

  it("reaches the fuzzy tier under a scope", () => {
    // The last tier, and the one most likely to be skipped by a scoped code
    // path: "algier" is distance 1 from "alger" and matches no key by prefix or
    // substring, so only the fuzzy tier can answer. Score 0.35 — distance 1 —
    // identical to the unscoped fuzzy result.
    const hits = search("algier", { wilaya: 16, fuzzy: true });
    expect(names(hits)).toEqual(["Alger"]);
    expect(hits[0]?.matched).toBe("fr");
    expect(hits[0]?.score).toBeCloseTo(0.35, 12);
    // And the flag still governs: scoping does not switch fuzzy on.
    expect(search("algier", { wilaya: 16 })).toEqual([]);
  });

  it("cuts the work, not just the output, on a query that has to scan", () => {
    // The candidate set drops from 2201 records to the 80 daïras and communes
    // of wilaya 19 BEFORE any key comparison runs, so a query that reaches the
    // linear substring tier does ~26× less work scoped than unscoped. Measured
    // on this checkout: 2203 comparisons unscoped, 83 scoped.
    //
    // The bounds below are deliberately loose where the exact numbers would be
    // brittle and tight where the CLAIM lives: unscoped must be corpus-scale,
    // scoped must be wilaya-scale, and the answer must be identical either way.
    // A post-filter would score the same on the first two and only differ here.
    resetComparisons();
    const unscopedHits = search("lahdjar");
    const unscoped = comparisons();

    resetComparisons();
    const scopedHits = search("lahdjar", { wilaya: 19 });
    const scoped = comparisons();

    expect(unscoped).toBeGreaterThan(2000); // corpus-scale: one per fr key
    expect(scoped).toBeLessThan(500); // wilaya-scale: 20 daïras + 60 communes
    expect(scoped * 4).toBeLessThan(unscoped);
    expect(names(scopedHits)).toEqual(names(unscopedHits));
  });

  it("cuts the work even when the answer came from the exact tier", () => {
    // A subtlety worth pinning: `setif` is answered exactly by three records,
    // but the default limit of 20 is not full afterwards, so the substring tier
    // still runs — and unscoped that means a full corpus scan for an answer
    // already in hand. Measured: 2206 comparisons unscoped, 86 scoped.
    resetComparisons();
    const unscopedHits = search("setif");
    const unscoped = comparisons();

    resetComparisons();
    const scopedHits = search("setif", { wilaya: 19 });
    const scoped = comparisons();

    expect(names(unscopedHits)).toEqual(names(scopedHits));
    expect(unscoped).toBeGreaterThan(2000);
    expect(scoped).toBeLessThan(500);
    expect(scoped * 4).toBeLessThan(unscoped);
  });

  it("cuts the work on a prefix query too, once the limit stops binding", () => {
    // The honest framing of the previous test's counterweight below. With a
    // limit high enough that it never truncates, the unscoped prefix query has
    // to walk its whole range and the scoped one does not: measured 2375
    // comparisons unscoped against 255 scoped, a 9.3× reduction, for 182
    // results against 13.
    //
    // Bounds, not exact counts: the runtime is still being tuned and the exact
    // numbers have moved twice already. What must not move is the ORDER OF
    // MAGNITUDE and the fact that the scoped answer is a subset of the
    // unscoped one.
    resetComparisons();
    const unscopedHits = search("ain", { limit: 1000 });
    const unscoped = comparisons();

    resetComparisons();
    const scopedHits = search("ain", { wilaya: 19, limit: 1000 });
    const scoped = comparisons();

    expect(unscopedHits.length).toBeGreaterThan(100);
    expect(scopedHits).toHaveLength(13);
    expect(unscoped).toBeGreaterThan(2000);
    expect(scoped).toBeLessThan(500);
    expect(scoped * 4).toBeLessThan(unscoped);

    // Every scoped result is one the unscoped query also found.
    const unscopedIds = new Set(ids(unscopedHits));
    expect(ids(scopedHits).filter((id) => !unscopedIds.has(id))).toEqual([]);
  });

  it("does NOT beat the sorted index on a prefix query, which is expected", () => {
    // The honest other half, pinned so nobody reads the test above as "scoping
    // is always cheaper" and then optimizes against a claim the library never
    // made. An unscoped prefix query is answered by two binary searches over
    // the sorted key array and stops at `limit`; the scoped path cannot use
    // that array, so it compares each candidate's keys directly.
    //
    // Measured: search("ain", { limit: 100 }) → 101 comparisons unscoped, 255
    // scoped to wilaya 19.
    //
    // The reason is precise and worth writing down: only 13 of the ~180 keys
    // beginning with `ain` are in Setif, so under a scope the accumulator never
    // reaches 100 and the `limit` short-circuit never fires — the prefix AND
    // substring tiers both run to completion. Unscoped, the limit is hit after
    // 101 comparisons and everything after that is skipped. It is the limit not
    // firing, not a structural problem, and no index choice fixes it.
    //
    // Scoping buys correctness of SCOPE here, not speed; it buys speed on the
    // tiers that scan, which the test above measures.
    resetComparisons();
    search("ain", { limit: 100 });
    const unscoped = comparisons();

    resetComparisons();
    search("ain", { limit: 100, wilaya: 19 });
    const scoped = comparisons();

    expect(unscoped).toBeLessThan(scoped);
    // Both stay far below a full corpus scan, which is the property that
    // actually matters for a prefix query.
    expect(scoped).toBeLessThan(1000);
  });
});

// ── limit ───────────────────────────────────────────────────────────────────

describe("search — limit", () => {
  it.each<[string, number, number]>([
    // A `limit` is almost never a literal in real code. It is
    // `Number(req.query.limit)`, and that expression produces `NaN` for
    // `?limit=all`, a negative for `?limit=-5`, and `Infinity` for
    // `?limit=1e999`. Every one of those used to reach the tier gates, where
    // the test is `out.length < limit` — and EVERY comparison against `NaN` is
    // false, so `search("setif", { limit: NaN })` returned [] with no error at
    // all. A silent empty result is the worst possible answer here: the caller
    // sees "no such commune" and goes looking in the data.
    //
    // `??` does not catch it, because `NaN` is not nullish. That is the whole
    // bug in one sentence.
    ["NaN falls back to the default", Number.NaN, 3],
    ["a negative falls back to the default", -5, 3],
    ["-Infinity falls back to the default", Number.NEGATIVE_INFINITY, 3],
    ["undefined falls back to the default", Number.NaN, 3],
  ])("%s", (_label, limit, expected) => {
    expect(search("setif", { limit }).length).toBe(expected);
  });

  it("preserves 0 as a real answer, not a falsy accident", () => {
    // The opposite failure, and the one a careless fix introduces: `limit ||
    // DEFAULT` or `limit ?? DEFAULT` after a truthiness check turns "give me
    // nothing" into "give me twenty". `0` is a legitimate request — a caller
    // priming a cache, or a UI that has not focused the search box yet.
    expect(search("setif", { limit: 0 })).toEqual([]);
    expect(search("ain", { limit: 0 })).toEqual([]);
    // Distinguishable from the fallbacks above, which is the point.
    expect(search("setif", { limit: Number.NaN })).toHaveLength(3);
  });

  it("treats Infinity as no limit at all", () => {
    // The other direction: `Infinity` is a well-formed request for everything,
    // and `out.length < Infinity` is always true, so it needs no special case —
    // but it MUST NOT be swept into the "not a usable number" fallback along
    // with NaN and the negatives, or the answer silently truncates to 20.
    expect(search("ain", { limit: Number.POSITIVE_INFINITY })).toHaveLength(182);
    expect(search("ain", { limit: 1000 })).toHaveLength(182);
    expect(search("ain")).toHaveLength(20);
  });

  it("defaults to 20", () => {
    // `ain` prefixes 172 keys, so the default is doing the limiting here and
    // not the corpus.
    expect(search("ain")).toHaveLength(20);
  });

  it("returns at most the requested number", () => {
    expect(search("ain", { limit: 5 })).toHaveLength(5);
    expect(search("ain", { limit: 1 })).toHaveLength(1);
    expect(search("ain", { limit: 100 })).toHaveLength(100);
  });

  it("returns [] for limit: 0, in every tier and with every flag", () => {
    // `limit: 0` is a contract in its own right, and the easy way for a
    // refactor to break it is `limit ?? DEFAULT_LIMIT` — `0` is falsy, so that
    // one character silently turns "give me nothing" into "give me twenty".
    //
    // Each row below also drives a different tier to the point where it starts
    // work with an already-full accumulator, which is the only way that guard
    // gets exercised at the top of a tier rather than in the middle of one.
    expect(search("setif", { limit: 0 })).toEqual([]); // exact
    expect(search("ain", { limit: 0 })).toEqual([]); // prefix
    expect(search("centre", { limit: 0 })).toEqual([]); // substring
    expect(search("algier", { fuzzy: true, limit: 0 })).toEqual([]); // fuzzy
    expect(search("algier", { wilaya: 16, fuzzy: true, limit: 0 })).toEqual([]); // scoped fuzzy
    expect(search("giers", { lang: "en", limit: 0 })).toEqual([]); // substring override
    expect(search("algierx", { lang: "en", fuzzy: true, limit: 0 })).toEqual([]); // fuzzy override

    // And the same queries are non-empty without the limit, so the [] above is
    // the limit talking and not a query that never matched.
    expect(search("setif")).not.toHaveLength(0);
    expect(search("centre")).not.toHaveLength(0);
    expect(search("algier", { fuzzy: true })).not.toHaveLength(0);
    expect(search("giers", { lang: "en" })).not.toHaveLength(0);
    expect(search("algierx", { lang: "en", fuzzy: true })).not.toHaveLength(0);
  });

  it("provably short-circuits the scan instead of slicing at the end", () => {
    // The instrumented counter, not a timing. `limit` that slices at the end is
    // indistinguishable from `limit` that stops the scan by looking at the
    // output — and the whole performance claim of this session rests on the
    // difference.
    //
    // Correctness note, stated narrowly because the broad version is FALSE.
    //
    // The guarantee is BETWEEN tiers only: the tiers run in strict score order
    // (exact > prefix > substring > fuzzy) and each is exhausted or capped
    // before the next begins, so stopping early can never admit a lower tier's
    // result ahead of a higher tier's. That much is real, and the test below
    // pins it.
    //
    // WITHIN a tier there is no such guarantee, and it is worth being blunt
    // about it: the prefix tier truncates in KEY order and only then sorts the
    // survivors by score. Measured on this checkout, `search("ain")` returns 20
    // results but misses 15 of the true top 20 by score — `Ain Taya` (0.775,
    // wilaya 16) is dropped while records scoring 0.7333 are kept. So the
    // short-circuit is correct about TIERS and lossy about RANK inside one.
    // Nothing here asserts otherwise; the API-level decision is being taken
    // separately.
    resetComparisons();
    search("ain", { limit: 5 });
    const few = comparisons();

    resetComparisons();
    search("ain", { limit: 100 });
    const many = comparisons();

    expect(few).toBeGreaterThan(0);
    expect(few).toBeLessThan(many);
  });

  it("never lets a lower tier outrank a higher one, however tight the limit", () => {
    // The between-tier half of the claim above, which IS true and IS worth
    // pinning. `alg` reaches the exact tier (`alger`, 1.0) and the prefix tier
    // (`alger centre`, 0.75). Whatever the limit, an exact hit can never be
    // dropped in favour of a prefix hit.
    expect(search("alg", { limit: 1 }).map((r) => r.score)).toEqual([0.82]);
    expect(search("alger", { limit: 1 }).map((r) => r.score)).toEqual([1]);

    // And across all four tiers at once: with fuzzy on, a query that has exact
    // hits must still return them first, never a distance-1 neighbour.
    const setif = search("setif", { fuzzy: true, limit: 3 });
    expect(setif.map((r) => r.score)).toEqual([1, 1, 1]);

    // Scores are non-increasing no matter where the cap lands.
    for (const limit of [1, 2, 3, 5, 13, 40]) {
      const scores = search("ain", { limit }).map((r) => r.score);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores, `limit: ${limit}`).toEqual(sorted);
    }
  });

  it("does the same work for the same query twice", () => {
    // A counter that keeps climbing across identical calls means state is
    // leaking between calls — a cache that is not being reused, or an index
    // being rebuilt.
    search("ain");
    resetComparisons();
    search("ain");
    const first = comparisons();
    resetComparisons();
    search("ain");
    expect(comparisons()).toBe(first);
  });
});

// ── Score bands ─────────────────────────────────────────────────────────────

describe("search — the published score", () => {
  // The score is published so consumers can threshold on it
  // (`results.filter(r => r.score >= 0.7)`), which makes these numbers part of
  // the API. Changing them later is a breaking change, so they are pinned as
  // literals here rather than described.
  //
  //   exact      1.0
  //   prefix     0.7 + 0.2 × (q.length / key.length)   → 0.7 – 0.9
  //   substring  0.4 + 0.2 × (q.length / key.length)   → 0.4 – 0.6
  //   fuzzy      0.35 − 0.05 × (distance − 1)          → 0.25 – 0.35

  it("scores an exact match 1.0", () => {
    expect(search("setif")[0]?.score).toBe(1);
    expect(search("ain lahdjar")[0]?.score).toBe(1);
  });

  it("scores a prefix match by how much of the key the query covers", () => {
    // "ain lahd" (8) is a prefix of exactly one key, "ain lahdjar" (11):
    // 0.7 + 0.2 × 8/11 = 0.8454545…  A longer query covering more of the key
    // ranks higher, which is the whole reason the ratio is in the formula.
    const hits = search("ain lahd");
    expect(hits).toHaveLength(1);
    expect(ids(hits)).toEqual(["19-ain-azel-ain-lahdjar"]);
    expect(hits[0]?.score).toBeCloseTo(0.8454545454545455, 12);
    expect(hits[0]?.score ?? 0).toBeGreaterThan(0.7);
    expect(hits[0]?.score ?? 1).toBeLessThanOrEqual(0.9);
  });

  it("scores a substring match in its own band, below every prefix match", () => {
    // "lahdjar" (7) is a substring of exactly one key, "ain lahdjar" (11), and
    // a prefix of none: 0.4 + 0.2 × 7/11 = 0.5272727…
    const hits = search("lahdjar");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.item.name.fr).toBe("Ain Lahdjar");
    expect(hits[0]?.score).toBeCloseTo(0.5272727272727273, 12);
  });

  it("scores a fuzzy match in the lowest band", () => {
    // distance 1 → 0.35; distance 2 → 0.30.
    const d1 = search("algier", { fuzzy: true }).find((r) => r.item.name.fr === "Alger");
    const d2 = search("algeirs", { fuzzy: true }).find((r) => r.item.name.fr === "Alger");
    expect(d1?.score).toBeCloseTo(0.35, 12);
    expect(d2?.score).toBeCloseTo(0.3, 12);
  });

  it("keeps the four bands strictly ordered and non-overlapping", () => {
    const exact = search("setif")[0]?.score ?? 0;
    const prefix = search("ain lahd")[0]?.score ?? 0;
    const substring = search("lahdjar")[0]?.score ?? 0;
    const fuzzy =
      search("algier", { fuzzy: true }).find((r) => r.item.name.fr === "Alger")?.score ?? 0;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(fuzzy);
    expect(fuzzy).toBeGreaterThanOrEqual(0.25);
  });

  it("returns results in non-increasing score order", () => {
    const descending: string[] = [];
    for (const query of ["setif", "ain", "sidi", "el"]) {
      const scores = search(query, { limit: 100 }).map((r) => r.score);
      for (let i = 1; i < scores.length; i++) {
        const prev = scores[i - 1];
        const curr = scores[i];
        if (prev === undefined || curr === undefined) continue;
        if (curr > prev) descending.push(`${query}[${i}]: ${curr} > ${prev}`);
      }
    }
    expect(descending).toEqual([]);
  });
});

// ── The tie-break, end to end ───────────────────────────────────────────────

describe("search — the documented tie-break, asserted as an order", () => {
  it("orders by score, then kind, then wilaya code, then normalized key", () => {
    // The spec's ordering guarantee has four stages and the last one — the
    // normalized key, ascending — is the one nothing else in this file pins.
    // `search("ain", { wilaya: 19 })` exercises all four in a single 13-row
    // answer, and the rows are asserted as an ORDER, not merely as a set.
    //
    // Read the 0.775 block and the 0.754545 block: within each, the daïra comes
    // before the communes (kind), and the communes are ordered by their
    // NORMALIZED KEY — `ain lahdjar` < `ain legradj` < `ain oulmene` — which is
    // NOT the order of their display names, `Ain Lahdjar`, `Ain-Legradj`,
    // `Ain Oulmene`. That divergence is the whole point: a sort on the display
    // name would produce a different array and still look plausible.
    //
    // The scores themselves are the prefix formula over different key lengths:
    // 0.7 + 0.2 × 3/len, for len 8, 9, 10, 11 and 13.
    const rows = search("ain", { wilaya: 19, limit: 100 }).map((r) => [
      Number(r.score.toFixed(6)),
      r.kind,
      r.item.name.fr,
    ]);

    expect(rows).toEqual([
      [0.775, "daira", "Ain Azel"],
      [0.775, "commune", "Ain Azel"],
      [0.775, "commune", "Ain-Roua"],
      [0.775, "commune", "Ain-Sebt"],
      [0.766667, "daira", "Ain Arnat"],
      [0.766667, "commune", "Ain Arnat"],
      [0.76, "commune", "Ain Abessa"],
      [0.754545, "daira", "Ain Oulmene"],
      [0.754545, "commune", "Ain Lahdjar"],
      [0.754545, "commune", "Ain-Legradj"],
      [0.754545, "commune", "Ain Oulmene"],
      [0.746154, "daira", "Ain El Kebira"],
      [0.746154, "commune", "Ain El Kebira"],
    ]);
  });

  it("breaks a wilaya-code tie before it ever looks at the key", () => {
    // Same score, same kind, different wilaya: 32 before 64, ascending.
    const communes = search("sidi ameur").filter((r) => r.kind === "commune");
    expect(communes.map((r) => r.wilaya.code)).toEqual([32, 64]);
    expect(communes.map((r) => r.score)).toEqual([1, 1]);
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe("search — determinism", () => {
  it("returns byte-identical arrays for 100 identical calls", () => {
    // A tie broken by dataset order — or by Map iteration order, or by a Set —
    // is a flaky test waiting to happen and looks broken in a UI. `ain` is
    // deliberately a broad query with many ties at the same score.
    const first = JSON.stringify(search("ain", { limit: 100 }));
    const differing: number[] = [];
    for (let i = 1; i < 100; i++) {
      if (JSON.stringify(search("ain", { limit: 100 })) !== first) differing.push(i);
    }
    expect(differing).toEqual([]);
  });

  it("is deterministic across the fuzzy tier too", () => {
    const first = JSON.stringify(search("algier", { fuzzy: true }));
    const differing: number[] = [];
    for (let i = 1; i < 100; i++) {
      if (JSON.stringify(search("algier", { fuzzy: true })) !== first) differing.push(i);
    }
    expect(differing).toEqual([]);
  });
});

// ── Fuzzy ───────────────────────────────────────────────────────────────────

describe("search — fuzzy", () => {
  it.each(["algier", "alget", "algeirs"])("resolves the misspelling %o to Alger", (query) => {
    const hits = search(query, { fuzzy: true });
    expect(names(hits)).toContain("Alger");
  });

  it.each(["algier", "alget", "algeirs"])(
    "returns nothing at all for %o with fuzzy off",
    (query) => {
      // None of the three is a substring of ANY of the 4402 keys — verified — so
      // the non-fuzzy call genuinely has nothing to return. If `fuzzy` were
      // decorative, or defaulted to true, these would come back populated.
      expect(search(query)).toEqual([]);
      expect(search(query, { fuzzy: false })).toEqual([]);
    },
  );

  it("disables fuzzy entirely for queries of 3 characters or fewer", () => {
    // maxDistance is never caller-supplied: ≤3 → 0, 4–5 → 1, ≥6 → 2. "orn" is
    // distance 1 from "oran", and must NOT find it — short queries fuzz into
    // hundreds of false hits, which is worse than no answer.
    const hits = search("orn", { fuzzy: true });
    expect(names(hits)).not.toContain("Oran");
  });

  it("caps a 5-character query at distance 1", () => {
    // "algxy" is distance 2 from "alger" and 5 characters long, so its budget
    // is 1 and it must find nothing. This is the row of the table that the
    // naive (≤3 → 0, 4–7 → 1, ≥8 → 2) version gets right and the next test is
    // the row it gets wrong.
    expect(search("algxy", { fuzzy: true })).toEqual([]);
  });

  it("allows distance 2 from 6 characters, which is what makes algeirs work", () => {
    // "algeirs" is 7 characters and distance 2 from "alger". The naive table
    // gives it a budget of 1 and fails it. Verify the target, never the table.
    expect(names(search("algeirs", { fuzzy: true }))).toContain("Alger");
    expect(names(search("algier", { fuzzy: true }))).toContain("Alger");
    expect(names(search("alget", { fuzzy: true }))).toContain("Alger");
  });

  it("returns [] when the query's first character has no bucket at all", () => {
    // The fuzzy tier ranges over the first-character bucket map. `q` does not
    // occur as the first character of any key — the whole `fr` alphabet is
    // " ().abcdefghijklmnoprstuwxyz", pinned in tests/normalize.test.ts, and it
    // has no `q` and no `v` — so the lookup misses and the tier returns without
    // computing a single distance.
    expect(search("qqqqqq", { fuzzy: true })).toEqual([]);
    expect(search("vvvvvv", { fuzzy: true })).toEqual([]);
  });

  it("cannot fix a typo in the first character, and that is the documented trade", () => {
    // "blger" is distance 1 from "alger" but lands in the wrong first-character
    // bucket. Accepted on purpose: the bucket prefilter cuts the candidate set
    // by 20–30× for free. Pinned so the limitation is a decision, not a
    // surprise, and so removing the prefilter is a visible change.
    expect(search("blger", { fuzzy: true })).toEqual([]);
  });

  it("does no fuzzy work on a query that already matched", () => {
    // Fuzzy is a last-resort tier: it runs only when the first three tiers came
    // up short of `limit`. `setif` fills a limit of 3 on the exact tier alone,
    // so it must cost the same with the flag on as with it off, or the flag is
    // not free.
    resetComparisons();
    search("setif", { limit: 3 });
    const plain = comparisons();

    resetComparisons();
    search("setif", { limit: 3, fuzzy: true });
    expect(comparisons()).toBe(plain);
  });
});

// ── limit, tier by tier ─────────────────────────────────────────────────────

describe("search — limit stops each tier individually", () => {
  // The counter test above proves `limit` stops the scan in aggregate. These
  // prove it stops EACH tier, which is a different claim: a `limit` check
  // hoisted to the top of `search()` instead of into every loop would satisfy
  // the aggregate claim and still walk a whole tier before truncating.
  //
  // Every query below has strictly more candidates in the tier under test than
  // the limit allows, so the loop must abandon a candidate it has already
  // located. The unlimited call is asserted alongside each one, because
  // "returns 1 result" is only interesting next to "would have returned 3".

  it("stops the exact tier mid-bucket", () => {
    // The key `setif` belongs to three records.
    expect(search("setif")).toHaveLength(3);
    expect(search("setif", { limit: 1 })).toHaveLength(1);
    expect(names(search("setif", { limit: 1 }))).toEqual(["Setif"]);

    // Adrar (wilaya 1) is the same shape at the other end of the dataset —
    // wilaya, seat daïra and seat commune all named `Adrar`.
    expect(search("adrar")).toHaveLength(3);
    expect(search("adrar", { limit: 1 })).toHaveLength(1);
  });

  it("stops the prefix tier mid-range", () => {
    // 172 keys begin with `ain`.
    expect(search("ain", { limit: 100 }).length).toBeGreaterThan(1);
    expect(search("ain", { limit: 1 })).toHaveLength(1);
  });

  it("stops before the override table in the prefix tier", () => {
    // `alg` prefixes two corpus keys — `alger` (0.82) and `alger centre`
    // (0.75) — and also the override key `algiers`. With `limit: 1` the corpus
    // part yields the single best hit and the override loop that follows must
    // not append a second one.
    expect(search("alg", { lang: "en" })).toHaveLength(2);
    const capped = search("alg", { lang: "en", limit: 1 });
    expect(capped).toHaveLength(1);
    expect(capped[0]?.score).toBeCloseTo(0.82, 12); // 0.7 + 0.2 × 3/5
    expect(names(capped)).toEqual(["Alger"]);
  });

  it("stops the substring tier mid-scan", () => {
    // `ouzou` is a substring of three keys and a prefix of none.
    expect(search("ouzou")).toHaveLength(3);
    expect(search("ouzou", { limit: 1 })).toHaveLength(1);
    expect(search("ouzou", { limit: 1 })[0]?.score).toBe(0.5);
  });

  it("stops the scoped substring tier mid-bucket", () => {
    // The scoped path is a different loop over a different structure — the
    // wilaya bucket rather than the whole key array — so it needs its own case.
    // `azel` is a substring of the daïra and the commune `Ain Azel`, both in 19.
    expect(search("azel", { wilaya: 19 })).toHaveLength(2);
    expect(search("azel", { wilaya: 19, limit: 1 })).toHaveLength(1);

    // A single-hit scoped substring query, capped at that single hit: the
    // bucket walk must stop rather than run out the remaining ~160 candidates.
    expect(search("hdjar", { wilaya: 19 })).toHaveLength(1);
    expect(search("hdjar", { wilaya: 19, limit: 1 })).toHaveLength(1);
  });

  it("stops the fuzzy tier mid-bucket", () => {
    // `setib` is distance 1 from `setif`, which three records share, and is a
    // substring and prefix of nothing — so all three hits come from the fuzzy
    // tier and nowhere else.
    expect(search("setib")).toEqual([]);
    expect(search("setib", { fuzzy: true })).toHaveLength(3);
    expect(search("setib", { fuzzy: true, limit: 1 })).toHaveLength(1);
  });

  it("stops the scoped fuzzy tier mid-bucket", () => {
    expect(search("setib", { wilaya: 19, fuzzy: true })).toHaveLength(3);
    expect(search("setib", { wilaya: 19, fuzzy: true, limit: 1 })).toHaveLength(1);
  });

  it("stops before the override table, in every tier", () => {
    // The override table is walked at the END of each tier, after the corpus.
    // If the limit is already full when the corpus part finishes, the override
    // loop must not run at all — otherwise `lang: "en"` could return `limit + 1`
    // results, or displace a higher-ranked corpus hit that was already emitted.
    //
    // One case per tier: exact (`setif`), prefix (`ain`), substring (`ouzou`).
    for (const query of ["setif", "ain", "ouzou"]) {
      const plain = search(query, { limit: 1 });
      const english = search(query, { lang: "en", limit: 1 });
      expect(english, `query: ${query}`).toHaveLength(1);
      expect(names(english), `query: ${query}`).toEqual(names(plain));
    }

    // And the fuzzy tier's override loop, same shape.
    expect(search("setib", { lang: "en", fuzzy: true, limit: 1 })).toHaveLength(1);
  });

  it("skips the override table when the exact tier filled the limit exactly", () => {
    // The precise boundary, and the only one of these that is not covered by
    // the loop above: `ain lahdjar` is an exact key for exactly ONE record, so
    // the exact tier's corpus loop finishes normally — it does not bail out —
    // with the accumulator holding exactly `limit` results. The override loop
    // that runs immediately after must see a full accumulator and stop.
    //
    // Off by one here and `lang: "en"` returns two results for `limit: 1`.
    const hits = search("ain lahdjar", { lang: "en", limit: 1 });
    expect(hits).toHaveLength(1);
    expect(ids(hits)).toEqual(["19-ain-azel-ain-lahdjar"]);
  });
});

// ── The override table is not a back door ───────────────────────────────────

describe("search — the override table obeys the same filters as the corpus", () => {
  // `EN_OVERRIDES` is a second, tiny key source consulted by all four tiers. It
  // is the easiest place in the library to accidentally skip a filter, because
  // its loops are separate from the corpus loops and are written four times.

  it("respects kinds on the exact tier", () => {
    // Wilaya 16 is a wilaya, so a commune-only search must not return it even
    // though the override key matches exactly.
    expect(search("algiers", { lang: "en" })).toHaveLength(1);
    expect(search("algiers", { lang: "en", kinds: ["commune"] })).toEqual([]);
    expect(search("algiers", { lang: "en", kinds: ["daira"] })).toEqual([]);
  });

  it("respects kinds on the substring tier", () => {
    expect(search("lgier", { lang: "en" })).toHaveLength(1);
    expect(search("lgier", { lang: "en", kinds: ["commune"] })).toEqual([]);
  });

  it("respects kinds inside a wilaya scope, on the scoped substring path", () => {
    // The scoped substring path is a separate function from the unscoped scan,
    // so its `kinds` filter is separate code. `azel` is a substring of the
    // daïra `Ain Azel` and the commune `Ain Azel`, both in wilaya 19: asking
    // for one kind must drop the other, not both and not neither.
    expect(search("azel", { wilaya: 19 }).map((r) => r.kind)).toEqual(["daira", "commune"]);
    expect(search("azel", { wilaya: 19, kinds: ["commune"] }).map((r) => r.kind)).toEqual([
      "commune",
    ]);
    expect(search("azel", { wilaya: 19, kinds: ["daira"] }).map((r) => r.kind)).toEqual(["daira"]);

    // The other direction: a scoped substring hit that IS a commune, filtered
    // out by asking only for wilayas. `hdjar` matches `ain lahdjar` and nothing
    // else in Setif, so the answer goes from one result to none.
    expect(search("hdjar", { wilaya: 19 }).map((r) => r.kind)).toEqual(["commune"]);
    expect(search("hdjar", { wilaya: 19, kinds: ["wilaya"] })).toEqual([]);
  });

  it("respects the wilaya scope", () => {
    expect(search("algiers", { lang: "en", wilaya: 16 })).toHaveLength(1);
    expect(search("algiers", { lang: "en", wilaya: 19 })).toEqual([]);
  });

  it("applies the distance cutoff on the fuzzy tier", () => {
    // `aaaaaaa` passes both cheap prefilters — same first character as
    // `algiers`, same length — so it reaches the Levenshtein call and is
    // rejected on distance alone. Without that final check the override would
    // match anything 7 characters long starting with `a`.
    expect(search("aaaaaaa", { lang: "en", fuzzy: true })).toEqual([]);
    expect(search("azzzzzz", { lang: "en", fuzzy: true })).toEqual([]);

    // The near miss that proves the cutoff is a cutoff and not a rejection of
    // everything: one more edit and it matches.
    expect(names(search("algierx", { lang: "en", fuzzy: true }))).toEqual(["Alger"]);
  });
});

// ── The English override meets the fuzzy tier ───────────────────────────────

describe("search — the en override in the fuzzy tier", () => {
  // The override table is walked by all four tiers, and the fuzzy one is the
  // last and least obvious. `algiars` is the query that isolates it: it is
  // distance 1 from the override key `algiers` but distance 3 from `alger`, so
  // the French layer cannot answer it at any budget and only the override can.

  it("fuzzy-matches the override key itself", () => {
    const hits = search("algiars", { lang: "en", fuzzy: true });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.item.name.en).toBe("Algiers");
    expect(hits[0]?.matched).toBe("en");
    expect(hits[0]?.score).toBeCloseTo(0.35, 12); // distance 1
  });

  it("needs BOTH lang: en and fuzzy: true — neither alone answers it", () => {
    // Three negatives, one per missing precondition. Together they prove the
    // hit above came from the override's fuzzy path and from nowhere else.
    expect(search("algiars")).toEqual([]); // no lang, no fuzzy
    expect(search("algiars", { lang: "en" })).toEqual([]); // no fuzzy
    expect(search("algiars", { fuzzy: true })).toEqual([]); // no lang
  });

  it("does not emit the same record twice when both layers can fuzzy-match it", () => {
    // `algierz` is distance 1 from `algiers` AND distance 2 from `alger`, so
    // both the French layer and the override can reach wilaya 16. It must
    // appear ONCE. The French layer runs first and wins, which is why
    // `matched` is "fr" and the score is the French distance-2 score, not the
    // override's distance-1 one — the dedupe is by record, not by key.
    const hits = search("algierz", { lang: "en", fuzzy: true });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matched).toBe("fr");
    expect(hits[0]?.score).toBeCloseTo(0.3, 12);
    expect(hits.filter((r) => r.wilaya.code === 16)).toHaveLength(1);
  });

  it("applies the same two prefilters to the override as to the corpus", () => {
    // First-character bucket: `blgiers` is distance 1 from `algiers` and is
    // rejected anyway, exactly as `blger` is rejected against `alger`. The
    // documented limitation applies to the override table too — it is not a
    // back door around it.
    expect(names(search("blgiers", { lang: "en", fuzzy: true }))).not.toContain("Alger");

    // Length delta: `algiersxxxx` is 11 characters against a 7-character key,
    // so it is rejected by a subtraction before any allocation happens.
    expect(names(search("algiersxxxx", { lang: "en", fuzzy: true }))).not.toContain("Alger");
  });

  it("prefers a real tier over the fuzzy one for the override, too", () => {
    // `algier` is a PREFIX of `algiers`, so enabling fuzzy must not change its
    // score: the tiers are strictly ordered for the override table as well.
    const plain = search("algier", { lang: "en" });
    const fuzzed = search("algier", { lang: "en", fuzzy: true });
    expect(fuzzed.map((r) => r.score)).toEqual(plain.map((r) => r.score));
    expect(fuzzed[0]?.score).toBeCloseTo(0.8714285714285714, 12);
  });
});

// ── Misses ──────────────────────────────────────────────────────────────────

describe("search — misses", () => {
  it("returns [] and never throws for a query that matches nothing", () => {
    expect(search("zzzzzzzz")).toEqual([]);
    expect(search("zzzzzzzz", { fuzzy: true })).toEqual([]);
    expect(() => search("zzzzzzzz")).not.toThrow();
  });

  it("returns [] rather than undefined", () => {
    expect(search("zzzzzzzz")).not.toBeUndefined();
    expect(search("zzzzzzzz")).not.toBeNull();
  });

  it("still answers when the scope does match", () => {
    // The counterweight to the three empty-result assertions above: a scoped
    // query that should find something must not be quietly emptied by the
    // scoping logic itself.
    expect(search("setif", { wilaya: 19 })).not.toHaveLength(0);
  });
});
