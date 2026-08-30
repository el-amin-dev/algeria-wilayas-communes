/**
 * One import-purity sample, against the **source** tree, in a fresh process.
 *
 * Usage: `node --import tsx child-source.mjs <entry-name>`
 * Prints one JSON line: `{ ms, state: { "<module>.<key>": boolean, … } }`.
 *
 * ── Why a fresh process, and why the source ─────────────────────────────────
 *
 * The invariant is *no index is constructed at import time*. Measuring that
 * inside a loop is meaningless: module evaluation happens once per process and
 * every later iteration reads a cache. `tests/import-purity.test.ts` gets around
 * that with `vi.resetModules()`, which is the best a single-process test runner
 * can do — but it still shares one process, one heap and one JIT state across
 * every case in the file. This is the stronger form: one process, one import,
 * one answer.
 *
 * It reads the **source** because the exactness comes from the `__*State()`
 * hooks, and those are deliberately not re-exported by any public entry — that
 * is what lets the bundler drop them from `dist/` entirely. `child-dist.mjs` is
 * the complementary check against the shipped artifact, where no hook exists.
 *
 * Nothing but the dynamic `import()` sits inside the timed region.
 */

import { fileURLToPath } from "node:url";

const SRC = new URL("../packages/js/src/", import.meta.url);

/** The five importable entry modules, by the name the parent passes. */
const ENTRIES = {
  root: "index.ts",
  wilayas: "wilayas.ts",
  dairas: "dairas.ts",
  communes: "communes.ts",
  legacy: "legacy/index.ts",
};

/**
 * Every module that owns lazy state, and the hook that reports it.
 *
 * Pinned as a list for the same reason `tests/import-purity.test.ts` pins its
 * key arrays: a lazy structure nobody reports on can never be caught being built
 * at import time, so a new `let … | undefined` has to come with a line here.
 */
const STATE_MODULES = [
  ["indexes", "indexes.ts", "__indexState"],
  ["search", "search.ts", "__searchState"],
  ["asof", "asof.ts", "__asOfState"],
  ["reform", "reform.ts", "__reformState"],
  ["legacy", "legacy/project.ts", "__legacyState"],
  ["tier:wilayas", "tiers/wilayas.ts", "__wilayaTierState"],
  ["tier:dairas", "tiers/dairas.ts", "__dairaTierState"],
  ["tier:communes", "tiers/communes.ts", "__communeTierState"],
];

const name = process.argv[2];
const file = ENTRIES[name];
if (file === undefined) {
  console.error(`Unknown entry "${name}". Expected one of: ${Object.keys(ENTRIES).join(", ")}`);
  process.exit(2);
}

const target = fileURLToPath(new URL(file, SRC));

const t0 = performance.now();
await import(target);
const t1 = performance.now();

// Read the hooks only AFTER the timed region: importing them is itself work, and
// it must not be attributed to the entry under test.
const state = {};
for (const [label, path, hook] of STATE_MODULES) {
  const mod = await import(fileURLToPath(new URL(path, SRC)));
  const fn = mod[hook];
  if (typeof fn !== "function") {
    console.error(`${path} does not export ${hook}() — the purity gate has no hook to read.`);
    process.exit(2);
  }
  for (const [key, built] of Object.entries(fn())) state[`${label}.${key}`] = built;
}

process.stdout.write(JSON.stringify({ ms: t1 - t0, state }));
