/**
 * **This file is the v1 contract. A failure here is a breaking change, not a
 * flaky test.**
 *
 * ── What this file is ───────────────────────────────────────────────────────
 *
 * `packages/js/README.md` is the only documentation v1 consumers ever read. It
 * is 64 lines long, and every one of its claims is an unversioned promise that
 * somebody has already copy-pasted into a running application. This file is
 * that README, transcribed into assertions: one per snippet line, one per
 * `## API` table row, one per `## Notes` bullet, and one each for the
 * `## Source & contributing` and `## License` sections.
 *
 * The point is temporal. Session 6 rewrites that README for v2. The moment it
 * does, the old promises stop being written down anywhere — and a promise that
 * is not written down is a promise that gets dropped by accident, in a
 * "cleanup" commit, with a green CI. Keeping them here, as executable
 * assertions against the shipped code, is what makes that rewrite safe: the
 * README may change, the behaviour it described may not.
 *
 * ── Why against `/legacy`, and only partly against the root ─────────────────
 *
 * Under decision D5 / ADR-001 the root entry is **pure v2** and
 * `algeria-wilayas-communes/legacy` is **pure v1**. So the exact v1 contract
 * lives at `/legacy`, and that is what the bulk of this file exercises. Only
 * two of the seven v1 names survive at the root as deprecated shims — `getAll`
 * and `findCommune`, the two that do not collide with a v2 export (ADR-002) —
 * so those two are asserted against **both** entry points, to pin that the
 * shim and the implementation can never drift.
 *
 * ── Field names are the whole point ─────────────────────────────────────────
 *
 * Every record below is checked through **snake_case French keys** — `nom_fr`,
 * `nom_ar`, `nom_en`, `code_postal`, `wilaya_num`, `nb_communes` — and never
 * through v2's `name.fr` / `postalCode`. If these assertions could be satisfied
 * by a v2-shaped record, the legacy layer would not exist.
 *
 * ── Types ───────────────────────────────────────────────────────────────────
 *
 * The README's "Full TypeScript types are bundled" sentence cannot be checked
 * at run time: `verbatimModuleSyntax` + `export type` means the names are
 * erased before this module loads. They are checked at **compile** time
 * instead, by annotating real values with them — so `pnpm typecheck` is the
 * gate for that section, and pretending otherwise with a runtime `expect`
 * would be theatre.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findCommune as rootFindCommune, getAll as rootGetAll } from "../../packages/js/src/index";
import {
  byWilaya,
  findByPostalCode,
  findCommune,
  getAll,
  getCommunes,
  getDairas,
  getWilayas,
} from "../../packages/js/src/legacy/index";

import type { WilayaNum } from "../../packages/js/src/legacy/index";
import type {
  Algeria,
  Commune,
  CommuneFlat,
  Country,
  Daira,
  DairaFlat,
  Wilaya,
  WilayaFlat,
} from "../../packages/js/src/legacy/index";
import type {
  Algeria as RootAlgeria,
  CommuneFlat as RootCommuneFlat,
  Country as RootCountry,
  DairaFlat as RootDairaFlat,
  V1Commune,
  V1Daira,
  V1Wilaya,
  WilayaFlat as RootWilayaFlat,
} from "../../packages/js/src/index";

// ── Locations ───────────────────────────────────────────────────────────────
// Resolved from `import.meta.url`, never from `process.cwd()`, so the suite is
// location-independent. Two levels up, because this file sits in a subdirectory.

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The first element of an array, without a `!`.
 *
 * `noUncheckedIndexedAccess` is on, so `arr[0]` is `T | undefined`. Throwing on
 * an empty array is the honest narrowing: if the array is empty the test has
 * already failed, and it should say so at the line that made the assumption.
 */
function first<T>(items: readonly T[], what: string): T {
  const head = items[0];
  if (head === undefined) throw new Error(`expected at least one ${what}`);
  return head;
}

/**
 * `byWilaya` with its argument widened to `number | string`.
 *
 * The real signature is a literal union (`1..69` and their string forms), so
 * `byWilaya(70)` is a deliberate **compile error** for TypeScript users. The
 * README nonetheless documents the runtime behaviour — "or `undefined`" — and
 * JavaScript users still reach it, so it has to be tested. This is the narrow,
 * single-purpose escape hatch for that; there is no `any` and no `!` anywhere
 * in this file.
 */
