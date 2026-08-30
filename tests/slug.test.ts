/**
 * The slug rule mints the library-assigned ids for daïras and communes
 * (decision D2) — neither has any official code in this dataset, only a name.
 * An id that changes is a breaking change for every consumer who stored one,
 * so the rule is pinned here by fixture, not by re-deriving it.
 *
 * The rule (from the session spec, step 6b):
 *   1. lowercase
 *   2. Unicode NFD normalize, then strip combining marks
 *   3. apostrophes (' and ’) and whitespace handled BEFORE the character filter
 *   4. drop every character that is not [a-z0-9-]
 *   5. collapse runs of "-" into a single "-"
 *   6. trim leading and trailing "-"
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { slug } from "../scripts/build-data";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

// ── The seven acceptance fixtures ───────────────────────────────────────────

describe("slug — the seven acceptance fixtures", () => {
  // Note the asymmetry, which is the whole point of the rule's ordering:
  //
  //   "Sidi M'hamed" → "sidi-mhamed"   apostrophe DELETED, no hyphen in its place
  //   "Abi-Youcef"   → "abi-youcef"    an EXISTING hyphen is KEPT
  //
  // The apostrophe must be dealt with before the [a-z0-9-] filter runs;
  // otherwise the same input slugs differently depending on ordering, and the
  // ids drift. `M'Sila` → `msila` (not `m-sila`) is the second witness.
  it.each<[string, string]>([
    ["Sidi M'hamed", "sidi-mhamed"],
    ["M'Sila", "msila"],
    ["Abi-Youcef", "abi-youcef"],
    ["Alger Centre", "alger-centre"],
    ["Bordj Bou Arreridj", "bordj-bou-arreridj"],
    ["Béjaïa", "bejaia"],
    ["Aïn Témouchent", "ain-temouchent"],
  ])("slug(%s) === %s", (input, expected) => {
    expect(slug(input)).toBe(expected);
  });
});

// ── Structural properties over the whole dataset ────────────────────────────

interface SourceCommune {
  nom_fr: string;
}

interface SourceDaira {
  nom_fr: string;
  communes: SourceCommune[];
}

interface SourceWilaya {
  nom_fr: string;
  dairas: SourceDaira[];
}

interface Algeria {
  wilayas: SourceWilaya[];
}

const algeria = JSON.parse(readFileSync(`${REPO_ROOT}data/algeria.json`, "utf8")) as Algeria;

const dairaNames: string[] = [];
const communeNames: string[] = [];

for (const wilaya of algeria.wilayas) {
  for (const daira of wilaya.dairas) {
    dairaNames.push(daira.nom_fr);
    for (const commune of daira.communes) {
      communeNames.push(commune.nom_fr);
    }
  }
}

/** No leading, trailing or doubled hyphen; no uppercase; no diacritic; not empty. */
const WELL_FORMED = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slug — structural properties over every name in the dataset", () => {
  it("has the expected number of names to slug", () => {
    expect(dairaNames).toHaveLength(591);
    expect(communeNames).toHaveLength(1541);
  });

  it("every daira nom_fr slugs to a non-empty, well-formed slug", () => {
    const bad: string[] = [];
    for (const name of dairaNames) {
      const s = slug(name);
      if (s.length === 0 || !WELL_FORMED.test(s)) bad.push(`${name} -> ${JSON.stringify(s)}`);
    }
    expect(bad).toEqual([]);
  });

  it("every commune nom_fr slugs to a non-empty, well-formed slug", () => {
    const bad: string[] = [];
    for (const name of communeNames) {
      const s = slug(name);
      if (s.length === 0 || !WELL_FORMED.test(s)) bad.push(`${name} -> ${JSON.stringify(s)}`);
    }
    expect(bad).toEqual([]);
  });

  it("is idempotent — slugging a slug changes nothing", () => {
    const bad: string[] = [];
    for (const name of [...dairaNames, ...communeNames]) {
      const once = slug(name);
      const twice = slug(once);
      if (once !== twice) bad.push(`${name}: ${once} -> ${twice}`);
    }
    expect(bad).toEqual([]);
  });
});
