/**
 * The CLI's logic, in-process.
 *
 * `tests/cli.test.ts` spawns the built binary and proves the real artifact
 * works — shebang, bundle, exit codes. It cannot contribute coverage, because
 * in-process v8 instrumentation does not see a spawned child. So the logic
 * lives in `cli-core.ts` as a pure `run(argv, io) -> exitCode`, and this file
 * drives it directly.
 *
 * The two files are complementary on purpose and neither is redundant: delete
 * this one and the coverage thresholds collapse; delete the other and nothing
 * proves the published `bin` is executable at all.
 */

import { describe, expect, it } from "vitest";

import { UsageError, reformLines, run } from "../packages/js/src/cli-core";
import { COMMUNES_MISSING_POSTAL_CODE, REFORM, getCommune } from "../packages/js/src/index";

/** Run a command, capturing stdout and stderr instead of printing. */
function cli(...argv: string[]): { out: string; err: string; code: number } {
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
  try {
    const code = run(argv, io);
    return { out: out.join("\n"), err: err.join("\n"), code };
  } catch (e) {
    // The shim turns a UsageError into exit 2; mirror that here so the tests
    // assert the user-visible contract rather than the internal mechanism.
    if (e instanceof UsageError) return { out: out.join("\n"), err: e.message, code: 2 };
    throw e;
  }
}

describe("cli-core: exit codes", () => {
  it("0 on a hit", () => {
    expect(cli("postal", "19018").code).toBe(0);
    expect(cli("wilaya", "19").code).toBe(0);
    expect(cli("wilayas").code).toBe(0);
    expect(cli("dairas", "19").code).toBe(0);
    expect(cli("communes", "19").code).toBe(0);
    expect(cli("commune", "19-ain-azel-ain-lahdjar").code).toBe(0);
    expect(cli("reform").code).toBe(0);
    expect(cli("version").code).toBe(0);
    expect(cli("search", "setif").code).toBe(0);
  });

  it("1 on a miss", () => {
    expect(cli("commune", "no-such-commune").code).toBe(1);
    expect(cli("search", "zzzzzzzzzzzz").code).toBe(1);
    expect(cli("postal", "00000").code).toBe(1);
  });

  it("2 on a usage error", () => {
    expect(cli().code).toBe(2);
    expect(cli("bogus").code).toBe(2);
    expect(cli("--unknown-flag").code).toBe(2);
    expect(cli("search").code).toBe(2);
    expect(cli("postal").code).toBe(2);
    expect(cli("postal", "1908").code).toBe(2);
    expect(cli("wilaya").code).toBe(2);
    expect(cli("wilaya", "0").code).toBe(2);
    expect(cli("wilaya", "70").code).toBe(2);
    expect(cli("wilaya", "abc").code).toBe(2);
    expect(cli("commune").code).toBe(2);
    expect(cli("--limit").code).toBe(2);
    expect(cli("search", "x", "--limit", "0").code).toBe(2);
    expect(cli("search", "x", "--limit", "nope").code).toBe(2);
    expect(cli("--lang").code).toBe(2);
    expect(cli("search", "x", "--lang", "de").code).toBe(2);
  });

  it("0 for an explicit --help, 2 for no command", () => {
    expect(cli("--help").code).toBe(0);
    expect(cli("-h").code).toBe(0);
    expect(cli().code).toBe(2);
    // Both print the usage text; only the exit code differs, because "I asked
    // for help" and "I ran it wrong" are different outcomes.
    expect(cli("--help").out).toContain("Usage");
    expect(cli().out).toContain("Usage");
  });
});

