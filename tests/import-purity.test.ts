/**
 * Import-time purity: **a user who only calls `getWilayas()` must never pay for
 * the commune index.**
 *
 * ── Why this file is written the way it is ──────────────────────────────────
 *
 * Every index in this library is a module-scope `let … | undefined` filled by a
 * lazy builder. That state belongs to the MODULE GRAPH, not to the test, and
 * vitest caches module graphs across test files and across `it` blocks in the
 * same file. So a purity assertion written the ordinary way — a top-level
 * `import` plus `expect(__indexState().postal).toBe(false)` — is not a test of
 * the library at all. It is a test of which file vitest happened to run first.
 * Once `tests/search.test.ts` has run in the same graph, every index is already
 * built and the assertion passes or fails on ordering.
 *
 * Hence, in every case below:
 *
 *   1. `vi.resetModules()` first, so the next import evaluates a FRESH graph;
 *   2. `await import(...)` inside the case, never a top-level import, because a
 *      top-level import is hoisted and evaluated before `resetModules` runs;
 *   3. the debug hooks are imported from their own modules — `indexes.ts`,
 *      `search.ts` and `asof.ts` — never from `index.ts`, which must not
 *      re-export them.
 *
 * The invariant this protects is not academic. A top-level `const idx =
 * build()` anywhere in `src/` makes `"sideEffects": false` a lie, and a
 * consumer who imported only `getWilayas()` then ships and executes the entire
 * commune index.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  // Drop every cached module so each case starts from a cold graph.
  vi.resetModules();
});

/** The nine lazy structures `indexes.ts` reports on. */
const INDEX_KEYS = [
  "commune",
  "communesOfWilaya",
  "daira",
  "dairasOfWilaya",
  "name",
  "postal",
  "tree",
  "wilaya",
  "wilayaList",
];

/**
 * The five lazy `asOf: "58"` structures `asof.ts` reports on.
 *
 * Pinned exactly like `INDEX_KEYS`, and for the same reason: a lazy structure
 * that is not reported can never be caught being built at import time, so a new
 * `let … | undefined` in `asof.ts` has to come with a line here or this test
 * goes red.
 */
const ASOF_KEYS = ["communeIndex", "communes", "dairas", "wilayaIndex", "wilayas"];

/** The two lazy reform maps, pinned so a new one cannot be added untested. */
const REFORM_KEYS = ["forward", "reverse"];

/** The five lazy v1 projections, pinned for the same reason. */
const LEGACY_KEYS = [
  "algeria",
  "communesFlat",
  "dairasFlat",
  "paddedCodeIndex",
  "wilayaTrees",
  "wilayasFlat",
];

