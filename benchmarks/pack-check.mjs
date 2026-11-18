/**
 * Assert the published tarball contains `dist/**` and `data/**`, the whole
 * frozen data contract, and nothing else.
 *
 * **Both halves are asserted, and the positive half is the one that matters.**
 * An earlier version of this script only checked "nothing else": it counted the
 * dist/ and data/ files, printed them, and compared them to nothing. Dropping
 * `"data"` from `files` would have emptied the tarball of all 73 JSON files,
 * broken every `algeria-wilayas-communes/data/*.json` import on npm and
 * jsDelivr, and printed `data/ 0` next to a green tick.
 *
 * `npm pack --dry-run` is the obvious way to check this by eye, and the obvious
 * way to get it wrong: `prepack` runs the build first, so the command's output
 * interleaves tsup's log — which mentions `src/index.ts`, `tsconfig.json` and
 * `tsup.config.ts` — with the file listing. Grepping the combined stream for
 * "src/" reports three leaks that are not in the tarball at all. This script
 * reads the machine-readable `--json` listing instead, so the build log cannot
 * be mistaken for contents.
 *
 * Three files are always allowed regardless of `files`: npm includes
 * `package.json`, `README.md` and `LICENSE` unconditionally, and cannot be told
 * not to.
 *
 * `data/raw/` IS expected here and must NOT be published. It is hand-edited
 * build input, and `data/raw/reform.json`'s `todo` strings name the UNVERIFIED
 * candidate wilaya mere for each of the 11 new wilayas — the exact table ADR-005
 * refuses to ship. `.github/workflows/publish-npm.yml` removes it after the copy
 * step; this script asserts that step still exists, because locally the staged
 * data always contains it.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);
const PACKAGE_DIR = fileURLToPath(new URL("packages/js/", REPO_ROOT));
const WORKFLOW = fileURLToPath(new URL(".github/workflows/publish-npm.yml", REPO_ROOT));

/** npm ships these three whatever `files` says. */
const ALWAYS_INCLUDED = new Set(["package.json", "README.md", "LICENSE"]);

// `--ignore-scripts` is required, not an optimisation: `prepack` runs tsup, and
// tsup writes its build log to STDOUT, so the JSON listing comes back with
// "CLI Building entry: ..." prepended and JSON.parse throws. dist/ is already
// built by `pnpm build`, which this script checks for below.
const raw = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: PACKAGE_DIR,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const distIndex = fileURLToPath(new URL("packages/js/dist/index.mjs", REPO_ROOT));
if (!existsSync(distIndex)) {
  console.error("packages/js/dist/ is missing. Run `pnpm build` before `pnpm pack:check`.");
  process.exit(1);
}

const [meta] = JSON.parse(raw);
const paths = meta.files.map((f) => f.path);

/**
 * The frozen contract: 4 top-level JSON files plus 69 `by-wilaya/*.json`.
 * Hard-coded rather than derived from `data/` on disk, because a check that
 * counts the same directory it is validating cannot catch that directory being
 * left out of the tarball.
 */
const DATA_CONTRACT_FILES = 73;

const failures = [];
const unexpected = paths.filter(
  (p) => !ALWAYS_INCLUDED.has(p) && !p.startsWith("dist/") && !p.startsWith("data/"),
);

const counts = { dist: 0, data: 0, "data/raw": 0, always: 0 };
for (const p of paths) {
  if (ALWAYS_INCLUDED.has(p)) counts.always++;
  else if (p.startsWith("data/raw/")) counts["data/raw"]++;
  else if (p.startsWith("data/")) counts.data++;
  else if (p.startsWith("dist/")) counts.dist++;
}

console.log(`Tarball: ${meta.name}@${meta.version}  (${String(paths.length)} files)\n`);
console.log(`  dist/       ${String(counts.dist).padStart(4)}`);
console.log(`  data/       ${String(counts.data).padStart(4)}   (the frozen 73-file contract)`);
console.log(
  `  data/raw/   ${String(counts["data/raw"]).padStart(4)}   stripped by CI before publish`,
);
console.log(
  `  npm always  ${String(counts.always).padStart(4)}   ${[...ALWAYS_INCLUDED].join(", ")}`,
);

// exports/csv and exports/sql are deliberately OUTSIDE the npm tarball: they
// serve jq users, analysts and database seeders over the repo and jsDelivr, and
// shipping ~460 kB of CSV and SQL to every `npm install` would serve nobody.
// They live at the repo root, outside packages/js, so `pnpm pack` cannot reach
// them today -- this asserts it stays that way if anyone moves them.
const leakedExports = paths.filter((p) => p.startsWith("exports/") || p.includes("/exports/"));
if (leakedExports.length > 0) {
  failures.push(
    `exports/ leaked into the tarball: ${leakedExports.join(", ")}. ` +
      "The CSV and SQL mirrors are repo/jsDelivr artifacts, not npm payload.",
  );
}

if (unexpected.length > 0) {
  failures.push(
    `these are neither dist/ nor data/: ${unexpected.join(", ")}. ` +
      "Fix `files` in packages/js/package.json -- never add an .npmignore.",
  );
}

// The positive assertions. Each names the consumer-visible breakage rather than
// the number, so a failure says what is broken and not merely that it changed.
if (counts.dist === 0) {
  failures.push(
    "the tarball contains no dist/ files, so every entry point in the exports " +
      'map resolves to nothing. Did `files` lose "dist", or did the build not run?',
  );
}
if (counts.data !== DATA_CONTRACT_FILES) {
  failures.push(
    `the tarball has ${String(counts.data)} data/ files, expected ` +
      `${String(DATA_CONTRACT_FILES)}. exports["./data/*"] is a published contract ` +
      "consumed over jsDelivr and by the jq, Python and Java examples in the README; " +
      "a short count means `algeria-wilayas-communes/data/<something>.json` now 404s.",
  );
}
if (counts.always !== ALWAYS_INCLUDED.size) {
  const present = paths.filter((f) => ALWAYS_INCLUDED.has(f));
  failures.push(
    `missing from the tarball: ${[...ALWAYS_INCLUDED].filter((f) => !present.includes(f)).join(", ")}. ` +
      "package.json declares license CC0-1.0, so the LICENSE file has to be there to back it.",
  );
}

// The CI step that both populates ./data/* and removes the unverified table.
const workflow = readFileSync(WORKFLOW, "utf8");
for (const [what, needle] of [
  ["copies data into the package", "cp -r data packages/js/data"],
  ["removes the unverified raw/ table", "rm -rf packages/js/data/raw"],
  ["builds before publishing", "pnpm build"],
  ["runs the gates before publishing", "pnpm lint:publish"],
  ["checks the tarball before publishing", "pnpm pack:check"],
  ["routes prereleases to the `next` dist-tag", 'if [[ "$VERSION" == *-* ]]; then TAG=next'],
]) {
  const present = workflow.includes(needle);
  console.log(`  workflow ${present ? "✓" : "✗"} ${what}`);
  if (!present) failures.push(`publish-npm.yml no longer ${what} (\`${needle}\` is gone)`);
}

if (failures.length > 0) {
  console.error(`\n✗ pack check failed:\n  - ${failures.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log("\n✓ pack check passed");
}
