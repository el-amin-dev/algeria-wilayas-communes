// Apply the correction ledger to data/algeria.json.
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT PART OF THE GENERATOR
//
// `data/algeria.json` is the hand-edited source of truth, and it is also a
// published artifact: jq users and CDN consumers read it directly. If the
// generator applied corrections only in memory, the npm and PyPI packages would
// be right while the raw JSON everyone fetches from jsDelivr stayed wrong --
// split-brain, with no error anywhere.
//
// So the correction lands in the data, once, here. `scripts/build-data.ts` then
// ASSERTS (A21-A24) that every ledger entry is reflected in the data and that
// none has lost its citation. The ledger is the specification, the data is the
// state, and the build fails if they disagree. Edit the data back by hand and
// the build goes red; add a ledger entry without running this and the build
// goes red.
//
// Run: node scripts/apply-corrections.mjs [--check]
//   (no flag)  apply anything outstanding and rewrite data/algeria.json
//   --check    report what would change, write nothing, exit 1 if anything would
//
// IDEMPOTENT. Running it twice is a no-op, because each entry is matched by its
// `dairaFrom`/`postalCodeFrom` state and skipped once already in its `To` state.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "data/algeria.json";
const LEDGER = "data/raw/postal-corrections.json";

const checkOnly = process.argv.slice(2).includes("--check");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const originalText = read(SOURCE);
const doc = JSON.parse(originalText);
const { corrections } = JSON.parse(read(LEDGER));

const problems = [];
const applied = [];
const alreadyDone = [];

for (const c of corrections) {
  const wilaya = doc.wilayas.find((w) => w.code === c.wilaya);
  if (!wilaya) {
    problems.push(`${c.wilaya}/${c.commune}: no wilaya with code ${c.wilaya}`);
    continue;
  }

  const target = wilaya.dairas.find((d) => d.nom_fr === c.dairaTo);
  if (!target) {
    // The ledger may only move a commune into a daira that ALREADY exists. A
    // correction that would have to invent one is not a correction -- it is a
    // second guess about the structure, and it needs its own sourcing.
    problems.push(
      `${c.wilaya}/${c.commune}: target daira "${c.dairaTo}" does not exist in wilaya ${c.wilaya}`,
    );
    continue;
  }

  // The commune may already be in dairaTo -- either because the correction has
  // run before, or because this is a POSTAL-ONLY correction where dairaFrom and
  // dairaTo are the same daira and only the code is wrong. Ghardaia's `Mansoura`
  // is that case: its daira is genuine (officially spelled `Mansoura`), and only
  // the postal code came from a homonym.
  const inTarget = target.communes.find((x) => x.nom_fr === c.commune);
  if (inTarget) {
    if (inTarget.code_postal === c.postalCodeTo) {
      alreadyDone.push(`${c.wilaya}/${c.commune}`);
    } else if (inTarget.code_postal === null && c.postalCodeTo !== null) {
      // A withdrawn code being FILLED once a source was found. The commune is
      // already in the right daira and the field is absent, so writing a cited
      // value over an absence is an upgrade, not an overwrite -- the case that
      // happens every time one of the withdrawals below finally gets sourced.
      inTarget.code_postal = c.postalCodeTo;
      applied.push(
        `${c.wilaya}/${c.commune}: filled withdrawn code -> ${JSON.stringify(c.postalCodeTo)}`,
      );
    } else if (inTarget.code_postal === c.postalCodeFrom) {
      inTarget.code_postal = c.postalCodeTo;
      applied.push(
        `${c.wilaya}/${c.commune}: code only, ` +
          `${JSON.stringify(c.postalCodeFrom)} -> ${JSON.stringify(c.postalCodeTo)}`,
      );
    } else {
      problems.push(
        `${c.wilaya}/${c.commune}: in "${c.dairaTo}" but code_postal is ` +
          `${JSON.stringify(inTarget.code_postal)}, ledger says ${JSON.stringify(c.postalCodeTo)} ` +
          `(and the pre-correction value was ${JSON.stringify(c.postalCodeFrom)})`,
      );
    }
    continue;
  }

  const from = wilaya.dairas.find((d) => d.nom_fr === c.dairaFrom);
  if (!from) {
    problems.push(
      `${c.wilaya}/${c.commune}: neither "${c.dairaFrom}" nor a corrected row found — ` +
        `the data no longer matches this ledger entry`,
    );
    continue;
  }
  const idx = from.communes.findIndex((x) => x.nom_fr === c.commune);
  if (idx === -1) {
    problems.push(`${c.wilaya}/${c.commune}: not found in daira "${c.dairaFrom}"`);
    continue;
  }
  const commune = from.communes[idx];
  if (commune.code_postal !== c.postalCodeFrom) {
    problems.push(
      `${c.wilaya}/${c.commune}: code_postal is ${JSON.stringify(commune.code_postal)}, ` +
        `ledger expected ${JSON.stringify(c.postalCodeFrom)} before correction`,
    );
    continue;
  }

  // Move it, preserving key order (nom_ar, nom_fr, nom_en, code_postal).
  from.communes.splice(idx, 1);
  target.communes.push({ ...commune, code_postal: c.postalCodeTo });
  applied.push(
    `${c.wilaya}/${c.commune}: ${c.dairaFrom} -> ${c.dairaTo}, ` +
      `${JSON.stringify(c.postalCodeFrom)} -> ${JSON.stringify(c.postalCodeTo)}`,
  );

  // A daira emptied by the move was the invented container. Drop it.
  if (from.communes.length === 0) {
    wilaya.dairas = wilaya.dairas.filter((d) => d !== from);
    applied.push(`${c.wilaya}: removed emptied daira "${c.dairaFrom}"`);
  }
}

