/**
 * The reform layer once the 58 → 69 mapping IS supplied — exercised against a
 * test fixture, never against the shipped data file.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠  THE PARENT CODES BELOW ARE A TEST FIXTURE. THEY ARE NOT DATA.        ║
 * ║                                                                          ║
 * ║  They are the UNVERIFIED postal-prefix candidates from the session        ║
 * ║  document: the majority first-two-digits of `code_postal` across each     ║
 * ║  new wilaya's communes. That heuristic is NOT a source. It already        ║
 * ║  disagrees with the wilaya code for 94 of the 1408 coded communes in      ║
 * ║  wilayas 1–58 (6.7 %), and a second heuristic — daïra names shared with   ║
 * ║  an old wilaya — CONTRADICTS it on rows 67 and 69.                        ║
 * ║                                                                          ║
 * ║  They exist here for one reason: to exercise the code paths that are      ║
 * ║  unreachable while `REFORM.mappingComplete` is `false`. Without a         ║
 * ║  fixture, `wilayas58()`, `dairas58()`, `communes58()` and both resolvers  ║
 * ║  would ship untested behind a gate that always throws.                    ║
 * ║                                                                          ║
 * ║  THEY MUST NEVER BE COPIED INTO `data/raw/reform.json`. That file is      ║
 * ║  filled by the maintainer only, one row at a time, from the text of       ║
 * ║  Loi 26-06 / Journal Officiel n°25, each row carrying its own citation.   ║
 * ║  A wrong `parentWilaya` misroutes real postal mail and real government    ║
 * ║  paperwork. See docs/DECISIONS.md ADR-005.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── Why `vi.mock` + `vi.resetModules()` + `await import()` ──────────────────
 *
 * The fixture is injected at `packages/js/src/generated/reform`, the single
 * module the shipped `REFORM_RAW` comes from, so the real `data/raw/reform.json`
 * and its generated emit are never touched and `tests/reform.test.ts` keeps
 * asserting the true shipped state in the same run.
 *
 * Every index in this library is a module-scope `let … | undefined`, and vitest
 * caches module graphs across files and across `it` blocks. So each case resets
 * the graph and imports inside itself — a top-level `import` is hoisted and
 * evaluated before `resetModules` can run, which would leave the caches warm
 * from a neighbouring case. Same pattern as `tests/import-purity.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WilayaCode } from "../packages/js/src/index";

// ── The fixture ─────────────────────────────────────────────────────────────

/**
 * The candidate mapping, hoisted so the `vi.mock` factory below can close over
 * it (`vi.mock` calls are lifted above every import in the file).
 *
 * Note **68 and 69 both point at 17 Djelfa**: one wilaya mère splitting into two
 * new wilayas. That is not an accident of the fixture, it is the case that
 * forces `resolveCurrentWilaya` to return an array rather than a single code,
 * and the reason `17` is used as the worked example throughout this file.
 */
const { FIXTURE_PARENTS } = vi.hoisted(() => ({
  FIXTURE_PARENTS: [
    [59, 3],
    [60, 32],
    [61, 13],
    [62, 7],
    [63, 5],
    [64, 28],
    [65, 12],
    [66, 26],
    [67, 14],
    [68, 17],
    [69, 17],
  ] as const,
}));

vi.mock("../packages/js/src/generated/reform", () => ({
  REFORM_RAW: {
    law: "Loi 26-06",
    journalOfficiel: "JO n°25",
    publishedOn: "2026-04-05",
    transitionDeadline: "2026-12-31",
    operationalFrom: "2027-01-01",
    previousWilayaCount: 58,
    currentWilayaCount: 69,
    // The only field the library branches on. `true` here, and ONLY here.
    mappingComplete: true,
    newWilayas: FIXTURE_PARENTS.map(([code, parentCode]) => ({
      code,
      parentCode,
      source: "TEST FIXTURE — not a citation. See the banner at the top of this file.",
      confidence: "confirmed",
    })),
  },
}));

beforeEach(() => {
  // Drop every cached module so each case starts from a cold graph and rebuilds
  // the lazy `asOf` structures from the fixture.
  vi.resetModules();
});

/** The package entry, freshly evaluated against the mocked reform module. */
async function load(): Promise<typeof import("../packages/js/src/index")> {
  return await import("../packages/js/src/index");
}

/** A real commune id — ids are dataset-derived and unaffected by the fixture. */
const COMMUNE_ID = "19-ain-azel-ain-lahdjar";

/** The 58 pre-reform codes, ascending. */
const OLD_CODES = Array.from({ length: 58 }, (_, i) => i + 1);

