// Detects the name-collision join artifact described in docs/DECISIONS.md ADR-018.
//
// WHAT IT LOOKS FOR
//
// `data/algeria.json` inherited its trilingual names and postal codes from the
// community corpus `othmanus/algeria-cities`, joined on commune name. Algerian
// commune names are not unique -- 1541 communes carry only 1500 distinct French
// names -- so a name-keyed join silently pulls a homonym's wilaya, daira AND
// postal code across as one unit.
//
// The artifact has a precise three-part signature, and all three must hold
// before a row is reported:
//
//   1. the commune's postal prefix is not its own wilaya code,
//   2. the postal code is also held by a commune in another wilaya,
//   3. the wilaya is 01-48.
//
// Condition 3 is what keeps this honest. For wilayas 49-58 (Loi 19-12, 2019) and
// 59-69 (Loi 26-06, 2026) a foreign postal prefix is CORRECT and expected: a new
// wilaya carved out of an old one inherits the parent's postal space, and Algerie
// Poste has not renumbered. 164 rows in 49-69 look exactly like the artifact and
// are not it. Reporting them would bury the real signal.
//
// SEVERITY, and why the daira matters more than the postal code
//
// A reported row is split by whether the join also invented a daira:
//
//   PHANTOM_DAIRA -- the commune sits alone in a daira whose name is a daira of
//     the twin wilaya. The join did not just copy a postal code, it created a
//     container to hold the commune. This inflates nb_dairas, and because
//     `commune id = <padded wilaya>-<slug(daira)>-<slug(commune)>` it also mints
//     a WRONG, STABLE, PUBLIC id. That is the expensive half.
//
//   POSTAL_ONLY -- the daira is genuine and populated; only the postal code came
//     from the homonym. Cheap to fix, no id churn.
//
// Run: node scripts/audit-postal-attribution.mjs [--json]
// Advisory only. It never edits a file and never fails a build; the build-time
// gate is assertion A21 in scripts/build-data.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const source = read("data/algeria.json");
const communes = read("data/communes.json").communes;

// (wilaya, daira) -> commune count, and the set of daira names per wilaya.
const dairaSize = new Map();
for (const w of source.wilayas) {
  for (const d of w.dairas) {
    dairaSize.set(`${w.wilaya_num}|${d.nom_fr}`, d.communes.length);
  }
}

const byPostal = new Map();
for (const c of communes) {
  if (!c.code_postal) continue;
  if (!byPostal.has(c.code_postal)) byPostal.set(c.code_postal, []);
  byPostal.get(c.code_postal).push(c);
}

const findings = [];
for (const c of communes) {
  const cp = c.code_postal;
  if (!cp) continue;
  if (c.wilaya_num > 48) continue; // see "Condition 3" above
  if (cp.slice(0, 2) === c.wilaya_code) continue;
  const holders = byPostal.get(cp);
  if (holders.length < 2) continue;

  const twins = holders.filter((t) => t.wilaya_num !== c.wilaya_num);
  const ownSize = dairaSize.get(`${c.wilaya_num}|${c.daira_fr}`) ?? 0;
  const dairaLivesInTwin = twins.some((t) => dairaSize.has(`${t.wilaya_num}|${c.daira_fr}`));

  findings.push({
    wilaya: c.wilaya_num,
    commune: c.nom_fr,
    daira: c.daira_fr,
    postalCode: cp,
    postalPrefixPointsAt: Number(cp.slice(0, 2)),
    twinWilayas: twins.map((t) => t.wilaya_num),
    dairaCommuneCount: ownSize,
    dairaAlsoInTwin: dairaLivesInTwin,
    severity: ownSize === 1 && dairaLivesInTwin ? "PHANTOM_DAIRA" : "POSTAL_ONLY",
  });
}

findings.sort((a, b) => a.wilaya - b.wilaya || a.commune.localeCompare(b.commune));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
  process.exit(0);
}

const phantom = findings.filter((f) => f.severity === "PHANTOM_DAIRA");
const postal = findings.filter((f) => f.severity === "POSTAL_ONLY");

console.log(`Postal-attribution audit — ${findings.length} rows match the join artifact\n`);
const w = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(
  `  ${w("w", 3)} ${w("commune", 26)} ${w("daira", 22)} ${w("code", 6)} ${w("dsz", 4)} twin`,
);
console.log("  " + "-".repeat(78));
for (const f of findings) {
  const mark = f.severity === "PHANTOM_DAIRA" ? "!" : " ";
  console.log(
    `${mark} ${w(f.wilaya, 3)} ${w(f.commune, 26)} ${w(f.daira, 22)} ${w(f.postalCode, 6)} ${w(f.dairaCommuneCount, 4)} ${f.twinWilayas.join(",")}`,
  );
}
console.log(
  `\n  ! PHANTOM_DAIRA ${phantom.length}  — wrong postal code AND an invented daira (wrong public id)`,
);
console.log(`    POSTAL_ONLY   ${postal.length}  — genuine daira, foreign postal code only`);
console.log(
  `\n  Excluded by design: rows in wilayas 49-69, where a foreign postal prefix is correct.`,
);
