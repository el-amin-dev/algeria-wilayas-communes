/**
 * One import sample against the **shipped artifact**, in a fresh process.
 *
 * Usage: `node --expose-gc child-dist.mjs <entry-name> [--force]`
 * Prints one JSON line: `{ ms, heapDelta, maps }`.
 *
 * ── Why this exists alongside child-source.mjs ──────────────────────────────
 *
 * `child-source.mjs` gives the exact answer — a boolean per lazy structure —
 * but only for the source tree, because the `__*State()` hooks are deliberately
 * not re-exported by any public entry. That is the right design (a hook nobody
 * exports is a hook `dist/` never carries), and it leaves the shipped artifact
 * with nothing to interrogate.
 *
 * So this substitutes a counting subclass for the global `Map` **before** the
 * dynamic `import()` and counts every construction during module evaluation.
 * Every index in this library is a `Map`, the bundlers do not capture or shim
 * the global, and `maps === 0` after a bare import is therefore the exact same
 * statement the source hooks make — asserted against the file that ships.
 *
 * `import-time.bench.mjs` runs each entry twice: bare, and again with
 * `--force`, which calls every accessor and so builds every index. **The
 * `--force` control is what makes the assertion live** — a build in which
 * nothing worked at all would report `maps === 0` too, and only the control
 * distinguishes "nothing was built yet" from "there was never anything to
 * build".
 *
 * ── Three measurement details that would otherwise make this noise ──────────
 *
 * - **The probe only sees `Map`.** Every index in this library is a `Map` today,
 *   which is what makes the count exact -- but it is an assumption, not a
 *   checked property. `wilayaList()` builds a frozen ARRAY of 69 objects and is
 *   caught only because the same function also builds a `parents` Map. A future
 *   lazy structure that is an array, a Set or a plain object would be invisible
 *   here. Mechanism 1 in `import-time.bench.mjs` reads the source hooks and does
 *   not share this blind spot, which is why both run.
 * - **`Object.freeze` is not a Map.** The three top-level freezes in `api.ts`
 *   and the tier modules are the only import-time statements with an effect, and
 *   they are invisible to this probe by construction — which is exactly right:
 *   the invariant forbids index construction, not a constant-time freeze.
 * - `global.gc()` on both sides of the heap reading, so `heapUsed` reports
 *   retained memory rather than whatever garbage the last allocation left
 *   behind. The parent spawns this with `--expose-gc`; without it the deltas
 *   swing by megabytes between identical runs. **`heapDelta` is reported, never
 *   gated** — a bare import already materializes the inlined data literals, so
 *   it is dominated by the records themselves and barely moves when the indexes
 *   are added on top. Measured on this checkout, `/communes` retains 1.44 MB
 *   bare and 1.75 MB forced: an 18 % difference, far too soft to gate on. The
 *   Map counter is what gates.
 * - The `dist/*.mjs` file is imported **by path, not by bare specifier**. The
 *   `exports` map is already proven by `publint`, `attw` and
 *   `tests/compat/cjs.test.ts`; re-proving it here would only add a temp
 *   directory and a symlink to a measurement that does not depend on either.
 */

import { fileURLToPath } from "node:url";

const DIST = new URL("../packages/js/dist/", import.meta.url);

const ENTRIES = {
  root: "index.mjs",
  wilayas: "wilayas.mjs",
  dairas: "dairas.mjs",
  communes: "communes.mjs",
  legacy: "legacy.mjs",
};

/**
 * Touch every lazy structure an entry owns.
 *
 * Deliberately written per entry rather than as one "call everything" loop: the
 * entries expose different surfaces, and a silent `?.()` on a missing function
 * would make the control under-build and the gate too lenient.
 */
const FORCE = {
  root: (m) => [
    m.getWilayas(),
    m.getWilaya(19),
    m.getDairas(),
    m.getDaira("19-ain-azel"),
    m.getDairasOfWilaya(19),
    m.getCommunes(),
    m.getCommune("19-ain-azel-ain-lahdjar"),
    m.getCommunesOfWilaya(19),
    m.findByPostalCode("19018"),
    m.findCommunesByName("Ain Lahdjar"),
    m.byWilaya(19),
    m.search("ain"),
    m.search("ain", { fuzzy: true }),
    m.getAll(),
    m.findCommune("ain"),
  ],
  wilayas: (m) => [m.getWilayas(), m.getWilaya(19)],
  dairas: (m) => [
    m.getWilayas(),
    m.getWilaya(19),
    m.getDairas(),
    m.getDaira("19-ain-azel"),
    m.getDairasOfWilaya(19),
  ],
  communes: (m) => [
    m.getWilayas(),
    m.getWilaya(19),
    m.getDairas(),
    m.getDaira("19-ain-azel"),
    m.getDairasOfWilaya(19),
    m.getCommunes(),
    m.getCommune("19-ain-azel-ain-lahdjar"),
    m.getCommunesOfWilaya(19),
    m.findByPostalCode("19018"),
  ],
  legacy: (m) => [
    m.getAll(),
    m.getWilayas(),
    m.getDairas(),
    m.getCommunes(),
    m.byWilaya(19),
    m.findByPostalCode("19018"),
    m.findCommune("ain"),
  ],
};

const name = process.argv[2];
const force = process.argv.includes("--force");
const file = ENTRIES[name];
if (file === undefined) {
  console.error(`Unknown entry "${name}". Expected one of: ${Object.keys(ENTRIES).join(", ")}`);
  process.exit(2);
}
if (typeof global.gc !== "function") {
  console.error("child-dist.mjs must be spawned with --expose-gc.");
  process.exit(2);
}

const target = fileURLToPath(new URL(file, DIST));

// Substitute a counting subclass for the global `Map` for the duration of module
// evaluation. Restored immediately afterwards so the forced calls below run
// against the real constructor and cost nothing extra.
const RealMap = globalThis.Map;
let maps = 0;
globalThis.Map = class extends RealMap {
  constructor(...args) {
    super(...args);
    maps++;
  }
};

global.gc();
const heap0 = process.memoryUsage().heapUsed;
const t0 = performance.now();
const mod = await import(target);
const t1 = performance.now();

const mapsAtImport = maps;

// The probe stays installed through the forced calls: `mapsTotal - mapsAtImport`
// is the control, and it is only meaningful if the same counter sees both.
let sink;
if (force) sink = FORCE[name](mod);
globalThis.Map = RealMap;

global.gc();
const heap1 = process.memoryUsage().heapUsed;

// Keep the forced structures reachable past the second reading, or V8 is free to
// collect the very allocations this run exists to measure.
if (sink !== undefined && sink.length === 0) console.error("unreachable");

process.stdout.write(
  JSON.stringify({ ms: t1 - t0, heapDelta: heap1 - heap0, maps: mapsAtImport, mapsTotal: maps }),
);