describe("import-time purity", () => {
  it("builds no index when only the entry point is imported", async () => {
    await import("../packages/js/src/index");
    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();

    // The nine keys are pinned too: an index that stops being reported is an
    // index that can never be caught being built at import time.
    expect(Object.keys(state).sort()).toEqual(INDEX_KEYS);
    // Reported as entries so a failure names which index was built.
    expect(Object.entries(state).filter(([, built]) => built)).toEqual([]);
  });

  it("builds no asOf structure when only the entry point is imported", async () => {
    // The whole 58-view — 58 recomputed wilaya records, 566 re-attributed
    // daïras, 1541 re-attributed communes and two Maps over them — is derived
    // work that only a caller who passes `{ asOf: "58" }` may pay for. A single
    // eager build here would land the reform layer in the bundle of every
    // consumer who never heard of Loi 26-06.
    await import("../packages/js/src/index");
    const { __asOfState } = await import("../packages/js/src/asof");
    const state = __asOfState();

    expect(Object.keys(state).sort()).toEqual(ASOF_KEYS);
    expect(Object.entries(state).filter(([, built]) => built)).toEqual([]);
  });

  it("builds no reform-derived structure when only the entry point is imported", async () => {
    // `reform.ts` keeps its own two lazy Maps (current -> legacy, legacy ->
    // current) behind `__reformState()`, and `legacy/project.ts` keeps its five
    // v1 projections behind `__legacyState()` — both exported from their own
    // module and re-exported by nothing, exactly like `__indexState`. So all
    // four layers are asserted directly here rather than inferred.
    //
    // The legacy half matters as much as the reform half: the v1 projections
    // materialize the denormalized wilaya_*/daira_* columns and roughly DOUBLE
    // the resident data. A root consumer who never touches the compat shims
    // must not pay for them.
    const api = await import("../packages/js/src/index");
    const { __asOfState } = await import("../packages/js/src/asof");
    const { __indexState } = await import("../packages/js/src/indexes");
    const { __reformState } = await import("../packages/js/src/reform");
    const { __legacyState } = await import("../packages/js/src/legacy/project");

    expect(Object.keys(__reformState()).sort()).toEqual(REFORM_KEYS);
    expect(Object.keys(__legacyState()).sort()).toEqual(LEGACY_KEYS);

    expect(Object.entries(__asOfState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__indexState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__reformState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__legacyState()).filter(([, built]) => built)).toEqual([]);

    // Reading the law reference and the dates is free — those facts are known
    // even while the mapping is a stub, so metadata access must build nothing.
    expect(api.REFORM.law).toBe("Loi 26-06");
    expect(api.getWilaya(59)?.parentWilaya).toBeNull();
    expect(Object.entries(__reformState()).filter(([, built]) => built)).toEqual([]);

    // The only route into those two Maps still refuses to run at all.
    expect(() => api.resolveLegacyWilaya(68)).toThrow(api.ReformMappingUnavailableError);
    expect(Object.entries(__reformState()).filter(([, built]) => built)).toEqual([]);
  });

  it("builds no v2 index and no v2 search structure when /legacy is imported", async () => {
    // The two entry points are disjoint by construction. A v1 consumer who
    // imports `algeria-wilayas-communes/legacy` gets the four snake_case
    // projections and nothing else — no normalized wrappers, and above all not
    // the 2176-key search index, which is v2's largest structure and has no v1
    // counterpart (`findCommune` is a `nom_fr` substring scan, deliberately).
    await import("../packages/js/src/legacy/index");
    const { __indexState } = await import("../packages/js/src/indexes");
    const { __searchState } = await import("../packages/js/src/search");

    expect(Object.entries(__searchState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__indexState()).filter(([, built]) => built)).toEqual([]);
  });

  it("builds no search structure when only the entry point is imported", async () => {
    await import("../packages/js/src/index");
    const { __searchState } = await import("../packages/js/src/search");
    const state = __searchState();

    // The three lazy search structures: the exact-match map, the
    // first-character bucket map the fuzzy tier ranges over, and the per-wilaya
    // key list that `opts.wilaya` scoping needs.
    expect(Object.keys(state).sort()).toEqual(["bucket", "exact", "wilayaKeys"]);
    expect(Object.entries(state).filter(([, built]) => built)).toEqual([]);
  });

  it("builds no index when the generated data modules are imported", async () => {
    // The three `Object.freeze` calls in api.ts are the only top-level
    // statements with an effect in the whole library. Freezing an already
    // materialized array is not index construction.
    await import("../packages/js/src/generated/communes");
    await import("../packages/js/src/generated/wilayas");
    const { __indexState } = await import("../packages/js/src/indexes");
    expect(Object.values(__indexState()).some(Boolean)).toBe(false);
  });
});

