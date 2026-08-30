/**
 * `data/*.json` is a FROZEN PUBLIC CONTRACT (decision D1). It is consumed over
 * jsDelivr, by `jq` one-liners, and by the Python and Java examples in the root
 * README. These tests pin its bytes, its key order and its agreement with
 * `data/algeria.json` — the hand-edited source of truth.
 *
 * They also close the biggest hole in `scripts/validate.py`: that script checks
 * the derived files by COUNT only and **never opens `data/dairas.json` at all**,
 * so that 142,867-byte file could be empty, stale or truncated and CI would stay
 * green. Everything below is a field-by-field cross-check that nothing else in
 * the repo performs.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ── Locations ───────────────────────────────────────────────────────────────
// Resolved from `import.meta.url`, never from `process.cwd()`, so the suite is
// location-independent.

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function readRaw(rel: string): string {
  return readFileSync(`${REPO_ROOT}${rel}`, "utf8");
}

function readJson<T>(rel: string): T {
  return JSON.parse(readRaw(rel)) as T;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

interface SourceCommune {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

interface SourceDaira {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  communes: SourceCommune[];
  nb_communes: number;
}

interface SourceWilaya {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
  dairas: SourceDaira[];
}

interface Algeria {
  langues: string[];
  nb_wilayas: number;
  nb_dairas: number;
  nb_communes: number;
  codes_postaux_renseignes: number;
  codes_postaux_manquants: number;
  wilayas: SourceWilaya[];
}

interface FlatWilayaRow {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
}

interface FlatDairaRow {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_fr: string;
  wilaya_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_communes: number;
}

interface FlatCommuneRow {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_ar: string;
  wilaya_fr: string;
  wilaya_en: string;
  daira_ar: string;
  daira_fr: string;
  daira_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

interface WilayasFile {
  langues: string[];
  nb_wilayas: number;
  wilayas: FlatWilayaRow[];
}

interface DairasFile {
  nb_dairas: number;
  dairas: FlatDairaRow[];
}

interface CommunesFile {
  nb_communes: number;
  communes: FlatCommuneRow[];
}

// ── The 72 generated files ──────────────────────────────────────────────────
// 3 flat files + 69 per-wilaya files. `data/algeria.json` is NOT in this list:
// it is hand-edited input, not generator output.

const BY_WILAYA_FILES: string[] = Array.from(
  { length: 69 },
  (_, i) => `by-wilaya/${String(i + 1).padStart(2, "0")}.json`,
);

const GENERATED_DATA_FILES: string[] = [
  "wilayas.json",
  "dairas.json",
  "communes.json",
  ...BY_WILAYA_FILES,
];

// ── Parsed once, at module scope ────────────────────────────────────────────

const algeria = readJson<Algeria>("data/algeria.json");
const wilayasFile = readJson<WilayasFile>("data/wilayas.json");
const dairasFile = readJson<DairasFile>("data/dairas.json");
const communesFile = readJson<CommunesFile>("data/communes.json");
const byWilayaFiles: SourceWilaya[] = BY_WILAYA_FILES.map((rel) =>
  readJson<SourceWilaya>(`data/${rel}`),
);

/** The nested tree, flattened in document order — the expectation for every
 *  flat file. Wilayas 1→69, daïras in array order, communes in array order.
 *  No sorting, ever. */
const expectedDairaRows: { wilaya: SourceWilaya; daira: SourceDaira }[] = [];
const expectedCommuneRows: {
  wilaya: SourceWilaya;
  daira: SourceDaira;
  commune: SourceCommune;
}[] = [];

for (const wilaya of algeria.wilayas) {
  for (const daira of wilaya.dairas) {
    expectedDairaRows.push({ wilaya, daira });
    for (const commune of daira.communes) {
      expectedCommuneRows.push({ wilaya, daira, commune });
    }
  }
}

describe("data/ file inventory", () => {
  it("covers exactly the 72 generated files", () => {
    expect(GENERATED_DATA_FILES).toHaveLength(72);
    expect(BY_WILAYA_FILES).toHaveLength(69);
    expect(BY_WILAYA_FILES[0]).toBe("by-wilaya/01.json");
    expect(BY_WILAYA_FILES[68]).toBe("by-wilaya/69.json");
  });
});

// ── (a) Byte-identity round-trip ────────────────────────────────────────────
// The property `scripts/build-data.ts` must satisfy. Testing it in-process
// (~40 ms) beats waiting for a CI `git diff --exit-code data/` (~40 s), and it
// forces every one of the 72 files to actually be opened and parsed — including
// `dairas.json`, which `scripts/validate.py` never reads.

describe("byte-identity round-trip", () => {
  it.each(GENERATED_DATA_FILES)(
    "data/%s round-trips through JSON.stringify byte-for-byte",
    (rel) => {
      const raw = readRaw(`data/${rel}`);
      expect(JSON.stringify(JSON.parse(raw), null, 2) + "\n").toBe(raw);
    },
  );

  // (d) Exactly one trailing newline — not zero, not two.
  it.each(GENERATED_DATA_FILES)("data/%s ends with exactly one newline", (rel) => {
    const raw = readRaw(`data/${rel}`);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
  });
});

