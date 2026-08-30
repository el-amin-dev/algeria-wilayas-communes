/**
 * The tree-shaking proof — **a byte assertion on a real bundle, not a
 * screenshot.**
 *
 * `pnpm size` already budgets `dist/wilayas.mjs` as a file. This goes one step
 * further and asks the question a user actually asks: *if I import `getWilayas`
 * into my app and run my bundler over it, what do I ship?* So it drives a real
 * Vite production build over the package's real `exports` map and then greps and
 * weighs the output.
 *
 * Every assertion is two-sided, because a one-sided one is satisfied by a build
 * that emitted nothing:
 *
 * 1. the `wilayas-only` bundle is under its gzip ceiling **and over a floor**;
 * 2. the commune-only sentinels are **absent** from it;
 * 3. the wilaya sentinels are **present** in it;
 * 4. the `full` control bundle **contains** the commune sentinels.
 *
 * **Assertions 1's floor, 3 and 4 are not optional, and 1's floor and 3 were
 * missing from the first version of this file.** An upper bound plus an absence
 * check is *exactly* the shape that passes against an empty bundle: a refactor
 * that made `WILAYAS` unreachable from `getWilayas()` would have produced
 * ~200 B, reported "sentinels absent OK", boasted a 500x size ratio, and exited
 * 0 while shipping a library that returns nothing. Same discipline as the
 * `--force` control in `import-time.bench.mjs`.
 *
 * Sentinels are derived, never hardcoded — see `sentinels.mjs` for the daïra
 * collision that makes a hand-picked list a trap.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { COMMUNE_ONLY_SENTINELS, WILAYA_PRESENT_SENTINELS } from "./sentinels.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const CONFIG = join(HERE, "vite.config.ts");

/**
 * Gzip ceiling for the wilayas-only bundle.
 *
 * Measured at 2,436 B on this checkout; the ceiling is that plus ~11 % headroom,
 * on the same tighten-in-the-same-PR rule as `.size-limit.js`. The spec proposed
 * 3,072 B, which the build beats by 21 %.
 */
const WILAYAS_ONLY_CEILING = 2_700;

/**
 * Gzip floor for the same bundle.
 *
 * The 69 wilaya records with three names each do not compress below this. Its
 * only job is to fail when the bundle is empty or stubbed -- the case an upper
 * bound cannot see.
 */
const WILAYAS_ONLY_FLOOR = 1_500;

const PACKAGE_DIST = join(REPO_ROOT, "packages", "js", "dist", "wilayas.mjs");
if (!existsSync(PACKAGE_DIST)) {
  console.error("packages/js/dist/ is missing. Run `pnpm build` before `pnpm treeshake:proof`.");
  process.exit(1);
}

/** Build one entry and return its concatenated JS output. */
function build(mode) {
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--mode",
      mode,
      "--config",
      CONFIG,
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );

  const assets = join(HERE, "dist", mode, "assets");
  const js = readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("\n");

  return { js, gzip: gzipSync(Buffer.from(js), { level: 9 }).length };
}

const failures = [];

console.log("Tree-shaking proof — real Vite production builds\n");

// --- Entry A: getWilayas only ----------------------------------------------

const only = build("wilayas-only");
const withinBudget = only.gzip < WILAYAS_ONLY_CEILING && only.gzip > WILAYAS_ONLY_FLOOR;
console.log(
  `  wilayas-only bundle: ${String(only.gzip)} B gzip ` +
    `(floor ${String(WILAYAS_ONLY_FLOOR)}, ceiling ${String(WILAYAS_ONLY_CEILING)})  ` +
    `${withinBudget ? "OK" : "OUT OF RANGE"}`,
);
if (only.gzip >= WILAYAS_ONLY_CEILING) {
  failures.push(
    `wilayas-only is ${String(only.gzip)} B gzip, over the ${String(WILAYAS_ONLY_CEILING)} B ceiling`,
  );
}
if (only.gzip <= WILAYAS_ONLY_FLOOR) {
  failures.push(
    `wilayas-only is only ${String(only.gzip)} B gzip, under the ` +
      `${String(WILAYAS_ONLY_FLOOR)} B floor -- the 69 wilaya records cannot be in there. ` +
      "A stubbed or empty bundle passes every other check in this file.",
  );
}

const absent = WILAYA_PRESENT_SENTINELS.filter((w) => !only.js.includes(w));
console.log(
  absent.length === 0
    ? `  wilaya data present in wilayas-only: ${WILAYA_PRESENT_SENTINELS.join(", ")}  OK`
    : `  WILAYA DATA MISSING from wilayas-only: ${absent.join(", ")}`,
);
for (const w of absent) {
  failures.push(
    `the wilayas-only bundle does not contain "${w}", so it is not carrying the ` +
      "wilaya records at all. Every absence check in this file is vacuous until this passes.",
  );
}

const leaked = COMMUNE_ONLY_SENTINELS.filter((s) => only.js.includes(s));
console.log(
  leaked.length === 0
    ? `  sentinels absent from wilayas-only: ${COMMUNE_ONLY_SENTINELS.join(", ")}  OK`
    : `  COMMUNE DATA LEAKED into wilayas-only: ${leaked.join(", ")}`,
);
for (const s of leaked) failures.push(`commune data leaked into wilayas-only: found "${s}"`);

// --- Entry B: the control ---------------------------------------------------

const full = build("full");
const missing = COMMUNE_ONLY_SENTINELS.filter((s) => !full.js.includes(s));
console.log(
  missing.length === 0
    ? `  sentinels present in full control (${String(full.gzip)} B gzip)  OK`
    : `  CONTROL IS DEAD — full bundle is missing: ${missing.join(", ")}`,
);
for (const s of missing) {
  failures.push(
    `the full-API control does not contain "${s}", so the absence check above ` +
      `proves nothing. Fix the control before trusting any result from this script.`,
  );
}

const ratio = (full.gzip / only.gzip).toFixed(1);
console.log(`\n  wilayas-only is ${ratio}x smaller than the full API bundle.`);

if (failures.length > 0) {
  console.error(`\n✗ tree-shaking proof failed:\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log("\n✓ tree-shaking proof passed");
}