describe("lazy index construction", () => {
  it("getWilayas() does not build the commune, postal or name indexes", async () => {
    const api = await import("../packages/js/src/index");
    expect(api.getWilayas()).toHaveLength(69);

    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();
    expect(state["postal"]).toBe(false);
    expect(state["commune"]).toBe(false);
    expect(state["name"]).toBe(false);
    expect(state["daira"]).toBe(false);
    expect(state["tree"]).toBe(false);
  });

  it("findByPostalCode() builds the postal index and nothing else", async () => {
    const api = await import("../packages/js/src/index");
    expect(api.findByPostalCode("19018")).toHaveLength(1);

    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();
    expect(state["postal"]).toBe(true);
    // Each index gets its own `let` and its own builder. One `initAll()` would
    // re-couple them and defeat the entire point.
    expect(state["commune"]).toBe(false);
    expect(state["name"]).toBe(false);
    expect(state["tree"]).toBe(false);
  });

  it("getWilaya() builds only the 69-entry wilaya index", async () => {
    const api = await import("../packages/js/src/index");
    expect(api.getWilaya(19)?.name.fr).toBe("Setif");

    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();
    expect(state["wilaya"]).toBe(true);
    expect(state["postal"]).toBe(false);
    expect(state["commune"]).toBe(false);
  });

  it("findCommunesByName() builds the name index, not the postal one", async () => {
    const api = await import("../packages/js/src/index");
    expect(api.findCommunesByName("Sidi Ameur")).toHaveLength(2);

    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();
    expect(state["name"]).toBe(true);
    expect(state["postal"]).toBe(false);
  });

  it("reading REFORM metadata builds nothing at all", async () => {
    // `REFORM` is 11 small records re-typed from the generated emit, not an
    // index. Reading the law, the Journal Officiel issue or the three dates has
    // to stay free: those are the fields a consumer logs on every boot to prove
    // provenance to a compliance team.
    const { REFORM } = await import("../packages/js/src/index");
    expect(REFORM.law).toBe("Loi 26-06");
    expect(REFORM.newWilayas).toHaveLength(11);

    const { __asOfState } = await import("../packages/js/src/asof");
    const { __indexState } = await import("../packages/js/src/indexes");
    expect(Object.entries(__asOfState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__indexState()).filter(([, built]) => built)).toEqual([]);
  });

  it("reading parentWilaya off a wilaya builds no asOf structure", async () => {
    // `parentWilaya` is attached where the `Wilaya` wrapper is minted, from that
    // same 11-record constant — a plain field read, not a lookup. So it costs
    // the wilaya list and the code index it would have cost anyway, and nothing
    // from the reform layer.
    const api = await import("../packages/js/src/index");
    expect(api.getWilaya(68)?.parentWilaya).toBeNull();

    const { __asOfState } = await import("../packages/js/src/asof");
    const { __indexState } = await import("../packages/js/src/indexes");
    const state = __indexState();

    expect(Object.entries(__asOfState()).filter(([, built]) => built)).toEqual([]);
    expect(state["wilayaList"]).toBe(true);
    expect(state["wilaya"]).toBe(true);
    expect(state["postal"]).toBe(false);
    expect(state["commune"]).toBe(false);
    expect(state["tree"]).toBe(false);
  });

  it("isWilayaCode() consults no index at all", async () => {
    // Validating a number must not drag 69 records — or any records — into a
    // consumer's bundle. This is the guard's whole selling point: it is usable
    // in code that never touches the data.
    const { isWilayaCode } = await import("../packages/js/src/guards");
    expect(isWilayaCode(16)).toBe(true);
    expect(isWilayaCode(70)).toBe(false);

    const { __indexState } = await import("../packages/js/src/indexes");
    expect(Object.values(__indexState()).some(Boolean)).toBe(false);
  });

  it("isPostalCode() consults no index at all", async () => {
    // Shape is not existence: the guard answers `/^\d{5}$/`, and "does any
    // commune have this code" is `findByPostalCode`'s question.
    const { isPostalCode } = await import("../packages/js/src/guards");
    expect(isPostalCode("00000")).toBe(true);

    const { __indexState } = await import("../packages/js/src/indexes");
    expect(Object.values(__indexState()).some(Boolean)).toBe(false);
  });
});

describe("the empty query is answered before any work happens", () => {
  it.each(["", "   ", "\t\n"])("search(%o) builds nothing", async (query) => {
    const api = await import("../packages/js/src/index");
    expect(api.search(query)).toEqual([]);

    const { __searchState } = await import("../packages/js/src/search");
    const { __indexState } = await import("../packages/js/src/indexes");

    // An empty search box on mount is the most common accidental call in the
    // library. It must cost one `normalize()` of a short string and nothing
    // else — no exact map, no bucket map, no commune index.
    expect(Object.entries(__searchState()).filter(([, built]) => built)).toEqual([]);
    expect(Object.entries(__indexState()).filter(([, built]) => built)).toEqual([]);
  });

  it("a scoped query that fills its limit never builds the wilaya bucket", async () => {
    // Laziness holds one level down, not just at import time. `ain` scoped to
    // Setif with `limit: 5` is answered entirely by the prefix tier walking the
    // globally sorted key array, so neither the first-character bucket map nor
    // the per-wilaya key list is ever needed — even though a wilaya scope was
    // requested. Building `wilayaKeys` here would be 2176 records of work to
    // answer a question that never asked for it.
    const api = await import("../packages/js/src/index");
    expect(api.search("ain", { wilaya: 19, limit: 5 })).toHaveLength(5);

    const { __searchState } = await import("../packages/js/src/search");
    expect(__searchState()).toEqual({ exact: true, bucket: false, wilayaKeys: false });
  });

  it("a scope that outlives its limit does build the wilaya bucket", async () => {
    // The counterweight, so the test above cannot pass on a structure that is
    // never built at all: raise the limit past the number of scoped matches and
    // the substring tier has to run, which is what needs the bucket.
    const api = await import("../packages/js/src/index");
    expect(api.search("ain", { wilaya: 19, limit: 100 })).toHaveLength(13);

    const { __searchState } = await import("../packages/js/src/search");
    expect(__searchState()["wilayaKeys"]).toBe(true);
  });

  it("a real query does build the search structures — the negative above is meaningful", async () => {
    // Without this, every assertion in this describe block would still pass if
    // `__searchState()` were hard-wired to all-false.
    const api = await import("../packages/js/src/index");
    expect(api.search("setif")).not.toHaveLength(0);

    const { __searchState } = await import("../packages/js/src/search");
    expect(Object.values(__searchState()).some(Boolean)).toBe(true);
  });
});
