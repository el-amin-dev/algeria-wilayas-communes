/**
 * The published documentation, as an assertion.
 *
 * Prose rots differently from code: nothing fails when a README goes stale, and
 * the reader has no way to tell. Every check here exists because the failure it
 * catches is silent and reaches a user directly on npm or PyPI.
 *
 * Scope is deliberately narrow. This does not test that the docs are *good* --
 * it tests the handful of claims that must be true, and the two things that
 * must never appear.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMMUNES_MISSING_POSTAL_CODE } from "../packages/js/src/generated/communes";
import { DATA_VERSION, LAST_VERIFIED, SOURCE_LAW } from "../packages/js/src/generated/meta";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), "utf8");

const JS_README = "packages/js/README.md";
const PY_README = "packages/python/README.md";
const ROOT_README = "README.md";
const LLMS = "llms.txt";

const PUBLISHED_DOCS = [JS_README, PY_README, ROOT_README, LLMS];

describe("the LAST_VERIFIED badge", () => {
  // A verification date is the one thing none of the competing datasets
  // publish, and it is the reason a developer picks this one after comparing
  // three. A badge that silently disagrees with the constant is worse than no
  // badge: it is a false claim of freshness, and only this test can catch it,
  // because bumping LAST_VERIFIED in scripts/build-data.ts regenerates the
  // constants and touches no README.
  const shieldsDate = LAST_VERIFIED.replace(/-/g, "--");

  for (const doc of [JS_README, PY_README, ROOT_README]) {
    it(`${doc} shows the current LAST_VERIFIED`, () => {
      expect(read(doc)).toContain(shieldsDate);
    });
  }

  it("no README shows a stale verification date", () => {
    // Any other `verified-YYYY--MM--DD` badge is a date that was hand-edited
    // once and then forgotten.
    for (const doc of [JS_README, PY_README, ROOT_README]) {
      const dates = [...read(doc).matchAll(/verified-(\d{4}--\d{2}--\d{2})/g)].map((m) => m[1]);
      for (const found of dates) expect(found).toBe(shieldsDate);
    }
  });
});

describe("provenance is quoted, not paraphrased", () => {
  // A compliance or procurement reviewer copies this section into a review
  // document. If it drifts from what the packages actually export, the reviewer
  // is citing something untrue.
  for (const doc of [JS_README, PY_README]) {
    it(`${doc} names all three provenance constants`, () => {
      const text = read(doc);
      expect(text).toContain("DATA_VERSION");
      expect(text).toContain("SOURCE_LAW");
      expect(text).toContain("LAST_VERIFIED");
    });
  }

  for (const doc of PUBLISHED_DOCS) {
    it(`${doc} quotes the dataset's own sources array`, () => {
      const text = read(doc);
      expect(text).toContain("ONS Code Geographique National");
      expect(text).toContain("othmanus/algeria-cities");
    });
  }

  it("the published constants are the ones the docs claim", () => {
    expect(DATA_VERSION).toBe("2.0.0");
    expect(SOURCE_LAW).toBe("Loi 26-06 du 4 avril 2026, JO n°25");
    expect(LAST_VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the unverified parent-wilaya mapping never leaks", () => {
  // data/raw/reform.json carries a `todo` string per new wilaya spelling out an
  // UNVERIFIED postal-prefix candidate mère. ADR-005 refuses to ship that table,
  // and publish-npm.yml deletes data/raw/ from the tarball for the same reason.
  //
  // Publishing a wrong administrative mapping is worse than publishing none: a
  // reader cannot tell a heuristic from a citation once it is in a README, and
  // an address encoded against a guessed mère is wrong in production.
  //
  // What this checks is the LEAK, not the mention. An earlier version of this
  // test looked for strings like "32 El Bayadh" and failed on the missing-postal-
  // code table, where "32 El Bayadh" is simply the wilaya a commune belongs to.
  // A test that fires on correct prose gets the prose changed, which is the test
  // damaging the docs rather than protecting them.
  const reform = JSON.parse(read("data/raw/reform.json")) as {
    newWilayas: { code: string; todo?: string }[];
  };

  for (const doc of PUBLISHED_DOCS) {
    it(`${doc} carries none of the generator's candidate text`, () => {
      const text = read(doc);

      // The exact strings from the stub, which are the thing that must not ship.
      for (const entry of reform.newWilayas) {
        if (entry.todo) expect(text).not.toContain(entry.todo);
      }

      // And the phrasing any hand-written leak would almost certainly use.
      expect(text).not.toMatch(/postal-prefix candidate/i);
      expect(text).not.toMatch(/\bcandidate m[eè]re\b/i);
    });
  }

  it("the mapping really is still unfilled, so these docs are current", () => {
    // If a maintainer fills the mapping, this test fails and every "not yet
    // sourced" sentence in the docs becomes false and has to be rewritten.
    // That is the intended behaviour: the docs and the data change together.
    expect(reform.newWilayas).toHaveLength(11);
    expect(reform.newWilayas.every((w) => w.todo !== undefined)).toBe(true);
  });

  for (const doc of [JS_README, PY_README]) {
    it(`${doc} states that the mapping is unfilled`, () => {
      expect(read(doc)).toMatch(/stub|not (yet )?(in the dataset|sourced|available)|unfilled/i);
    });
  }
});

describe("the 27 documented gaps are published in full", () => {
  // "27 communes have no postal code" is a claim a reader can only trust if the
  // list is there. Publishing the count without the list is how a dataset asks
  // to be taken on faith.
  it("the constant still holds 27 ids", () => {
    expect(COMMUNES_MISSING_POSTAL_CODE).toHaveLength(27);
  });

  // The names a reader actually sees, derived from the dataset rather than
  // hard-coded, so this test cannot drift from the data it is checking.
  const uncoded = (
    JSON.parse(read("data/communes.json")) as {
      communes: {
        wilaya_num: number;
        nom_fr: string;
        daira_fr: string;
        code_postal: string | null;
      }[];
    }
  ).communes.filter((c) => c.code_postal === null);

  for (const doc of [JS_README, PY_README]) {
    it(`${doc} names every commune that has no postal code`, () => {
      const text = read(doc);
      expect(uncoded).toHaveLength(27);

      // Checking all 27 by name, not counting table rows: a table that lost a
      // row still looks complete, and a row count would also match some
      // unrelated table that happens to start with a number.
      const missing = uncoded
        .filter((c) => !text.includes(c.nom_fr))
        .map((c) => `${c.wilaya_num} ${c.nom_fr}`);
      expect(missing, `${doc} omits documented gaps: ${missing.join(", ")}`).toEqual([]);
    });
  }
});

describe("no marketing adjective survives review", () => {
  // The rule for every document in this session: no marketing adjective where a
  // number would do. A claim that cannot be measured cannot be checked by a
  // sceptical reader, and this package's whole pitch is that its claims can be.
  // "the only" and "the best" are banned as SELF-DESCRIPTION, not as English.
  // "the only official identifier", "the only two deprecated names at the root"
  // and "the only other package carrying the 69-wilaya map" are all statements
  // of fact, and a check that rejects them teaches the writer to write worse
  // sentences. So the superlatives are matched only where they describe a
  // package, library, dataset or solution.
  const banned =
    /\b(blazing|lightning[- ]fast|ultra-|insanely|massively|super[- ]fast)\b|\bthe (only|best) (algeria\w*|npm |pypi |python |javascript |typescript )?(package|library|dataset|solution|choice)\b/i;

  for (const doc of PUBLISHED_DOCS) {
    it(`${doc} has none`, () => {
      const offenders = read(doc)
        .split("\n")
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => banned.test(line));
      expect(offenders, `${doc}: ${JSON.stringify(offenders)}`).toEqual([]);
    });
  }
});

describe("the Python README publishes no JavaScript-measured number", () => {
  // Bytes and microseconds measured on Node against the JS bundle say nothing
  // about a wheel on CPython. Copying them across is the easiest possible way
  // to publish a false number, because both files are being written from the
  // same notes.
  const jsOnly = [
    "2.36 kB",
    "16.66 kB",
    "64.8 kB",
    "48.93 kB",
    "96.92 kB",
    "5.847",
    "188.6",
    "gzip",
  ];

  it("none of the JS figures appear", () => {
    const text = read(PY_README);
    for (const n of jsOnly) {
      expect(text, `packages/python/README.md leaks the JS-measured "${n}"`).not.toContain(n);
    }
  });

  it("and no JavaScript framework recipe appears", () => {
    // Matched as an IMPORT, not as a bare word. "ZR Express" is a real Algerian
    // carrier and belongs in the shipping recipe; a bare /\bExpress\b/ flagged
    // it and pushed the brand name out of the prose, which is the test breaking
    // the docs rather than checking them.
    expect(read(PY_README)).not.toMatch(
      /\b(from|require|import)\s*\(?\s*["'`](express|hono|react|next)/i,
    );
    expect(read(PY_README)).not.toMatch(/\bNext\.js\b/);
  });
});