const byWilayaLoose = byWilaya as (num: number | string) => Wilaya | undefined;

// ── `# algeria-wilayas-communes` — the headline ──────────────────────────────
//
// Line 3 of the README: "69 wilayas, 591 daïras, 1541 communes (2025/2026
// reform, Loi 26-06) with Arabic / French / English names and postal codes",
// and the `npm install algeria-wilayas-communes` line above the fold.

describe("README `# algeria-wilayas-communes` — the headline", () => {
  it("installs under the name the README tells people to install", () => {
    const pkg = JSON.parse(readFileSync(`${REPO_ROOT}packages/js/package.json`, "utf8")) as Record<
      string,
      unknown
    >;
    expect(pkg.name).toBe("algeria-wilayas-communes");
  });

  it("ships 69 wilayas, 591 daïras and 1541 communes", () => {
    expect(getWilayas()).toHaveLength(69);
    expect(getDairas()).toHaveLength(591);
    expect(getCommunes()).toHaveLength(1541);
  });

  it("carries Arabic / French / English names on every record", () => {
    for (const w of getWilayas()) {
      expect(typeof w.nom_ar).toBe("string");
      expect(typeof w.nom_fr).toBe("string");
      expect(typeof w.nom_en).toBe("string");
    }
    for (const d of getDairas()) {
      expect(typeof d.nom_ar).toBe("string");
      expect(typeof d.nom_fr).toBe("string");
      expect(typeof d.nom_en).toBe("string");
    }
    for (const c of getCommunes()) {
      expect(typeof c.nom_ar).toBe("string");
      expect(typeof c.nom_fr).toBe("string");
      expect(typeof c.nom_en).toBe("string");
    }
  });

  it("carries postal codes — `string` or an explicit `null`, never `undefined`", () => {
    for (const c of getCommunes()) {
      expect(c.code_postal === null || typeof c.code_postal === "string").toBe(true);
    }
    expect(getCommunes().some((c) => typeof c.code_postal === "string")).toBe(true);
  });

  it("declares the 2025/2026 reform in the document header", () => {
    // `getAll().reforme` is one of the six top-level keys v1's `[key: string]:
    // unknown` index signature silently swallowed. Reading it through the
    // legacy surface proves the header survived the reprojection.
    expect(getAll().reforme).toBeDefined();
    expect(JSON.stringify(getAll().reforme)).toContain("26-06");
  });
});

// ── `## Usage`, snippet 1 — the seven-name ESM import ────────────────────────
//
// ```js
// import { getAll, getWilayas, getDairas, getCommunes,
//          byWilaya, findByPostalCode, findCommune } from "algeria-wilayas-communes";
//
// getWilayas().length;                 // 69
// getCommunes().length;                // 1541
// byWilaya(16).nom_en;                 // "Algiers"
// findByPostalCode("16000");           // [ { nom_fr: "Alger Centre", ... } ]
// findCommune("adrar");                // communes whose French name contains "adrar"
// getAll();                            // full nested tree: wilaya > daira > commune
// ```

