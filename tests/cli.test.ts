/**
 * The CLI, exercised as a subprocess against the BUILT artifact.
 *
 * Importing `src/cli.ts` would be the wrong test. The file runs on import and
 * sets `process.exitCode`, so an in-process import would mutate the test
 * runner's own exit code, and it would prove nothing about the thing users
 * actually run: `dist/cli.mjs`, with its shebang, its ESM-only build and its
 * bundled copy of the dataset.
 *
 * So these spawn it. That also makes the exit-code contract testable, which is
 * the part most likely to rot: 0 found, 1 not found, 2 usage error. A lookup
 * that misses is not a crash, and a bad flag is not a miss.
 *
 * Skipped when `dist/` is absent, exactly like `tests/dist.artifact.test.ts`,
 * and the `node` CI job builds before testing so it never skips there.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../packages/js/dist/cli.mjs", import.meta.url));
const HAS_CLI = existsSync(CLI);

/** Run the CLI and capture stdout plus the exit code, never throwing. */
function cli(...args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, code: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { out: (e.stdout ?? "") + (e.stderr ?? ""), code: e.status ?? -1 };
  }
}

describe.skipIf(!HAS_CLI)("the CLI", () => {
  it("is built, and the skip condition above is not hiding a missing file", () => {
    // Guards against this whole block silently never running.
    expect(HAS_CLI).toBe(true);
  });

  describe("exit codes mean something", () => {
    it("exits 0 on a hit", () => {
      expect(cli("postal", "19018").code).toBe(0);
      expect(cli("wilaya", "19").code).toBe(0);
      expect(cli("version").code).toBe(0);
    });

    it("exits 1 on a miss, which is not an error", () => {
      expect(cli("commune", "no-such-commune").code).toBe(1);
      expect(cli("search", "zzzzzzzzzz").code).toBe(1);
    });

    it("exits 2 on a usage error, which is not a miss", () => {
      // The distinction matters: "1908" is not a code that missed, it is not a
      // code at all, and reporting "not found" would send someone hunting for
      // a commune instead of fixing their input.
      expect(cli("postal", "1908").code).toBe(2);
      expect(cli("wilaya", "99").code).toBe(2);
      expect(cli("bogus").code).toBe(2);
      expect(cli("--nope").code).toBe(2);
      expect(cli("--limit").code).toBe(2);
      expect(cli("--lang", "de").code).toBe(2);
      expect(cli().code).toBe(2);
    });

    it("exits 0 for an explicit --help but 2 for no command at all", () => {
      expect(cli("--help").code).toBe(0);
      expect(cli().code).toBe(2);
    });
  });

  describe("--json is the real interface", () => {
    it("emits parseable JSON for every command that returns records", () => {
      for (const args of [
        ["postal", "19018"],
        ["communes", "19"],
        ["dairas", "19"],
        ["wilayas"],
        ["wilaya", "19"],
        ["commune", "19-ain-azel-ain-lahdjar"],
        ["search", "setif"],
        ["reform"],
        ["version"],
      ]) {
        const { out, code } = cli(...args, "--json");
        expect(code, `${args.join(" ")} should succeed`).toBe(0);
        expect(
          () => JSON.parse(out) as unknown,
          `${args.join(" ")} should emit JSON`,
        ).not.toThrow();
      }
    });

    it("agrees with the library it wraps", () => {
      const parsed = JSON.parse(cli("communes", "19", "--json").out) as { id: string }[];
      expect(parsed).toHaveLength(60);
      expect(parsed.every((c) => c.id.startsWith("19-"))).toBe(true);
    });

    it("emits null, not a message, for a miss in JSON mode", () => {
      const { out, code } = cli("commune", "no-such-commune", "--json");
      expect(code).toBe(1);
      expect(JSON.parse(out)).toBeNull();
    });
  });

  describe("the data it reports", () => {
    it("finds the canonical row by postal code", () => {
      expect(cli("postal", "19018").out).toContain("Ain Lahdjar");
    });

    it("searches in Arabic", () => {
      expect(cli("search", "سطيف", "--limit", "1").out).toContain("سطيف");
    });

    it("honours --limit", () => {
      const rows = JSON.parse(cli("search", "ain", "--limit", "3", "--json").out) as unknown[];
      expect(rows).toHaveLength(3);
    });

    it("reports the JO date as publication, never as the signing date", () => {
      // The law is dated 4 April 2026, the JO issue 5 April. The first draft of
      // the reform command printed "signed 2026-04-05", which is the exact
      // confusion docs/DATA_PROVENANCE.md calls out.
      const out = cli("reform").out;
      expect(out).toContain("published in the JO 2026-04-05");
      expect(out).not.toContain("signed 2026-04-05");
    });

    it("warns that the reform resolvers throw while the mapping is unsourced", () => {
      // Whoever runs `reform` is about to call a resolver that raises.
      expect(cli("reform").out).toContain("not guessed");
    });
  });
});
