/**
 * `npx algeria-wilayas-communes` — the dataset from a terminal.
 *
 * Why a CLI exists in a data package. The single most common first contact with
 * this dataset is not `import`, it is someone wanting to know one thing: which
 * commune has postal code 19018, how many communes Setif has, what سطيف is
 * called in French. Making that require a project, a package install and a
 * script is friction with no payoff. `npx` answers it in one line.
 *
 * Design rules, all of them load-bearing:
 *
 * - **Zero dependencies, hand-rolled argv parsing.** The package has no runtime
 *   dependencies and a CLI is a bad reason to acquire the first one. The parser
 *   below is ~30 lines because the surface is deliberately small.
 * - **`--json` on every command.** The human table is for humans; anything that
 *   might get piped into `jq` has a machine-readable form that is the real API.
 *   Scraping a pretty table is a thing people do when you do not give them this.
 * - **Exit codes mean something.** 0 found, 1 not found, 2 usage error. A lookup
 *   that misses is not a crash, and a typo in a flag is not a miss.
 * - **It composes the public API only.** No import from `generated/`, no private
 *   helper. If the CLI can do it, a consumer can do it, which keeps this file
 *   from quietly becoming a second API with its own behaviour.
 *
 * **Why this is a separate module from `cli.ts`.** Everything here is pure: it
 * takes an argv array and an output sink and returns an exit code. `cli.ts` is
 * the four-line executable shim that wires it to `process`. The split exists
 * because the coverage thresholds in `vitest.config.ts` are 100% and
 * deliberately load-bearing: the subprocess tests in `tests/cli.test.ts` prove
 * the real artifact works, but in-process v8 coverage cannot see a spawned
 * child, so a single-file CLI would have shown 0% and forced the thresholds
 * down. Splitting it means the logic is covered in-process AND the shipped
 * binary is still tested as a binary.
 *
 * Nothing here touches `process` or `console`, so a test can assert on exactly
 * what a user would see.
 *
 * @module
 */

import {
  COMMUNE_COUNT,
  DAIRA_COUNT,
  DATA_VERSION,
  LAST_VERIFIED,
  REFORM,
  SOURCE_LAW,
  WILAYA_COUNT,
  findByPostalCode,
  getCommune,
  getCommunesOfWilaya,
  getDairasOfWilaya,
  getWilaya,
  getWilayas,
  isPostalCode,
  search,
} from "./index";

import type { Commune, SearchResult, Wilaya } from "./index";

const USAGE = `algeria-wilayas-communes — Algeria's 69 wilayas, 591 daïras, 1541 communes

Usage
  npx algeria-wilayas-communes <command> [argument] [flags]

Commands
  search <query>        ranked search in Arabic, French or English
  postal <code>         communes holding a 5-digit postal code
  wilaya <code>         one wilaya (1-69) and its counts
  communes <code>       every commune of a wilaya
  dairas <code>         every daïra of a wilaya
  commune <id>          one commune by id
  wilayas               list all 69 wilayas
  reform                the 2026 reform (Loi 26-06) facts
  version               data version and provenance

Flags
  --json                machine-readable output
  --limit <n>           cap results (search, default 20)
  --lang <ar|fr|en>     restrict search to one language
  -h, --help            this text

Examples
  npx algeria-wilayas-communes search "سطيف"
  npx algeria-wilayas-communes postal 19018
  npx algeria-wilayas-communes communes 19 --json | jq '.[].name.fr'

Exit codes: 0 found, 1 not found, 2 usage error.`;

/**
 * Where output goes. Injected rather than imported so tests can capture it;
 * `cli.ts` passes `console.log` / `console.error`.
 */
export type Io = { out: (line: string) => void; err: (line: string) => void };

type Flags = { json: boolean; limit?: number | undefined; lang?: "ar" | "fr" | "en" | undefined };

/** Thrown for a usage error, so `main` can exit 2 rather than 1. */
export class UsageError extends Error {}