describe("README `## Usage` snippet 1 — through `/legacy`, the exact v1 contract", () => {
  it("imports all seven names and every one is a function", () => {
    // The import at the top of this file IS the assertion — a missing export is
    // an ESM link-time failure, not a runtime one, so the file would not load
    // at all. This re-states it so a reader sees the seven names in one place.
    expect(typeof getAll).toBe("function");
    expect(typeof getWilayas).toBe("function");
    expect(typeof getDairas).toBe("function");
    expect(typeof getCommunes).toBe("function");
    expect(typeof byWilaya).toBe("function");
    expect(typeof findByPostalCode).toBe("function");
    expect(typeof findCommune).toBe("function");
  });

  it("`getWilayas().length` → 69", () => {
    expect(getWilayas().length).toBe(69);
  });

  it("`getDairas().length` → 591", () => {
    expect(getDairas().length).toBe(591);
  });

  it("`getCommunes().length` → 1541", () => {
    expect(getCommunes().length).toBe(1541);
  });

  it('`byWilaya(16).nom_en` → "Algiers", with 15 daïras and 57 communes', () => {
    expect(byWilaya(16)?.nom_en).toBe("Algiers");
    expect(byWilaya(16)?.nb_dairas).toBe(15);
    expect(byWilaya(16)?.nb_communes).toBe(57);
  });

  it('`findByPostalCode("16000")` → 1 record, nom_fr "Alger Centre"', () => {
    expect(findByPostalCode("16000")).toHaveLength(1);
    expect(findByPostalCode("16000")[0]?.nom_fr).toBe("Alger Centre");
  });

  it('`findCommune("adrar")` → 1 record, nom_fr "Adrar"', () => {
    expect(findCommune("adrar")).toHaveLength(1);
    expect(findCommune("adrar")[0]?.nom_fr).toBe("Adrar");
  });

  it("`findCommune(q)` → every result's `nom_fr` contains the query", () => {
    expect(findCommune("adrar").every((c) => c.nom_fr.toLowerCase().includes("adrar"))).toBe(true);
  });

  it("`getAll()` → the full nested tree, wilaya > daïra > commune", () => {
    const all = getAll();
    expect(all.nb_wilayas).toBe(69);
    expect(all.nb_dairas).toBe(591);
    expect(all.nb_communes).toBe(1541);
    expect(all.wilayas).toHaveLength(69);

    const w = first(all.wilayas, "wilaya");
    expect(Array.isArray(w.dairas)).toBe(true);
    const d = first(w.dairas, "daïra");
    expect(Array.isArray(d.communes)).toBe(true);
    const c = first(d.communes, "commune");
    // snake_case French keys at every depth — NOT `name.fr` / `postalCode`.
    expect(typeof c.nom_fr).toBe("string");
    expect(c).not.toHaveProperty("name");
    expect(c).not.toHaveProperty("postalCode");
  });
});

// ── `## Usage` snippet 1 — the two names the ROOT still carries ──────────────
//
// ADR-002: only `getAll` and `findCommune` have no v2 counterpart at the root,
// so only those two can be shimmed there. The other five belong to v2 at the
// root and live unaliased at `/legacy`. Both shims must be the SAME v1
// behaviour, not a re-implementation.

describe("README `## Usage` snippet 1 — the v1-only names at the package root", () => {
  it("`getAll()` from the root is the v1 document, identical to `/legacy`'s", () => {
    expect(rootGetAll()).toBe(getAll());
    expect(rootGetAll().nb_communes).toBe(1541);
    expect(rootGetAll().wilayas).toHaveLength(69);
  });

  it('`findCommune("adrar")` from the root returns the v1 rows', () => {
    expect(rootFindCommune("adrar")).toHaveLength(1);
    expect(rootFindCommune("adrar")[0]?.nom_fr).toBe("Adrar");
    expect(rootFindCommune("adrar")).toStrictEqual(findCommune("adrar"));
  });
});

// ── `## Usage`, snippet 2 — the CommonJS example ─────────────────────────────
//
// ```js
// const dz = require("algeria-wilayas-communes");
// dz.getWilayas().length; // 69
// ```
//
// Lives in `tests/compat/cjs.test.ts`, not here: it has to run from a real
// `.cjs` file in a child process, or the `"require"` condition of the exports
// map is never exercised. See that file for why it is currently skipped.

// ── `## API` — one assertion per table row ───────────────────────────────────

