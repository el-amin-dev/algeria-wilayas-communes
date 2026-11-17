/**
 * One ESM bundle with a shebang. No CJS, no .d.ts: this package is a server
 * someone runs, never a library someone imports.
 *
 * The SDK and zod stay EXTERNAL rather than bundled. They are real
 * dependencies declared in package.json, so npm installs them; inlining them
 * would triple the artifact and make the versions a consumer actually resolved
 * invisible. `algeria-wilayas-communes` stays external for the same reason, and
 * one more: bundling it would freeze a copy of the dataset into this package,
 * so an `npm update` of the data would silently not reach the MCP server.
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: false,
  splitting: false,
  sourcemap: false,
  // Cleaning happens in the `build` script, not here -- see packages/js/tsup.config.ts.
  clean: false,
  treeshake: true,
  target: "es2022",
  outExtension: () => ({ js: ".mjs" }),
  banner: { js: "#!/usr/bin/env node" },
  external: ["@modelcontextprotocol/sdk", "zod", "algeria-wilayas-communes"],
});
