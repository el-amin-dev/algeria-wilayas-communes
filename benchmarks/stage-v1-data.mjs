/**
 * Stage `data/` into `packages/js/data/` so the frozen v1 fixture can read it.
 *
 * This reproduces, locally and exactly, what `.github/workflows/publish-npm.yml`
 * does at pack time. `packages/js/data/` is gitignored, so this leaves the
 * working tree clean — the copy goes *from* `data/` *into* the package, never
 * the other way round.
 *
 * **Written in Node rather than as `cp -r data packages/js/data`** because on
 * the maintainer's machine `cp` is aliased to `cp -i` and zsh has `noclobber`
 * set: the shell form prompts, declines, and exits 0 having done nothing. A
 * silent no-op that looks like success is worse than an error, and this script
 * has bitten that way before.
 *
 * Idempotent. Run it as often as you like.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(REPO_ROOT, "data");
const TARGET = join(REPO_ROOT, "packages", "js", "data");

if (!existsSync(SOURCE)) {
  console.error(`No data/ directory at ${SOURCE}. Run \`pnpm build:data\` first.`);
  process.exitCode = 1;
} else {
  rmSync(TARGET, { recursive: true, force: true });
  cpSync(SOURCE, TARGET, { recursive: true });
  console.log(`staged ${SOURCE} -> ${TARGET}`);
}
