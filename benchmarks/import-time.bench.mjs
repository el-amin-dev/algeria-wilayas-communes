/**
 * The import-time gate: **a user who only calls `getWilayas()` must never pay
 * for the commune index.**
 *
 * This is the one benchmark in the suite that is a *gate* rather than a report.
 * `pnpm bench` is reporting only — timings on shared runners are too noisy to
 * fail a build on — but `pnpm bench:import` exits non-zero on a real regression,
 * and session 6 wires it into CI as such.
 *
 * ── Three mechanisms, because no single one is sufficient ───────────────────
 *
 * 1. **Exact, on source.** `child-source.mjs` imports one entry module in a
 *    fresh process and reports a boolean for each of the 32 lazy structures
 *    across `indexes`, `search`, `asof`, `reform`, `legacy/project` and the
 *    three `tiers/*`. Any `true` after a bare import fails. This is the
 *    strongest statement available, and it is only available on the source: the
 *    `__*State()` hooks are deliberately re-exported by no public entry, which
 *    is what lets the bundler drop them from `dist/` entirely.
 *
 * 2. **Exact, on the shipped artifact.** `child-dist.mjs` swaps a counting
 *    subclass in for the global `Map` before importing `dist/<entry>.mjs`. Every
 *    index in this library is a `Map`, so a non-zero count during module
 *    evaluation is index construction in the file that actually ships. Each
 *    entry is also run with `--force`, which calls every accessor; that run must
 *    report a **non-zero** total, or the probe is dead and mechanism 2 proves
 *    nothing.
 *
 * 3. **Bytes.** `dist/wilayas.mjs` and `dist/dairas.mjs` must not contain the
 *    commune-only sentinels. Purity is about *when* work happens; this is about
 *    *what data is present at all*, and a wilaya entry carrying commune strings
 *    is a failure whether or not it indexes them.
 *
 * Import cost in milliseconds is reported (median of 30 fresh processes) and
 * never gated — process spawn noise makes the mean useless and even the median
 * moves several percent between runs.
 *
 * ── What is deliberately NOT gated ──────────────────────────────────────────
 *
 * Retained heap. A bare import already materializes the inlined data literals,
 * so `heapUsed` after import is dominated by the records themselves: `/communes`
 * retains 1.44 MB bare and 1.75 MB with every index forced. An 18 % spread is
 * far too soft to gate on, and a gate that cannot fail is worse than no gate. It
 * is printed because it is the honest answer to "what does this cost me", not
 * because it proves anything.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);
const DIST = new URL("../packages/js/dist/", import.meta.url);
const SAMPLES = 30;

/** The entries measured, in narrowest-to-widest order. */
const ENTRIES = ["wilayas", "dairas", "communes", "root", "legacy"];

/**
 * Commune-only sentinel strings.
 *
 * Derived, not hardcoded — see `treeshake-fixture/sentinels.mjs` for why a
 * hand-picked name is a trap (several commune names are also daïra names, so
 * the "absent from /dairas" half of the assertion would fail on correct data).
 */
const { COMMUNE_ONLY_SENTINELS } = await import(
  fileURLToPath(new URL("./treeshake-fixture/sentinels.mjs", HERE))
);

