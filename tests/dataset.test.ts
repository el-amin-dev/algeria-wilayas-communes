/**
 * Ground truth for the dataset, asserted against the GENERATED constants — the
 * session-2 accessors do not exist yet. When they land, these same assertions
 * are re-run through the public API.
 *
 * Every number below is a MEASURED property of this checkout, hard-coded as a
 * literal. Nothing here is computed from the data it is checking: a test that
 * derives its expectation from its subject proves only that the subject equals
 * itself.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { WILAYA_CODES } from "../packages/js/src/generated/codes";
import { COMMUNES, COMMUNES_MISSING_POSTAL_CODE } from "../packages/js/src/generated/communes";
import { DAIRAS } from "../packages/js/src/generated/dairas";
import {
  COMMUNE_COUNT,
  DAIRA_COUNT,
  DATA_VERSION,
  LAST_VERIFIED,
  MISSING_POSTAL_CODE_COUNT,
  POSTAL_CODE_COUNT,
  SOURCE_LAW,
  WILAYA_COUNT,
} from "../packages/js/src/generated/meta";
import { WILAYAS } from "../packages/js/src/generated/wilayas";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** `1..69`, written out independently of the dataset. */
const EXPECTED_WILAYA_CODES: number[] = Array.from({ length: 69 }, (_, i) => i + 1);

// ─────────────────────────────────────────────────────────────────────────────

describe("counts", () => {
  it("has 69 wilayas, 591 daïras and 1541 communes", () => {
    expect(WILAYAS).toHaveLength(69);
    expect(DAIRAS).toHaveLength(591);
    expect(COMMUNES).toHaveLength(1541);
  });

  it("sums the denormalized counters back to the record counts", () => {
    expect(WILAYAS.reduce((n, w) => n + w.communeCount, 0)).toBe(1541);
    expect(WILAYAS.reduce((n, w) => n + w.dairaCount, 0)).toBe(591);
    expect(DAIRAS.reduce((n, d) => n + d.communeCount, 0)).toBe(1541);
  });

  it("has contiguous wilaya codes 1..69 in document order", () => {
    expect(WILAYAS.map((w) => w.code)).toEqual(EXPECTED_WILAYA_CODES);
    expect(WILAYA_CODES).toHaveLength(69);
    expect([...WILAYA_CODES]).toEqual(EXPECTED_WILAYA_CODES);
  });
});

