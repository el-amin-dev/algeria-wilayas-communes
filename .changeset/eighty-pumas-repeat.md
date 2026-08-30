---
"algeria-wilayas-communes": major
---

Ship the package as a dual ESM + CJS build with six entry points.

**`require()` works for the first time.** v1's `package.json` declared only an
`"import"` condition, so the CommonJS example in the README — shipped in every
1.x release — threw `ERR_PACKAGE_PATH_NOT_EXPORTED` on every Node version. This
is purely additive: no CJS consumer can exist today, because none could. Every
entry point now resolves under both `require()` and `import`, with `.d.ts` for
the ESM branch and `.d.cts` for the CJS one. `publint --strict` and
`attw --pack .` both pass clean across `node10`, `node16 (from CJS)`,
`node16 (from ESM)` and `bundler`.

**Five new subpaths**, so you download the level of detail you actually use:

| Subpath | Contents | gzip |
|---|---|---|
| `algeria-wilayas-communes` | full API — accessors, search, reform, v1 shims | 96.9 kB |
| `…/wilayas` | 69 wilaya records | **2.36 kB** |
| `…/dairas` | wilayas + 591 daïras | 16.7 kB |
| `…/communes` | wilayas + daïras + 1541 communes + postal lookup | 64.8 kB |
| `…/zod` | optional Zod schemas | 48.9 kB |
| `…/legacy` | the byte-exact v1 snake_case surface | 65.0 kB |

A wilaya `<select>` costs 2.36 kB instead of 96.9 kB. The narrow entries omit
`asOf` and name search deliberately — both are derived over commune data, which
is what those entries exist to exclude.

**Pick one entry per application; do not mix them.** Each subpath is a
self-contained bundle, so importing both `algeria-wilayas-communes` and
`algeria-wilayas-communes/communes` ships the dataset **twice**, and the records
they return are *different objects*: `getWilaya(19)` from the root is not `===`
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
lookup goes from 5.92 µs to 0.032 µs (~185×) and is now O(1) rather than a scan,
so it stays flat inside a loop. But the **cold path is slower than v1**, by
roughly 1.4–3.7× depending on the call: inlining the data as JavaScript removed
the `node:fs` dependency that made browser, Worker, Deno and React Native
support possible at all, and moved the parse cost into module evaluation, where
it is larger. Measured numbers and the analysis are in `docs/DECISIONS.md`
ADR-008. If you are latency-sensitive on a cold start, import a narrow subpath.
