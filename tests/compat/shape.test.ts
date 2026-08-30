/**
 * **This file is the v1 contract. A failure here is a breaking change, not a
 * flaky test.**
 *
 * ── Field for field, in order ───────────────────────────────────────────────
 *
 * `toStrictEqual` does not care about key order. `JSON.stringify` does — and
 * key order is part of this package's contract in a way it is not for most
 * libraries, because `data/*.json` is served verbatim over the jsDelivr CDN,
 * diffed by consumers, and read by the `jq`, Python and Java examples in the
 * root README. A reordered key is a non-empty diff on a file that is supposed
 * to be byte-frozen (decision D1), so it is checked here, not assumed.
 *
 * Two layers of assertion, deliberately overlapping:
 *
 * 1. `Object.keys(record)` in order, for one record of each of the four v1
 *    shapes. This one names the field that moved.
 * 2. `JSON.stringify` of every accessor against the frozen JSON on disk. This
 *    one subsumes layer 1 and cannot drift — but when it fails it prints two
 *    500KB strings, which is why layer 1 exists.
 *
 * The v2 legacy layer builds these records with explicit object literals rather
 * than spread-from-source precisely so that insertion order is written down in
 * the code. This file is the test that makes that discipline load-bearing.
 *
 * ── The `data/` files are the oracle, not the generated constants ───────────
 *
 * Comparing the projections against `packages/js/src/generated/*` would only
 * prove the projector agrees with its own input. The frozen JSON on disk is an
 * INDEPENDENT artefact — the published v1 payload — so it is the only oracle
 * that can catch a build-time drift and a projection bug at the same time.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  byWilaya,
  getAll,
  getCommunes,
  getDairas,
  getWilayas,
} from "../../packages/js/src/legacy/index";

import type { WilayaNum } from "../../packages/js/src/legacy/index";

// ── Locations ───────────────────────────────────────────────────────────────
// Resolved from `import.meta.url`, never from `process.cwd()`. Two levels up,
// because this file sits in a subdirectory.

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(`${REPO_ROOT}${rel}`, "utf8")) as T;
}

/** The first element of an array, without a `!`. */
function first<T>(items: readonly T[], what: string): T {
  const head = items[0];
  if (head === undefined) throw new Error(`expected at least one ${what}`);
  return head;
}

// ── 1. Key order, one record of each v1 shape ───────────────────────────────

