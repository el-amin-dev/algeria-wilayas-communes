/**
 * **This file is the v1 contract. A failure here is a breaking change, not a
 * flaky test.**
 *
 * ── The semantics nobody wrote down ─────────────────────────────────────────
 *
 * v1's `load(name)` was a `readFileSync` + `JSON.parse` behind a **per-file**
 * module-scope cache. Nobody designed the object graph that fell out of that —
 * it was an implementation detail of a seven-line helper — but it was
 * observable, it was stable across every 1.x release, and consumers built on
 * it. Specifically:
 *
 * - each accessor returned the **same array instance** on every call, so
 *   `useMemo(() => …, [getCommunes()])` never re-fired, a `WeakMap` keyed on a
 *   commune row kept working, and a React dependency array stayed stable;
 * - the rows were **not frozen**, so patching a name in place worked and stuck;
 * - the caches were **per file**, so a mutation through `getCommunes()` was
 *   invisible to `getAll()` — three independent parses of the same facts.
 *
 * v2 has no files and no `JSON.parse`: the legacy layer projects from inlined
 * constants behind memo slots. That is a completely different mechanism, and it
 * would be very easy to build it in a way that is *nicer* than v1 — frozen
 * arrays, a single shared row per commune, a fresh projection per call — and
 * break real programs without changing a single documented behaviour. These
 * assertions are the only thing standing between "nicer" and "shipped".
 *
 * The mutation round-trip lives in `identity.mutation.test.ts`, alone, because
 * vitest isolates by FILE and not by test: mutating a memoized row here would
 * leak into every other case in this file.
 *
 * ── `findByPostalCode` returns an ARRAY, and that is load-bearing ───────────
 *
 * 1493 communes hold only 1476 distinct postal codes — **17 codes are shared**.
 * Any "simplification" to a single-commune return value silently drops real
 * data. The shared code below is found programmatically, so the test keeps
 * meaning if the dataset changes and does not encode a lucky constant.
 */

import { describe, expect, it } from "vitest";

import {
  byWilaya,
  findByPostalCode,
  findCommune,
  getAll,
  getCommunes,
  getDairas,
  getWilayas,
} from "../../packages/js/src/legacy/index";

import type { CommuneFlat } from "../../packages/js/src/legacy/index";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A postal code held by more than one commune.
 *
 * Found by scanning rather than hard-coded: the assertion is "shared codes
 * exist and `findByPostalCode` returns all of them", not "02015 is special".
 */
function sharedPostalCode(): { code: string; count: number } {
  const counts = new Map<string, number>();
  for (const c of getCommunes()) {
    if (c.code_postal === null) continue;
    counts.set(c.code_postal, (counts.get(c.code_postal) ?? 0) + 1);
  }
  for (const [code, count] of counts) if (count > 1) return { code, count };
  throw new Error("expected at least one postal code shared by two communes");
}

// ── Referential identity: every accessor is memoized ─────────────────────────

describe("referential identity — the same instance on every call", () => {
  it("`getCommunes() === getCommunes()`", () => {
    expect(getCommunes()).toBe(getCommunes());
  });

  it("`getWilayas() === getWilayas()`", () => {
    expect(getWilayas()).toBe(getWilayas());
  });

  it("`getDairas() === getDairas()`", () => {
    expect(getDairas()).toBe(getDairas());
  });

  it("`getAll() === getAll()`", () => {
    expect(getAll()).toBe(getAll());
  });

  it("`byWilaya(16) === byWilaya(16)`", () => {
    expect(byWilaya(16)).toBe(byWilaya(16));
  });

  it('`byWilaya(16) === byWilaya("16")` — one cache keyed on the PADDED code', () => {
    // v1's `String(num).padStart(2, "0")` collapsed both forms onto one
    // filename, so both calls hit one parse. The memo key must do the same, or
    // a caller who reads the number from a form field gets a different object
    // than a caller who typed the literal.
    expect(byWilaya(16)).toBe(byWilaya("16"));
    expect(byWilaya(6)).toBe(byWilaya("06"));
    expect(byWilaya(6)).toBe(byWilaya("6"));
  });

  it("the memo is per-wilaya, not one shared object", () => {
    expect(byWilaya(16)).not.toBe(byWilaya(19));
  });
});

// ── The filters return a FRESH array of SHARED rows ──────────────────────────

describe("`findByPostalCode` / `findCommune` — fresh array, shared elements", () => {
  it("`findByPostalCode(p) !== findByPostalCode(p)` — a new array each call", () => {
    // `getCommunes().filter(…)` allocates. That is v1's behaviour and callers
    // may mutate the returned array (sort it, splice it) without corrupting the
    // dataset — so memoizing this would be a break, not an optimisation.
    expect(findByPostalCode("16000")).not.toBe(findByPostalCode("16000"));
    expect(findCommune("adrar")).not.toBe(findCommune("adrar"));
  });

  it("`findByPostalCode(p)[0] === getCommunes().find(…)` — the ELEMENTS are shared", () => {
    const hit = findByPostalCode("16000")[0];
    expect(hit).toBe(getCommunes().find((c) => c.code_postal === "16000"));
  });

  it("`findCommune(q)[0]` is the shared row too", () => {
    const hit = findCommune("adrar")[0];
    expect(hit).toBe(getCommunes().find((c) => c.nom_fr.toLowerCase().includes("adrar")));
  });

  it("sorting a returned array cannot reorder the dataset", () => {
    const before = getCommunes().slice(0, 5);
    const results = findCommune("a");
    results.reverse();
    expect(getCommunes().slice(0, 5)).toStrictEqual(before);
  });
});

