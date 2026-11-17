import { defineConfig } from "tsup";

/**
 * The dual ESM + CJS build, one bundle per published entry point.
 *
 * ── Six entries, seven subpaths ─────────────────────────────────────────────
 *
 * `./data/*` is the seventh subpath and is not built: it is the v1 raw-JSON
 * contract, copied into the package by `.github/workflows/publish-npm.yml` at
 * pack time and passed straight through the exports map. Do not add it here.
 *
 * ── Why each non-obvious option is what it is ───────────────────────────────
 *
 * - **`splitting: false`** — chunk splitting would create shared chunks between
 *   `/wilayas` and `/communes`, which makes per-entry size budgets unmeasurable
 *   and can drag the commune table into the wilaya entry through a chunk no one
 *   reviewed. Duplicating a few hundred bytes of shared helper is the price of a
 *   budget that can actually fail in CI. It is also why `src/tiers/*` may
 *   duplicate logic from `api.ts` without guilt: every entry gets its own copy
 *   regardless.
 * - **`outExtension`** — explicit `.mjs` / `.cjs` rather than relying on
 *   `"type": "module"` inference. Extension-explicit output is what lets both
 *   formats coexist in one directory unambiguously, and what makes the `.d.cts`
 *   pairing below meaningful.
 * - **`external: ["zod"]`** — zod is an OPTIONAL PEER. Bundling it would put it
 *   in every consumer's download and make the zero-runtime-dependency claim
 *   false. `dist/zod.mjs` must contain a bare `from "zod"` specifier and
 *   `dist/index.*` must contain no `zod` specifier at all — both asserted by
 *   `tests/dist.artifact.test.ts`, and the source-side rule that keeps it that
 *   way is the `no-restricted-imports` block for `zod` in `eslint.config.js`.
 * - **`treeshake: true`** — with `"sideEffects": false` in the manifest, this is
 *   what lets a consumer's bundler drop the parts of an entry they do not touch.
 *
 * ── `.d.cts` is not optional ────────────────────────────────────────────────
 *
 * A `.d.ts` file's module kind is decided by the nearest `package.json`
 * `"type"` field, not by its content. This package is `"type": "module"`, so
 * every `.d.ts` in `dist/` is read as ESM types — including by a consumer who
 * resolved the `"require"` branch. That is `@arethetypeswrong/cli`'s
 * *Masquerading as CJS*, and it produces type errors with no runtime bug or,
 * worse, no type error where there is one.
 *
 * **tsup 8.5 emits the `.d.cts` half itself** from `dts: true` once `format`
 * includes `cjs`, so no post-build copy step is needed. That is a property of
 * this tsup version, not a guarantee: if a future upgrade emits only `.d.ts`,
 * `pnpm lint:publish` goes red with *Masquerading as CJS* and the fix is a copy
 * step, not a suppression. Verified output per entry: `.mjs`, `.cjs`, `.d.ts`,
 * `.d.cts` — 24 files across the six entries, plus sourcemaps and the shared
 * declaration chunks TypeScript factors out.
 *
 * ── node10 needs `typesVersions`, separately ────────────────────────────────
 *
 * TypeScript's legacy `moduleResolution: "node"` ignores `exports` entirely and
 * resolves `algeria-wilayas-communes/wilayas` as a path on disk, which does not
 * exist. attw reports it as *Resolution failed* on the node10 row for all five
 * subpaths. The fix is the `typesVersions` block in `package.json`, which maps
 * each subpath to its `.d.ts`. JSON carries no comments, so the reasoning lives
 * here: that block is *redundant* for every resolver that reads `exports`
 * (node16, bundler) and load-bearing only for node10. `publint --strict`
 * accepts it; deleting it turns five attw rows back to 💀.
 */
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      wilayas: "src/wilayas.ts",
      dairas: "src/dairas.ts",
      communes: "src/communes.ts",
      zod: "src/zod.ts",
      legacy: "src/legacy/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: "es2020",
    outExtension: ({ format }) => ({ js: format === "esm" ? ".mjs" : ".cjs" }),
    external: ["zod"],
  },

  // The CLI, built separately and deliberately unlike the library entries.
  //
  // - ESM only. A CLI is executed, never imported, so a second CJS copy of the
  //   whole dataset would double the installed size to serve nobody.
  // - `dts: false`. Nothing imports a CLI, so a .d.ts for it is dead weight and
  //   would show up as another row in `attw` for no reason.
  // - `clean: false` is REQUIRED. tsup runs these configs in sequence against
  //   one outDir; a second `clean: true` would delete everything the first
  //   config just emitted and the package would publish with only a CLI in it.
  // - The shebang goes in via `banner`, not in the source, because the source is
  //   type-checked by `tsc -p tsconfig.json` where a leading `#!` is a syntax
  //   error.
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: false,
    treeshake: true,
    target: "es2020",
    outExtension: () => ({ js: ".mjs" }),
    banner: { js: "#!/usr/bin/env node" },
  },
]);
