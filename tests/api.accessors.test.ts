/**
 * The bulk accessors, the frozen top level, and the API surface itself.
 *
 * Every number below is a MEASURED property of this checkout, hard-coded as a
 * literal. Nothing here is computed from the data it is checking: a test that
 * derives its expectation from its subject proves only that the subject equals
 * itself. `tests/dataset.test.ts` asserts the same facts against the generated
 * constants; this file re-asserts them through the PUBLIC API, which is a
 * different claim — it proves the accessor layer hands the records back
 * untouched.
 */

import { describe, expect, it } from "vitest";

import * as api from "../packages/js/src/index";
import {
  COMMUNES_MISSING_POSTAL_CODE,
  DATA_VERSION,
  LAST_VERIFIED,
  SOURCE_LAW,
  findByPostalCode,
  findCommunesByName,
  getCommunes,
  getCommunesOfWilaya,
  getDairas,
  getDairasOfWilaya,
  getWilayas,
} from "../packages/js/src/index";
import type { WilayaCode } from "../packages/js/src/index";

// ── The API surface ─────────────────────────────────────────────────────────

/**
 * Every runtime export of the package entry, sorted with the default
 * `Array.prototype.sort()` (UTF-16 code units, so `SCREAMING_CASE` sorts before
 * `camelCase`).
 *
 * Types are absent on purpose: `verbatimModuleSyntax` + `export type` means
 * they are erased before this module ever loads. `Wilaya`, `WilayaTree`,
 * `SearchResult` and friends are pinned instead in `tests/types.test-d.ts`,
 * which is the only place they exist.
 *
 * This list is the accidental-export guard. `__indexState`, `__searchState`,
 * `__searchStats` and `__resetSearchStats` are debug hooks that must reach
 * `dist/` through NO public entry — a symbol no public entry re-exports is
 * tree-shaken out entirely, and a symbol that leaks here is a symbol consumers
 * will start depending on.
 *
 * `DairaSubtree` and `NameOf` live in `types.ts` and are deliberately not
 * re-exported either; they are erased anyway, and `tests/types.test-d.ts`
 * reaches the tree's daïra shape through `WilayaTree["dairas"]` rather than by
 * naming them.
 */
const PUBLIC_API = [
  "COMMUNES_MISSING_POSTAL_CODE",
  "DATA_VERSION",
  "LAST_VERIFIED",
  "SOURCE_LAW",
  "assertWilayaCode",
  "byWilaya",
  "findByPostalCode",
  "findCommunesByName",
  "getCommune",
  "getCommunes",
  "getCommunesOfWilaya",
  "getDaira",
  "getDairas",
  "getDairasOfWilaya",
  "getWilaya",
  "getWilayas",
  "isPostalCode",
  "isWilayaCode",
  "search",
];

describe("the exported API surface", () => {
  it("exports exactly the documented symbols and nothing else", () => {
    // When someone adds an export without a test, this fails first and says
    // exactly what is missing.
    expect(Object.keys(api).sort()).toEqual(PUBLIC_API);
  });

  it("leaks none of the four debug hooks", () => {
    // Stated separately from the list equality above so the failure message
    // names the actual sin rather than dumping a 19-line array diff.
    expect(Object.keys(api)).not.toContain("__indexState");
    expect(Object.keys(api)).not.toContain("__searchState");
    expect(Object.keys(api)).not.toContain("__searchStats");
    expect(Object.keys(api)).not.toContain("__resetSearchStats");
  });

  it("ships no default export", () => {
    // `import dz from "algeria-wilayas-communes"` must fail loudly at ESM link
    // time rather than silently handing back a v2 object whose `.nom_fr` reads
    // `undefined`. v1 HAD a default export, so this is the one place a
    // migrating user gets an error instead of a wrong answer.
    expect(Object.keys(api)).not.toContain("default");
    expect("default" in api).toBe(false);
  });
});

// ── Counts, through the public accessors ────────────────────────────────────

describe("bulk accessors", () => {
  it("returns 69 wilayas, 591 daïras and 1541 communes", () => {
    expect(getWilayas()).toHaveLength(69);
    expect(getDairas()).toHaveLength(591);
    expect(getCommunes()).toHaveLength(1541);
  });

  it("returns the same array instance every call — no defensive copy", () => {
    // A defensive copy would allocate 1541 elements per call and silently break
    // `getCommunes() === getCommunes()`, which session 3's compat layer relies
    // on. The arrays are frozen instead; that is the whole trade.
    expect(getWilayas()).toBe(getWilayas());
    expect(getDairas()).toBe(getDairas());
    expect(getCommunes()).toBe(getCommunes());
  });

  it("returns frozen arrays", () => {
    expect(Object.isFrozen(getWilayas())).toBe(true);
    expect(Object.isFrozen(getDairas())).toBe(true);
    expect(Object.isFrozen(getCommunes())).toBe(true);
  });

  it("sums the denormalized counters back to the record counts", () => {
    expect(getWilayas().reduce((n, w) => n + w.communeCount, 0)).toBe(1541);
    expect(getWilayas().reduce((n, w) => n + w.dairaCount, 0)).toBe(591);
    expect(getDairas().reduce((n, d) => n + d.communeCount, 0)).toBe(1541);
  });
});