const failures = [];

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function runChild(script, args, nodeArgs = []) {
  const out = execFileSync(
    process.execPath,
    [...nodeArgs, fileURLToPath(new URL(script, HERE)), ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// 1. Exact purity, on source, one fresh process per sample.
// ---------------------------------------------------------------------------

console.log(`Import-time gate — ${String(SAMPLES)} fresh processes per entry\n`);
console.log("1. source: no lazy structure built at import");
console.log("   entry       median ms   structures built");

/**
 * How many lazy structures the hooks are expected to report on.
 *
 * The control for mechanism 1. Without it, a `__*State()` that started returning
 * `{}` -- a refactor renaming a `let`, say -- would make every entry report
 * "none built ✓" while proving nothing at all. Pinned like `INDEX_KEYS` in
 * `tests/import-purity.test.ts`: adding a lazy structure means updating this
 * number, and that is the intended friction.
 */
const EXPECTED_STATE_KEYS = 32;

const sourceMs = {};
for (const entry of ENTRIES) {
  const samples = [];
  const built = new Set();
  let reportedKeys = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const r = runChild("child-source.mjs", [entry], ["--import", "tsx"]);
    samples.push(r.ms);
    reportedKeys = Object.keys(r.state).length;
    for (const [key, isBuilt] of Object.entries(r.state)) if (isBuilt) built.add(key);
  }
  if (reportedKeys !== EXPECTED_STATE_KEYS) {
    failures.push(
      `${entry}: the state hooks reported ${String(reportedKeys)} structures, expected ` +
        `${String(EXPECTED_STATE_KEYS)}. A structure nobody reports on can never be caught ` +
        "being built at import time, so this check is vacuous until the count matches.",
    );
  }
  sourceMs[entry] = median(samples);
  const verdict =
    built.size === 0 ? `none of ${String(reportedKeys)}  ✓` : `${[...built].join(", ")}  ✗`;
  console.log(`   ${entry.padEnd(11)} ${sourceMs[entry].toFixed(2).padStart(9)}   ${verdict}`);
  if (built.size > 0) {
    failures.push(`${entry}: source built ${[...built].join(", ")} at import time`);
  }
}

// ---------------------------------------------------------------------------
// 2. Exact purity, on dist, with the live control.
// ---------------------------------------------------------------------------

console.log("\n2. dist: no Map constructed during module evaluation");
console.log("   entry       median ms   heap KB   maps at import   control (forced)");

const distMs = {};
for (const entry of ENTRIES) {
  const samples = [];
  const heaps = [];
  let mapsAtImport = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const r = runChild("child-dist.mjs", [entry], ["--expose-gc"]);
    samples.push(r.ms);
    heaps.push(r.heapDelta);
    mapsAtImport = Math.max(mapsAtImport, r.maps);
  }
  const control = runChild("child-dist.mjs", [entry, "--force"], ["--expose-gc"]);
  const forcedTotal = control.mapsTotal - control.maps;

  distMs[entry] = median(samples);
  const heapKb = Math.round(median(heaps) / 1024);
  const ok = mapsAtImport === 0 && forcedTotal > 0;
  console.log(
    `   ${entry.padEnd(11)} ${distMs[entry].toFixed(2).padStart(9)} ${String(heapKb).padStart(9)}` +
      ` ${String(mapsAtImport).padStart(16)}   ${String(forcedTotal).padStart(3)} built  ${ok ? "✓" : "✗"}`,
  );

  if (mapsAtImport > 0) {
    failures.push(`${entry}: dist constructed ${String(mapsAtImport)} Map(s) at import time`);
  }
  if (forcedTotal === 0) {
    failures.push(
      `${entry}: the --force control built no Map, so the probe proves nothing. ` +
        `Either the Map counter no longer sees the bundle's constructions, or ` +
        `child-dist.mjs's FORCE[${entry}] no longer touches a lazy structure.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Bytes: the narrow entries carry no commune data at all.
// ---------------------------------------------------------------------------

console.log("\n3. dist: commune data absent from the narrow entries");

for (const entry of ["wilayas", "dairas"]) {
  const file = fileURLToPath(new URL(`${entry}.mjs`, DIST));
  if (!existsSync(file)) {
    failures.push(`${entry}: dist/${entry}.mjs is missing — run \`pnpm build\` first`);
    continue;
  }
  const source = readFileSync(file, "utf8");
  const leaked = COMMUNE_ONLY_SENTINELS.filter((s) => source.includes(s));
  console.log(
    `   dist/${entry}.mjs`.padEnd(26) +
      (leaked.length === 0
        ? `${String(COMMUNE_ONLY_SENTINELS.length)} sentinels absent  ✓`
        : `LEAKED ${leaked.join(", ")}  ✗`),
  );
  if (leaked.length > 0) failures.push(`${entry}: commune data leaked — ${leaked.join(", ")}`);
}

// The control, and it is the same argument as everywhere else in this suite: an
// absence check whose strings are not detectable in the first place passes
// against any bundle at all, including an empty one.
const communesSource = readFileSync(fileURLToPath(new URL("communes.mjs", DIST)), "utf8");
const undetectable = COMMUNE_ONLY_SENTINELS.filter((s) => !communesSource.includes(s));
console.log(
  "   dist/communes.mjs".padEnd(26) +
    (undetectable.length === 0
      ? `${String(COMMUNE_ONLY_SENTINELS.length)} sentinels present (control)  ✓`
      : `CONTROL IS DEAD — missing ${undetectable.join(", ")}  ✗`),
);
for (const s of undetectable) {
  failures.push(
    `dist/communes.mjs does not contain "${s}", so the absence checks above prove ` +
      "nothing. Fix the sentinels before trusting any result from this gate.",
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n✗ import-time gate failed:\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log("\n✓ import-time gate passed");
}
