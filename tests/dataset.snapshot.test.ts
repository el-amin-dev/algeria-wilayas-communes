/**
 * Two snapshots, deliberately NOT `expect(COMMUNES).toMatchSnapshot()`.
 *
 * The naive full-record dump writes a ~592 KB `.snap` file — the same size as
 * `data/communes.json`. It does technically detect any mutation, but nobody
 * reviews a 592 KB snapshot diff: GitHub collapses it as too large, the
 * reviewer sees "1 snapshot updated" and reflexively runs `vitest -u`. A test
 * that is always updated reflexively is WORSE than no test, because it *looks*
 * like coverage.
 *
 * So instead:
 *
 *   (a) three sha256 DIGESTS — completeness. Any byte change in any record of
 *       any of the three arrays fails, including changes the summary below does
 *       not surface. Answers "did anything change?"
 *
 *   (b) one readable SUMMARY — a few hundred lines a reviewer actually reads,
 *       which names the wilaya whose commune count moved. Answers "what
 *       changed?"
 *
 * Neither alone answers both questions. `node:crypto` is used HERE ONLY; it
 * must never appear under `packages/js/src/` — removing that Node-builtin
 * dependency from the library is the point of the whole rebuild.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { COMMUNES, COMMUNES_MISSING_POSTAL_CODE } from "../packages/js/src/generated/communes";
import { DAIRAS } from "../packages/js/src/generated/dairas";
import { WILAYAS } from "../packages/js/src/generated/wilayas";

/** Tuple form: stable field order, stable record order, no whitespace, no keys. */
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalWilayas(): unknown {
  return WILAYAS.map((w) => [
    w.code,
    w.name.ar,
    w.name.fr,
    w.name.en,
    w.dairaCount,
    w.communeCount,
  ]);
}

function canonicalDairas(): unknown {
  return DAIRAS.map((d) => [d.id, d.wilaya, d.name.ar, d.name.fr, d.name.en, d.communeCount]);
}

/** Postal codes used by more than one commune. */
function sharedPostalCodeCount(): number {
  const occurrences = new Map<string, number>();
  for (const c of COMMUNES) {
    if (c.postalCode === null) continue;
    occurrences.set(c.postalCode, (occurrences.get(c.postalCode) ?? 0) + 1);
  }
  let shared = 0;
  for (const n of occurrences.values()) if (n > 1) shared += 1;
  return shared;
}

function canonicalCommunes(): unknown {
  return COMMUNES.map((c) => [
    c.id,
    c.wilaya,
    c.daira,
    c.name.ar,
    c.name.fr,
    c.name.en,
    c.postalCode,
  ]);
}

describe("dataset fingerprint", () => {
  // Three separate digests rather than one combined hash, so a failure says
  // which of the three arrays moved before you open anything.

  it("WILAYAS fingerprint is unchanged", () => {
    expect(digest(canonicalWilayas())).toMatchSnapshot();
  });

  it("DAIRAS fingerprint is unchanged", () => {
    expect(digest(canonicalDairas())).toMatchSnapshot();
  });

  it("COMMUNES fingerprint is unchanged", () => {
    expect(digest(canonicalCommunes())).toMatchSnapshot();
  });
});

describe("dataset summary", () => {
  it("dataset summary is unchanged", () => {
    expect({
      wilayas: WILAYAS.length,
      dairas: DAIRAS.length,
      communes: COMMUNES.length,
      withPostalCode: COMMUNES.filter((c) => c.postalCode !== null).length,
      missingPostalCode: COMMUNES_MISSING_POSTAL_CODE.length,
      distinctPostalCodes: new Set<string>(
        COMMUNES.flatMap((c) => (c.postalCode === null ? [] : [c.postalCode])),
      ).size,
      sharedPostalCodes: sharedPostalCodeCount(),
      // 69 rows — this is the line that names the wilaya whose count moved.
      perWilaya: WILAYAS.map((w) => [w.code, w.communeCount]),
      missing: [...COMMUNES_MISSING_POSTAL_CODE].sort(),
    }).toMatchSnapshot();
  });
});
