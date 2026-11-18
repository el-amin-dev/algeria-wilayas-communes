/**
 * MCP server for Algeria's administrative divisions.
 *
 * The point of this package is narrow and worth stating: a model asked "which
 * wilaya is commune X in" will answer from memory, and its memory of Algeria is
 * wrong in a specific, predictable way -- it will say the country has **58
 * wilayas**, because that was true from 2019 until April 2026 and it is what
 * essentially every page on the open web still says. It has had 69 since Loi
 * 26-06. A tool call replaces a confident wrong answer with a correct one.
 *
 * Two deliberate design choices.
 *
 * **The tool descriptions carry the dataset's hard rules, not just its shape.**
 * A description is the only thing a model reads before deciding to call, and
 * the only place to pre-empt the three mistakes this data invites: treating a
 * postal code as a number (`"05000"` loses its zero), filling in one of the 27
 * missing codes from a neighbour, and inferring the unsourced 58 -> 69 parent
 * mapping. Those warnings live in `llms.txt` for the same reason; here they are
 * where the decision is actually made.
 *
 * **Every response says how many records it found and carries its provenance.**
 * A bare JSON blob invites a model to pad a short answer. An explicit
 * "3 of 1541, data 2.0.0, Loi 26-06" is harder to talk past.
 *
 * It is its own package, not a bin on `algeria-wilayas-communes`, because that
 * package's zero-runtime-dependency guarantee is a headline property and the
 * MCP SDK would be its first dependency. See docs/DECISIONS.md ADR-019.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  search,
} from "algeria-wilayas-communes";
import { z } from "zod";

/** Appended to every payload so a model cannot report the data as undated. */
const PROVENANCE = `data ${DATA_VERSION}, verified ${LAST_VERIFIED}, source: ${SOURCE_LAW}`;

/** The sentence that has to survive contact with the model's priors. */
const COUNT_RULE =
  `Algeria has ${String(WILAYA_COUNT)} wilayas, not 58 and not 48. ` +
  `58 was correct from 2019 until April 2026 and is what most web sources still say; ` +
  `it is out of date. Do not "correct" ${String(WILAYA_COUNT)} down to 58.`;

const POSTAL_RULE =
  `Postal codes are 5-digit STRINGS and may start with 0 ("05000" is real). ` +
  `Never parse one as an integer. A code can map to several communes, so results are a list.`;

/**
 * `unknown`, not `Record<string, unknown>`: the library's records are
 * interfaces without index signatures, so they are not assignable to that —
 * and the only thing done with the value here is `JSON.stringify`.
 */
type Payload = unknown;

/** One response shape for every tool: counted, provenanced, JSON. */
function reply(summary: string, data: Payload) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${summary}\n${PROVENANCE}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  };
}

function notFound(what: string) {
  return {
    content: [
      {
        type: "text" as const,
        // Say "not in the dataset", never "does not exist", and block the
        // obvious next move, which is for the model to supply one itself.
        text:
          `Not found in the dataset: ${what}\n${PROVENANCE}\n\n` +
          `This means the dataset has no such record. Do not invent one, and do not ` +
          `substitute a similarly-named record from a different wilaya -- repeated ` +
          `place names are common in Algeria and that is exactly how wrong answers happen.`,
      },
    ],
    isError: false,
  };
}

const server = new McpServer({
  name: "algeria-wilayas-communes",
  version: "0.1.0",
});