describe("postal codes", () => {
  it("has 27 missing and 1514 present", () => {
    expect(COMMUNES.filter((c) => c.postalCode === null)).toHaveLength(27);
    expect(COMMUNES.filter((c) => c.postalCode !== null)).toHaveLength(1514);
  });

  it("has zero malformed codes — every non-null value is exactly five digits", () => {
    const malformed = COMMUNES.filter(
      (c) => c.postalCode !== null && !/^\d{5}$/.test(c.postalCode),
    ).map((c) => `${c.id}: ${JSON.stringify(c.postalCode)}`);
    expect(malformed).toEqual([]);
  });

  it("has 1471 distinct codes, so 38 codes are shared by more than one commune", () => {
    const distinct = new Set<string>();
    const occurrences = new Map<string, number>();
    for (const c of COMMUNES) {
      if (c.postalCode === null) continue;
      distinct.add(c.postalCode);
      occurrences.set(c.postalCode, (occurrences.get(c.postalCode) ?? 0) + 1);
    }
    expect(distinct.size).toBe(1471);
    expect([...occurrences.values()].filter((n) => n > 1)).toHaveLength(38);
  });

  it("lists exactly the 27 communes with no postal code, in both directions", () => {
    // The 27 CANNOT be filled — no available source has them. They ship as
    // `null` behind an exported array rather than being guessed. Never invent
    // a record: one fabricated postal code ends the package's credibility.
    expect(COMMUNES_MISSING_POSTAL_CODE).toHaveLength(27);
    const missing = new Set<string>(COMMUNES_MISSING_POSTAL_CODE);
    expect(missing.size).toBe(27);

    // Forward: every null-postal-code commune is listed.
    const unlisted = COMMUNES.filter((c) => c.postalCode === null && !missing.has(c.id)).map(
      (c) => c.id,
    );
    expect(unlisted).toEqual([]);

    // Reverse: every listed id belongs to a commune whose postalCode is null.
    const byId = new Map<string, (typeof COMMUNES)[number]>();
    for (const c of COMMUNES) byId.set(c.id, c);
    const wrong: string[] = [];
    for (const id of COMMUNES_MISSING_POSTAL_CODE) {
      const commune = byId.get(id);
      if (commune === undefined) wrong.push(`${id}: no such commune`);
      else if (commune.postalCode !== null) wrong.push(`${id}: has ${String(commune.postalCode)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("agrees with the two metadata counters in data/algeria.json", () => {
    // `scripts/validate.py` never checks these two — they can drift away from
    // the records they describe and CI stays green.
    interface AlgeriaCounters {
      codes_postaux_renseignes: number;
      codes_postaux_manquants: number;
    }
    const src = JSON.parse(
      readFileSync(`${REPO_ROOT}data/algeria.json`, "utf8"),
    ) as AlgeriaCounters;
    expect(src.codes_postaux_renseignes).toBe(1514);
    expect(src.codes_postaux_manquants).toBe(27);
    expect(src.codes_postaux_renseignes + src.codes_postaux_manquants).toBe(COMMUNES.length);
  });
});

describe("uniqueness", () => {
  it("mints 591 unique daira ids and 1541 unique commune ids", () => {
    expect(new Set<string>(DAIRAS.map((d) => d.id)).size).toBe(591);
    expect(new Set<string>(COMMUNES.map((c) => c.id)).size).toBe(1541);
  });

  it("has unique (wilaya, name) composite keys — this is what makes the ids safe", () => {
    expect(new Set<string>(COMMUNES.map((c) => `${c.wilaya}|${c.name.fr}`)).size).toBe(1541);
    expect(new Set<string>(DAIRAS.map((d) => `${d.wilaya}|${d.name.fr}`)).size).toBe(591);
  });

  it("does NOT have unique bare names — 38 commune names repeat across wilayas", () => {
    // The other direction matters just as much: if bare names became unique,
    // the wilaya prefix in the ids would look redundant and someone would drop
    // it. It is not redundant.
    const occurrences = new Map<string, number>();
    for (const c of COMMUNES) occurrences.set(c.name.fr, (occurrences.get(c.name.fr) ?? 0) + 1);
    expect([...occurrences.values()].filter((n) => n > 1)).toHaveLength(38);
  });

  it("has 545 distinct daira names for 591 daïras", () => {
    expect(new Set<string>(DAIRAS.map((d) => d.name.fr)).size).toBe(545);
  });

  it("pins the duplicated commune names by wilaya — a count alone misses a swap", () => {
    expect(
      COMMUNES.filter((c) => c.name.fr === "Sidi Ameur")
        .map((c) => c.wilaya)
        .sort((a, b) => a - b),
    ).toEqual([32, 64]);
    expect(
      COMMUNES.filter((c) => c.name.fr === "Souk El Had")
        .map((c) => c.wilaya)
        .sort((a, b) => a - b),
    ).toEqual([35, 48]);
  });
});

describe("names", () => {
  it("has a non-empty Arabic name on every wilaya, daira and commune", () => {
    expect(WILAYAS.filter((w) => w.name.ar.trim().length === 0)).toEqual([]);
    expect(DAIRAS.filter((d) => d.name.ar.trim().length === 0).map((d) => d.id)).toEqual([]);
    expect(COMMUNES.filter((c) => c.name.ar.trim().length === 0).map((c) => c.id)).toEqual([]);
  });

  it("has exactly ONE English exonym in the whole dataset: Alger → Algiers", () => {
    // `en` is generated as `override ?? nom_fr` from a ONE-ENTRY override
    // table (`data/raw/en-overrides.json`). That is exactly the kind of thing
    // that drifts silently — a second override slips in, or the existing one
    // is lost. Pinning the count is not enough; this pins WHICH record it is.
    //
    // If this ever fails, the change may well be correct — but a human must
    // look at it and update the literal deliberately.
    expect([
      ...WILAYAS.filter((w) => w.name.en !== w.name.fr).map((w) => w.name.fr),
      ...DAIRAS.filter((d) => d.name.en !== d.name.fr).map((d) => d.name.fr),
      ...COMMUNES.filter((c) => c.name.en !== c.name.fr).map((c) => c.name.fr),
    ]).toEqual(["Alger"]);

    const alger = WILAYAS.find((w) => w.code === 16);
    if (alger === undefined) throw new Error("wilaya 16 is missing");
    expect(alger.name.fr).toBe("Alger");
    expect(alger.name.en).toBe("Algiers");
  });
});

describe("provenance", () => {
  it("exports the source law verbatim", () => {
    expect(SOURCE_LAW).toBe("Loi 26-06 du 4 avril 2026, JO n°25");
  });

  it("exports LAST_VERIFIED as an ISO date STRING, not a Date", () => {
    expect(typeof LAST_VERIFIED).toBe("string");
    expect(LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("exports a data version", () => {
    expect(DATA_VERSION).toBeTruthy();
    expect(typeof DATA_VERSION).toBe("string");
  });

  it("exports the five count constants, and they agree with the arrays", () => {
    expect(WILAYA_COUNT).toBe(69);
    expect(DAIRA_COUNT).toBe(591);
    expect(COMMUNE_COUNT).toBe(1541);
    expect(POSTAL_CODE_COUNT).toBe(1514);
    expect(MISSING_POSTAL_CODE_COUNT).toBe(27);

    expect(WILAYA_COUNT).toBe(WILAYAS.length);
    expect(DAIRA_COUNT).toBe(DAIRAS.length);
    expect(COMMUNE_COUNT).toBe(COMMUNES.length);
    expect(MISSING_POSTAL_CODE_COUNT).toBe(COMMUNES_MISSING_POSTAL_CODE.length);
    expect(POSTAL_CODE_COUNT + MISSING_POSTAL_CODE_COUNT).toBe(1541);
  });
});

describe("referential integrity", () => {
  it("resolves every commune's daira to a real daira", () => {
    const dairaIds = new Set<string>(DAIRAS.map((d) => d.id));
    const orphans = COMMUNES.filter((c) => !dairaIds.has(c.daira)).map(
      (c) => `${c.id} -> ${c.daira}`,
    );
    expect(orphans).toEqual([]);
  });

  it("resolves every wilaya reference to a known wilaya code", () => {
    const codes = new Set<number>(WILAYA_CODES);
    expect(DAIRAS.filter((d) => !codes.has(d.wilaya)).map((d) => d.id)).toEqual([]);
    expect(COMMUNES.filter((c) => !codes.has(c.wilaya)).map((c) => c.id)).toEqual([]);
  });

  it("nests every commune id under its daira id", () => {
    const bad = COMMUNES.filter((c) => !c.id.startsWith(`${c.daira}-`)).map(
      (c) => `${c.id} is not under ${c.daira}`,
    );
    expect(bad).toEqual([]);
  });

  it("agrees between a daira's wilaya and its communes' wilaya", () => {
    const dairaWilaya = new Map<string, number>();
    for (const d of DAIRAS) dairaWilaya.set(d.id, d.wilaya);
    const bad = COMMUNES.filter((c) => dairaWilaya.get(c.daira) !== c.wilaya).map((c) => c.id);
    expect(bad).toEqual([]);
  });
});

describe("record shape — no denormalized parent names leaked in", () => {
  // The whole point of the generated layer is that a commune carries NO
  // wilaya_fr / wilaya_en / wilaya_ar / daira_* copies; session 2's accessors
  // join on `wilaya` and `daira` instead. That removal is what buys the
  // −28% / −41% gzip win, so the key sets are pinned exactly.

  it("a wilaya has exactly code, name, dairaCount, communeCount", () => {
    const w = WILAYAS.find((x) => x.code === 16);
    if (w === undefined) throw new Error("wilaya 16 is missing");
    expect(Object.keys(w)).toEqual(["code", "name", "dairaCount", "communeCount"]);
    expect(Object.keys(w.name)).toEqual(["ar", "fr", "en"]);
    expect(typeof w.code).toBe("number");
  });

  it("a daira has exactly id, wilaya, name, communeCount", () => {
    const d = DAIRAS.find((x) => x.wilaya === 16);
    if (d === undefined) throw new Error("no daira in wilaya 16");
    expect(Object.keys(d)).toEqual(["id", "wilaya", "name", "communeCount"]);
    expect(Object.keys(d.name)).toEqual(["ar", "fr", "en"]);
  });

  it("a commune has exactly id, wilaya, daira, name, postalCode", () => {
    const c = COMMUNES.find((x) => x.wilaya === 16);
    if (c === undefined) throw new Error("no commune in wilaya 16");
    expect(Object.keys(c)).toEqual(["id", "wilaya", "daira", "name", "postalCode"]);
    expect(Object.keys(c.name)).toEqual(["ar", "fr", "en"]);
  });
});