describe("v1 record shapes — `Object.keys()` in order", () => {
  it("`WilayaFlat` — 7 fields", () => {
    expect(Object.keys(first(getWilayas(), "wilaya"))).toEqual([
      "wilaya_num",
      "code",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_dairas",
      "nb_communes",
    ]);
  });

  it("`DairaFlat` — 8 fields", () => {
    expect(Object.keys(first(getDairas(), "daïra"))).toEqual([
      "wilaya_num",
      "wilaya_code",
      "wilaya_fr",
      "wilaya_en",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_communes",
    ]);
  });

  it("`CommuneFlat` — 12 fields", () => {
    expect(Object.keys(first(getCommunes(), "commune"))).toEqual([
      "wilaya_num",
      "wilaya_code",
      "wilaya_ar",
      "wilaya_fr",
      "wilaya_en",
      "daira_ar",
      "daira_fr",
      "daira_en",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "code_postal",
    ]);
  });

  it("`Commune` (nested) — 4 fields", () => {
    const nested = first(
      first(first(getAll().wilayas, "wilaya").dairas, "daïra").communes,
      "commune",
    );
    expect(Object.keys(nested)).toEqual(["nom_ar", "nom_fr", "nom_en", "code_postal"]);
  });

  it("`Wilaya` (nested) — 8 fields, `dairas` last", () => {
    expect(Object.keys(first(getAll().wilayas, "wilaya"))).toEqual([
      "wilaya_num",
      "code",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_dairas",
      "nb_communes",
      "dairas",
    ]);
  });

  it("`Daira` (nested) — `communes` BEFORE `nb_communes`, as on disk (ADR-004)", () => {
    // v1's `index.d.ts` declares `nb_communes` then `communes`. The 70 JSON
    // files on disk have the opposite order, and those bytes are the frozen
    // contract — a TypeScript interface imposes no runtime key order, so the
    // disk wins. This assertion is the entire enforcement of ADR-004; without
    // it, someone "fixing" the projector to match the `.d.ts` produces a
    // non-empty diff on every published data file and nothing catches it.
    const nested = first(first(getAll().wilayas, "wilaya").dairas, "daïra");
    expect(Object.keys(nested)).toEqual(["nom_ar", "nom_fr", "nom_en", "communes", "nb_communes"]);
  });

  it("the `wilaya_ar` asymmetry is reproduced, NOT fixed", () => {
    // `DairaFlat` has no `wilaya_ar`; `CommuneFlat` has one. That is almost
    // certainly an oversight in the original `jq` filter that generated
    // `data/dairas.json` — and it is faithfully preserved, because adding the
    // field changes what `getDairas()` returns and what every jsDelivr consumer
    // downloads. It is recorded as a candidate **v3 data break**, not an
    // oversight in this layer. Deleting this test to "clean up" the shape is
    // the exact mistake it exists to prevent.
    const dairaFlat = first(getDairas(), "daïra");
    const communeFlat = first(getCommunes(), "commune");
    expect("wilaya_ar" in dairaFlat).toBe(false);
    expect("wilaya_ar" in communeFlat).toBe(true);
    // The pair that IS symmetric, so the assertion above reads as specific.
    expect("wilaya_fr" in dairaFlat).toBe(true);
    expect("wilaya_fr" in communeFlat).toBe(true);
  });

  it("every record of every kind has the same keys in the same order", () => {
    // One sample proves nothing about row 900. These loops do.
    const wilayaKeys = JSON.stringify(Object.keys(first(getWilayas(), "wilaya")));
    for (const w of getWilayas()) expect(JSON.stringify(Object.keys(w))).toBe(wilayaKeys);

    const dairaKeys = JSON.stringify(Object.keys(first(getDairas(), "daïra")));
    for (const d of getDairas()) expect(JSON.stringify(Object.keys(d))).toBe(dairaKeys);

    const communeKeys = JSON.stringify(Object.keys(first(getCommunes(), "commune")));
    for (const c of getCommunes()) expect(JSON.stringify(Object.keys(c))).toBe(communeKeys);
  });
});

// ── 2. The subsuming check: JSON.stringify against the frozen contract ──────

describe("the whole projection, against the frozen `data/*.json`", () => {
  it("`getWilayas()` === `data/wilayas.json`.wilayas", () => {
    const source = readJson<{ wilayas: unknown }>("data/wilayas.json");
    expect(JSON.stringify(getWilayas())).toBe(JSON.stringify(source.wilayas));
  });

  it("`getDairas()` === `data/dairas.json`.dairas", () => {
    const source = readJson<{ dairas: unknown }>("data/dairas.json");
    expect(JSON.stringify(getDairas())).toBe(JSON.stringify(source.dairas));
  });

  it("`getCommunes()` === `data/communes.json`.communes", () => {
    const source = readJson<{ communes: unknown }>("data/communes.json");
    expect(JSON.stringify(getCommunes())).toBe(JSON.stringify(source.communes));
  });

  it("`getAll()` === the WHOLE of `data/algeria.json`", () => {
    // Not just `.wilayas`: the six document-level keys v1's `[key: string]:
    // unknown` index signature swallowed — `reforme`, `hierarchie`,
    // `codes_postaux_renseignes`, `codes_postaux_manquants`, `note_daira`,
    // `sources` — are part of the payload and are compared here too.
    const source = readJson<unknown>("data/algeria.json");
    expect(JSON.stringify(getAll())).toBe(JSON.stringify(source));
  });
});

// ── 3. All 69 subtrees, one `it` each so a failure NAMES the wilaya ─────────

describe("`byWilaya(n)` against each `data/by-wilaya/NN.json`", () => {
  for (let n = 1; n <= 69; n++) {
    const nn = String(n).padStart(2, "0");
    it(`byWilaya(${n}) === data/by-wilaya/${nn}.json`, () => {
      const source = readJson<unknown>(`data/by-wilaya/${nn}.json`);
      expect(JSON.stringify(byWilaya(n as WilayaNum))).toBe(JSON.stringify(source));
    });
  }

  it("covers all 69 files and no more", () => {
    // A guard on the loop above: if a 70th wilaya file ever appears, the loop
    // would silently ignore it.
    const source = readJson<{ nb_wilayas: number }>("data/algeria.json");
    expect(source.nb_wilayas).toBe(69);
    expect(getWilayas()).toHaveLength(69);
  });
});