// `| undefined` is explicit because tsconfig sets exactOptionalPropertyTypes:
// under that flag `cmd?: string` means "absent", not "present and undefined".
function parseArgs(argv: readonly string[]): {
  cmd?: string | undefined;
  arg?: string | undefined;
  flags: Flags;
} {
  const flags: Flags = { json: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") flags.json = true;
    else if (a === "-h" || a === "--help") return { cmd: "help", flags };
    else if (a === "--limit") {
      // `--limit` with no value used to yield NaN and silently return nothing.
      const v = argv[++i];
      if (v === undefined) throw new UsageError("--limit needs a number");
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1)
        throw new UsageError(`--limit expects a positive integer, got "${v}"`);
      flags.limit = n;
    } else if (a === "--lang") {
      const v = argv[++i];
      if (v !== "ar" && v !== "fr" && v !== "en") {
        throw new UsageError(`--lang expects ar, fr or en, got "${v ?? ""}"`);
      }
      flags.lang = v;
    } else if (a.startsWith("-")) {
      throw new UsageError(`unknown flag "${a}"`);
    } else {
      positional.push(a);
    }
  }
  return { cmd: positional[0], arg: positional.slice(1).join(" ") || undefined, flags };
}

/**
 * Parse a wilaya code, rejecting anything outside 1-69 with a readable message.
 *
 * Validation is delegated to `getWilaya` rather than done twice. An earlier
 * version called `isWilayaCode(n)` first and then re-checked the lookup result,
 * which left a branch that could never be taken -- the guard had already proved
 * the lookup would succeed. Two gates for one question is also how the two get
 * to disagree later.
 */