describe("cli-core: --json", () => {
  it("every record-returning command emits parseable JSON", () => {
    for (const argv of [
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
      const { out, code } = cli(...argv, "--json");
      expect(code, argv.join(" ")).toBe(0);
      expect(() => JSON.parse(out) as unknown, argv.join(" ")).not.toThrow();
    }
  });

  it("a miss emits null, not prose", () => {
    const { out, code } = cli("commune", "no-such-commune", "--json");
    expect(code).toBe(1);
    expect(JSON.parse(out)).toBeNull();
  });

  it("an empty search emits [], not prose", () => {
    const { out, code } = cli("search", "zzzzzzzzzzzz", "--json");
    expect(code).toBe(1);
    expect(JSON.parse(out)).toEqual([]);
  });

  it("agrees with the library", () => {
    const rows = JSON.parse(cli("communes", "19", "--json").out) as { id: string }[];
    expect(rows).toHaveLength(60);
    expect(rows.every((c) => c.id.startsWith("19-"))).toBe(true);
  });
});

describe("cli-core: flags", () => {
  it("--limit caps results", () => {
    const rows = JSON.parse(cli("search", "ain", "--limit", "3", "--json").out) as unknown[];
    expect(rows).toHaveLength(3);
  });

  it("--lang restricts the matched language", () => {
    const rows = JSON.parse(cli("search", "setif", "--lang", "fr", "--json").out) as {
      matched: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.matched === "fr")).toBe(true);
  });

  it("--json may appear before or after the positional arguments", () => {
    expect(cli("--json", "wilaya", "19").code).toBe(0);
    expect(cli("wilaya", "19", "--json").code).toBe(0);
  });

  it("a multi-word query does not need quoting through argv", () => {
    // `search bordj bou arreridj` arrives as three positionals and is rejoined.
    expect(cli("search", "bordj", "bou", "arreridj").code).toBe(0);
  });
});

describe("cli-core: output content", () => {
  it("finds the canonical row", () => {
    expect(cli("postal", "19018").out).toContain("Ain Lahdjar");
  });

  it("searches Arabic", () => {
    expect(cli("search", "سطيف", "--limit", "1").out).toContain("سطيف");
  });

  it("prints an em dash for a commune with no postal code", () => {
    // This asserted NOTHING before: it read wilaya 01, which has no
    // null-postal commune at all, and then guarded the assertion on
    // `if (missing)`. It passed by never running. Derive the id from the
    // published hole list instead, and fail loudly if that list is empty.
    const id = COMMUNES_MISSING_POSTAL_CODE[0];
    expect(id, "the hole list must not be empty").toBeDefined();
    const row = getCommune(id);
    expect(row?.postalCode, `${id} should have no postal code`).toBeNull();
    expect(cli("commune", id).out).toContain("—");
  });

  it("reports the JO date as publication, never as a signing date", () => {
    // The law is dated 4 April 2026, the JO issue 5 April. The first draft of
    // this command printed "signed 2026-04-05".
    const out = cli("reform").out;
    expect(out).toContain("published in the JO 2026-04-05");
    expect(out).not.toContain("signed 2026-04-05");
  });

  it("warns that the reform resolvers throw while the mapping is unsourced", () => {
    expect(cli("reform").out).toContain("not guessed");
  });

  it("version reports the same counts the library exports", () => {
    const v = JSON.parse(cli("version", "--json").out) as Record<string, unknown>;
    expect(v).toMatchObject({ wilayas: 69, dairas: 585, communes: 1541, dataVersion: "2.0.0" });
  });

  it("dairas lists every daira of the wilaya", () => {
    const rows = JSON.parse(cli("dairas", "19", "--json").out) as unknown[];
    expect(rows).toHaveLength(20);
  });
});

