/**
 * Gzip size budgets, enforced by `pnpm size`.
 *
 * ── These numbers were measured, not chosen ─────────────────────────────────
 *
 * Every limit below is the first real measurement of the built entry plus ~8 %
 * headroom. The session-4 spec proposed budgets seeded from a projected
 * "normalized data floor" (/communes < 30 kB, root < 40 kB); those projections
 * do not survive contact with the build and are not used. See ADR-008 for the
 * measurement that explains why: normalizing the records cut the raw payload by
 * 59 % but gzip had already collapsed the denormalized repetition, so the
 * compressed size did not move.
 *
 * **The rule for changing a number here:** a build that comes in *under* budget
 * with more than ~30 % slack gets the budget lowered in the same PR. A build
 * that comes in *over* gets investigated — `pnpm size:why` prints the
 * composition — and the budget is raised only with a one-line justification in
 * the PR description. A budget quietly raised to match a regression is worse
 * than no budget.
 *
 * ── Why this file is .js and not .json ──────────────────────────────────────
 *
 * Because the `root, getWilayas only` row below is not self-explanatory and a
 * JSON file cannot say so. A number without its reason gets "fixed" by the next
 * person who sees it.
 */

export default [
  {
    // The metadata-split payoff, and the headline number of this session:
    // a wilaya <select> costs 2.36 kB gzip instead of the root's 96.9 kB.
    name: "/wilayas",
    path: "packages/js/dist/wilayas.mjs",
    import: "*",
    limit: "2.6 kB",
    gzip: true,
  },
  {
    name: "/dairas",
    path: "packages/js/dist/dairas.mjs",
    import: "*",
    limit: "18 kB",
    gzip: true,
  },
  {
    name: "/communes",
    path: "packages/js/dist/communes.mjs",
    import: "*",
    limit: "70 kB",
    gzip: true,
  },
  {
    // `ignore: ["zod"]` is load-bearing, not a convenience. zod is an OPTIONAL
    // PEER and `tsup.config.ts` marks it external, so it is never in the
    // tarball — but it IS a devDependency, so size-limit resolves and bundles it
    // unless told not to. Without this the row reports 136 kB for a file that
    // ships 48 kB, and the budget measures the wrong artifact entirely.
    name: "/zod",
    path: "packages/js/dist/zod.mjs",
    import: "*",
    ignore: ["zod"],
    limit: "53 kB",
    gzip: true,
  },
  {
    // The /zod counterpart of the `root, getWilayas only` row below, and it
    // reports the same shape of problem: `addressSchema` validates commune
    // membership, so `src/zod.ts` imports the commune tier, so a consumer who
    // wants nothing but the five-digit postal regex still downloads the entire
    // 1541-record table. Measured at ~48.8 kB against ~48.9 kB for the whole
    // module -- importing one schema saves essentially nothing.
    //
    // Recorded rather than fixed. Splitting `addressSchema` into its own entry
    // would fix it and adds a permanent public subpath, which is a decision for
    // the pre-2.0.0 cut-down pass (ADR-009), not a change to slip in here.
    name: "/zod, postalCodeSchema only",
    path: "packages/js/dist/zod.mjs",
    import: "{ postalCodeSchema }",
    ignore: ["zod"],
    limit: "53 kB",
    gzip: true,
  },
  {
    name: "/legacy",
    path: "packages/js/dist/legacy.mjs",
    import: "*",
    limit: "70 kB",
    gzip: true,
  },
  {
    name: "root, full API",
    path: "packages/js/dist/index.mjs",
    import: "*",
    limit: "105 kB",
    gzip: true,
  },
  {
    // NOT a tree-shaking assertion — read this before "fixing" the number.
    //
    // The spec expected this row at 3 kB, on the theory that importing only
    // `getWilayas` from the root would shake the commune table out. It does not,
    // and cannot: `api.ts`'s `getWilayas(opts?: AsOfOptions)` calls
    // `wantsLegacyView(opts)` from `asof.ts`, which imports
    // `generated/communes`. The reference is unconditional in the module graph
    // even though the call is conditional, so no bundler may drop it.
    //
    // Tree-shaking does work here — it removes the 4390-key search corpus and
    // the reform resolvers, 96.9 kB down to 64.7 kB. It just cannot remove the
    // communes. That 64.7 kB against `/wilayas`'s 2.36 kB is the entire
    // justification for the metadata split, measured rather than asserted, and
    // this row exists to keep the comparison honest as the code changes.
    name: "root, getWilayas only",
    path: "packages/js/dist/index.mjs",
    import: "{ getWilayas }",
    limit: "70 kB",
    gzip: true,
  },
];