// ── `findByPostalCode` legitimately returns more than one row ────────────────

describe("`findByPostalCode` — an ARRAY, not a single commune", () => {
  it("at least one postal code is held by more than one commune", () => {
    const { code, count } = sharedPostalCode();
    expect(count).toBeGreaterThan(1);
    const hits: CommuneFlat[] = findByPostalCode(code);
    expect(hits.length).toBe(count);
    for (const c of hits) expect(c.code_postal).toBe(code);
  });

  it("17 codes are shared across the 1493 communes that have one (1476 distinct)", () => {
    const counts = new Map<string, number>();
    for (const c of getCommunes()) {
      if (c.code_postal === null) continue;
      counts.set(c.code_postal, (counts.get(c.code_postal) ?? 0) + 1);
    }
    const withCode = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(withCode).toBe(1493);
    expect(counts.size).toBe(1476);
    expect([...counts.values()].filter((n) => n > 1)).toHaveLength(17);
  });

  it("never matches a `code_postal: null` commune", () => {
    // `null === code` is false for every string, so the 30 unpublished rows are
    // unreachable through this function — in v1 and here. A "helpful" coercion
    // (`==`, or treating `""` as a wildcard) would surface them.
    expect(getCommunes().filter((c) => c.code_postal === null)).toHaveLength(48);
    for (const probe of ["", "null", "undefined", "0"]) {
      expect(findByPostalCode(probe)).toStrictEqual([]);
    }
    const everyHit = getCommunes().flatMap((c) =>
      c.code_postal === null ? [] : findByPostalCode(c.code_postal),
    );
    expect(everyHit.every((c) => c.code_postal !== null)).toBe(true);
  });
});

// ── The object graph: flat rows and tree rows are DISTINCT ───────────────────

describe("per-view object graph — as in v1's per-file caches", () => {
  it("`getCommunes()[0] !== getAll().wilayas[0].dairas[0].communes[0]`", () => {
    // Different objects with equal contents. v1 got this from parsing
    // `communes.json` and `algeria.json` separately; v2 reproduces it by
    // projecting each view independently. Deduplicating the rows into one
    // shared object would make a mutation cross view boundaries — a behaviour
    // change no consumer asked for.
    const flat = getCommunes()[0];
    const nested = getAll().wilayas[0]?.dairas[0]?.communes[0];
    expect(flat).toBeDefined();
    expect(nested).toBeDefined();
    expect(flat).not.toBe(nested);
    expect(flat?.nom_fr).toBe(nested?.nom_fr);
    expect(flat?.code_postal).toBe(nested?.code_postal);
  });

  it("`byWilaya()` is a third independent projection", () => {
    const fromTree = getAll().wilayas[0];
    const fromByWilaya = byWilaya(1);
    expect(fromTree).not.toBe(fromByWilaya);
    expect(fromTree?.nom_fr).toBe(fromByWilaya?.nom_fr);
    expect(fromTree?.dairas[0]?.communes[0]).not.toBe(fromByWilaya?.dairas[0]?.communes[0]);
  });
});

// ── Not frozen ───────────────────────────────────────────────────────────────

describe("mutability — the legacy surface stays writable", () => {
  it("`Object.isFrozen(getCommunes())` is false, at every level", () => {
    // The v2 root freezes its bulk arrays. `/legacy` must NOT: v1 handed back
    // the live `JSON.parse` result, so `getCommunes()[0].nom_fr = "X"` compiled
    // and persisted. Freezing here turns that into a silent no-op in sloppy
    // mode and a `TypeError` under `"use strict"` — a runtime break in code
    // that never changed.
    expect(Object.isFrozen(getCommunes())).toBe(false);
    expect(Object.isFrozen(getWilayas())).toBe(false);
    expect(Object.isFrozen(getDairas())).toBe(false);
    expect(Object.isFrozen(getAll())).toBe(false);
    expect(Object.isFrozen(byWilaya(16))).toBe(false);

    const row = getCommunes()[0];
    expect(row).toBeDefined();
    expect(Object.isFrozen(row)).toBe(false);
    expect(Object.isFrozen(getAll().wilayas)).toBe(false);
    expect(Object.isFrozen(getAll().wilayas[0])).toBe(false);
  });

  it("the arrays are extensible and their rows are writable descriptors", () => {
    expect(Object.isExtensible(getCommunes())).toBe(true);
    expect(Object.isSealed(getCommunes())).toBe(false);
    const descriptor = Object.getOwnPropertyDescriptor(getCommunes()[0] ?? {}, "nom_fr");
    expect(descriptor?.writable).toBe(true);
    expect(descriptor?.configurable).toBe(true);
  });
});

// ── The null-argument quirk, pinned ─────────────────────────────────────────

describe("findByPostalCode(null) — a v1 quirk, deliberately preserved", () => {
  it("returns the 48 null-code communes, because null === null", () => {
    // NOT a bug being blessed: this is byte-faithful to v1's
    // `getCommunes().filter((c) => c.code_postal === code)`, and someone may
    // already depend on it. It IS a trap — a caller passing a nullable database
    // column straight in asks "no postal code" and gets 27 rows instead of none.
    // Pinned so a later "cleanup" cannot quietly change it: doing so is a
    // breaking change and belongs in a major with a line in the migration guide.
    const nulls = findByPostalCode(null as never);

    expect(nulls).toHaveLength(48);
    expect(nulls.every((c) => c.code_postal === null)).toBe(true);

    // Every *string* argument, by contrast, matches none of them.
    for (const q of ["", "null", "undefined", "0", "16000"]) {
      expect(findByPostalCode(q).some((c) => c.code_postal === null)).toBe(false);
    }
  });
});
