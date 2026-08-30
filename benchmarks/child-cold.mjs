/**
 * One cold sample: module evaluation plus the first call, in a fresh process.
 *
 * Usage: `node child-cold.mjs <v1|v2> <op>` → `{ importMs, firstCallMs, result }`
 *
 * ── Why the cost is split in two, and why that matters ──────────────────────
 *
 * v1 and v2 pay their cold cost in **different places**, and a benchmark that
 * reports only "first call" flatters v2 by hiding the half it moved.
 *
 * - **v1** imports instantly — `index.js` defines functions and an empty cache —
 *   then pays `readFileSync` + `JSON.parse` on the first call that needs a file.
 * - **v2** has no files. The data is inlined as JavaScript literals, so the cost
 *   lands during **module evaluation**, before the first call, and the first call
 *   is then nearly free.
 *
 * Reporting only one of the two numbers would let either library look
 * arbitrarily good. What a user actually waits for is `importMs + firstCallMs`,
 * and that total is what `run.mjs` compares. See ADR-008: v2's total is
 * **larger** than v1's, and this is the harness that says so.
 *
 * A fresh process per sample, because module evaluation happens once and every
 * later measurement in the same process reads a cache.
 */

import { fileURLToPath } from "node:url";

const V1 = new URL("./v1/index.js", import.meta.url);
const V2 = new URL("../packages/js/dist/index.mjs", import.meta.url);

/**
 * The operation set, chosen so v1 and v2 answer the *same question*.
 *
 * `getAll` and `findCommune` exist on the v2 root only as the two deprecated v1
 * shims (ADR-002) — which is exactly what makes them comparable here. The other
 * three are named the same in both and mean the same thing.
 */
const OPS = {
  getWilayas: (m) => m.getWilayas().length,
  getCommunes: (m) => m.getCommunes().length,
  getAll: (m) => Object.keys(m.getAll()).length,
  findByPostalCode: (m) => m.findByPostalCode("19018").length,
  findCommune: (m) => m.findCommune("ain").length,
};

const impl = process.argv[2];
const op = process.argv[3];

if (impl !== "v1" && impl !== "v2") {
  console.error(`Unknown impl "${impl}". Expected v1 or v2.`);
  process.exit(2);
}
if (OPS[op] === undefined) {
  console.error(`Unknown op "${op}". Expected one of: ${Object.keys(OPS).join(", ")}`);
  process.exit(2);
}

const target = fileURLToPath(impl === "v1" ? V1 : V2);

const t0 = performance.now();
const mod = await import(target);
const t1 = performance.now();

const t2 = performance.now();
const result = OPS[op](mod);
const t3 = performance.now();

process.stdout.write(JSON.stringify({ importMs: t1 - t0, firstCallMs: t3 - t2, result }));
