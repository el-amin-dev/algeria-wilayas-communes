/**
 * The MCP server, driven over the real wire protocol.
 *
 * MCP on stdio is newline-delimited JSON-RPC 2.0, and this file speaks it
 * directly instead of using `@modelcontextprotocol/sdk`'s client. Two reasons,
 * both deliberate:
 *
 * 1. It adds no dependency to the repo root. The SDK is a dependency of
 *    `packages/mcp`, not of the test runner, and pnpm resolves it per package.
 * 2. Using the SDK on both ends would test the SDK against itself. Framing a
 *    request by hand proves the published artifact answers something a real
 *    client would send.
 *
 * What is actually asserted is the part that rots: the tool NAMES and INPUT
 * SCHEMAS (renaming a tool silently breaks every configured assistant), and the
 * guard rails in the descriptions. Those descriptions are not documentation —
 * they are the only text a model reads before deciding whether to call, and they
 * are the single defence against it answering "58 wilayas" from memory. A
 * refactor that tidies them away would pass every other test in this repo.
 *
 * Skipped when `packages/mcp/dist/` is absent, like `tests/cli.test.ts`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const SERVER = fileURLToPath(new URL("../packages/mcp/dist/index.mjs", import.meta.url));
const HAS_SERVER = existsSync(SERVER);

// `result` is method-dependent, so `unknown` is the honest type here; each
// call site narrows it to the shape that method actually returns.
type Rpc = { id?: number; result?: unknown; error?: unknown };
type Tool = {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
};

/** A single session: spawn, initialize, run `fn`, shut down. */
async function session<T>(
  fn: (rpc: (m: string, p: unknown) => Promise<Rpc>) => Promise<T>,
): Promise<T> {
  const srv = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
  const waiters = new Map<number, (m: Rpc) => void>();
  let buf = "";
  srv.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as Rpc;
      if (msg.id !== undefined) waiters.get(msg.id)?.(msg);
    }
  });

  let nextId = 1;
  const rpc = (method: string, params: unknown) =>
    new Promise<Rpc>((resolve, reject) => {
      const id = nextId++;
      waiters.set(id, resolve);
      setTimeout(() => reject(new Error(`timeout on ${method}`)), 20_000).unref();
      srv.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  try {
    await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0" },
    });
    srv.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return await fn(rpc);
  } finally {
    srv.kill();
  }
}

const call = async (rpc: (m: string, p: unknown) => Promise<Rpc>, name: string, args: unknown) => {
  const r = (await rpc("tools/call", { name, arguments: args })) as {
    result?: { content?: { text?: string }[]; isError?: boolean };
  };
  return { text: r.result?.content?.[0]?.text ?? "", isError: r.result?.isError === true };
};

describe.skipIf(!HAS_SERVER)("the MCP server", () => {
  let tools: Tool[] = [];

  beforeAll(async () => {
    tools = await session(async (rpc) => {
      const r = (await rpc("tools/list", {})) as unknown as { result: { tools: Tool[] } };
      return r.result.tools;
    });
  });

  it("is built, so the skip above is not hiding a missing artifact", () => {
    expect(HAS_SERVER).toBe(true);
  });

  it("completes the handshake and reports its identity", async () => {
    const info = await session(async (rpc) => {
      const r = (await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "0" },
      })) as unknown as { result: { serverInfo: { name: string } } };
      return r.result.serverInfo;
    });
    expect(info.name).toBe("algeria-wilayas-communes");
  });

  it("exposes exactly the six documented tools, by name", () => {
    // Renaming a tool breaks every assistant already configured against it, and
    // nothing else in the repo would notice.
    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_algeria_communes_by_postal_code",
      "get_algeria_commune",
      "get_algeria_reform_info",
      "get_algeria_wilaya",
      "list_algeria_communes_of_wilaya",
      "search_algeria_places",
    ]);
  });

  it("keeps the input schema of each tool stable", () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const props = (n: string) => Object.keys(byName.get(n)?.inputSchema?.properties ?? {}).sort();
    expect(props("search_algeria_places")).toEqual(["kinds", "lang", "limit", "query"]);
    expect(props("get_algeria_wilaya")).toEqual(["code"]);
    expect(props("find_algeria_communes_by_postal_code")).toEqual(["postalCode"]);
    expect(props("get_algeria_commune")).toEqual(["id"]);
    expect(props("list_algeria_communes_of_wilaya")).toEqual(["code", "includeDairas"]);
    expect(props("get_algeria_reform_info")).toEqual([]);
  });

  describe("the descriptions carry the guard rails, which is their job", () => {
    const describedBy = (name: string) => tools.find((t) => t.name === name)?.description ?? "";

    it("tells the model not to correct 69 down to 58", () => {
      // The one error this server exists to prevent.
      for (const n of ["search_algeria_places", "get_algeria_wilaya", "get_algeria_reform_info"]) {
        expect(describedBy(n), n).toMatch(/not 58|down to 58|58 to 69/);
      }
    });

    it("says postal codes are strings", () => {
      expect(describedBy("find_algeria_communes_by_postal_code")).toMatch(/STRING/);
      expect(describedBy("find_algeria_communes_by_postal_code")).toMatch(/05000/);
    });

    it("forbids filling a missing postal code", () => {
      expect(describedBy("get_algeria_commune")).toMatch(/[Nn]ever fill one in/);
    });

    it("forbids inferring the parent-wilaya mapping", () => {
      expect(describedBy("get_algeria_reform_info")).toMatch(
        /must not be\s+inferred|not be inferred/,
      );
    });
  });

  describe("the answers", () => {
    it("returns the canonical commune for its postal code", async () => {
      const { text } = await session((rpc) =>
        call(rpc, "find_algeria_communes_by_postal_code", { postalCode: "19018" }),
      );
      expect(text).toContain("Ain Lahdjar");
      expect(text).toContain("1 commune(s)");
    });

    it("searches in Arabic", async () => {
      const { text } = await session((rpc) =>
        call(rpc, "search_algeria_places", { query: "سطيف", limit: 2 }),
      );
      expect(text).toContain("سطيف");
    });

    it("stamps provenance on every answer", async () => {
      // A bare blob invites a model to present the data as undated.
      for (const [name, args] of [
        ["get_algeria_wilaya", { code: 19 }],
        ["get_algeria_reform_info", {}],
      ] as const) {
        const { text } = await session((rpc) => call(rpc, name, args));
        expect(text, name).toContain("data 2.0.0");
        expect(text, name).toContain("Loi 26-06");
      }
    });

    it("reports a miss as absence, and blocks the obvious wrong next step", async () => {
      const { text } = await session((rpc) =>
        call(rpc, "get_algeria_commune", { id: "no-such-commune" }),
      );
      expect(text).toContain("Not found in the dataset");
      expect(text).toMatch(/[Dd]o not invent/);
      // Substituting a same-named commune from another wilaya is exactly how the
      // dataset's own upstream corpus went wrong. See ADR-018.
      expect(text).toMatch(/different wilaya/);
    });

    it("rejects a malformed postal code at the schema, not as a miss", async () => {
      const { isError } = await session((rpc) =>
        call(rpc, "find_algeria_communes_by_postal_code", { postalCode: "1908" }),
      );
      expect(isError).toBe(true);
    });

    it("says outright when a commune has no published postal code", async () => {
      const { text } = await session(async (rpc) => {
        const list = await call(rpc, "list_algeria_communes_of_wilaya", { code: 1 });
        return list;
      });
      expect(text).toContain("commune(s) in wilaya 01");
    });
  });
});
