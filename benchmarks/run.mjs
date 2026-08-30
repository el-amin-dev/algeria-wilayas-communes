/**
 * The benchmark orchestrator. Writes `benchmarks/results.json`.
 *
 * **Reporting only — never a CI gate.** Timings on a shared runner are too
 * noisy to fail a build on. `pnpm bench:import` and `pnpm treeshake:proof` are
 * the gates; this one exists to produce numbers session 6 can put in the README
 * without anyone having to trust a claim.
 *
 * ── The honesty requirement, and the direction it actually points ───────────
 *
 * The spec's headline is "first call is ~1.1 ms cheaper and import is free". It
 * is **wrong, in v1's favour**, and this harness is what says so. Inlining the
 * data as TypeScript literals did not remove the cold cost, it moved it from
 * `JSON.parse` into module evaluation and made it bigger: V8's JSON parser is
 * specialised, object-literal compilation is not. Measured on this checkout, v2
 * costs roughly 1.5x v1 to get to a first answer.
 *
 * So every row carries `importMs` and `firstCallMs` separately as well as their
 * total. Reporting only "first call" would flatter v2 by hiding the half it
 * moved; reporting only the total would hide *why*. See ADR-008.
 *
 * What v2 genuinely won is in the warm column and is very large — O(1) Map
 * lookups instead of O(n) scans — plus the thing no number here can show: it
 * runs in a browser, a Worker, Deno and React Native at all, which v1 cannot.
 *
 * Rows where v2 is flat or worse are published flat or worse. A fabricated
 * speedup is a liability the first person to run `pnpm bench` would find.
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);
const REPO_ROOT = new URL("../", import.meta.url);

const COLD_SAMPLES = 15;
const OPS = ["getWilayas", "getCommunes", "getAll", "findByPostalCode", "findCommune"];

// --- Preconditions, named rather than left to fail obscurely -----------------

const v1Data = fileURLToPath(new URL("packages/js/data/wilayas.json", REPO_ROOT));
if (!existsSync(v1Data)) {
  console.error(
    "packages/js/data/ is not staged, so the v1 baseline cannot read its JSON.\n" +
      "Run:  node benchmarks/stage-v1-data.mjs",
  );
  process.exit(1);
}
const v2Dist = fileURLToPath(new URL("packages/js/dist/index.mjs", REPO_ROOT));
if (!existsSync(v2Dist)) {
  console.error("packages/js/dist/ is missing. Run `pnpm build` first.");
  process.exit(1);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
};

const child = (script, args) =>
  JSON.parse(
    execFileSync(process.execPath, [fileURLToPath(new URL(script, HERE)), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );

// --- Cold: one fresh process per sample --------------------------------------

console.log(`Cold path — ${String(COLD_SAMPLES)} fresh processes per cell\n`);

const cold = {};
for (const op of OPS) {
  cold[op] = {};
  for (const impl of ["v1", "v2"]) {
    const imports = [];
    const firsts = [];
    let result;
    for (let i = 0; i < COLD_SAMPLES; i++) {
      const r = child("child-cold.mjs", [impl, op]);
      imports.push(r.importMs);
      firsts.push(r.firstCallMs);
      result = r.result;
    }
    cold[op][impl] = {
      importMs: median(imports),
      firstCallMs: median(firsts),
      totalMs: median(imports) + median(firsts),
      result,
    };
  }
}

console.log(
  "  op                  v1 import  v1 first   v1 total | v2 import  v2 first   v2 total",
);
for (const op of OPS) {
  const a = cold[op].v1;
  const b = cold[op].v2;
  const f = (n) => n.toFixed(2).padStart(9);
  console.log(
    `  ${op.padEnd(18)}${f(a.importMs)}${f(a.firstCallMs)}${f(a.totalMs)} |` +
      `${f(b.importMs)}${f(b.firstCallMs)}${f(b.totalMs)}`,
  );
}

// Parity: the two implementations must be answering the same question.
const mismatches = OPS.filter((op) => cold[op].v1.result !== cold[op].v2.result);
if (mismatches.length > 0) {
  // This suite is reporting-only and never gates on a TIMING -- runner noise
  // makes that meaningless. A parity mismatch is a different category: it means
  // the two implementations are answering different questions, so every number
  // printed above is meaningless too. That is worth a non-zero exit.
  console.error(
    `\n! v1 and v2 returned different results for: ${mismatches.join(", ")}. ` +
      "The comparison above is not apples to apples.",
  );
  process.exitCode = 1;
}

// --- Warm: one process per implementation ------------------------------------

console.log("\nWarm path — tinybench, 1 s per task, one process per implementation\n");

const warm = { v1: child("child-warm.mjs", ["v1"]), v2: child("child-warm.mjs", ["v2"]) };

console.log("  op                      v1 us      v2 us   change");
for (const op of Object.keys(warm.v2)) {
  const a = warm.v1[op]?.us;
  const b = warm.v2[op].us;
  const change =
    a === undefined ? "—" : b < a ? `${(a / b).toFixed(1)}x faster` : `${(b / a).toFixed(2)}x`;
  console.log(
    `  ${op.padEnd(18)}${(a ?? NaN).toFixed(3).padStart(11)}${b.toFixed(3).padStart(11)}   ${change}`,
  );
}

// --- Emit ---------------------------------------------------------------------

const rows = OPS.map((op) => ({
  op,
  v1_import_ms: +cold[op].v1.importMs.toFixed(3),
  v1_first_call_ms: +cold[op].v1.firstCallMs.toFixed(3),
  v1_cold_ms: +cold[op].v1.totalMs.toFixed(3),
  v1_warm_us: warm.v1[op] === undefined ? null : +warm.v1[op].us.toFixed(4),
  v2_import_ms: +cold[op].v2.importMs.toFixed(3),
  v2_first_call_ms: +cold[op].v2.firstCallMs.toFixed(3),
  v2_cold_ms: +cold[op].v2.totalMs.toFixed(3),
  v2_warm_us: warm.v2[op] === undefined ? null : +warm.v2[op].us.toFixed(4),
  result: cold[op].v1.result === cold[op].v2.result ? cold[op].v1.result : "MISMATCH",
}));

const out = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  note:
    "Cold is import + first call, reported separately because v1 and v2 pay it " +
    "in different places. v2's cold total is LARGER than v1's -- inlined TS " +
    "literals cost more to evaluate than JSON.parse costs to parse. See ADR-008. " +
    "Warm rows that are flat are published flat.",
  coldSamples: COLD_SAMPLES,
  rows,
  warmExtra: { byWilaya: { v1_us: warm.v1.byWilaya?.us ?? null, v2_us: warm.v2.byWilaya.us } },
};

const dest = fileURLToPath(new URL("results.json", HERE));
writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`\nwrote ${dest}`);