/** Every code, 1..69. */
const ALL_CODES = Array.from({ length: 69 }, (_, i) => i + 1) as readonly WilayaCode[];

// ── 0. The fixture is actually in force ─────────────────────────────────────

describe("the fixture replaces the shipped stub", () => {
  it("reports mappingComplete true with all 11 parents filled and sourced", async () => {
    // Without this, every assertion in the file could pass against a
    // still-throwing library only because the expectations were written wrong.
    const { REFORM } = await load();

    expect(REFORM.mappingComplete).toBe(true);
    expect(REFORM.newWilayas).toHaveLength(11);
    expect(REFORM.newWilayas.map((e) => [e.code, e.parentCode])).toEqual(
      FIXTURE_PARENTS.map(([code, parent]) => [code, parent]),
    );
    for (const entry of REFORM.newWilayas) {
      expect(entry.confidence).toBe("confirmed");
      expect(typeof entry.source).toBe("string");
      expect(entry.source).not.toBe("");
    }
  });

  it("leaves the metadata untouched", async () => {
    const { REFORM } = await load();
    expect(REFORM.law).toBe("Loi 26-06");
    expect(REFORM.previousWilayaCount).toBe(58);
    expect(REFORM.currentWilayaCount).toBe(69);
  });
});

// ── 1. getWilayas({ asOf: "58" }) — 58 records, recomputed counts ───────────

describe('getWilayas({ asOf: "58" })', () => {
  it("returns 58 records with codes 1..58 ascending", async () => {
    const { getWilayas } = await load();
    const legacy = getWilayas({ asOf: "58" });

    expect(legacy).toHaveLength(58);
    expect(legacy.map((w) => w.code)).toEqual(OLD_CODES);
  });

  it("carries no parentWilaya key on any record", async () => {
    // The 58-map has no wilayas mères to point at: every wilaya in it predates
    // the reform. `undefined` (absent) is the honest state, and `null` here
    // would say "this wilaya has a mère we have not identified".
    const { getWilayas } = await load();
    const withKey = getWilayas({ asOf: "58" }).filter((w) => "parentWilaya" in w);
    expect(withKey.map((w) => w.code)).toEqual([]);
  });

  it("aggregates 17 Djelfa's counts over itself plus 68 and 69", async () => {
    const { getWilaya, getWilayas } = await load();

    // Measured on this checkout: Djelfa 6/18, Ain Oussara 4/10, Messaad 2/8.
    expect(getWilaya(17)?.dairaCount).toBe(6);
    expect(getWilaya(17)?.communeCount).toBe(18);
    expect(getWilaya(68)?.dairaCount).toBe(4);
    expect(getWilaya(68)?.communeCount).toBe(10);
    expect(getWilaya(69)?.dairaCount).toBe(2);
    expect(getWilaya(69)?.communeCount).toBe(8);

    const djelfa58 = getWilayas({ asOf: "58" }).find((w) => w.code === 17);
    expect(djelfa58?.dairaCount).toBe(12);
    expect(djelfa58?.communeCount).toBe(36);

    // …and stated again as arithmetic, so the intent survives a data refresh:
    // these two numbers are DERIVED over a maintainer-supplied mapping, not
    // transcribed from the Journal Officiel.
    const family = [17, 68, 69] as readonly WilayaCode[];
    const sumDairas = family.reduce((n, c) => n + (getWilaya(c)?.dairaCount ?? 0), 0);
    const sumCommunes = family.reduce((n, c) => n + (getWilaya(c)?.communeCount ?? 0), 0);
    expect(djelfa58?.dairaCount).toBe(sumDairas);
    expect(djelfa58?.communeCount).toBe(sumCommunes);
  });

  it("leaves a wilaya untouched by the reform with its own counts", async () => {
    const { getWilaya, getWilayas } = await load();
    const setif58 = getWilayas({ asOf: "58" }).find((w) => w.code === 19);
    expect(setif58?.dairaCount).toBe(getWilaya(19)?.dairaCount);
    expect(setif58?.communeCount).toBe(getWilaya(19)?.communeCount);
  });

  it("totals to the same 566 daïras and 1541 communes across the 58 records", async () => {
    // Nothing may be lost or double-counted in the re-attachment.
    const { getWilayas } = await load();
    const legacy = getWilayas({ asOf: "58" });
    expect(legacy.reduce((n, w) => n + w.dairaCount, 0)).toBe(566);
    expect(legacy.reduce((n, w) => n + w.communeCount, 0)).toBe(1541);
  });

  it("is cached — the same array on every call", async () => {
    const { getWilayas } = await load();
    expect(getWilayas({ asOf: "58" })).toBe(getWilayas({ asOf: "58" }));
    expect(getWilayas({ asOf: "58" })).not.toBe(getWilayas());
  });
});