describe("README `## API` table", () => {
  it("row 1 — `getAll()` returns the full nested tree (wilaya → daïra → commune)", () => {
    const all = getAll();
    expect(all.pays.code_iso).toBe("DZ");
    expect(all.langues).toStrictEqual(["ar", "fr", "en"]);
    let dairas = 0;
    let communes = 0;
    for (const w of all.wilayas) {
      dairas += w.dairas.length;
      for (const d of w.dairas) communes += d.communes.length;
    }
    expect(dairas).toBe(591);
    expect(communes).toBe(1541);
  });

  it("row 2 — `getWilayas()` is a FLAT array of 69 wilayas (no `dairas` key)", () => {
    const wilayas = getWilayas();
    expect(wilayas).toHaveLength(69);
    for (const w of wilayas) {
      expect("dairas" in w).toBe(false);
      expect(typeof w.wilaya_num).toBe("number");
      expect(w.code).toBe(String(w.wilaya_num).padStart(2, "0"));
      expect(typeof w.nb_dairas).toBe("number");
      expect(typeof w.nb_communes).toBe("number");
    }
  });

  it("row 3 — `getDairas()` is 591 flat daïras, EACH WITH ITS WILAYA", () => {
    const dairas = getDairas();
    expect(dairas).toHaveLength(591);
    for (const d of dairas) {
      expect(typeof d.wilaya_num).toBe("number");
      expect(d.wilaya_code).toBe(String(d.wilaya_num).padStart(2, "0"));
      expect(typeof d.wilaya_fr).toBe("string");
      expect(d.wilaya_fr.length).toBeGreaterThan(0);
      expect(typeof d.wilaya_en).toBe("string");
      expect("communes" in d).toBe(false);
    }
    const d0 = first(dairas, "daïra");
    expect(d0.wilaya_num).toBe(1);
    expect(d0.wilaya_code).toBe("01");
    expect(d0.wilaya_fr).toBe("Adrar");
    expect(d0.nom_fr).toBe("Aoulef");
  });

  it("row 4 — `getCommunes()` is 1541 flat communes with wilaya + daïra + postal code", () => {
    const communes = getCommunes();
    expect(communes).toHaveLength(1541);
    for (const c of communes) {
      // wilaya context
      expect(typeof c.wilaya_num).toBe("number");
      expect(c.wilaya_code).toBe(String(c.wilaya_num).padStart(2, "0"));
      expect(typeof c.wilaya_ar).toBe("string");
      expect(typeof c.wilaya_fr).toBe("string");
      expect(typeof c.wilaya_en).toBe("string");
      // daïra context
      expect(typeof c.daira_ar).toBe("string");
      expect(typeof c.daira_fr).toBe("string");
      expect(typeof c.daira_en).toBe("string");
      // postal code — present as a key on every row, `null` where unpublished
      expect("code_postal" in c).toBe(true);
      expect(c.code_postal === null || typeof c.code_postal === "string").toBe(true);
    }
    const c0 = first(communes, "commune");
    expect(c0.wilaya_fr).toBe("Adrar");
    expect(c0.daira_fr).toBe("Aoulef");
    expect(c0.nom_fr).toBe("Timekten");
    expect(c0.code_postal).toBe("01041");
  });

  it("row 5 — `byWilaya(num)` returns one wilaya's full subtree for 1..69", () => {
    for (let n = 1; n <= 69; n++) {
      const w = byWilaya(n as WilayaNum);
      expect(w, `byWilaya(${n})`).toBeDefined();
      expect(w?.wilaya_num, `byWilaya(${n}).wilaya_num`).toBe(n);
      expect(w?.code, `byWilaya(${n}).code`).toBe(String(n).padStart(2, "0"));
      expect(w?.dairas.length, `byWilaya(${n}).dairas.length`).toBe(w?.nb_dairas);
      const communes = (w?.dairas ?? []).reduce((sum, d) => sum + d.communes.length, 0);
      expect(communes, `byWilaya(${n}) commune total`).toBe(w?.nb_communes);
    }
  });

  it("row 5 — `byWilaya(num)` is `undefined` outside 1..69, and never throws", () => {
    expect(byWilayaLoose(0)).toBeUndefined();
    expect(byWilayaLoose(70)).toBeUndefined();
    expect(byWilayaLoose(-1)).toBeUndefined();
    expect(byWilayaLoose(1000)).toBeUndefined();
    expect(byWilayaLoose("70")).toBeUndefined();
    // `String(num).padStart(2, "0")` is a no-op on a 3-character string, so the
    // lookup simply misses — exactly as v1's `by-wilaya/016.json` read did.
    expect(byWilayaLoose("016")).toBeUndefined();
    expect(byWilayaLoose("")).toBeUndefined();
    expect(byWilayaLoose("Alger")).toBeUndefined();
  });

  it("row 6 — `findByPostalCode(code)` returns the communes matching a 5-digit code", () => {
    const hits = findByPostalCode("16000");
    expect(hits).toHaveLength(1);
    for (const c of hits) expect(c.code_postal).toBe("16000");
    // A miss is an empty array, not `undefined` and not a throw.
    expect(findByPostalCode("99999")).toStrictEqual([]);
    // Every hit is a full CommuneFlat row, not a bare name.
    expect(first(hits, "hit").wilaya_fr).toBe("Alger");
  });

  it("row 7 — `findCommune(query)` is a CASE-INSENSITIVE `nom_fr` substring match", () => {
    expect(findCommune("ADRAR")).toStrictEqual(findCommune("adrar"));
    expect(findCommune("AdRaR")).toStrictEqual(findCommune("adrar"));
    // It searches `nom_fr` and nothing else: an Arabic name that exists in the
    // data must not match, or the function has been re-routed to v2's
    // multilingual `search()`.
    const arabicOnly = first(getCommunes(), "commune").nom_ar;
    expect(findCommune(arabicOnly)).toStrictEqual([]);
    // Unranked, unlimited, document order.
    const broad = findCommune("a");
    expect(broad.length).toBeGreaterThan(10);
    expect(broad).toStrictEqual(getCommunes().filter((c) => c.nom_fr.toLowerCase().includes("a")));
  });
});