describe("cli-core: the branches that only a specific shape reaches", () => {
  it("--json with an empty record set emits [] and still exits 1", () => {
    // printCommunes' json path with zero rows: valid code shape, no holder.
    const { out, code } = cli("postal", "00000", "--json");
    expect(code).toBe(1);
    expect(JSON.parse(out)).toEqual([]);
  });

  it("prints a blank postal column for a non-commune search hit", () => {
    // printSearch only has a postal code to show for kind "commune"; a wilaya
    // or daira hit takes the other arm.
    const out = cli("search", "setif", "--limit", "1").out;
    expect(out).toMatch(/^wilaya/);
    expect(out).not.toMatch(/\d{5}/);
  });

  it("prints an em dash for a commune search hit with no postal code", () => {
    // Derive the hole from the published list rather than guessing a wilaya --
    // the first draft assumed wilaya 01 had one and it does not.
    const id = COMMUNES_MISSING_POSTAL_CODE[0];
    const commune = getCommune(id);
    expect(commune, `${id} should be a real commune`).toBeDefined();
    if (!commune) return;
    // Search by name so the row goes through printSearch's `?? "—"` arm rather
    // than printCommunes'.
    expect(cli("search", commune.name.fr).out).toContain("—");
  });

  it("rejects a non-integer wilaya code with the same message as an out-of-range one", () => {
    // One message for one question: "that is not a wilaya code".
    expect(cli("wilaya", "abc").code).toBe(2);
    expect(cli("wilaya", "1.5").code).toBe(2);
    expect(cli("wilaya", "70").code).toBe(2);
    expect(cli("wilaya", "abc").err).toContain("not a wilaya code");
    expect(cli("wilaya", "70").err).toContain("not a wilaya code");
  });
});

describe("cli-core: reformLines covers both mapping states", () => {
  it("warns about the throwing resolvers while the mapping is unsourced", () => {
    const out = reformLines({ ...REFORM, mappingComplete: false }).join("\n");
    expect(out).toContain("parent mapping complete: false");
    expect(out).toContain("not guessed");
  });

  it("drops the warning once the mapping is complete", () => {
    // Unreachable from the real data today -- mappingComplete is false and will
    // be until the 11 parentCodes are sourced (ADR-018). Passing a synthetic
    // reform is what makes the other arm testable at all, and this test is what
    // will catch the warning being left behind when the data does land.
    const out = reformLines({ ...REFORM, mappingComplete: true }).join("\n");
    expect(out).toContain("parent mapping complete: true");
    expect(out).not.toContain("not guessed");
  });

  it("never labels the JO publication date as a signing date", () => {
    for (const complete of [true, false]) {
      const out = reformLines({ ...REFORM, mappingComplete: complete }).join("\n");
      expect(out).toContain("published in the JO 2026-04-05");
      expect(out).not.toContain("signed 2026-04-05");
    }
  });
});

describe("cli-core: regressions found in review", () => {
  it("never truncates a commune id, so output round-trips", () => {
    // 14 ids are longer than the old 38-char column; the longest is 49. The id
    // is the lookup key for `commune`, so a cut id broke the obvious two-step
    // workflow: list, then look one up.
    const rows = JSON.parse(cli("communes", "15", "--json").out) as { id: string }[];
    const longest = rows.reduce((a, b) => (a.id.length >= b.id.length ? a : b)).id;
    expect(longest.length).toBeGreaterThan(38);
    expect(cli("communes", "15").out).toContain(longest);
    // And the printed id is accepted back.
    expect(cli("commune", longest).code).toBe(0);
  });

  it("rejects --limit and --lang on commands that ignore them", () => {
    // Previously `communes 19 --limit 2` printed all 60 rows and exited 0 --
    // a wrong answer rather than an error.
    for (const argv of [
      ["communes", "19", "--limit", "2"],
      ["wilayas", "--limit", "2"],
      ["dairas", "19", "--lang", "fr"],
      ["postal", "19018", "--limit", "1"],
      ["commune", "19-ain-azel-ain-lahdjar", "--lang", "ar"],
      ["reform", "--limit", "1"],
      ["version", "--lang", "en"],
    ]) {
      expect(cli(...argv).code, argv.join(" ")).toBe(2);
    }
    // ...and still honours them where they mean something.
    expect(cli("search", "ain", "--limit", "2").code).toBe(0);
    expect(cli("search", "setif", "--lang", "fr").code).toBe(0);
  });
});
