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
import {
  COMMUNE_COUNT,
  DAIRA_COUNT,
  DATA_VERSION,
  LAST_VERIFIED,
  POSTAL_CODE_COUNT,
  SOURCE_LAW,
  WILAYA_COUNT,
} from "../packages/js/src/generated/meta";

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
  // data/raw/reform.json carries a `todo` string per new wilaya naming an
  // UNVERIFIED postal-prefix candidate mère. ADR-005 refuses to ship that table,
  // and publish-npm.yml deletes data/raw/ from the tarball for the same reason.
  //
  // Publishing a wrong administrative mapping is worse than publishing none: a
  // reader cannot tell a heuristic from a citation once it is in a README, and
  // an address encoded against a guessed mère is wrong in production.
  //
  // This checks the LEAK, not the mention. An earlier version searched for
  // strings like "32 El Bayadh" and failed on the missing-postal-code table,
  // where that is simply the wilaya a commune belongs to. A test that fires on
  // correct prose gets the prose rewritten, which is the test damaging the docs.
  const reform = JSON.parse(read("data/raw/reform.json")) as {
    newWilayas: { code: string; nom_fr: string; todo?: string }[];
  };
  const wilayas = JSON.parse(read("data/wilayas.json")) as {
    wilayas: { wilaya_num: number; nom_fr: string }[];
  };
  const nameOf = new Map(wilayas.wilayas.map((w) => [w.wilaya_num, w.nom_fr]));

  /**
   * Every (new wilaya, candidate parent) pair the stub hints at, derived from
   * the `todo` strings rather than hard-coded — so if a maintainer edits the
   * stub, this test follows.
   */
  const pairs = reform.newWilayas.flatMap((entry) => {
    const m = entry.todo?.match(/candidate:\s*(\d{2})\s+([^(]+?)\s*\(/i);
    const parentCode = m?.[1];
    const parentName = m?.[2]?.trim();
    if (parentCode === undefined || parentName === undefined) return [];
    const childName = entry.nom_fr ?? nameOf.get(Number(entry.code)) ?? "";
    return childName ? [{ childName, parentName, parentCode }] : [];
  });

  it("the stub is still parseable, so this test is still meaningful", () => {
    // If this fails, the todo format changed and the checks below silently
    // stopped covering anything.
    expect(pairs.length).toBe(11);
  });

  // Every committed document, not just the four published pages: docs/ is public
  // on GitHub, and DATA_PROVENANCE.md and DECISIONS.md are the files that
  // discuss the mapping in the most detail — the likeliest place to slip.
  const committedDocs = [
    ...PUBLISHED_DOCS,
    "docs/DATA_PROVENANCE.md",
    "docs/DATA_POLICY.md",
    "docs/DECISIONS.md",
    "docs/MIGRATION.md",
    "SUPPORT.md",
    "CONTRIBUTING.md",
    "RUNBOOK.md",
  ];

  for (const doc of committedDocs) {
    it(`${doc} never pairs a new wilaya with a candidate parent`, () => {
      const lines = read(doc).split("\n");

      for (const { childName, parentName, parentCode } of pairs) {
        for (const [i, line] of lines.entries()) {
          // Co-occurrence ON ONE LINE is the leak shape: a table row
          // `| 59 Aflou | 03 Laghouat |`, or a sentence saying Aflou was
          // detached from Laghouat. Either name alone is innocent, which is why
          // the whole-document check produced false positives.
          const leaked =
            line.includes(childName) &&
            (line.includes(parentName) || new RegExp(`\\b${parentCode}\\b`).test(line));
          expect(
            leaked,
            `${doc}:${i + 1} pairs "${childName}" with candidate parent "${parentCode} ${parentName}":\n  ${line.trim()}`,
          ).toBe(false);
        }
      }
    });

    it(`${doc} carries none of the generator's candidate text`, () => {
      const text = read(doc);
      for (const entry of reform.newWilayas) {
        if (entry.todo) expect(text).not.toContain(entry.todo);
      }
    });
  }

  it("the mapping really is still unfilled, so these docs are current", () => {
    // If a maintainer fills the mapping, this fails and every "not yet sourced"
    // sentence in the docs becomes false and has to be rewritten. That is the
    // intended coupling: the docs and the data change together.
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

describe("the machine-readable dataset descriptors", () => {
  // dataset.jsonld (schema.org/Dataset) and datapackage.json (Frictionless)
  // exist to be crawled and consumed by tools, not read by people -- which
  // means nobody will ever notice them going stale. They restate counts and a
  // version that live in exactly one place, so they get the same treatment as
  // the README badges.
  const jsonld = JSON.parse(read("dataset.jsonld")) as {
    version: string;
    variableMeasured: { name: string; value: number }[];
    license: string;
    distribution: { contentUrl: string }[];
  };
  const dp = JSON.parse(read("datapackage.json")) as {
    version: string;
    resources: { name: string; path: string }[];
    licenses: { name: string }[];
  };

  it("both declare the same data version as the package", () => {
    expect(jsonld.version).toBe(DATA_VERSION);
    expect(dp.version).toBe(DATA_VERSION);
  });

  it("the counts in dataset.jsonld match the dataset", () => {
    const measured = new Map(jsonld.variableMeasured.map((v) => [v.name, v.value]));
    expect(measured.get("wilayas")).toBe(WILAYA_COUNT);
    expect(measured.get("dairas")).toBe(DAIRA_COUNT);
    expect(measured.get("communes")).toBe(COMMUNE_COUNT);
    expect(measured.get("communes with a postal code")).toBe(POSTAL_CODE_COUNT);
    expect(measured.get("communes without a postal code")).toBe(
      COMMUNES_MISSING_POSTAL_CODE.length,
    );
  });

  it("both state CC0, matching LICENSE", () => {
    expect(jsonld.license).toContain("publicdomain/zero/1.0");
    expect(dp.licenses[0]?.name).toBe("CC0-1.0");
  });

  it("every datapackage resource points at a file that exists", () => {
    // A Frictionless consumer resolves these paths; a renamed data file would
    // make the descriptor point at nothing.
    for (const r of dp.resources) {
      expect(() => read(r.path), `${r.name} -> ${r.path}`).not.toThrow();
    }
  });

  it("every jsonld distribution URL names a data file that exists", () => {
    for (const d of jsonld.distribution) {
      const file = d.contentUrl.split("/data/")[1];
      expect(file, d.contentUrl).toBeDefined();
      expect(() => read(`data/${file ?? ""}`), d.contentUrl).not.toThrow();
    }
  });
});

describe("the descriptor and manifest claims found wrong in review", () => {
  const jsonld = JSON.parse(read("dataset.jsonld")) as {
    datePublished: string;
    dateModified: string;
  };
  const dp = JSON.parse(read("datapackage.json")) as {
    resources: { name: string; path: string; dialect?: { property?: string } }[];
  };
  const pyproject = read("packages/python/pyproject.toml");

  it("dataset.jsonld is not modified before it was published", () => {
    // It shipped with datePublished 2026-07-21 and dateModified 2026-07-20,
    // which schema.org consumers and Google Dataset Search read as inconsistent.
    expect(jsonld.dateModified >= jsonld.datePublished).toBe(true);
  });

  it("dataset.jsonld's dateModified is the real verification date", () => {
    // Tie it to the one date the project actually maintains, so it cannot rot
    // independently of LAST_VERIFIED.
    expect(jsonld.dateModified).toBe(LAST_VERIFIED);
  });

  it("every datapackage resource says where its array lives", () => {
    // data/*.json are JSON OBJECTS wrapping the rows under a key. Without a
    // dialect naming that key, a conforming Frictionless reader sees a
    // non-tabular object and cannot apply the declared fields; the prose note
    // "Records live under the `wilayas` key" is for humans only.
    for (const r of dp.resources) {
      expect(r.dialect?.property, `${r.name} needs dialect.property`).toBeDefined();
      const doc = JSON.parse(read(r.path)) as Record<string, unknown>;
      const key = r.dialect?.property ?? "";
      expect(Array.isArray(doc[key]), `${r.path} should hold an array at "${key}"`).toBe(true);
    }
  });

  it("the Python package does not advertise TypeScript", () => {
    // The description was pasted from the npm manifest, so the PyPI page for a
    // pure-Python package promised "JSON and TypeScript".
    const desc = /^description = "(.*)"$/m.exec(pyproject)?.[1] ?? "";
    expect(desc).not.toMatch(/TypeScript/i);
    expect(desc.length).toBeGreaterThan(40);
  });

  it("every repo-relative project_url in pyproject points at a file that exists", () => {
    // Changelog pointed at packages/python/CHANGELOG.md, which did not exist,
    // so the PyPI sidebar link 404'd.
    const urls = [
      ...pyproject.matchAll(/^\w+ = "https:\/\/github\.com\/[^"]*\/blob\/main\/([^"]+)"$/gm),
    ];
    expect(urls.length, "expected at least one blob/main url to check").toBeGreaterThan(0);
    for (const [, path] of urls) {
      expect(() => read(path ?? ""), path).not.toThrow();
    }
  });
});