// ── The plural lookups hand out the index itself ────────────────────────────

describe("plural lookups return frozen arrays, not live index buckets", () => {
  /**
   * This is the v1 defect the package explicitly claims to have closed, and
   * `readonly` does NOT close it: `readonly` is erased at compile time, so it
   * stops a TypeScript caller and nothing else. Every one of these lookups
   * returns the index bucket ITSELF — no defensive copy, by design, because a
   * copy would allocate on every call — which means one line of JavaScript in a
   * consumer's codebase corrupts the shared index for the whole process:
   *
   *   findByPostalCode("10031").push(whatever)   // → next call returns 3, not 2
   *   findCommunesByName("Sidi Ameur").length = 0 // → next call returns [] forever
   *
   * There is no error and no failing type; the next caller in an unrelated
   * request just gets a wrong answer. `Object.freeze` on the bucket is what
   * makes "no copy" safe, and it is only safe if EVERY bucket is frozen — the
   * three bulk accessors were frozen from the start, these four were not.
   */

  it("freezes the postal-code buckets, shared and single alike", () => {
    expect(Object.isFrozen(findByPostalCode("10031"))).toBe(true); // 2 communes
    expect(Object.isFrozen(findByPostalCode("19018"))).toBe(true); // 1 commune
    expect(Object.isFrozen(findByPostalCode("02015"))).toBe(true); // 3 communes
  });

  it("freezes the name buckets", () => {
    expect(Object.isFrozen(findCommunesByName("Sidi Ameur"))).toBe(true); // 2 communes
    expect(Object.isFrozen(findCommunesByName("Ain Lahdjar"))).toBe(true); // 1 commune
  });

  it("freezes the per-wilaya buckets", () => {
    expect(Object.isFrozen(getCommunesOfWilaya(19))).toBe(true);
    expect(Object.isFrozen(getDairasOfWilaya(19))).toBe(true);
  });

  it("throws on mutation rather than corrupting the index", () => {
    // A frozen array throws on `push` in strict mode, and ES modules are always
    // strict — so this is what a consumer actually sees, not a silent no-op.
    // The `as unknown as` is how a JavaScript caller reaches these methods at
    // all; the TypeScript half of the claim is in tests/types.test-d.ts, where
    // the same calls sit under `@ts-expect-error`.
    const postal = findByPostalCode("10031") as unknown as string[];
    const names = findCommunesByName("Sidi Ameur") as unknown as string[];
    const communes = getCommunesOfWilaya(19) as unknown as string[];
    const dairas = getDairasOfWilaya(19) as unknown as string[];

    expect(() => postal.push("BOOM")).toThrow(TypeError);
    expect(() => names.push("BOOM")).toThrow(TypeError);
    expect(() => communes.push("BOOM")).toThrow(TypeError);
    expect(() => dairas.push("BOOM")).toThrow(TypeError);
  });

  it("still returns the right lengths after a mutation attempt", () => {
    // The assertion that actually matters. A throw is the mechanism; an
    // uncorrupted index is the property. If freezing were ever dropped, the
    // test above would fail AND these counts would drift — and in production
    // only the counts would, silently.
    const attempts: (() => void)[] = [
      () => (findByPostalCode("10031") as unknown as string[]).push("BOOM"),
      () => (findCommunesByName("Sidi Ameur") as unknown as string[]).push("BOOM"),
      () => (getCommunesOfWilaya(19) as unknown as string[]).push("BOOM"),
      () => (getDairasOfWilaya(19) as unknown as string[]).push("BOOM"),
      () => ((getCommunesOfWilaya(19) as unknown as string[]).length = 0),
    ];
    for (const attempt of attempts) expect(attempt).toThrow(TypeError);

    expect(findByPostalCode("10031")).toHaveLength(2);
    expect(findCommunesByName("Sidi Ameur")).toHaveLength(2);
    expect(getCommunesOfWilaya(19)).toHaveLength(60);
    expect(getDairasOfWilaya(19)).toHaveLength(20);
    // And the whole-corpus totals, in case a bucket was replaced rather than
    // extended.
    expect(getCommunes()).toHaveLength(1541);
  });

  it("freezes the empty array a miss returns, which is shared across calls", () => {
    // KNOWN FAILING — the same defect as above, still live on the MISS path.
    //
    // A miss does not allocate: all four lookups return one shared module-level
    // empty array, and it is NOT frozen. Verified against the runtime:
    //
    //   findByPostalCode("99999") === findByPostalCode("88888")   // → true
    //   findByPostalCode("99999") === findCommunesByName("Paris") // → true
    //   findByPostalCode("99999").push("POISON")
    //   findCommunesByName("Londres").length                      // → 1
    //
    // So one `push` on any miss result permanently gives every future miss —
    // in either function, anywhere in the process — a phantom element. It is
    // strictly worse than the hit-path bug it mirrors, because the hit path
    // corrupts one bucket and this corrupts all of them at once.
    // `getCommunesOfWilaya` and `getDairasOfWilaya` each carry their own
    // unfrozen empty constant with the same problem.
    //
    // Fixing it is `Object.freeze` on those constants. This test asserts the
    // fix, not the bug.
    expect(Object.isFrozen(findByPostalCode("99999"))).toBe(true);
    expect(Object.isFrozen(findCommunesByName("Paris"))).toBe(true);
    expect(Object.isFrozen(getCommunesOfWilaya(70 as WilayaCode))).toBe(true);
    expect(Object.isFrozen(getDairasOfWilaya(70 as WilayaCode))).toBe(true);
  });
});