// Recompute every counter from the tree. They are denormalized in five places
// and assertions A6-A9 check all of them against the walk, so they cannot be
// left to drift.
let dairas = 0;
let communes = 0;
let withCode = 0;
for (const w of doc.wilayas) {
  let wCommunes = 0;
  for (const d of w.dairas) {
    d.nb_communes = d.communes.length;
    wCommunes += d.communes.length;
    for (const c of d.communes) if (c.code_postal !== null) withCode++;
  }
  w.nb_dairas = w.dairas.length;
  w.nb_communes = wCommunes;
  dairas += w.dairas.length;
  communes += wCommunes;
}
doc.nb_wilayas = doc.wilayas.length;
doc.nb_dairas = dairas;
doc.nb_communes = communes;
doc.codes_postaux_renseignes = withCode;
doc.codes_postaux_manquants = communes - withCode;

if (problems.length > 0) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\napply-corrections: ${problems.length} ledger entr(ies) do not match the data.`);
  process.exitCode = 1;
} else {
  // 2-space indent, unescaped UTF-8, trailing newline: verified byte-identical
  // to the hand-edited file on a no-op round trip.
  const out = `${JSON.stringify(doc, null, 2)}\n`;
  const changed = out !== originalText;
  console.log(
    `apply-corrections: ${applied.length} change(s), ${alreadyDone.length} already applied`,
  );
  for (const a of applied) console.log(`  + ${a}`);
  console.log(
    `  counts now: ${doc.nb_wilayas} wilayas, ${doc.nb_dairas} dairas, ` +
      `${doc.nb_communes} communes, ${doc.codes_postaux_renseignes} with a postal code`,
  );
  if (checkOnly) {
    if (changed) {
      console.error(
        "\napply-corrections --check: data/algeria.json is out of date. Run without --check.",
      );
      process.exitCode = 1;
    } else {
      console.log("  data/algeria.json is up to date");
    }
  } else if (changed) {
    writeFileSync(join(ROOT, SOURCE), out);
    console.log(`  wrote ${SOURCE}`);
  } else {
    console.log("  nothing to write");
  }
}