function wilayaArg(arg: string | undefined): Wilaya {
  if (arg === undefined) throw new UsageError("this command needs a wilaya code (1-69)");
  const n = Number(arg);
  // Reject "abc" and "1.5" here, so the message names the real problem instead
  // of reporting a NaN lookup as a missing wilaya.
  if (!Number.isInteger(n)) throw new UsageError(`"${arg}" is not a wilaya code (expected 1-69)`);
  const w = getWilaya(n as Parameters<typeof getWilaya>[0]);
  if (!w) throw new UsageError(`"${arg}" is not a wilaya code (expected 1-69)`);
  return w;
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

function printCommunes(rows: readonly Commune[], flags: Flags, io: Io): number {
  if (flags.json) {
    io.out(JSON.stringify(rows, null, 2));
    return rows.length > 0 ? 0 : 1;
  }
  if (rows.length === 0) {
    io.out("no match");
    return 1;
  }
  for (const c of rows) {
    io.out(`${pad(c.id, 38)} ${pad(c.name.fr, 26)} ${pad(c.name.ar, 22)} ${c.postalCode ?? "—"}`);
  }
  return 0;
}

/**
 * The human-readable `reform` output, as lines.
 *
 * Pure and exported so BOTH arms of the `mappingComplete` branch are testable.
 * Inline in the command it was unreachable in one direction: the mapping is
 * unsourced today, so `mappingComplete` is always `false`, and the warning
 * could never be shown to be absent once it is filled. Taking the reform as a
 * parameter rather than reading the module constant turns a data-dependent
 * branch into an ordinary one — and it will matter for real once the mapping is
 * sourced (docs/DECISIONS.md ADR-018).
 */
export function reformLines(reform: typeof REFORM): string[] {
  const lines = [
    `${reform.law} — ${reform.journalOfficiel}`,
    // `publishedOn` is the JOURNAL OFFICIEL date, not the signing date. The law
    // is dated 4 April 2026 and the JO issue 5 April; reporting one as the other
    // is the specific mistake docs/DATA_PROVENANCE.md warns about, and the first
    // draft of this line made it.
    `published in the JO ${reform.publishedOn}`,
    `transition ends ${reform.transitionDeadline}, operational from ${reform.operationalFrom}`,
    `${String(reform.previousWilayaCount)} → ${String(reform.currentWilayaCount)} wilayas`,
    `parent mapping complete: ${String(reform.mappingComplete)}`,
  ];
  if (!reform.mappingComplete) {
    // Say this plainly. Someone reaching for `reform` is exactly the person
    // about to call a resolver that throws.
    lines.push(
      "\nThe 58→69 parent mapping is unsourced, so resolveLegacyWilaya,\n" +
        'resolveCurrentWilaya and asOf: "58" throw. It is not guessed.',
    );
  }
  return lines;
}

function printSearch(rows: readonly SearchResult[], flags: Flags, io: Io): number {
  if (flags.json) {
    io.out(JSON.stringify(rows, null, 2));
    return rows.length > 0 ? 0 : 1;
  }
  if (rows.length === 0) {
    io.out("no match");
    return 1;
  }
  for (const r of rows) {
    const code = r.kind === "commune" ? (r.item.postalCode ?? "—") : "";
    io.out(
      `${pad(r.kind, 8)} ${pad(r.item.name.fr, 26)} ${pad(r.item.name.ar, 22)} ` +
        `${pad(r.wilaya.name.fr, 18)} ${pad(code, 6)} ${r.score.toFixed(2)}`,
    );
  }
  return 0;
}

export function run(argv: readonly string[], io: Io): number {
  const { cmd, arg, flags } = parseArgs(argv);

  if (cmd === undefined || cmd === "help") {
    io.out(USAGE);
    return cmd === undefined ? 2 : 0;
  }

  switch (cmd) {
    case "search": {
      if (!arg) throw new UsageError("search needs a query");
      return printSearch(
        search(arg, {
          ...(flags.limit !== undefined ? { limit: flags.limit } : {}),
          ...(flags.lang !== undefined ? { lang: flags.lang } : {}),
        }),
        flags,
        io,
      );
    }

    case "postal": {
      if (!arg) throw new UsageError("postal needs a 5-digit code");
      // Codes are strings and may start with 0; reject a bad shape loudly rather
      // than reporting "not found" for "1908".
      if (!isPostalCode(arg)) throw new UsageError(`"${arg}" is not a 5-digit postal code`);
      return printCommunes(findByPostalCode(arg), flags, io);
    }

    case "wilaya": {
      const w = wilayaArg(arg);
      if (flags.json) {
        io.out(JSON.stringify(w, null, 2));
      } else {
        io.out(`${w.codeText}  ${w.name.fr} / ${w.name.ar} / ${w.name.en}`);
        io.out(`${String(w.dairaCount)} daïras, ${String(w.communeCount)} communes`);
      }
      return 0;
    }

    case "communes":
      return printCommunes(getCommunesOfWilaya(wilayaArg(arg).code), flags, io);

    case "dairas": {
      const rows = getDairasOfWilaya(wilayaArg(arg).code);
      if (flags.json) {
        io.out(JSON.stringify(rows, null, 2));
      } else {
        for (const d of rows) {
          io.out(
            `${pad(d.id, 30)} ${pad(d.name.fr, 24)} ${pad(d.name.ar, 22)} ${String(d.communeCount)}`,
          );
        }
      }
      return 0;
    }

    case "commune": {
      if (!arg) throw new UsageError("commune needs an id, e.g. 19-ain-azel-ain-lahdjar");
      const c = getCommune(arg);
      if (!c) {
        io.out(flags.json ? "null" : `no commune with id "${arg}"`);
        return 1;
      }
      return printCommunes([c], flags, io);
    }

    case "wilayas": {
      const rows = getWilayas();
      if (flags.json) {
        io.out(JSON.stringify(rows, null, 2));
      } else {
        for (const w of rows) {
          io.out(
            `${w.codeText}  ${pad(w.name.fr, 24)} ${pad(w.name.ar, 20)} ` +
              `${String(w.dairaCount).padStart(3)} daïras ${String(w.communeCount).padStart(4)} communes`,
          );
        }
      }
      return 0;
    }

    case "reform": {
      if (flags.json) {
        io.out(JSON.stringify(REFORM, null, 2));
        return 0;
      }
      for (const line of reformLines(REFORM)) io.out(line);
      return 0;
    }

    case "version":
      if (flags.json) {
        io.out(
          JSON.stringify(
            {
              dataVersion: DATA_VERSION,
              sourceLaw: SOURCE_LAW,
              lastVerified: LAST_VERIFIED,
              wilayas: WILAYA_COUNT,
              dairas: DAIRA_COUNT,
              communes: COMMUNE_COUNT,
            },
            null,
            2,
          ),
        );
      } else {
        io.out(`data ${DATA_VERSION}, verified ${LAST_VERIFIED}`);
        io.out(SOURCE_LAW);
        io.out(
          `${String(WILAYA_COUNT)} wilayas, ${String(DAIRA_COUNT)} daïras, ${String(COMMUNE_COUNT)} communes`,
        );
      }
      return 0;

    default:
      throw new UsageError(`unknown command "${cmd}"`);
  }
}