// ── 2. getWilaya(code, { asOf: "58" }) ──────────────────────────────────────

describe('getWilaya(code, { asOf: "58" })', () => {
  it("returns undefined for 59..69 — they did not exist in the 58-map", async () => {
    const { getWilaya } = await load();
    for (const code of [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69]) {
      expect(getWilaya(code as WilayaCode, { asOf: "58" })).toBeUndefined();
    }
  });

  it("returns the aggregated mère for 17 Djelfa", async () => {
    const { getWilaya } = await load();
    const djelfa = getWilaya(17, { asOf: "58" });
    expect(djelfa?.name.fr).toBe("Djelfa");
    expect(djelfa?.dairaCount).toBe(12);
    expect(djelfa?.communeCount).toBe(36);
  });

  it("hands back the same record the bulk accessor holds", async () => {
    const { getWilaya, getWilayas } = await load();
    expect(getWilaya(17, { asOf: "58" })).toBe(
      getWilayas({ asOf: "58" }).find((w) => w.code === 17),
    );
  });
});

// ── 3. Daïras and communes — never merged, never dropped ────────────────────

describe('getDairas({ asOf: "58" })', () => {
  it("still returns all 566 daïras", async () => {
    // Merging two same-named daïras under one mère would assert they are the
    // same daïra — a claim the dataset does not make. 566 in both views.
    const { getDairas } = await load();
    expect(getDairas({ asOf: "58" })).toHaveLength(566);
  });

  it("re-attributes the daïras of a new wilaya to its mère", async () => {
    const { getDairas } = await load();
    const current = getDairas();
    const legacy = getDairas({ asOf: "58" });
    const idsOf59 = current.filter((d) => d.wilaya === 59).map((d) => d.id);

    expect(idsOf59.length).toBeGreaterThan(0);
    for (const id of idsOf59) {
      expect(legacy.find((d) => d.id === id)?.wilaya).toBe(3);
    }
    expect(legacy.filter((d) => d.wilaya === 59)).toEqual([]);
  });
});

describe('getCommunes({ asOf: "58" })', () => {
  it("still returns all 1541 communes", async () => {
    const { getCommunes } = await load();
    expect(getCommunes({ asOf: "58" })).toHaveLength(1541);
  });

  it("reports every commune of wilaya 59 Aflou under 3 Laghouat", async () => {
    // This is the requirement that makes `asOf` worth having: an address in
    // Aflou has to print its mère on a 2026 shipping label, because that is the
    // wilaya the postal service still routes on.
    const { getCommunes } = await load();
    const current = getCommunes();
    const legacy = getCommunes({ asOf: "58" });
    const idsOf59 = current.filter((c) => c.wilaya === 59).map((c) => c.id);

    expect(idsOf59).toHaveLength(12);
    for (const id of idsOf59) {
      expect(legacy.find((c) => c.id === id)?.wilaya).toBe(3);
    }
  });

  it("leaves no commune attributed to a 59..69 wilaya", async () => {
    const { getCommunes } = await load();
    const stragglers = getCommunes({ asOf: "58" }).filter((c) => c.wilaya >= 59);
    expect(stragglers.map((c) => c.id)).toEqual([]);
  });

  it("rewrites nothing on a commune whose wilaya predates the reform", async () => {
    // Unchanged rows are handed back as the SAME object — no copy.
    const { getCommunes } = await load();
    const current = getCommunes();
    const legacy = getCommunes({ asOf: "58" });
    const index = current.findIndex((c) => c.wilaya === 19);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(legacy[index]).toBe(current[index]);
  });
});

// ── 4. Ids and postal codes never move with asOf ────────────────────────────