// ── (b) Frozen key order ────────────────────────────────────────────────────

describe("frozen key order", () => {
  it("data/algeria.json top-level keys are in the frozen order", () => {
    expect(Object.keys(algeria)).toEqual([
      "pays",
      "langues",
      "reforme",
      "hierarchie",
      "nb_wilayas",
      "nb_dairas",
      "nb_communes",
      "codes_postaux_renseignes",
      "codes_postaux_manquants",
      "note_daira",
      "sources",
      "wilayas",
    ]);
  });

  it("data/wilayas.json rows keep their key order", () => {
    expect(Object.keys(wilayasFile)).toEqual(["langues", "nb_wilayas", "wilayas"]);
    const row = wilayasFile.wilayas[0];
    if (row === undefined) throw new Error("data/wilayas.json has no rows");
    expect(Object.keys(row)).toEqual([
      "wilaya_num",
      "code",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_dairas",
      "nb_communes",
    ]);
  });

  it("data/dairas.json rows have NO wilaya_ar", () => {
    expect(Object.keys(dairasFile)).toEqual(["nb_dairas", "dairas"]);
    const row = dairasFile.dairas[0];
    if (row === undefined) throw new Error("data/dairas.json has no rows");
    expect(Object.keys(row)).toEqual([
      "wilaya_num",
      "wilaya_code",
      "wilaya_fr",
      "wilaya_en",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_communes",
    ]);
    // NOTE: no `wilaya_ar`. FROZEN AND DELIBERATE. It is almost certainly an
    // oversight in the original jq filter, but `data/*.json` is a published
    // contract — adding the field changes what every CDN consumer receives.
    // Recorded as a candidate v3 (major) data break, never a silent fix.
  });

  it("data/communes.json rows DO have wilaya_ar", () => {
    expect(Object.keys(communesFile)).toEqual(["nb_communes", "communes"]);
    const row = communesFile.communes[0];
    if (row === undefined) throw new Error("data/communes.json has no rows");
    expect(Object.keys(row)).toEqual([
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
    // NOTE: HAS `wilaya_ar`, unlike dairas.json above. The asymmetry between
    // the two files is FROZEN AND DELIBERATE — reproduce it, do not fix it.
  });

  it("data/by-wilaya/16.json orders nb_communes AFTER communes", () => {
    const w16 = readJson<SourceWilaya>("data/by-wilaya/16.json");
    expect(Object.keys(w16)).toEqual([
      "wilaya_num",
      "code",
      "nom_ar",
      "nom_fr",
      "nom_en",
      "nb_dairas",
      "nb_communes",
      "dairas",
    ]);
    const daira = w16.dairas[0];
    if (daira === undefined) throw new Error("data/by-wilaya/16.json has no dairas");
    expect(Object.keys(daira)).toEqual(["nom_ar", "nom_fr", "nom_en", "communes", "nb_communes"]);
    // `nb_communes` LAST, after the `communes` array. FROZEN AND DELIBERATE.
    // It is unusual and very easy to "tidy up" by accident; doing so changes
    // 69 files and fails the byte-identity gate.
    const commune = daira.communes[0];
    if (commune === undefined) throw new Error("daira 0 of wilaya 16 has no communes");
    expect(Object.keys(commune)).toEqual(["nom_ar", "nom_fr", "nom_en", "code_postal"]);
  });
});

// ── (c) The field-by-field cross-check nothing performs today ───────────────
// `scripts/validate.py` checks the derived files by COUNT only. A flat file
// could carry a stale `wilaya_fr` for a renamed wilaya, or be truncated, and
// nothing would notice. Mismatches are accumulated and reported together so a
// failure names every offending record rather than only the first.

describe("flat files cross-checked field-by-field against data/algeria.json", () => {
  it("data/wilayas.json header and record count", () => {
    expect(wilayasFile.langues).toEqual(["ar", "fr", "en"]);
    expect(wilayasFile.nb_wilayas).toBe(69);
    expect(wilayasFile.wilayas).toHaveLength(69);
  });

  it("data/dairas.json header and record count", () => {
    expect(dairasFile.nb_dairas).toBe(591);
    expect(dairasFile.dairas).toHaveLength(591);
  });

  it("data/communes.json header and record count", () => {
    expect(communesFile.nb_communes).toBe(1541);
    expect(communesFile.communes).toHaveLength(1541);
  });

  it("every one of the 69 wilaya rows matches the nested source", () => {
    const mismatches: string[] = [];
    for (let i = 0; i < 69; i++) {
      const row = wilayasFile.wilayas[i];
      const src = algeria.wilayas[i];
      if (row === undefined || src === undefined) {
        mismatches.push(`index ${i}: missing record`);
        continue;
      }
      // Name equality first: the flat file is a positional projection of the
      // nested tree, so comparing names catches a silent REORDER, which a
      // pure count check cannot.
      if (row.nom_fr !== src.nom_fr) {
        mismatches.push(`index ${i}: nom_fr "${row.nom_fr}" !== "${src.nom_fr}" (reordered?)`);
        continue;
      }
      const expected: FlatWilayaRow = {
        wilaya_num: src.wilaya_num,
        code: src.code,
        nom_ar: src.nom_ar,
        nom_fr: src.nom_fr,
        nom_en: src.nom_en,
        nb_dairas: src.nb_dairas,
        nb_communes: src.nb_communes,
      };
      for (const key of Object.keys(expected) as (keyof FlatWilayaRow)[]) {
        if (row[key] !== expected[key]) {
          const got = JSON.stringify(row[key]);
          const want = JSON.stringify(expected[key]);
          mismatches.push(`wilaya ${src.wilaya_num}: ${key} = ${got}, expected ${want}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every one of the 591 daira rows matches the nested source", () => {
    expect(expectedDairaRows).toHaveLength(591);
    const mismatches: string[] = [];
    for (let i = 0; i < 591; i++) {
      const row = dairasFile.dairas[i];
      const src = expectedDairaRows[i];
      if (row === undefined || src === undefined) {
        mismatches.push(`index ${i}: missing record`);
        continue;
      }
      if (row.nom_fr !== src.daira.nom_fr) {
        mismatches.push(
          `index ${i}: nom_fr "${row.nom_fr}" !== "${src.daira.nom_fr}" (reordered?)`,
        );
        continue;
      }
      const expected: FlatDairaRow = {
        wilaya_num: src.wilaya.wilaya_num,
        wilaya_code: src.wilaya.code,
        wilaya_fr: src.wilaya.nom_fr,
        wilaya_en: src.wilaya.nom_en,
        nom_ar: src.daira.nom_ar,
        nom_fr: src.daira.nom_fr,
        nom_en: src.daira.nom_en,
        nb_communes: src.daira.nb_communes,
      };
      const where = `daira ${src.wilaya.wilaya_num}/${src.daira.nom_fr}`;
      for (const key of Object.keys(expected) as (keyof FlatDairaRow)[]) {
        if (row[key] !== expected[key]) {
          const got = JSON.stringify(row[key]);
          const want = JSON.stringify(expected[key]);
          mismatches.push(`${where}: ${key} = ${got}, expected ${want}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every one of the 1541 commune rows matches the nested source", () => {
    expect(expectedCommuneRows).toHaveLength(1541);
    const mismatches: string[] = [];
    for (let i = 0; i < 1541; i++) {
      const row = communesFile.communes[i];
      const src = expectedCommuneRows[i];
      if (row === undefined || src === undefined) {
        mismatches.push(`index ${i}: missing record`);
        continue;
      }
      if (row.nom_fr !== src.commune.nom_fr) {
        mismatches.push(
          `index ${i}: nom_fr "${row.nom_fr}" !== "${src.commune.nom_fr}" (reordered?)`,
        );
        continue;
      }
      const expected: FlatCommuneRow = {
        wilaya_num: src.wilaya.wilaya_num,
        wilaya_code: src.wilaya.code,
        wilaya_ar: src.wilaya.nom_ar,
        wilaya_fr: src.wilaya.nom_fr,
        wilaya_en: src.wilaya.nom_en,
        daira_ar: src.daira.nom_ar,
        daira_fr: src.daira.nom_fr,
        daira_en: src.daira.nom_en,
        nom_ar: src.commune.nom_ar,
        nom_fr: src.commune.nom_fr,
        nom_en: src.commune.nom_en,
        code_postal: src.commune.code_postal,
      };
      const where = `commune ${src.wilaya.wilaya_num}/${src.daira.nom_fr}/${src.commune.nom_fr}`;
      for (const key of Object.keys(expected) as (keyof FlatCommuneRow)[]) {
        if (row[key] !== expected[key]) {
          const got = JSON.stringify(row[key]);
          const want = JSON.stringify(expected[key]);
          mismatches.push(`${where}: ${key} = ${got}, expected ${want}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("per-wilaya files mirror data/algeria.json exactly", () => {
  it("there are 69 of them", () => {
    expect(byWilayaFiles).toHaveLength(69);
  });

  it.each(BY_WILAYA_FILES)("data/%s deep-equals its element of algeria.json.wilayas[]", (rel) => {
    const index = BY_WILAYA_FILES.indexOf(rel);
    const file = byWilayaFiles[index];
    const src = algeria.wilayas[index];
    if (file === undefined || src === undefined) {
      throw new Error(`no record for data/${rel} at index ${index}`);
    }
    // A per-wilaya file's ROOT is the wilaya object itself — no wrapper key,
    // no {"wilaya": …} envelope. Key order is covered by the frozen key-order
    // tests and by the byte-identity round-trip above, so toEqual is enough.
    expect(file).toEqual(src);
    expect(file.wilaya_num).toBe(index + 1);
    expect(file.code).toBe(String(index + 1).padStart(2, "0"));
  });
});
