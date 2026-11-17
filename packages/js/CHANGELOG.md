# algeria-wilayas-communes

## 2.0.0

### Minor Changes

- Add a CLI, shipped as the package's `bin` — no separate install.

  ```bash
  npx algeria-wilayas-communes postal 19018
  npx algeria-wilayas-communes search "سطيف"
  npx algeria-wilayas-communes communes 19 --json | jq '.[].name.fr'
  ```

  Commands: `search`, `postal`, `wilaya`, `communes`, `dairas`, `commune`,
  `wilayas`, `reform`, `version`. Flags: `--json`, `--limit`, `--lang`, `--help`.
  Exit codes are distinct and meaningful — **0** found, **1** not found,
  **2** usage error — so a miss is not an error and a bad flag is not a miss.
  Zero new dependencies.

- Export the five size constants from the root: `WILAYA_COUNT`, `DAIRA_COUNT`,
  `COMMUNE_COUNT`, `POSTAL_CODE_COUNT`, `MISSING_POSTAL_CODE_COUNT`. They were
  generated from the start but only ever re-exported on the Python side, so
  `llms.txt` had to warn that JavaScript lacked them. They are inlined literals;
  the root entry grew 60 bytes gzip.

- Add `isCommuneMissingPostalCode(id: string): boolean`, plus the
  `MissingPostalCodeId` type. `COMMUNES_MISSING_POSTAL_CODE` is a tuple of
  literals, so `.includes(id)` for an arbitrary string does not typecheck, and
  the documented answer was to write the widening cast yourself. The cast now
  lives in the package, where it is tested.

### Major Changes

- Ship the package as a dual ESM + CJS build with six entry points.

  **`require()` works for the first time.** v1's `package.json` declared only an
  `"import"` condition, so the CommonJS example in the README — shipped in every
  1.x release — threw `ERR_PACKAGE_PATH_NOT_EXPORTED` on every Node version. This
  is purely additive: no CJS consumer can exist today, because none could. Every
  entry point now resolves under both `require()` and `import`, with `.d.ts` for
  the ESM branch and `.d.cts` for the CJS one. `publint --strict` and
  `attw --pack .` both pass clean across `node10`, `node16 (from CJS)`,
  `node16 (from ESM)` and `bundler`.

  **Five new subpaths**, so you download the level of detail you actually use:

  | Subpath                    | Contents                                         | gzip        |
  | -------------------------- | ------------------------------------------------ | ----------- |
  | `algeria-wilayas-communes` | full API — accessors, search, reform, v1 shims   | 96.92 kB    |
  | `…/wilayas`                | 69 wilaya records                                | **2.36 kB** |
  | `…/dairas`                 | wilayas + 591 daïras                             | 16.7 kB     |
  | `…/communes`               | wilayas + daïras + 1541 communes + postal lookup | 64.8 kB     |
  | `…/zod`                    | optional Zod schemas                             | 48.9 kB     |
  | `…/legacy`                 | the byte-exact v1 snake_case surface             | 65.0 kB     |

  A wilaya `<select>` costs 2.36 kB instead of 96.92 kB. The narrow entries omit
  `asOf` and name search deliberately — both are derived over commune data, which
  is what those entries exist to exclude.

  **Pick one entry per application; do not mix them.** Each subpath is a
  self-contained bundle, so importing both `algeria-wilayas-communes` and
  `algeria-wilayas-communes/communes` ships the dataset **twice**, and the records
  they return are _different objects_: `getWilaya(19)` from the root is not `===`
  `getWilaya(19)` from `/wilayas`. They are deeply equal, so comparisons and
  lookups by `id` or `code` behave identically — but a `Set` or a `Map` keyed by
  the record object itself will see two distinct entries. Start at the narrowest
  entry that has what you need and move up if you need more.

  `algeria-wilayas-communes/data/*` is unchanged and byte-identical to v1.

  **zod is an optional peer dependency**, never a runtime one. Installing this
  package still installs nothing. Import `…/zod` only if you have zod (v3 or v4)
  in your project; the package continues to ship **zero runtime dependencies**.

  **`engines.node` is `>=18`** (Node 16 went end-of-life in September 2023). npm
  reports this as an `EBADENGINE` warning rather than an error unless you have set
  `engine-strict=true`.

  **On performance, honestly:** warm lookups are dramatically faster — postal-code
  lookup goes from 5.847 µs to 0.031 µs (~188.6×) and is now O(1) rather than a scan,
  so it stays flat inside a loop. But the **cold path is slower than v1**, by
  roughly 1.5–3.3× depending on the call: inlining the data as JavaScript removed
  the `node:fs` dependency that made browser, Worker, Deno and React Native
  support possible at all, and moved the parse cost into module evaluation, where
  it is larger. Measured numbers and the analysis are in `docs/DECISIONS.md`
  ADR-008. If you are latency-sensitive on a cold start, import a narrow subpath.

- The root entry is pure v2. Three breaking changes, all with one-line fixes.

  These landed with the v2 API itself and are recorded here because a consumer
  reading the changelog must find every break in one place. `docs/MIGRATION.md`
  has the worked before/after for each.

  **1. The root ships no default export.**
  `import dz from "algeria-wilayas-communes"` now fails at ESM link time with
  _"The requested module does not provide an export named 'default'"_. That is
  deliberate: the alternative was returning v2 objects whose `.nom_fr` reads
  `undefined`, which fails silently at property access, arbitrarily far from the
  import that caused it. A loud failure at link time is the better trade.

  The v1 default-export object, and all seven v1 functions, live permanently at
  `algeria-wilayas-communes/legacy`:

  ```js
  import dz from "algeria-wilayas-communes/legacy"; // ← the whole fix
  ```

  `getWilayas`, `getDairas`, `getCommunes`, `byWilaya` and `findByPostalCode`
  survive at the root by name but are now v2's and return v2 shapes. `getAll` and
  `findCommune` remain at the root as `@deprecated` shims returning v1 shapes.
  **Semver protects you**: pinned to `^1.0.0`, none of this reaches you until you
  take the major deliberately.

  **2. `wilaya.code` changed type: the padded string `"16"` is now the number
  `16`.** The padded form moved to a new field, `codeText`.

  This is the sharpest trap in the migration, because `code` is one of the very
  few field names that survives verbatim from v1 — so it is the one a reader
  assumes is unchanged — and the failure is silent:

  ```js
  `${w.code}`; // v1 → "01"   v2 → "1"     ← breaks postal prefixes,
  `${w.codeText}`; //         v2 → "01"     ← licence plates, URL segments, filenames
  ```

  Both fields ship, and a test pins `w.codeText === String(w.code).padStart(2, "0")`
  for all 69 wilayas, so they cannot drift apart.

  **3. Returned v2 data is `readonly`, and the bulk arrays are frozen.**
  v1 handed back the live cached `JSON.parse` result, so
  `getCommunes()[0].nom_fr = "X"` corrupted the dataset for every other consumer
  in the process, with no trace. In v2 every member and every array is `readonly`
  in the types, so mutation is a compile error, and `getCommunes().push(x)` throws
  a `TypeError` at run time.

  Precisely: the three bulk arrays are `Object.freeze`d; individual records are
  **not** deep-frozen, because that would put thousands of `Object.freeze` calls
  on the import path. Mutating a record from untyped JavaScript still succeeds and
  is unsupported.

  If you relied on mutating what you got back, `/legacy` and the root shims return
  **unfrozen, mutable projections — deliberately** — so v1 mutation code keeps
  working verbatim, and those projections are separate objects that cannot corrupt
  the v2 data. For a mutable v2 record, `structuredClone` it.
