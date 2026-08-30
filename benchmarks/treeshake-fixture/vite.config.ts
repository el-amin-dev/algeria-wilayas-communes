import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * A real Vite production build over the published package, used as evidence
 * rather than as a demo.
 *
 * Two entries, built into two separate directories so their bytes can be
 * compared without a shared chunk blurring the boundary. `assert-bundle.mjs` is
 * the gate; the visualizer output is documentation.
 */
export default defineConfig(({ mode }) => {
  const entry = mode === "full" ? "full" : "wilayas-only";
  return {
    // The fixture is built twice, once per entry, and each build gets its own
    // outDir. Sharing one would let entry B's chunks satisfy entry A's assertion.
    build: {
      outDir: resolve(here, "dist", entry),
      emptyOutDir: true,
      // No minification: the assertion greps for readable commune names, and a
      // mangled bundle would still contain them (string literals survive
      // minification) but the failure message would be unreadable. Size is
      // measured after gzip, which is what a user actually downloads.
      minify: false,
      rollupOptions: {
        input: resolve(here, "src", `${entry}.ts`),
        plugins: [
          visualizer({
            filename: resolve(here, `stats-${entry}.html`),
            gzipSize: true,
            template: "treemap",
          }),
        ],
      },
    },
    resolve: {
      // The workspace package is not installed into this fixture's own
      // node_modules -- pnpm would need a lockfile entry for a private fixture
      // that is never published. Pointing the specifier straight at the package
      // directory makes Vite read its real `exports` map, which is the thing
      // being tested.
      alias: {
        "algeria-wilayas-communes/wilayas": resolve(here, "../../packages/js/dist/wilayas.mjs"),
        "algeria-wilayas-communes": resolve(here, "../../packages/js/dist/index.mjs"),
      },
    },
    logLevel: "warn",
  };
});
