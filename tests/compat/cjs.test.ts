/**
 * **This file is the v1 contract. A failure here is a breaking change, not a
 * flaky test.**
 *
 * ── The one README example that has never worked ────────────────────────────
 *
 * `packages/js/README.md`, lines 30-35:
 *
 * ```js
 * // CommonJS works too:
 * const dz = require("algeria-wilayas-communes");
 * dz.getWilayas().length; // 69
 * ```
 *
 * It does not work today, and it never has. v1's `package.json` is
 * `"type": "module"` and its `"."` condition map declares only `"import"` —
 * there is no `"require"` key — so that snippet throws `ERR_REQUIRE_ESM` or
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` depending on the Node version. It is a
 * documentation bug that has shipped in every 1.x release.
 *
 * Two consequences, both worth stating plainly:
 *
 * 1. **No CJS consumer exists today**, because none can. So adding CJS in v2 is
 *    purely additive and breaks nothing — there is no behaviour to preserve,
 *    only a promise to finally keep.
 * 2. This is therefore the one file in `tests/compat/` that is *expected* to be
 *    red against v1 and green against v2, rather than the other way round.
 *
 * ── Why a real `.cjs` file in a child process ───────────────────────────────
 *
 * `createRequire(import.meta.url)` inside this ESM test would be the easy way,
 * and it would be worthless: the calling module's format participates in
 * condition resolution, and bundler/test-runner resolvers routinely paper over
 * a broken `exports` map that real Node would reject. The only way to prove the
 * `"require"` condition resolves is to make **Node itself** resolve it, from a
 * genuine CommonJS file, in a fresh process, with no vitest transform anywhere
 * near it.
 *
 * The fixture is written to a temp directory at run time — not committed —
 * containing a `node_modules/algeria-wilayas-communes` symlink to the package.
 * That is what makes `require("algeria-wilayas-communes")` a **bare specifier**
 * lookup, which is the only form that consults the `exports` map. A
 * `require("/abs/path/to/packages/js")` would bypass `exports` entirely and
 * silently fall back to `"main"` — the exact masking this file exists to avoid.
 *
 * ── Why it is skipped right now ─────────────────────────────────────────────
 *
 * There is no `packages/js/dist/` yet. The dual ESM+CJS build is **session 4's**
 * job and `pnpm build` is deliberately unimplemented until then, so this file
 * gates on the build output existing and the whole suite stays green without
 * it. The skip is not a silenced failure: it is a test written ahead of the
 * code it covers, with a named unblocking event. It goes green the moment
 * session 4 lands `dist/index.cjs` and the `"require"` condition in the exports
 * map — and if session 4 ships a build whose CJS entry is broken, this is what
 * catches it.
 *
 * What it proves when it runs: that the published `exports` map exposes a
 * `"require"` condition for `"."`, that the CJS entry actually loads under
 * `require()`, and that the README's five-year-old promise is true.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// ── Locations ───────────────────────────────────────────────────────────────
// Two levels up, because this file sits in a subdirectory.

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PACKAGE_DIR = join(REPO_ROOT, "packages", "js");
const DIST_DIR = join(PACKAGE_DIR, "dist");

/** Session 4 produces `dist/`. Until it does, everything below is skipped. */
const HAS_DIST = existsSync(DIST_DIR);

// ── The sandbox ─────────────────────────────────────────────────────────────

const sandboxes: string[] = [];

/**
 * A throwaway directory holding a `node_modules/algeria-wilayas-communes`
 * symlink to the package under test, plus the given CommonJS script.
 *
 * The symlink is what turns `require("algeria-wilayas-communes")` into a real
 * bare-specifier resolution against the package's `exports` map.
 */
function writeCjsFixture(filename: string, source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "awc-cjs-"));
  sandboxes.push(dir);
  const modules = join(dir, "node_modules");
  mkdirSync(modules);
  symlinkSync(PACKAGE_DIR, join(modules, "algeria-wilayas-communes"), "dir");
  const file = join(dir, filename);
  writeFileSync(file, source, "utf8");
  return file;
}

/** Run a `.cjs` file in a fresh Node process and return its stdout, trimmed. */
function runCjs(file: string): string {
  return execFileSync(process.execPath, [file], { encoding: "utf8" }).trim();
}

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

// ── The README's CommonJS snippet, executed ─────────────────────────────────

describe.skipIf(!HAS_DIST)("README `## Usage` snippet 2 — `require()` from real CommonJS", () => {
  it("the package actually declares a `require` condition for `.`", () => {
    // Asserted before the child process runs, so a missing condition reports as
    // "no require condition" rather than as an opaque resolver error.
    const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>;
    };
    const root = pkg.exports?.["."];
    expect(root).toBeTypeOf("object");
    expect(root).toHaveProperty("require");
    // The v1 public subpath must survive the rewrite — consumers import the raw
    // JSON without calling a single function.
    expect(pkg.exports).toHaveProperty(["./data/*"]);
  });

  it('`const dz = require("algeria-wilayas-communes"); dz.getWilayas().length` → 69', () => {
    const file = writeCjsFixture(
      "readme-cjs-example.cjs",
      [
        // Verbatim from the README, plus a print so the parent can assert on it.
        'const dz = require("algeria-wilayas-communes");',
        "console.log(dz.getWilayas().length);",
        "",
      ].join("\n"),
    );
    expect(runCjs(file)).toBe("69");
  });

  it("`require()` does not throw ERR_REQUIRE_ESM / ERR_PACKAGE_PATH_NOT_EXPORTED", () => {
    // The two errors v1 produced, named explicitly: if the exports map ever
    // regresses to ESM-only, the failure message says which one came back.
    const file = writeCjsFixture(
      "error-probe.cjs",
      [
        "try {",
        '  require("algeria-wilayas-communes");',
        '  console.log("OK");',
        "} catch (err) {",
        "  console.log(String(err && err.code ? err.code : err));",
        "}",
        "",
      ].join("\n"),
    );
    expect(runCjs(file)).toBe("OK");
  });

  it("the v1 seven are reachable under `require()` via `/legacy`", () => {
    // The README's example only exercises `getWilayas`, but a CJS consumer
    // migrating from a v1 ESM call site needs the whole v1 surface, and under
    // ADR-001 that lives at `/legacy`. Its `require` condition must resolve too.
    const file = writeCjsFixture(
      "legacy.cjs",
      [
        'const dz = require("algeria-wilayas-communes/legacy");',
        "console.log(",
        "  [",
        '    "getAll",',
        '    "getWilayas",',
        '    "getDairas",',
        '    "getCommunes",',
        '    "byWilaya",',
        '    "findByPostalCode",',
        '    "findCommune",',
        '  ].every((name) => typeof dz[name] === "function"),',
        "  dz.getWilayas().length,",
        "  dz.getCommunes().length,",
        "  dz.byWilaya(16).nom_en,",
        ");",
        "",
      ].join("\n"),
    );
    expect(runCjs(file)).toBe("true 69 1541 Algiers");
  });
});
