/**
 * The executable shim. All the logic is in `cli-core.ts`.
 *
 * This file is excluded from coverage in `vitest.config.ts`, and it is kept
 * this small so that the exclusion covers almost nothing: it binds `run` to
 * `process` and `console`, which cannot be exercised in-process without
 * mutating the test runner's own exit code. The behaviour it wires up is
 * covered twice over — in-process against `cli-core.ts`, and as a spawned
 * subprocess against the built artifact in `tests/cli.test.ts`.
 *
 * ESM-only, no `.d.ts`: nobody imports a CLI. See the second config block in
 * `tsup.config.ts`. The shebang is added there by `banner`, not here, because
 * `tsc -p tsconfig.json` treats a leading `#!` as a syntax error.
 *
 * @module
 */

import { UsageError, run } from "./cli-core";

const io = {
  out: (line: string) => {
    console.log(line);
  },
  err: (line: string) => {
    console.error(line);
  },
};

try {
  process.exitCode = run(process.argv.slice(2), io);
} catch (err) {
  if (err instanceof UsageError) {
    io.err(`error: ${err.message}\n`);
    io.err("Run `npx algeria-wilayas-communes --help` for usage.");
    process.exitCode = 2;
  } else {
    throw err;
  }
}
