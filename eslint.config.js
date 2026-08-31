import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ---------------------------------------------------------------------------
  // Global ignores.
  //
  // `eslint .` walks the whole repo, so every pre-existing or generated file has
  // to be named here. The rule of thumb: lint only what this session hand-wrote
  // (scripts/, tests/, packages/js/src/*.ts, this file). Everything else is
  // either frozen, generated, or not ours.
  // ---------------------------------------------------------------------------
  {
    ignores: [
      // Tooling output — never source.
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      ".turbo/**",

      // Python virtualenvs. `eslint .` walks the whole repo, and a venv is not
      // empty of JavaScript: installing anything that depends on `docutils`
      // (twine, readme_renderer, sphinx) drops a bundled `slides.js` into
      // site-packages, and eslint then reports ~150 browser-global errors in a
      // vendored file from 2005. The venv is gitignored tooling output, so
      // nothing in it is ours to lint or fix.
      ".venv/**",
      "venv/**",

      // Frozen data contract: the 72 JSON files under data/ are byte-identity
      // gated. Nothing may rewrite them, and there is no JS to lint in there.
      "data/**",

      // Internal planning docs — not ours to lint or reformat.
      "docs/**",

      // Emitted by `scripts/build-data.ts`. Generated code is not hand-written
      // code: lint findings there would have to be fixed in the emitter, not in
      // the output, and any edit here is destroyed on the next build.
      "packages/js/src/generated/**",

      // The frozen v1 implementation, kept verbatim so `pnpm bench` can measure
      // the real "before" column rather than a paraphrase of it. Linting it can
      // only produce findings we are forbidden to act on. The rest of
      // benchmarks/ IS linted -- it was hand-written this session.
      "benchmarks/v1/**",

      // The Vite fixture's own sources. They are compiled by Vite against the
      // BUILT package (dist/), not by this repo's tsconfig, so the type-checked
      // ruleset has no program for them and reports a parse error. Their
      // correctness is proved by `pnpm treeshake:proof` actually building them.
      "benchmarks/treeshake-fixture/src/**",
      "benchmarks/treeshake-fixture/vite.config.ts",
    ],
  },

  // Baseline recommended rules for every linted file (including this config).
  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // benchmarks/*.mjs and scripts/*.mjs — plain Node scripts, not library code.
  //
  // They are hand-written this session and must stay linted, but they run in
  // Node and use `process`, `console` and `URL` freely. `js.configs.recommended`
  // brings `no-undef` with no environment attached, so the globals are declared
  // here rather than switching the whole repo to a browser/node union. The
  // library itself may NOT touch any of these -- that rule is enforced
  // separately, and far more strictly, further down.
  //
  // Not type-checked: they are .mjs, and the type-aware block below is scoped to
  // `**/*.ts` on purpose.
  // ---------------------------------------------------------------------------
  {
    files: ["benchmarks/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        console: "readonly",
        global: "readonly",
        performance: "readonly",
        process: "readonly",
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Type-checked rules, TypeScript only.
  //
  // Scoped to `**/*.ts` so the type-aware ruleset never sees a .js file. This
  // config itself is `.js`, so it is linted by js.configs.recommended above and
  // is deliberately outside the type-checked glob — it needs no TS program.
  // `vitest.config.ts` IS inside the glob; tsconfig.json's `include` already
  // covers `*.config.ts`, so `projectService` finds a program for it.
  //
  // `projectService: true` is the modern replacement for `project: [...]`: it
  // resolves each file's nearest tsconfig on demand and degrades gracefully for
  // files no tsconfig claims, instead of erroring out.
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.ts"],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // The library may not import Node builtins. Enforced, not merely documented.
  //
  // This is repo invariant #3, and it is the whole reason `generated/*.ts`
  // exists: v1's `index.js` did `readFileSync` at module scope, which is why it
  // could not run in a browser bundle, Vite, a Cloudflare Worker, Deno or React
  // Native AT ALL. Nothing under `packages/js/src/` may reintroduce that.
  //
  // Without this rule the invariant had no teeth: a `node:fs` import added to,
  // say, `legacy/project.ts` would pass typecheck, pass all 975 tests and meet
  // the coverage thresholds, while silently re-breaking every non-Node target.
  // The tests cannot catch it — they run in Node, where it works fine.
  //
  // Scoped to the library only. `scripts/` and `tests/` run in Node by design
  // and use `node:fs` freely; `generated/` is already globally ignored.
  // ---------------------------------------------------------------------------
  {
    files: ["packages/js/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "url", "crypto", "os"],
              message:
                "packages/js/src/ must not import Node builtins (repo invariant #3). " +
                "The library ships to browsers, Workers, Deno and React Native. Data " +
                "comes from packages/js/src/generated/, emitted by scripts/build-data.ts.",
            },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // zod is an OPTIONAL PEER. Only src/zod.ts may reach it. (Repo invariant #2.)
  //
  // This is invariant #3's sibling and it had NO enforcement until a review
  // found the gap. Nothing catches the mistake it prevents: adding
  // `export { wilayaSchema } from "./zod"` to src/index.ts for convenience
  // passes typecheck, all 1035 tests, publint AND attw -- because zod is a root
  // devDependency and therefore resolves in this repo. It breaks only on a
  // consumer's machine, where `import "algeria-wilayas-communes"` dies with
  // ERR_MODULE_NOT_FOUND for a package they never asked for, and every browser
  // bundler fails on the unresolvable bare specifier.
  //
  // Scoped by exclusion rather than by an `ignores` on the file, so that adding
  // a second zod-importing module is a deliberate edit here rather than an
  // accident there.
  // ---------------------------------------------------------------------------
  {
    files: ["packages/js/src/**/*.ts"],
    ignores: ["packages/js/src/zod.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "url", "crypto", "os"],
              message:
                "packages/js/src/ must not import Node builtins (repo invariant #3). " +
                "The library ships to browsers, Workers, Deno and React Native. Data " +
                "comes from packages/js/src/generated/, emitted by scripts/build-data.ts.",
            },
            {
              group: ["zod", "zod/*", "./zod", "../zod", "*/zod"],
              message:
                "Only packages/js/src/zod.ts may import zod (repo invariant #2). zod is " +
                "an OPTIONAL peer: reaching it from any other module makes " +
                'require("algeria-wilayas-communes") fail for every consumer who does not ' +
                "have zod installed, and leaves an unresolvable bare specifier in the " +
                "browser bundles. src/zod.ts is a leaf -- nothing imports it.",
            },
          ],
        },
      ],
    },
  },
);