// ── codeText, the derived field ─────────────────────────────────────────────

describe("wilaya.codeText", () => {
  // `codeText` is DERIVED in the accessor layer — session 1 deliberately does
  // not ship 69 duplicate padded strings in the generated data. Pinning the
  // derivation for all 69 is what stops `code` and `codeText` ever drifting
  // apart, which would be invisible: both fields would still look plausible.
  it('equals String(code).padStart(2, "0") for all 69 wilayas', () => {
    const wrong = getWilayas()
      .filter((w) => w.codeText !== String(w.code).padStart(2, "0"))
      .map((w) => `${w.code} -> ${w.codeText}`);
    expect(wrong).toEqual([]);
  });

  it("pads the single-digit codes and leaves the two-digit ones alone", () => {
    expect(getWilayas().find((w) => w.code === 1)?.codeText).toBe("01");
    expect(getWilayas().find((w) => w.code === 6)?.codeText).toBe("06");
    expect(getWilayas().find((w) => w.code === 19)?.codeText).toBe("19");
    expect(getWilayas().find((w) => w.code === 69)?.codeText).toBe("69");
  });

  it("keeps `code` a number and `codeText` a string", () => {
    // The v1 → v2 migration trap: v1's `w.code` was the padded STRING "19".
    // In v2 `code` is the NUMBER 19, so `${w.code}` yields "1" for Adrar where
    // v1 yielded "01" — silently, and precisely where it matters (postal
    // prefixes, plate numbers). Both types are pinned so neither can drift back.
    const setif = getWilayas().find((w) => w.code === 19);
    expect(typeof setif?.code).toBe("number");
    expect(typeof setif?.codeText).toBe("string");
  });
});

// ── Record anchors — never assert on [0] ────────────────────────────────────

