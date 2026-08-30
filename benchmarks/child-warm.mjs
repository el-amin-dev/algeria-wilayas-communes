/**
 * Steady-state timings for one implementation, in its own process.
 *
 * Usage: `node child-warm.mjs <v1|v2>` → `{ "<op>": { us, rme, samples }, … }`
 *
 * One process per implementation, deliberately: v1 and v2 hold the entire
 * dataset in memory in different shapes, and sharing a heap between them would
 * let one library's residency and GC pressure show up in the other's numbers.
 *
 * Every operation is called once before the suite so the measurement is warm by
 * construction — v1's lazy `JSON.parse` and v2's lazy indexes both belong to the
 * cold column (`child-cold.mjs`), and letting either leak in here would report a
 * one-off cost as a per-call one.
 *
 * ── The honesty rule this file exists under ─────────────────────────────────
 *
 * The original spec set a target of "under 50 µs warm" and assumed v2 would win
 * it. **v1 already meets that target** — 11.5 µs for postal lookup, 41.6 µs for
 * a name scan — so there is no target to claim. Whatever comes out goes into
 * `results.json` unedited, including rows where v2 is flat or worse. Do not tune
 * the harness until a number tells a story it does not have.
 */

import { Bench } from "tinybench";
import { fileURLToPath } from "node:url";

const V1 = new URL("./v1/index.js", import.meta.url);
const V2 = new URL("../packages/js/dist/index.mjs", import.meta.url);

const impl = process.argv[2];
if (impl !== "v1" && impl !== "v2") {
  console.error(`Unknown impl "${impl}". Expected v1 or v2.`);
  process.exit(2);
}

const m = await import(fileURLToPath(impl === "v1" ? V1 : V2));

/** ADR-006's canonical row throughout: wilaya 19 Setif, postal 19018. */
const OPS = {
  getWilayas: () => m.getWilayas().length,
  getCommunes: () => m.getCommunes().length,
  getAll: () => m.getAll(),
  findByPostalCode: () => m.findByPostalCode("19018").length,
  findCommune: () => m.findCommune("ain").length,
  byWilaya: () => m.byWilaya(19),
};

// Warm every path before measuring: lazy parse (v1) and lazy indexes (v2) are
// cold-column costs and must not be amortized into a per-call figure.
for (const fn of Object.values(OPS)) fn();

const bench = new Bench({ time: 1000, warmupTime: 200 });
for (const [name, fn] of Object.entries(OPS)) bench.add(name, fn);
await bench.run();

const out = {};
for (const task of bench.tasks) {
  const { latency } = task.result;
  // tinybench 6 reports latency in milliseconds; this suite talks in µs. The
  // median is preferred over the mean: these are sub-microsecond operations, so
  // a single GC pause during the run skews a mean by more than the signal being
  // measured.
  out[task.name] = {
    us: latency.p50 * 1000,
    meanUs: latency.mean * 1000,
    rme: latency.rme,
    samples: latency.samplesCount,
  };
}

process.stdout.write(JSON.stringify(out));
