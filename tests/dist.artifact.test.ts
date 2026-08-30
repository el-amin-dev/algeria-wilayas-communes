/**
 * Assertions about the **built artifact** that no source-level test can make.
 *
 * These exist because three of this package's headline claims are properties of
 * `dist/`, not of `src/`, and every source-level gate passes while they are
 * false: zod is a root devDependency, so it resolves in this repo whatever the
 * bundle does.
 *
 * Skipped when `dist/` is absent, and the skip is itself asserted against — see
 * the first case. Run `pnpm build` first.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIST = join(fileURLToPath(new URL("../", import.meta.url)), "packages", "js", "dist");
const HAS_DIST = existsSync(DIST);

const read = (file: string) => readFileSync(join(DIST, file), "utf8");

describe.skipIf(!HAS_DIST)("the built artifact", () => {
  it.each(["index", "wilayas", "dairas", "communes", "legacy"])(
    "dist/%s.{mjs,cjs} contains no zod specifier",
    (entry) => {
      // Repo invariant #2. If this fails, `import "algeria-wilayas-communes"`
      // dies with ERR_MODULE_NOT_FOUND on every consumer machine without zod.
      for (const ext of ["mjs", "cjs"]) {
        expect(read(`${entry}.${ext}`)).not.toMatch(/["']zod["']/);
      }
    },
  );

  it("dist/zod.{mjs,cjs} keeps zod as a BARE external specifier", () => {
    // The mirror of the case above: external, so never inlined. If zod were
    // bundled, `/zod` would load without zod installed -- which looks like it
    // works and silently doubles every consumer's download.
    expect(read("zod.mjs")).toMatch(/from\s*["']zod["']/);
    expect(read("zod.cjs")).toMatch(/require\(["']zod["']\)/);
    // ...and none of zod's own internals came along for the ride.
    expect(read("zod.mjs")).not.toMatch(/\$ZodType|ZodString\s*=|_zod\b/);
  });

  it("every entry ships both formats and both declaration kinds", () => {
    for (const entry of ["index", "wilayas", "dairas", "communes", "zod", "legacy"]) {
      for (const ext of ["mjs", "cjs", "d.ts", "d.cts"]) {
        expect(existsSync(join(DIST, `${entry}.${ext}`)), `${entry}.${ext}`).toBe(true);
      }
    }
  });

  it("the root ships no default export, and /legacy does (ADR-001)", () => {
    // A missing default is a LINK-TIME error in ESM, which is the whole point:
    // a v1 caller who upgrades gets a loud failure at import rather than a
    // silent `undefined` at property access.
    expect(read("index.mjs")).not.toMatch(/\bas default\b|\bexport default\b/);
    expect(read("legacy.mjs")).toMatch(/\bas default\b|\bexport default\b/);
  });

  it("the narrow entries carry no commune data", () => {
    for (const entry of ["wilayas", "dairas"]) {
      expect(read(`${entry}.mjs`)).not.toContain("19-ain-azel-ain-lahdjar");
    }
    // The control: the string IS detectable where it should be present.
    expect(read("communes.mjs")).toContain("19-ain-azel-ain-lahdjar");
  });

  it("no debug hook leaked into any published entry", () => {
    // The tier/entry split exists so these never reach dist/. If one appears, it
    // has become a public symbol this major version has to support forever.
    //
    // Comments are stripped before matching. The declarations legitimately
    // *discuss* the hooks in prose -- `asof.d.ts` explains why the bundler can
    // drop `__asOfState` -- and a naive grep flags that as a leak, which is a
    // false positive that would train the next reader to loosen this test.
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "");

    for (const entry of ["index", "wilayas", "dairas", "communes", "zod", "legacy"]) {
      for (const ext of ["d.ts", "d.cts", "mjs", "cjs"]) {
        expect(stripComments(read(`${entry}.${ext}`)), `${entry}.${ext}`).not.toMatch(
          /__\w*(State|Stats)\b/,
        );
      }
    }
  });
});

it("dist/ exists — build before testing, or the suite above is vacuous", () => {
  // Deliberately OUTSIDE the skipIf block. tests/compat/cjs.test.ts spent a whole
  // session legitimately skipped waiting for session 4; now that dist/ is real,
  // a silent skip would hide the entire require() and artifact contract behind a
  // green run. This is the one case that fails instead of skipping.
  expect(HAS_DIST, "packages/js/dist/ is missing — run `pnpm build`").toBe(true);
});
