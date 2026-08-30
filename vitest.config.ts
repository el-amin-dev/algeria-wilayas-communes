import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Flat test layout, one file per concern. No __tests__ directories nested
    // inside src/ — the source tree stays shippable and the coverage `include`
    // glob below stays a single line.
    include: ["tests/**/*.test.ts"],

    typecheck: {
      // ON, as of session 2 — the commit that adds the first `*.test-d.ts`.
      //
      // This flag is not a preference, it is what makes `tests/types.test-d.ts`
      // execute at all. `expectTypeOf` and `@ts-expect-error` are ERASED before
      // run time, so a plain `vitest run` reports a file full of broken type
      // assertions as passing: it never type-checks it. With `enabled: false`
      // the type tests would be 200 lines of decoration.
      //
      // The cost is real and accepted: every `pnpm test` now shells out to tsc
      // over the tsconfig program. It buys the only mechanism that can catch a
      // widened `byWilaya` parameter — an unused `@ts-expect-error` directive
      // is itself an error, which no positive test can express.
      //
      // `pnpm typecheck` (`tsc --noEmit`, whose `include` also covers `tests/`)
      // is the second net, in case this field is ever flipped back or vitest's
      // typechecker is misconfigured. Two independent nets, on purpose.
      enabled: true,
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
      // NOT 100, and not a negative "max uncovered count" either. Negative
      // thresholds are SILENTLY IGNORED by vitest 4's v8 provider — verified by
      // setting `branches: -1` against 2 uncovered branches and watching the run
      // pass. A gate that cannot go red is worse than no gate, so these are
      // percentages, which are enforced (verified in both directions).
      //
      // The shortfall is exactly two branch arms and the one statement they sit
      // on: the `a.key < b.key` / `a.key > b.key` tie-break in `compareScored`
      // (search.ts). They are deliberately NOT annotated `v8 ignore`, unlike the
      // 21 guards that are, because they are not structurally unreachable —
      // they are simply never invoked in the descending direction, since every
      // tier appends candidates in ascending key order and V8's sort never needs
      // to swap an already-ordered tie-break field. That is a property of the
      // current data and the current sort, not of the code, so claiming
      // "unreachable" would overstate it. The arms must stay regardless: a
      // comparator handed to Array.prototype.sort has to be a total order.
      //
      // Current absolutes: statements 692/693, branches 330/332, lines 560/560,
      // functions 101/101. Because these are percentages they drift as the file
      // grows — if a number moves, find out WHY before adjusting it.
      //
      // Session 3 (reform + v1 compat) added ~230 statements and the numbers went
      // UP, to 99.85 / 99.37: the six new modules are fully covered, and the nine
      // genuinely unreachable defensive arms they introduced carry `v8 ignore`
      // with a reason each, rather than being paid for out of the threshold.
      // These numbers RATCHET. Raise them when coverage improves; never lower
      // them to make a red run go green — a shortfall is a missing test or an
      // unreachable branch that needs annotating, and both have a real fix.
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 99.87,
        branches: 99.46,
      },
    },
  },
});
