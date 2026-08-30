import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Flat test layout, one file per concern. No __tests__ directories nested
    // inside src/ — the source tree stays shippable and the coverage `include`
    // glob below stays a single line.
    include: ["tests/**/*.test.ts"],

    typecheck: {
      // DECISION: off for now.
      //
      // `tests/**/*.test-d.ts` matches ZERO files in this session — the type
      // tests need the Session 2 API to assert against. The block lands now so
      // the config is written once, but leaving `enabled: true` would make
      // every `pnpm test` shell out to tsc over the whole tsconfig program for
      // zero assertions gained, and put a second failure surface in front of
      // this session's acceptance gate for no benefit.
      //
      // Nothing is lost meanwhile: `pnpm test:types` is `vitest run --typecheck`,
      // and the CLI flag overrides this field while still using the `include`
      // and `tsconfig` set here. Session 2 flips this to `true` in the same
      // commit that adds the first `*.test-d.ts`.
      enabled: false,
      include: ["tests/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },

    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["packages/js/src/**/*.ts"],
      exclude: [
        // The generated files are 1541 object literals with zero branches.
        // Including them inflates the percentage into meaninglessness — you
        // would hit 100% just by importing the module. The coverage number has
        // to describe *logic*. The generated data is verified by
        // tests/dataset.snapshot.test.ts instead, which is the right tool for
        // it.
        "packages/js/src/generated/**",
        "**/*.d.ts",
      ],
      // HONESTY NOTE, until session 2: after the exclusions above, `include`
      // currently matches only index.ts (`export {}`) and types.ts (types
      // only) — both compile to zero statements. So these thresholds pass on an
      // EMPTY set and report "100% ( 0/0 )". `pnpm test:coverage` is therefore
      // not yet a gate that can go red, and this session does not treat it as
      // one; scripts/build-data.ts is covered by tests/ and by the build's own
      // assertions instead. The first real logic module lands in session 2 and
      // makes these thresholds load-bearing. Do not read the 100% before then.
      //
      // Thresholds live HERE, not on a CI command line. `pnpm test:coverage`
      // must fail on a developer's machine for exactly the same reason it fails
      // in CI. A threshold that only exists in a workflow file is a threshold
      // people discover after pushing.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