describe("asOf rewrites attribution, never identity", () => {
  it("commune ids are byte-identical across the two views", async () => {
    // Two id namespaces would make every cached key in every consumer's
    // database ambiguous. Full-list comparison, in order — not a sample.
    const { getCommunes } = await load();
    expect(getCommunes({ asOf: "58" }).map((c) => c.id)).toEqual(
      getCommunes({ asOf: "69" }).map((c) => c.id),
    );
  });

  it("daïra ids are byte-identical across the two views", async () => {
    const { getDairas } = await load();
    expect(getDairas({ asOf: "58" }).map((d) => d.id)).toEqual(
      getDairas({ asOf: "69" }).map((d) => d.id),
    );
  });

  it("commune postal codes are byte-identical across the two views", async () => {
    // A postal code is a postal code. They were assigned under the 58-map and
    // have not been reissued, so `asOf` has nothing to say about them — the 30
    // nulls included.
    const { getCommunes } = await load();
    expect(getCommunes({ asOf: "58" }).map((c) => c.postalCode)).toEqual(
      getCommunes({ asOf: "69" }).map((c) => c.postalCode),
    );
  });

  it("daïra parent ids on communes are byte-identical across the two views", async () => {
    const { getCommunes } = await load();
    expect(getCommunes({ asOf: "58" }).map((c) => c.daira)).toEqual(
      getCommunes({ asOf: "69" }).map((c) => c.daira),
    );
  });

  it('getCommune(id, { asOf: "58" }) keeps the id and moves only the wilaya', async () => {
    const { getCommune, getCommunes } = await load();
    const aflou = getCommunes().find((c) => c.wilaya === 59);
    expect(aflou).toBeDefined();
    if (aflou === undefined) return expect.unreachable("no commune in wilaya 59");

    const legacy = getCommune(aflou.id, { asOf: "58" });
    expect(legacy?.id).toBe(aflou.id);
    expect(legacy?.postalCode).toBe(aflou.postalCode);
    expect(legacy?.name).toEqual(aflou.name);
    expect(legacy?.wilaya).toBe(3);

    // And an untouched commune comes back identical.
    expect(getCommune(COMMUNE_ID, { asOf: "58" })).toBe(getCommune(COMMUNE_ID));
  });
});

// ── 5. resolveLegacyWilaya ──────────────────────────────────────────────────

describe("resolveLegacyWilaya", () => {
  it("maps a new wilaya to its mère", async () => {
    const { resolveLegacyWilaya } = await load();
    expect(resolveLegacyWilaya(68)).toBe(17);
    expect(resolveLegacyWilaya(69)).toBe(17);
    expect(resolveLegacyWilaya(59)).toBe(3);
  });

  it("returns a pre-reform code unchanged", async () => {
    const { resolveLegacyWilaya } = await load();
    expect(resolveLegacyWilaya(16)).toBe(16);
    expect(resolveLegacyWilaya(19)).toBe(19);
  });

  it("answers for all 69 codes", async () => {
    const { resolveLegacyWilaya } = await load();
    for (const code of ALL_CODES) expect(resolveLegacyWilaya(code)).toBeDefined();
  });
});

// ── 6. resolveCurrentWilaya ─────────────────────────────────────────────────

describe("resolveCurrentWilaya", () => {
  it("returns the mère first, then its children ascending", async () => {
    const { resolveCurrentWilaya } = await load();
    expect(resolveCurrentWilaya(17)).toEqual([17, 68, 69]);
  });

  it("returns a single-element array for a wilaya that lost no territory", async () => {
    const { resolveCurrentWilaya } = await load();
    expect(resolveCurrentWilaya(16)).toEqual([16]);
  });

  it("returns undefined — NOT [] — for a code that is not a legacy code", async () => {
    // The distinction is load-bearing. `undefined` means "68 is not a code that
    // existed in the 58-map at all"; `[]` would mean "68 existed and lost all of
    // its territory". Collapsing the two is how a consumer ends up rendering an
    // empty wilaya list for a wilaya that is perfectly real today.
    const { resolveCurrentWilaya } = await load();
    expect(resolveCurrentWilaya(68)).toBeUndefined();
    expect(resolveCurrentWilaya(69)).toBeUndefined();
    expect(resolveCurrentWilaya(59)).toBeUndefined();
  });

  it("is cached per code and frozen", async () => {
    const { resolveCurrentWilaya } = await load();
    const first = resolveCurrentWilaya(17);
    expect(first).toBe(resolveCurrentWilaya(17));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(resolveCurrentWilaya(16))).toBe(true);
  });

  it("covers all 69 current codes exactly once across the 58 legacy answers", async () => {
    const { resolveCurrentWilaya } = await load();
    const seen: number[] = [];
    for (const code of OLD_CODES) {
      const current = resolveCurrentWilaya(code as WilayaCode);
      expect(current).toBeDefined();
      seen.push(...(current ?? []));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([...ALL_CODES]);
  });
});

// ── 7. Junk input — undefined, never null, never [], never a throw ──────────