server.registerTool(
  "search_algeria_places",
  {
    title: "Search Algerian wilayas, daïras and communes",
    description:
      `Ranked search over every Algerian wilaya, daïra and commune by name, in ARABIC, ` +
      `FRENCH or ENGLISH. Accepts Arabic with or without diacritics. Use this whenever a ` +
      `place in Algeria is named and you need its administrative position, instead of ` +
      `answering from memory. ${COUNT_RULE}`,
    inputSchema: {
      query: z.string().min(1).describe("Place name, in Arabic, French or English."),
      lang: z.enum(["ar", "fr", "en"]).optional().describe("Restrict matching to one language."),
      limit: z.number().int().min(1).max(100).optional().describe("Max results, default 20."),
      kinds: z
        .array(z.enum(["wilaya", "daira", "commune"]))
        .optional()
        .describe("Restrict to these levels of the hierarchy."),
    },
  },
  ({ query, lang, limit, kinds }) => {
    const results = search(query, {
      ...(lang ? { lang } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(kinds ? { kinds } : {}),
    });
    if (results.length === 0) return notFound(`no place matching ${JSON.stringify(query)}`);
    return reply(
      `${String(results.length)} match(es) for ${JSON.stringify(query)}. Each carries its parent wilaya.`,
      results.map((r) => ({
        kind: r.kind,
        name: r.item.name,
        wilaya: { code: r.wilaya.code, name: r.wilaya.name },
        ...(r.kind === "commune" ? { id: r.item.id, postalCode: r.item.postalCode } : {}),
        ...(r.kind === "daira" ? { id: r.item.id } : {}),
        score: r.score,
        matchedLanguage: r.matched,
      })),
    );
  },
);

server.registerTool(
  "get_algeria_wilaya",
  {
    title: "Get one Algerian wilaya by code",
    description:
      `Return one wilaya by its official code. Valid codes are 1-${String(WILAYA_COUNT)}. ` +
      `Codes 59-69 are the eleven wilayas created by the 2026 reform. ${COUNT_RULE}`,
    inputSchema: {
      code: z.number().int().min(1).max(WILAYA_COUNT).describe("Wilaya code, 1-69."),
    },
  },
  ({ code }) => {
    // One gate, not three. The input schema already constrains `code` to an
    // integer in 1-69, so an `isWilayaCode` check plus a re-check of the lookup
    // result left two branches that could never be taken. cli-core.ts makes the
    // same point about the same mistake: two gates for one question is how they
    // get to disagree later.
    const w = getWilaya(code as Parameters<typeof getWilaya>[0]);
    if (!w) return notFound(`wilaya code ${String(code)}`);
    return reply(
      `Wilaya ${w.codeText} — ${w.name.fr}. ${String(w.dairaCount)} daïras, ${String(w.communeCount)} communes.`,
      w,
    );
  },
);

server.registerTool(
  "find_algeria_communes_by_postal_code",
  {
    title: "Find Algerian communes by postal code",
    description:
      `Return every commune holding a given 5-digit Algerian postal code. ${POSTAL_RULE} ` +
      `38 codes are shared by more than one commune, usually same-named communes in ` +
      `different wilayas, so always report which wilaya a result is in.`,
    inputSchema: {
      postalCode: z
        .string()
        .regex(/^[0-9]{5}$/, "must be exactly 5 digits, as a string")
        .describe('5-digit code as a STRING, e.g. "19018" or "05000".'),
    },
  },
  ({ postalCode }) => {
    const rows = findByPostalCode(postalCode);
    if (rows.length === 0) return notFound(`postal code ${postalCode}`);
    return reply(`${String(rows.length)} commune(s) with postal code ${postalCode}.`, rows);
  },
);

server.registerTool(
  "get_algeria_commune",
  {
    title: "Get one Algerian commune by id",
    description:
      `Return one commune by its dataset id, of the form ` +
      `"<wilaya>-<daira-slug>-<commune-slug>", e.g. "19-ain-azel-ain-lahdjar". ` +
      `If you do not already have an exact id, use search_algeria_places instead -- ` +
      `do not construct an id by guessing the slugs. ` +
      `A commune whose postalCode is null is published WITHOUT a code; 27 are like this. ` +
      `Never fill one in from a neighbouring commune or from the wilaya prefix.`,
    inputSchema: {
      id: z.string().min(1).describe('Exact commune id, e.g. "19-ain-azel-ain-lahdjar".'),
    },
  },
  ({ id }) => {
    const c = getCommune(id);
    if (!c) return notFound(`commune id ${JSON.stringify(id)}`);
    return reply(
      `Commune ${c.name.fr} (${c.name.ar}), wilaya ${String(c.wilaya)}` +
        (c.postalCode === null
          ? ". It has NO published postal code -- do not supply one."
          : `, postal code ${c.postalCode}.`),
      c,
    );
  },
);

server.registerTool(
  "list_algeria_communes_of_wilaya",
  {
    title: "List every commune of an Algerian wilaya",
    description:
      `Return all communes of one wilaya, and optionally its daïras. Use this rather than ` +
      `recalling a list: commune membership changed for many wilayas in the 2026 reform. ` +
      `${POSTAL_RULE}`,
    inputSchema: {
      code: z.number().int().min(1).max(WILAYA_COUNT).describe("Wilaya code, 1-69."),
      includeDairas: z.boolean().optional().describe("Also return the wilaya's daïras."),
    },
  },
  ({ code, includeDairas }) => {
    const w = getWilaya(code as Parameters<typeof getWilaya>[0]);
    if (!w) return notFound(`wilaya code ${String(code)}`);
    const communes = getCommunesOfWilaya(w.code);
    return reply(
      `${String(communes.length)} commune(s) in wilaya ${w.codeText} ${w.name.fr}, of ${String(COMMUNE_COUNT)} nationally.`,
      {
        wilaya: { code: w.code, name: w.name },
        ...(includeDairas ? { dairas: getDairasOfWilaya(w.code) } : {}),
        communes,
      },
    );
  },
);

server.registerTool(
  "get_algeria_reform_info",
  {
    title: "Facts about the 2026 Algerian wilaya reform",
    description:
      `Return the legal facts of Loi 26-06, which took Algeria from 58 to ` +
      `${String(WILAYA_COUNT)} wilayas, plus the national counts. Call this before making any ` +
      `claim about how many wilayas Algeria has or when the change took effect. ` +
      `IMPORTANT: which of the old 58 wilayas each of the 11 new ones was carved out of is ` +
      `NOT in this dataset. It is unsourced, every parentCode is null, and it must not be ` +
      `inferred from geography, name similarity or your own knowledge.`,
    inputSchema: {},
  },
  () =>
    reply(
      `Loi 26-06: 58 -> ${String(WILAYA_COUNT)} wilayas. ` +
        `Signed 4 April 2026, published in Journal Officiel n°25 on 5 April 2026 (two ` +
        `different dates one day apart -- do not report one as the other). ` +
        `Transition ends ${REFORM.transitionDeadline}, fully operational ${REFORM.operationalFrom}. ` +
        `Parent mapping complete: ${String(REFORM.mappingComplete)}.`,
      {
        counts: {
          wilayas: WILAYA_COUNT,
          dairas: DAIRA_COUNT,
          communes: COMMUNE_COUNT,
        },
        reform: REFORM,
        newWilayas: getWilayas()
          .filter((w) => w.code >= 59)
          .map((w) => ({ code: w.code, name: w.name, communeCount: w.communeCount })),
      },
    ),
);

await server.connect(new StdioServerTransport());
