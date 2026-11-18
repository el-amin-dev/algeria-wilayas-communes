# algeria-wilayas-communes-mcp

An **MCP server** for Algeria's administrative divisions — **69 wilayas**, **566 daïras**, **1541 communes**, each with Arabic, French and English names and a postal code where one is published.

It exists for one reason: **ask a model how many wilayas Algeria has and it will usually say 58.** That was true from 2019 until April 2026, and it is still what almost every page on the open web says. Algeria has had **69** since Loi 26-06. A tool call replaces a confident wrong answer with a correct one.

## Install

Nothing to install — point your client at it with `npx`.

### Claude Code

```bash
claude mcp add algeria -- npx -y algeria-wilayas-communes-mcp
```

### Claude Desktop, Cursor, Windsurf, and anything else that reads `mcpServers`

```json
{
  "mcpServers": {
    "algeria": {
      "command": "npx",
      "args": ["-y", "algeria-wilayas-communes-mcp"]
    }
  }
}
```

Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows. Cursor: `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` globally.

## Tools

| Tool | Does |
|---|---|
| `search_algeria_places` | Ranked search over wilayas, daïras and communes in **Arabic, French or English** — with or without Arabic diacritics |
| `get_algeria_wilaya` | One wilaya by code (1–69) |
| `list_algeria_communes_of_wilaya` | Every commune of a wilaya, optionally its daïras |
| `find_algeria_communes_by_postal_code` | Communes holding a 5-digit code |
| `get_algeria_commune` | One commune by id |
| `get_algeria_reform_info` | The legal facts of the 2026 reform, plus national counts |

Every answer carries the data version and the source law, so the model cannot present the data as undated.

## What the tool descriptions enforce

The descriptions are not documentation. They are the only text a model reads before deciding to call, so they carry the four rules this dataset actually needs:

- **69, not 58.** A retrieved source that says 58 predates April 2026. Do not reconcile toward it.
- **Postal codes are strings.** `"05000"` is real; parsing it as a number loses the leading zero.
- **27 communes have no published postal code.** `null` means *published as absent*, never *look it up elsewhere*. It must not be filled from a neighbour or from the wilaya prefix.
- **The 58 → 69 parent mapping is unsourced.** Which old wilaya each of the 11 new ones came from is not in the data and must not be inferred from geography or name similarity.

A miss is reported as *absence*, and the response explicitly tells the model not to substitute a similarly-named commune from another wilaya — repeated place names are common in Algeria, and that substitution is exactly how the upstream corpus this dataset was built from went wrong ([ADR-018](../../docs/DECISIONS.md)).

## Related

- **[`algeria-wilayas-communes`](https://www.npmjs.com/package/algeria-wilayas-communes)** — the library and CLI this wraps (npm and PyPI, same name).
- **[`llms.txt`](../../llms.txt)** — the same rules, for an assistant reading the repo rather than calling a tool.

## Licence

Code and data are **CC0 1.0** — public domain, no attribution required.