// ── `## API` — "Full TypeScript types are bundled" ──────────────────────────
//
// > Full TypeScript types are bundled (`Wilaya`, `Daira`, `Commune`, and the
// > flat variants).
//
// All eight v1 names. They are ERASED at run time, so each one below is
// exercised as a TYPE — annotating a real value, or a literal checked with
// `satisfies`. `pnpm typecheck` is the gate; the `expect`s only keep the
// values live so `noUnusedLocals` stays meaningful.

describe("README `## API` — all eight v1 type names resolve", () => {
  it("from `/legacy`, UNALIASED — the exact v1 names", () => {
    const commune: Commune = {
      nom_ar: "الجزائر الوسطى",
      nom_fr: "Alger Centre",
      nom_en: "Alger Centre",
      code_postal: "16000",
    };
    const daira: Daira = {
      nom_ar: "سيدي امحمد",
      nom_fr: "Sidi M'Hamed",
      nom_en: "Sidi M'Hamed",
      nb_communes: 1,
      communes: [commune],
    };
    const wilaya: Wilaya = {
      wilaya_num: 16,
      code: "16",
      nom_ar: "الجزائر",
      nom_fr: "Alger",
      nom_en: "Algiers",
      nb_dairas: 1,
      nb_communes: 1,
      dairas: [daira],
    };
    const wilayaFlat: WilayaFlat = first(getWilayas(), "wilaya");
    const dairaFlat: DairaFlat = first(getDairas(), "daïra");
    const communeFlat: CommuneFlat = first(getCommunes(), "commune");
    const country: Country = getAll().pays;
    const algeria: Algeria = getAll();

    expect(commune.code_postal).toBe("16000");
    expect(daira.communes).toHaveLength(1);
    expect(wilaya.nom_en).toBe("Algiers");
    expect(wilayaFlat.nom_fr).toBe("Adrar");
    expect(dairaFlat.nom_fr).toBe("Aoulef");
    expect(communeFlat.nom_fr).toBe("Timekten");
    expect(country.code_iso).toBe("DZ");
    expect(algeria.nb_wilayas).toBe(69);
  });

  it("from the ROOT — five unaliased, three aliased `V1*` (ADR-001 / ADR-002)", () => {
    // `Commune`, `Daira` and `Wilaya` belong to v2 at the root, so the v1 three
    // are exported there as `V1Commune` / `V1Daira` / `V1Wilaya`. That is a
    // deliberate, documented rename of the TYPE names only — the runtime shapes
    // are unchanged, and `/legacy` still exports all eight unaliased.
    const v1Commune: V1Commune = {
      nom_ar: "أدرار",
      nom_fr: "Adrar",
      nom_en: "Adrar",
      code_postal: null,
    };
    const v1Daira: V1Daira = {
      nom_ar: "أدرار",
      nom_fr: "Adrar",
      nom_en: "Adrar",
      nb_communes: 1,
      communes: [v1Commune],
    };
    const v1Wilaya: V1Wilaya = {
      wilaya_num: 1,
      code: "01",
      nom_ar: "أدرار",
      nom_fr: "Adrar",
      nom_en: "Adrar",
      nb_dairas: 1,
      nb_communes: 1,
      dairas: [v1Daira],
    };
    const wilayaFlat: RootWilayaFlat = first(getWilayas(), "wilaya");
    const dairaFlat: RootDairaFlat = first(getDairas(), "daïra");
    const communeFlat: RootCommuneFlat = first(getCommunes(), "commune");
    const country: RootCountry = rootGetAll().pays;
    const algeria: RootAlgeria = rootGetAll();

    expect(v1Commune.code_postal).toBeNull();
    expect(v1Daira.nb_communes).toBe(1);
    expect(v1Wilaya.code).toBe("01");
    expect(wilayaFlat.wilaya_num).toBe(1);
    expect(dairaFlat.wilaya_code).toBe("01");
    expect(communeFlat.wilaya_code).toBe("01");
    expect(country.nom_en).toBe("Algeria");
    expect(algeria.nb_communes).toBe(1541);
  });

  it("the v1 records are MUTABLE types — v1 handed back the live parse", () => {
    // Not cosmetic: adding `readonly` would be a source-compatibility break for
    // every v1 program that assigns into a record. The value is discarded, the
    // assignment is the assertion, and it is made on a literal so nothing in
    // the shared cache is touched (see `identity.mutation.test.ts`).
    const c: Commune = { nom_ar: "س", nom_fr: "S", nom_en: "S", code_postal: null };
    c.nom_fr = "T";
    expect(c.nom_fr).toBe("T");
  });
});