describe("junk input", () => {
  it("resolveLegacyWilaya returns undefined for anything that is not a wilaya code", async () => {
    const { resolveLegacyWilaya } = await load();

    // Reachable only from untyped JavaScript or a cast, which is exactly why it
    // is worth pinning: the TypeScript union is not a run-time guarantee.
    // @ts-expect-error 0 is not a WilayaCode
    expect(resolveLegacyWilaya(0)).toBeUndefined();
    // @ts-expect-error 70 is not a WilayaCode
    expect(resolveLegacyWilaya(70)).toBeUndefined();
    // @ts-expect-error -1 is not a WilayaCode
    expect(resolveLegacyWilaya(-1)).toBeUndefined();
    // @ts-expect-error 1.5 is not a WilayaCode
    expect(resolveLegacyWilaya(1.5)).toBeUndefined();
    // @ts-expect-error NaN is not a WilayaCode
    expect(resolveLegacyWilaya(NaN)).toBeUndefined();
    // @ts-expect-error the codes are numbers, not the padded strings v1 used
    expect(resolveLegacyWilaya("17")).toBeUndefined();
  });

  it("resolveCurrentWilaya returns undefined for anything that is not a wilaya code", async () => {
    const { resolveCurrentWilaya } = await load();

    // @ts-expect-error 0 is not a WilayaCode
    expect(resolveCurrentWilaya(0)).toBeUndefined();
    // @ts-expect-error 70 is not a WilayaCode
    expect(resolveCurrentWilaya(70)).toBeUndefined();
    // @ts-expect-error -1 is not a WilayaCode
    expect(resolveCurrentWilaya(-1)).toBeUndefined();
    // @ts-expect-error 1.5 is not a WilayaCode
    expect(resolveCurrentWilaya(1.5)).toBeUndefined();
    // @ts-expect-error NaN is not a WilayaCode
    expect(resolveCurrentWilaya(NaN)).toBeUndefined();
    // @ts-expect-error the codes are numbers, not the padded strings v1 used
    expect(resolveCurrentWilaya("17")).toBeUndefined();
  });

  it("never returns null, never returns [], never throws", async () => {
    const { resolveCurrentWilaya, resolveLegacyWilaya } = await load();
    const junk = [0, 70, -1, 1.5, NaN, "17"] as unknown as readonly WilayaCode[];

    for (const value of junk) {
      expect(() => resolveLegacyWilaya(value)).not.toThrow();
      expect(() => resolveCurrentWilaya(value)).not.toThrow();
      expect(resolveLegacyWilaya(value)).not.toBeNull();
      expect(resolveCurrentWilaya(value)).not.toBeNull();
      expect(resolveCurrentWilaya(value)).not.toEqual([]);
    }
  });
});

// ── 8. The round-trip property, over all 69 codes ──────────────────────────

describe("round trip", () => {
  it.each([...ALL_CODES])(
    "resolveCurrentWilaya(resolveLegacyWilaya(%i)) is defined and includes %i",
    async (code) => {
      const { resolveCurrentWilaya, resolveLegacyWilaya } = await load();

      const legacy = resolveLegacyWilaya(code);
      expect(legacy).toBeDefined();
      if (legacy === undefined) return expect.unreachable(`no legacy code for ${code}`);

      const current = resolveCurrentWilaya(legacy);
      expect(current).toBeDefined();
      expect(current).toContain(code);
    },
  );
});

// ── 9. Nothing throws where the unfilled stub threw ────────────────────────

describe("the gate is open", () => {
  it("none of the seven derived entry points throws", async () => {
    // The exact list `tests/reform.test.ts` asserts THROWS while the shipped
    // mapping is unfilled. Same calls, opposite expectation — that pairing is
    // what makes both files meaningful.
    const api = await load();
    const calls: readonly (() => unknown)[] = [
      () => api.resolveLegacyWilaya(68),
      () => api.resolveCurrentWilaya(17),
      () => api.getWilayas({ asOf: "58" }),
      () => api.getDairas({ asOf: "58" }),
      () => api.getCommunes({ asOf: "58" }),
      () => api.getWilaya(17, { asOf: "58" }),
      () => api.getCommune(COMMUNE_ID, { asOf: "58" }),
    ];
    for (const call of calls) expect(call).not.toThrow();
  });

  it("and the default path is still identical to the no-options call", async () => {
    const { getCommunes, getDairas, getWilayas } = await load();
    expect(getWilayas({ asOf: "69" })).toBe(getWilayas());
    expect(getDairas({ asOf: "69" })).toBe(getDairas());
    expect(getCommunes({ asOf: "69" })).toBe(getCommunes());
    expect(getWilayas()).toHaveLength(69);
  });
});