describe("record shapes, anchored on real records", () => {
  it("carries the multilingual name on a wilaya", () => {
    const setif = getWilayas().find((w) => w.code === 19);
    expect(setif?.name.fr).toBe("Setif");
    expect(setif?.name.ar).toBe("سطيف");
    // `en` equals `fr` here, as it does for 2200 of the 2201 records.
    expect(setif?.name.en).toBe("Setif");
    expect(setif?.dairaCount).toBe(20);
    expect(setif?.communeCount).toBe(60);
  });

  it("references the parent wilaya by NUMBER on a daira and a commune", () => {
    // Not by object. `d.wilaya` is `19`, not `{ code: 19, ... }` — the generated
    // shape is kept verbatim through the accessor layer, so a consumer joins on
    // the code rather than paying for a denormalized back-reference on 2132
    // records.
    const daira = getDairas().find((d) => d.id === "19-ain-azel");
    expect(daira?.wilaya).toBe(19);
    expect(typeof daira?.wilaya).toBe("number");
    expect(daira?.name.fr).toBe("Ain Azel");
    expect(daira?.name.ar).toBe("عين أزال");
    expect(daira?.communeCount).toBe(4);

    const commune = getCommunes().find((c) => c.id === "19-ain-azel-ain-lahdjar");
    expect(commune?.wilaya).toBe(19);
    expect(typeof commune?.wilaya).toBe("number");
    expect(commune?.daira).toBe("19-ain-azel");
    expect(commune?.name.fr).toBe("Ain Lahdjar");
    expect(commune?.name.ar).toBe("عين الحجر");
    expect(commune?.postalCode).toBe("19018");
  });

  it("has no accented Latin character anywhere in the French wilaya names", () => {
    // Verified fact about THIS dataset, and a standing correction to every doc
    // that writes "Béjaïa": the shipped record is `Bejaia`, unaccented. Accent
    // folding is a QUERY-side concern (tests/search.test.ts), not a data-side
    // one. If a future data drop introduces `é`, this fails and forces the
    // search tests to be re-read rather than letting them quietly still pass.
    const accented = getWilayas()
      .filter((w) => w.name.fr !== w.name.fr.normalize("NFD").replace(/[̀-ͯ]/g, ""))
      .map((w) => w.name.fr);
    expect(accented).toEqual([]);
    // `Setif`, not `Sétif` — the accent a French keyboard puts there appears
    // nowhere in the dataset.
    expect(getWilayas().find((w) => w.code === 19)?.name.fr).toBe("Setif");
    expect(getWilayas().find((w) => w.code === 6)?.name.fr).toBe("Bejaia");
    expect(getWilayas().find((w) => w.code === 31)?.name.fr).toBe("Oran");
    expect(getWilayas().find((w) => w.code === 28)?.name.fr).toBe("M'Sila");
    expect(getWilayas().find((w) => w.code === 15)?.name.fr).toBe("Tizi Ouzou");
    expect(getWilayas().find((w) => w.code === 34)?.name.fr).toBe("Bordj Bou Arreridj");
  });

  it("has exactly one record in the whole dataset whose en differs from fr", () => {
    // The single English exonym: wilaya 16, Alger → Algiers. Zero daïras and
    // zero communes differ, and Setif's `en` is just `Setif` — which is exactly
    // why the English override, and only the English override, is anchored on
    // Alger throughout this suite. `en` is generated as a fallback to `fr` plus a
    // 1-entry override table — exactly the kind of generation that drifts
    // silently, by gaining a second override or losing the only one. Pinned to
    // 1 AND to which record, because a count alone does not catch a swap.
    const differ = [
      ...getWilayas()
        .filter((w) => w.name.en !== w.name.fr)
        .map((w) => w.name.fr),
      ...getDairas()
        .filter((d) => d.name.en !== d.name.fr)
        .map((d) => d.id),
      ...getCommunes()
        .filter((c) => c.name.en !== c.name.fr)
        .map((c) => c.id),
    ];
    expect(differ).toEqual(["Alger"]);
  });
});

// ── Postal-code nulls, through the public API ───────────────────────────────

describe("the 27 communes with no postal code", () => {
  it("has 27 nulls and 1514 present", () => {
    expect(getCommunes().filter((c) => c.postalCode === null)).toHaveLength(27);
    expect(getCommunes().filter((c) => c.postalCode !== null)).toHaveLength(1514);
  });

  it("re-exports the 27 ids, and they agree with the records in both directions", () => {
    // The 27 CANNOT be filled — no available source has them. They ship as
    // `null` behind an exported array rather than being guessed. Never invent a
    // record: one fabricated postal code ends the package's credibility.
    expect(COMMUNES_MISSING_POSTAL_CODE).toHaveLength(27);

    const listed = new Set<string>(COMMUNES_MISSING_POSTAL_CODE);
    expect(listed.size).toBe(27);

    const unlisted = getCommunes()
      .filter((c) => c.postalCode === null && !listed.has(c.id))
      .map((c) => c.id);
    expect(unlisted).toEqual([]);

    const withCode = getCommunes()
      .filter((c) => c.postalCode !== null && listed.has(c.id))
      .map((c) => c.id);
    expect(withCode).toEqual([]);
  });

  it("uses null, not undefined and not an absent property", () => {
    // `postalCode` is `string | null`, NOT optional. With
    // `exactOptionalPropertyTypes` those are different types, and the
    // difference carries information: `null` says "published as absent",
    // `undefined` would say "we did not look".
    const sidiAmeur = getCommunes().find((c) => c.id === "32-sidi-ameur-sidi-ameur");
    expect(sidiAmeur?.postalCode).toBeNull();
    expect(sidiAmeur === undefined ? false : "postalCode" in sidiAmeur).toBe(true);
  });
});

// ── Provenance constants ────────────────────────────────────────────────────

describe("provenance constants", () => {
  // Provenance is EXPORTED, not merely documented: compliance, legal and
  // procurement teams ask where administrative boundaries came from and as of
  // when. A constant a consumer can log or assert on answers that in one line.
  it("re-exports the dataset provenance from the public entry", () => {
    expect(DATA_VERSION).toBe("2.0.0");
    expect(SOURCE_LAW).toBe("Loi 26-06 du 4 avril 2026, JO n°25");
    expect(LAST_VERIFIED).toBe("2026-07-20");
  });

  it("keeps LAST_VERIFIED an ISO string, not a Date", () => {
    // A `Date` in a const object is not serializable in a config dump and buys
    // nothing here.
    expect(typeof LAST_VERIFIED).toBe("string");
    expect(LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
