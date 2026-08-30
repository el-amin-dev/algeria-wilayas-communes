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

      // Frozen data contract: the 72 JSON files under data/ are byte-identity
      // gated. Nothing may rewrite them, and there is no JS to lint in there.
      "data/**",

      // Internal planning docs — not ours to lint or reformat.
      "docs/**",

      // Emitted by `scripts/build-data.ts`. Generated code is not hand-written
      // code: lint findings there would have to be fixed in the emitter, not in
      // the output, and any edit here is destroyed on the next build.
      "packages/js/src/generated/**",

      // Pre-existing published v1 surface. Must stay byte-identical this
      // session, so linting it can only produce findings we are forbidden to act
      // on.
      "packages/js/index.js",
      "packages/js/index.d.ts",
    ],
  },

  // Baseline recommended rules for every linted file (including this config).
  js.configs.recommended,

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
);