// ── `## Notes` — the three factual claims ───────────────────────────────────
//
// Asserted THROUGH the legacy surface, never against the generated constants:
// the shim could map a field wrongly and a test that reads the source data
// would never notice.

describe("README `## Notes`", () => {
  it("note 2 — 27 communes have `code_postal: null`", () => {
    expect(getCommunes().filter((c) => c.code_postal === null)).toHaveLength(27);
    // The complement, so a bug that nulled everything cannot pass note 2.
    expect(getCommunes().filter((c) => c.code_postal !== null)).toHaveLength(1514);
  });

  it('note 1 — the ONE exonym: `nom_en !== nom_fr` only for the wilaya "Alger"', () => {
    expect(
      getWilayas()
        .filter((w) => w.nom_en !== w.nom_fr)
        .map((w) => w.nom_fr),
    ).toEqual(["Alger"]);
    expect(getWilayas().find((w) => w.nom_fr === "Alger")?.nom_en).toBe("Algiers");
  });

  it("note 1 — zero communes and zero daïras differ; Alger is the only record in the dataset", () => {
    expect(getCommunes().filter((c) => c.nom_en !== c.nom_fr)).toHaveLength(0);
    expect(getDairas().filter((d) => d.nom_en !== d.nom_fr)).toHaveLength(0);
    // And through the nested tree too, in case the flat and nested projections
    // ever disagree.
    const differing: string[] = [];
    for (const w of getAll().wilayas) {
      if (w.nom_en !== w.nom_fr) differing.push(w.nom_fr);
      for (const d of w.dairas) {
        if (d.nom_en !== d.nom_fr) differing.push(d.nom_fr);
        for (const c of d.communes) if (c.nom_en !== c.nom_fr) differing.push(c.nom_fr);
      }
    }
    expect(differing).toEqual(["Alger"]);
  });

  it("note 3 — 591 daïra rows, 545 distinct names: the reform split daïras across wilayas", () => {
    expect(getDairas()).toHaveLength(591);
    expect(new Set(getDairas().map((d) => d.nom_fr)).size).toBe(545);
    // The claim is specifically that a repeated name sits under MORE THAN ONE
    // wilaya, not that a wilaya lists the same daïra twice.
    const wilayasByName = new Map<string, Set<number>>();
    for (const d of getDairas()) {
      const seen = wilayasByName.get(d.nom_fr) ?? new Set<number>();
      seen.add(d.wilaya_num);
      wilayasByName.set(d.nom_fr, seen);
    }
    const crossWilaya = [...wilayasByName.values()].filter((s) => s.size > 1);
    expect(crossWilaya.length).toBeGreaterThan(0);
  });
});

// ── `## Source & contributing` and `## License` — no code, so: metadata ─────

describe("README `## Source & contributing` / `## License`", () => {
  const pkg = JSON.parse(readFileSync(`${REPO_ROOT}packages/js/package.json`, "utf8")) as {
    license?: unknown;
    repository?: { url?: unknown };
    homepage?: unknown;
  };

  it("`## License` — still CC0-1.0 (repo invariant C15.8)", () => {
    expect(pkg.license).toBe("CC0-1.0");
  });

  it("`## Source & contributing` — repository still points at the README's URL", () => {
    const url = pkg.repository?.url;
    expect(typeof url).toBe("string");
    expect(String(url)).toContain("https://github.com/el-amin-dev/algeria-wilayas-communes");
    expect(String(pkg.homepage)).toContain(
      "https://github.com/el-amin-dev/algeria-wilayas-communes",
    );
  });
});
